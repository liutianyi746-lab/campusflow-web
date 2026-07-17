"use client";

import "@/lib/browser/mobile-polyfills";
import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { StepIndicator } from "@/app/_components/step-indicator";
import { useEventStore } from "@/stores/use-event-store";
import { useStepStore } from "@/stores/use-step-store";
import { apiUrl } from "@/lib/http/api-client";
import { extractPdfInBrowser } from "@/lib/pdf/browser-pdf";
import { parseScheduleTemplateText } from "@/lib/schedule/schedule-template-parser";
import type { CampusEvent, EventSource, RecognitionIntent } from "@/lib/types/campus-event";

const SUPPORTED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/jpg",
  "image/webp",
  "application/pdf",
  "text/csv",
  "text/plain",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

const UNSUPPORTED_MOBILE_IMAGE_TYPES = new Set(["image/heic", "image/heif"]);
const LOSSLESS_IMAGE_TYPES = new Set(["image/png", "image/webp"]);
const SUPPORTED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "pdf", "csv", "txt", "xls", "xlsx"]);
const UNSUPPORTED_MOBILE_IMAGE_EXTENSIONS = new Set(["heic", "heif"]);
const LOSSLESS_IMAGE_EXTENSIONS = new Set(["png", "webp"]);
const MAX_FILE_SIZE_MB = 25;
const MAX_FILE_SIZE = MAX_FILE_SIZE_MB * 1024 * 1024;
const IMAGE_FILE_ACCEPT = "image/*,.jpg,.jpeg,.png,.webp";
const PDF_FILE_ACCEPT = ".pdf,application/pdf";
const EXCEL_FILE_ACCEPT = ".xls,.xlsx,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv";
const TEXT_FILE_ACCEPT = ".txt,text/plain";
const UPLOAD_TIMEOUT_MS = 120000;

function fileExtension(file: File): string {
  return file.name.toLowerCase().split(".").pop() ?? "";
}

function isUnsupportedMobileImage(file: File): boolean {
  const extension = fileExtension(file);
  return UNSUPPORTED_MOBILE_IMAGE_TYPES.has(file.type) || UNSUPPORTED_MOBILE_IMAGE_EXTENSIONS.has(extension);
}

function isSupportedUploadFile(file: File): boolean {
  const extension = fileExtension(file);
  return SUPPORTED_TYPES.has(file.type) || SUPPORTED_EXTENSIONS.has(extension);
}

function isLosslessScreenshot(file: File): boolean {
  const extension = fileExtension(file);
  return file.size <= MAX_FILE_SIZE && (LOSSLESS_IMAGE_TYPES.has(file.type) || LOSSLESS_IMAGE_EXTENSIONS.has(extension));
}

function uploadAcceptForPreset(presetId: string): string {
  if (presetId === "pdf") return PDF_FILE_ACCEPT;
  if (presetId === "excel") return EXCEL_FILE_ACCEPT;
  if (presetId === "text") return TEXT_FILE_ACCEPT;
  if (presetId === "schedule") return `${IMAGE_FILE_ACCEPT},${PDF_FILE_ACCEPT},${TEXT_FILE_ACCEPT}`;
  return IMAGE_FILE_ACCEPT;
}

function shouldPrepareAsImage(file: File): boolean {
  const extension = fileExtension(file);
  return file.type.startsWith("image/") || ["jpg", "jpeg", "png", "webp", "heic", "heif"].includes(extension);
}

function isPdfUploadFile(file: File): boolean {
  return file.type === "application/pdf" || fileExtension(file) === "pdf";
}

async function convertImageToJpeg(file: File): Promise<File> {
  const objectUrl = URL.createObjectURL(file);

  try {
    const image = new Image();
    image.decoding = "async";
    const loaded = new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("图片解码失败"));
    });
    image.src = objectUrl;
    await loaded;

    const maxSide = 3600;
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("图片压缩失败");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => {
        if (result) resolve(result);
        else reject(new Error("图片压缩失败"));
      }, "image/jpeg", 0.94);
    });
    const baseName = file.name.replace(/\.[^.]+$/, "") || "mobile-photo";
    return new File([blob], `${baseName}.jpg`, { type: "image/jpeg", lastModified: file.lastModified });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function prepareFileForUpload(file: File): Promise<{ file: File; previewUrl: string | null }> {
  if (!shouldPrepareAsImage(file)) return { file, previewUrl: null };

  const previewUrl = URL.createObjectURL(file);
  const isAlreadySmallJpeg = file.type === "image/jpeg" && file.size <= MAX_FILE_SIZE;
  if (isAlreadySmallJpeg || isLosslessScreenshot(file)) return { file, previewUrl };

  try {
    return { file: await convertImageToJpeg(file), previewUrl };
  } catch {
    if (isUnsupportedMobileImage(file)) {
      throw new Error("iPhone HEIC/HEIF 暂不支持识别，请在相册中分享为 JPG，或截图后再上传。");
    }
    return { file, previewUrl };
  }
}

async function uploadFileToBackend(formData: FormData) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);

  try {
    const response = await fetch(apiUrl("/api/upload"), {
      method: "POST",
      body: formData,
      signal: controller.signal,
    });
    return await response.json();
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("读取来源超时，请检查网络后重试，或改用文本输入。手机网络上传图片可能需要 1-2 分钟。");
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function extractPdfAfterUploadFailure(file: File, onStatus: (status: string) => void) {
  onStatus("网络上传不稳定，正在本地读取 PDF...");
  const result = await extractPdfInBrowser(file, onStatus);
  return { success: true, data: result };
}

const SOURCE_PRESETS: Array<{
  id: string;
  label: string;
  description: string;
  intent: RecognitionIntent;
  source: EventSource;
}> = [
  { id: "image", label: "图片", description: "课表、作业、通知截图", intent: "AUTO", source: "IMAGE" },
  { id: "pdf", label: "PDF", description: "课表、考试、教学计划", intent: "AUTO", source: "PDF" },
  { id: "excel", label: "Excel", description: "教务系统导出表格", intent: "COURSE", source: "EXCEL" },
  { id: "notice", label: "群截图", description: "微信或 QQ 通知", intent: "NOTICE", source: "IMAGE" },
  { id: "text", label: "文本", description: "粘贴自然语言", intent: "NATURAL_LANGUAGE", source: "TEXT" },
  { id: "schedule", label: "作息表", description: "截图、PDF 或文本", intent: "SCHEDULE", source: "IMAGE" },
];

const DEFAULT_SCHEDULE_TEXT = `第一节 08:00-08:45
第二节 08:55-09:40
第三节 10:10-10:55
第四节 11:05-11:50
第五节 14:00-14:45
第六节 14:55-15:40
第七节 16:10-16:55
第八节 17:05-17:50
第九节 19:00-19:45
第十节 19:55-20:40`;

const SAMPLE_EVENTS: CampusEvent[] = [
  {
    id: "sample-math",
    title: "高等数学 A",
    type: "COURSE",
    source: "IMAGE",
    confidence: 0.94,
    reminderMinutes: 10,
    userEdited: false,
    weekType: "EVERY_WEEK",
    location: "教学楼 A301",
    course: {
      courseName: "高等数学 A",
      teacher: "张老师",
      classroom: "教学楼 A301",
      dayOfWeek: 1,
      periodStart: 1,
      periodEnd: 2,
      weekStart: 1,
      weekEnd: 16,
      weekType: "EVERY_WEEK",
    },
  },
  {
    id: "sample-exam",
    title: "数据结构考试",
    type: "EXAM",
    source: "PDF",
    confidence: 0.88,
    reminderMinutes: 60,
    startTime: "2026-06-20T15:00:00",
    endTime: "2026-06-20T17:00:00",
    location: "教学楼 A301",
    userEdited: false,
  },
  {
    id: "sample-homework",
    title: "提交课程设计报告",
    type: "HOMEWORK",
    source: "IMAGE",
    confidence: 0.82,
    reminderMinutes: 120,
    startTime: "2026-06-20T23:59:00",
    endTime: "2026-06-20T23:59:00",
    description: "作业通知中识别出的提交截止时间。",
    userEdited: false,
  },
  {
    id: "sample-meeting",
    title: "班会",
    type: "MEETING",
    source: "TEXT",
    confidence: 0.78,
    reminderMinutes: 30,
    startTime: "2026-07-03T19:00:00",
    endTime: "2026-07-03T20:00:00",
    location: "线上会议",
    userEdited: false,
  },
];

export default function UploadPage() {
  const router = useRouter();
  const { setImageUrl, setOcrResult } = useStepStore();
  const { setEvents, scheduleTemplate, semesterStart, setSemesterStart, setScheduleTemplate, resetScheduleTemplate } = useEventStore();
  const [selectedPresetId, setSelectedPresetId] = useState("image");
  const selectedPreset = SOURCE_PRESETS.find((preset) => preset.id === selectedPresetId) ?? SOURCE_PRESETS[0];
  const [textInput, setTextInput] = useState("下周五晚上七点开班会，地点线上会议");
  const [scheduleText, setScheduleText] = useState(DEFAULT_SCHEDULE_TEXT);
  const [scheduleMessage, setScheduleMessage] = useState("当前使用通用大学作息模板。");
  const [scheduleWarnings, setScheduleWarnings] = useState<string[]>([]);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const isScheduleMode = selectedPresetId === "schedule";
  const acceptsText = selectedPresetId === "text" || selectedPresetId === "notice";
  const fileAccept = uploadAcceptForPreset(selectedPresetId);

  const finishWithEvents = useCallback(
    (events: CampusEvent[], rawText = "手动输入", hash = "memory") => {
      setOcrResult(rawText, hash);
      setEvents(events);
      router.push("/result");
    },
    [router, setEvents, setOcrResult],
  );

  const applyScheduleText = useCallback(
    (value: string, name = "自定义学校作息表", source: EventSource = "MANUAL") => {
      const result = parseScheduleTemplateText(value, { name, source });
      setScheduleWarnings(result.warnings);

      if (!result.template.periods.length) {
        setError("作息表没有识别到有效节次，请按“第一节 08:00-08:45”的格式输入。");
        return false;
      }

      setError("");
      setScheduleTemplate(result.template);
      setScheduleMessage(`已启用 ${result.template.periods.length} 个节次，课程会按这张作息表映射。`);
      return true;
    },
    [setScheduleTemplate],
  );

  const parseText = useCallback(
    async (value: string, source: EventSource, intent: RecognitionIntent) => {
      if (!value.trim()) {
        setError("请输入要转化的校园信息。");
        return;
      }

      setError("");
      setLoading(true);
      setStatus(isScheduleMode ? "正在识别作息表..." : "正在生成时间事件...");

      try {
        if (isScheduleMode) {
          applyScheduleText(value, "文本作息表", "TEXT");
          return;
        }

        const parseResponse = await fetch(apiUrl("/api/parse"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ naturalInput: value, source, intent, semesterStart, scheduleTemplate }),
        }).then((response) => response.json());

        if (!parseResponse.success) {
          throw new Error(parseResponse.error?.message ?? "事件生成失败");
        }

        const parsedEvents = parseResponse.data.events ?? [];
        if (!parsedEvents.length) {
          throw new Error("没有识别到可生成的时间事件，请补充日期、时间、课程或地点后再试。");
        }

        finishWithEvents(parsedEvents, value, "manual");
      } catch (err) {
        setError(err instanceof Error ? err.message : "处理失败，请稍后重试。");
      } finally {
        setLoading(false);
      }
    },
    [applyScheduleText, finishWithEvents, isScheduleMode, scheduleTemplate, semesterStart],
  );

  const handleFile = useCallback(
    async (file: File) => {
      setError("");

      if (!isSupportedUploadFile(file) && !isUnsupportedMobileImage(file)) {
        setError("请上传 JPG、PNG、WebP 图片、PDF、Excel、CSV 或文本文件。");
        return;
      }

      setLoading(true);
      setStatus(shouldPrepareAsImage(file) ? "正在准备图片..." : isScheduleMode ? "正在读取作息表..." : "正在读取来源...");

      try {
        const prepared = await prepareFileForUpload(file);
        const uploadFile = prepared.file;

        if (uploadFile.size > MAX_FILE_SIZE) {
          throw new Error(`文件不能超过 ${MAX_FILE_SIZE_MB}MB。`);
        }

        setPreview(prepared.previewUrl);
        setImageUrl(prepared.previewUrl);
        setStatus(isScheduleMode ? "正在读取作息表..." : "正在读取来源...");

        const formData = new FormData();
        formData.append("file", uploadFile);
        if (isScheduleMode) formData.append("purpose", "schedule");

        const uploadResponse = await uploadFileToBackend(formData).catch((uploadError) => {
          if (isPdfUploadFile(uploadFile)) return extractPdfAfterUploadFailure(uploadFile, setStatus);
          throw uploadError;
        });

        if (!uploadResponse.success) {
          throw new Error(uploadResponse.error?.message ?? "文件上传失败");
        }

        if (uploadResponse.data?.success === false) {
          throw new Error(uploadResponse.data.error ?? "图片识别失败，请裁剪清晰后重试。");
        }

        if (!uploadResponse.data?.ocrText?.trim()) {
          throw new Error("没有识别到文字，请换一张更清晰的图片/PDF，或改用文本输入。");
        }

        const resolvedSemesterStart = uploadResponse.data.semesterStart ?? semesterStart;
        if (uploadResponse.data.semesterStart) setSemesterStart(uploadResponse.data.semesterStart);

        if (isScheduleMode) {
          const ok = applyScheduleText(
            uploadResponse.data.ocrText,
            "上传作息表",
            uploadResponse.data.source ?? selectedPreset.source,
          );
          setOcrResult(uploadResponse.data.ocrText, uploadResponse.data.inputHash);
          if (ok) setStatus("作息表已应用，可以继续上传课表。");
          return;
        }

        setStatus("正在生成时间事件...");
        const parseResponse = await fetch(apiUrl("/api/parse"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ocrText: uploadResponse.data.ocrText,
            intent: selectedPreset.intent,
            source: uploadResponse.data.source ?? selectedPreset.source,
            semesterStart: resolvedSemesterStart,
            scheduleTemplate,
          }),
        }).then((response) => response.json());

        if (!parseResponse.success) {
          throw new Error(parseResponse.error?.message ?? "事件生成失败");
        }

        const parsedEvents = parseResponse.data.events ?? [];
        if (!parsedEvents.length) {
          throw new Error("没有识别到可生成的时间事件，请补充日期、时间、课程或地点后再试。");
        }

        finishWithEvents(
          parsedEvents,
          uploadResponse.data.ocrText,
          uploadResponse.data.inputHash,
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "处理失败，请稍后重试。");
      } finally {
        setLoading(false);
      }
    },
    [applyScheduleText, finishWithEvents, isScheduleMode, scheduleTemplate, selectedPreset.intent, selectedPreset.source, semesterStart, setImageUrl, setOcrResult, setSemesterStart],
  );


  const resetSchedule = () => {
    resetScheduleTemplate();
    setScheduleText(DEFAULT_SCHEDULE_TEXT);
    setScheduleWarnings([]);
    setScheduleMessage("已恢复通用大学作息模板。");
    setError("");
  };

  const useSample = () => {
    finishWithEvents(SAMPLE_EVENTS, "示例校园信息", "sample");
  };

  const choosePreset = (id: string) => {
    setSelectedPresetId(id);
    setError("");
    if (id === "schedule") setScheduleOpen(true);
  };

  return (
    <div className="workflow-page mx-auto max-w-6xl">
      <StepIndicator current="upload" />
      <div className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">Step 1</p>
          <h1 className="mt-2 text-3xl font-black text-emerald-950">生成校园时间事件</h1>
          <p className="mt-3 max-w-2xl text-stone-600">选择一种来源，识别后进入校对页修正课程、地点和时间。</p>
        </div>
        <button
          onClick={useSample}
          className="w-fit rounded-lg border border-emerald-200 px-4 py-2 font-semibold text-emerald-800 transition hover:bg-emerald-50"
        >
          使用示例
        </button>
      </div>

      <section className="glass-panel mb-5 rounded-xl p-2">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {SOURCE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              onClick={() => choosePreset(preset.id)}
              className={[
                "source-preset",
                "min-h-20 rounded-lg px-3 py-3 text-left transition sm:px-4",
                selectedPresetId === preset.id ? "bg-emerald-900 text-white" : "text-stone-700 hover:bg-stone-50",
              ].join(" ")}
            >
              <span className="block text-sm font-bold">{preset.label}</span>
              <span className={selectedPresetId === preset.id ? "mt-1 block text-xs text-emerald-100" : "mt-1 block text-xs text-stone-500"}>
                {preset.description}
              </span>
            </button>
          ))}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <main className="space-y-5">
          <section
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              const file = event.dataTransfer.files[0];
              if (file) void handleFile(file);
            }}
            className={[
              "upload-zone glass-panel",
              "rounded-xl border-2 border-dashed bg-white p-6 shadow-sm transition",
              dragging ? "border-emerald-500 bg-emerald-50" : "border-emerald-200 hover:border-emerald-400",
            ].join(" ")}
          >
            {loading ? (
              <div className="flex min-h-64 flex-col items-center justify-center gap-5 text-center">
                <div className="size-12 animate-spin rounded-full border-4 border-emerald-100 border-t-emerald-700" />
                <p className="font-semibold text-emerald-900">{status}</p>
                {preview ? (
                  <div
                    aria-label="上传预览"
                    className="h-44 w-full max-w-sm rounded-lg border border-emerald-100 bg-cover bg-center shadow-sm"
                    style={{ backgroundImage: `url(${preview})` }}
                  />
                ) : null}
              </div>
            ) : (
              <div className="grid min-h-64 gap-5 md:grid-cols-[1fr_auto] md:items-center">
                <div>
                  <p className="text-sm font-semibold text-emerald-700">当前来源</p>
                  <h2 className="mt-2 text-2xl font-black text-emerald-950">{selectedPreset.label}</h2>
                  <p className="mt-2 text-stone-600">{selectedPreset.description}</p>
                  <p className="mt-4 text-sm text-stone-500">支持图片、PDF、Excel 和文本；最大 25MB。</p>
                </div>
                <label className="block w-full md:w-80">
                  <span className="mb-2 block text-sm font-bold text-emerald-900">
                    {isScheduleMode ? "上传作息表" : "选择文件"}
                  </span>
                  <input
                    type="file"
                    accept={fileAccept}
                    className="block min-h-12 w-full cursor-pointer rounded-lg border border-emerald-200 bg-white text-sm font-semibold text-stone-700 shadow-sm file:mr-4 file:min-h-12 file:cursor-pointer file:border-0 file:bg-emerald-700 file:px-5 file:py-3 file:font-semibold file:text-white hover:file:bg-emerald-800"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void handleFile(file);
                      event.currentTarget.value = "";
                    }}
                  />
                </label>
              </div>
            )}
          </section>

          {(acceptsText || isScheduleMode) && !loading ? (
            <section className="glass-panel rounded-xl p-5">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <div>
                  <h2 className="font-bold text-emerald-950">{isScheduleMode ? "文本识别作息" : "文本输入"}</h2>
                  <p className="mt-1 text-sm text-stone-600">
                    {isScheduleMode ? "可粘贴作息表，也可写成自然语言节次。" : "适合手动粘贴通知、作业截止或自然语言描述。"}
                  </p>
                </div>
              </div>
              <textarea
                value={isScheduleMode ? scheduleText : textInput}
                onChange={(event) => (isScheduleMode ? setScheduleText(event.target.value) : setTextInput(event.target.value))}
                rows={isScheduleMode ? 8 : 4}
                className="mt-4 w-full resize-none rounded-lg border border-stone-200 px-3 py-2 text-sm leading-6 outline-emerald-700"
                placeholder={isScheduleMode ? "例如：第一节 08:00-08:45" : "例如：下周五晚上七点开班会，地点线上会议"}
              />
              <button
                onClick={() =>
                  void parseText(
                    isScheduleMode ? scheduleText : textInput,
                    isScheduleMode ? "TEXT" : selectedPreset.source,
                    isScheduleMode ? "SCHEDULE" : selectedPreset.intent,
                  )
                }
                disabled={loading}
                className="mt-3 rounded-lg bg-emerald-700 px-5 py-2 font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
              >
                {isScheduleMode ? "应用作息表" : "生成事件"}
              </button>
            </section>
          ) : null}

          {scheduleOpen && !isScheduleMode ? (
            <section className="glass-panel rounded-xl p-5">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <div>
                  <h2 className="font-bold text-emerald-950">作息映射</h2>
                  <p className="mt-1 text-sm text-stone-600">课程识别到第几节时，会按这里转换为具体时间。</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => applyScheduleText(scheduleText)}
                    className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
                  >
                    应用
                  </button>
                  <button
                    onClick={() => setScheduleOpen(false)}
                    className="rounded-lg border border-stone-200 px-4 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50"
                  >
                    收起
                  </button>
                </div>
              </div>
              <textarea
                value={scheduleText}
                onChange={(event) => setScheduleText(event.target.value)}
                rows={6}
                className="mt-4 w-full resize-none rounded-lg border border-stone-200 px-3 py-2 text-sm leading-6 outline-emerald-700"
              />
            </section>
          ) : null}
        </main>

        <aside className="space-y-5">
          <section className="glass-panel rounded-xl p-5">
            <h2 className="font-bold text-emerald-950">学期起始</h2>
            <p className="mt-1 text-sm text-stone-500">请填第一周周一，课程周次会按这个日期换算。</p>
            <label className="mt-4 block">
              <span className="text-sm font-semibold text-stone-700">第一周周一</span>
              <input
                type="date"
                value={semesterStart}
                onChange={(event) => setSemesterStart(event.target.value)}
                className="mt-2 w-full rounded-lg border border-stone-200 px-3 py-2 outline-emerald-700"
              />
            </label>
          </section>

          <section className="glass-panel rounded-xl p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-bold text-emerald-950">作息概览</h2>
                <p className="mt-1 text-sm text-stone-500">{scheduleMessage}</p>
              </div>
              <button
                onClick={() => setScheduleOpen((open) => !open)}
                className="rounded-md px-2 py-1 text-sm font-semibold text-emerald-800 hover:bg-emerald-50"
              >
                {scheduleOpen ? "收起" : "编辑"}
              </button>
            </div>
            <div className="mt-4 grid max-h-52 grid-cols-2 gap-2 overflow-auto text-xs text-stone-600">
              {scheduleTemplate.periods.map((period) => (
                <div key={period.periodNumber} className="rounded-md bg-stone-50 px-2 py-1">
                  {period.label ?? `第${period.periodNumber}节`} {period.startTime}-{period.endTime}
                </div>
              ))}
            </div>
            <button
              onClick={resetSchedule}
              className="mt-4 w-full rounded-lg border border-emerald-200 px-4 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-50"
            >
              恢复默认作息
            </button>
            {scheduleWarnings.length ? (
              <div className="mt-3 space-y-1 text-xs text-amber-700">
                {scheduleWarnings.slice(0, 3).map((warning) => (
                  <p key={warning}>{warning}</p>
                ))}
              </div>
            ) : null}
          </section>

          <section className="rounded-xl border border-stone-200 bg-stone-50 p-5">
            <h2 className="font-bold text-stone-900">当前约束</h2>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-stone-600">
              <li>不做登录。</li>
              <li>不写数据库，只用内存态。</li>
              <li>只导出 ICS。</li>
              <li>输入都围绕时间事件生成。</li>
            </ul>
          </section>
        </aside>
      </div>

      {error ? (
        <div className="mt-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}
    </div>
  );
}



"use client";

import "@/lib/browser/mobile-polyfills";
import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { StepIndicator } from "@/app/_components/step-indicator";
import { useEventStore } from "@/stores/use-event-store";
import { useStepStore } from "@/stores/use-step-store";
import { apiUrl } from "@/lib/http/api-client";
import { extractPdfInBrowser, isSparsePdfText } from "@/lib/pdf/browser-pdf";
import { parseWithLocalFallback } from "@/lib/parser/network-parse-fallback";
import { parseScheduleTemplateText } from "@/lib/schedule/schedule-template-parser";
import { Button, SectionCard, Spinner } from "@/components/ui";
import { ScheduleEditor } from "@/components/schedule/schedule-editor";
import { DAY_PART_LABELS, groupPeriodsByDayPart, type ScheduleIssue } from "@/lib/schedule/schedule-validation";
import { Icon, type IconName } from "@/components/ui/icon";
import { cn } from "@/lib/utils/cn";
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
  icon: IconName;
}> = [
  { id: "image", label: "图片", description: "课表、作业、通知截图", intent: "AUTO", source: "IMAGE", icon: "image" },
  { id: "pdf", label: "PDF", description: "课表、考试、教学计划", intent: "AUTO", source: "PDF", icon: "file-text" },
  { id: "excel", label: "Excel", description: "教务系统导出表格", intent: "COURSE", source: "EXCEL", icon: "table" },
  { id: "notice", label: "群截图", description: "微信或 QQ 通知", intent: "NOTICE", source: "IMAGE", icon: "message" },
  { id: "text", label: "文本", description: "粘贴自然语言", intent: "NATURAL_LANGUAGE", source: "TEXT", icon: "type" },
  { id: "schedule", label: "作息表", description: "截图、PDF 或文本", intent: "SCHEDULE", source: "IMAGE", icon: "clock" },
];


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
  const [scheduleMessage, setScheduleMessage] = useState("当前使用通用大学作息模板。");
  const [scheduleIssues, setScheduleIssues] = useState<ScheduleIssue[]>([]);
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
      setScheduleIssues(result.issues);

      if (!result.template.periods.length) {
        setError("作息表没有识别到有效节次。可以直接在下面逐节手动填，或按“第一节 08:00-08:45”的格式粘贴文本。");
        setScheduleOpen(true);
        return false;
      }

      setError("");
      setScheduleTemplate(result.template);

      const skipped = result.stats.skippedLines
        ? `，跳过 ${result.stats.skippedLines} 行表头或午休等非上课时段`
        : "";
      setScheduleMessage(`已识别 ${result.template.periods.length} 个节次${skipped}。`);
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

        let uploadResponse = await uploadFileToBackend(formData).catch((uploadError) => {
          if (isPdfUploadFile(uploadFile)) return extractPdfAfterUploadFailure(uploadFile, setStatus);
          throw uploadError;
        });

        if (!uploadResponse.success) {
          throw new Error(uploadResponse.error?.message ?? "文件上传失败");
        }

        if (isPdfUploadFile(uploadFile) && uploadResponse.data?.success === false) {
          setStatus("PDF 文字层为空，正在识别页面中的课表图片...");
          uploadResponse = await extractPdfAfterUploadFailure(uploadFile, setStatus);
        }

        if (uploadResponse.data?.success === false) {
          throw new Error(uploadResponse.data.error ?? "图片识别失败，请裁剪清晰后重试。");
        }

        if (isPdfUploadFile(uploadFile) && isSparsePdfText(uploadResponse.data?.ocrText ?? "")) {
          setStatus("PDF 文字层不完整，正在识别页面中的课表图片...");
          uploadResponse = await extractPdfAfterUploadFailure(uploadFile, setStatus);
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
        const eventSource = uploadResponse.data.source ?? selectedPreset.source;
        let parsedEvents: CampusEvent[];
        try {
          const parseResponse = await fetch(apiUrl("/api/parse"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ocrText: uploadResponse.data.ocrText,
              intent: selectedPreset.intent,
              source: eventSource,
              semesterStart: resolvedSemesterStart,
              scheduleTemplate,
            }),
          }).then((response) => response.json());

          if (!parseResponse.success) {
            throw new Error(parseResponse.error?.message ?? "事件生成失败");
          }
          parsedEvents = parseResponse.data.events ?? [];
        } catch {
          setStatus("网络解析不可用，正在使用本地规则生成课程...");
          parsedEvents = parseWithLocalFallback(
            uploadResponse.data.ocrText,
            selectedPreset.intent,
            eventSource,
            scheduleTemplate,
            resolvedSemesterStart,
          );
        }

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
    setScheduleIssues([]);
    setScheduleMessage("已恢复通用大学作息模板。");
    setError("");
  };

  const updateScheduleTemplate = (next: typeof scheduleTemplate) => {
    setScheduleTemplate(next);
    setScheduleIssues([]);
    setScheduleMessage(`当前共 ${next.periods.length} 个节次，课程会按这张作息表映射。`);
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
    <div className="mx-auto max-w-6xl">
      <StepIndicator current="upload" />

      <header className="mb-7 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="eyebrow">Step 1</p>
          <h1 className="mt-2 text-3xl font-extrabold text-fg">生成校园时间事件</h1>
          <p className="mt-2.5 max-w-2xl text-muted">
            选择一种来源，识别后进入校对页修正课程、地点和时间。
          </p>
        </div>
        <Button onClick={useSample} icon="sparkles" className="w-fit">
          使用示例数据
        </Button>
      </header>

      {/* 来源选择 */}
      <section className="mb-5" aria-label="选择来源类型">
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
          {SOURCE_PRESETS.map((preset) => {
            const active = selectedPresetId === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => choosePreset(preset.id)}
                aria-pressed={active}
                className={cn(
                  "group flex min-h-[5.5rem] flex-col items-start gap-2 rounded-xl border p-3 text-left transition-all duration-200",
                  active
                    ? "border-primary bg-primary text-primary-fg shadow-[var(--shadow-primary)]"
                    : "border-line bg-surface text-fg hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[var(--shadow-md)]",
                )}
              >
                <span
                  className={cn(
                    "grid size-8 place-items-center rounded-lg transition-colors",
                    active ? "bg-primary-fg/15 text-primary-fg" : "bg-primary-soft text-primary-soft-fg",
                  )}
                >
                  <Icon name={preset.icon} size={17} />
                </span>
                <span className="text-sm font-bold">{preset.label}</span>
                <span className={cn("text-xs leading-4", active ? "opacity-80" : "text-subtle")}>
                  {preset.description}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_330px]">
        <div className="space-y-5">
          {/* 拖拽 / 选择文件 */}
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
            className={cn(
              "rounded-2xl border-2 border-dashed p-6 transition-all duration-200",
              dragging
                ? "scale-[1.01] border-primary bg-primary-soft"
                : "border-line-strong bg-surface hover:border-primary/50",
            )}
          >
            {loading ? (
              <div className="flex min-h-64 flex-col items-center justify-center gap-5 text-center">
                <Spinner size={44} />
                <p className="font-semibold text-fg">{status}</p>
                {preview ? (
                  <div
                    aria-label="上传预览"
                    className="h-44 w-full max-w-sm rounded-xl border border-line bg-surface-2 bg-cover bg-center shadow-[var(--shadow-sm)]"
                    style={{ backgroundImage: `url(${preview})` }}
                  />
                ) : null}
              </div>
            ) : (
              <div className="grid min-h-64 place-items-center gap-6 py-4 text-center">
                <div>
                  <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-primary-soft text-primary-soft-fg">
                    <Icon name={selectedPreset.icon} size={26} />
                  </span>
                  <h2 className="mt-4 text-xl font-extrabold text-fg">
                    {isScheduleMode ? "上传作息表" : `上传${selectedPreset.label}`}
                  </h2>
                  <p className="mt-2 text-sm text-muted">
                    {selectedPreset.description}
                    {/* 手机上没有拖拽，只提示点按 */}
                    <span className="hidden sm:inline">，拖到这里或点击下方按钮</span>
                    <span className="sm:hidden">，点下方按钮从相册或文件中选择</span>。
                  </p>
                </div>

                <div className="flex flex-col items-center gap-3">
                  <label className="btn btn-primary btn-lg cursor-pointer">
                    <Icon name="upload" size={18} />
                    {isScheduleMode ? "选择作息表文件" : "选择文件"}
                    <input
                      type="file"
                      accept={fileAccept}
                      className="sr-only"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) void handleFile(file);
                        event.currentTarget.value = "";
                      }}
                    />
                  </label>
                  <p className="text-xs text-subtle">
                    支持 JPG / PNG / WebP / PDF / Excel / CSV / TXT，单个文件最大 {MAX_FILE_SIZE_MB}MB
                  </p>
                </div>
              </div>
            )}
          </section>

          {/* 文本输入（作息表模式下由下面的作息编辑器接管） */}
          {acceptsText && !isScheduleMode && !loading ? (
            <SectionCard
              icon="type"
              title="文本输入"
              description="适合手动粘贴通知、作业截止或自然语言描述。"
            >
              <textarea
                value={textInput}
                onChange={(event) => setTextInput(event.target.value)}
                rows={4}
                className="textarea"
                placeholder="例如：下周五晚上七点开班会，地点线上会议"
              />
              <Button
                variant="primary"
                icon="sparkles"
                onClick={() => void parseText(textInput, selectedPreset.source, selectedPreset.intent)}
                disabled={loading}
                className="mt-3"
              >
                生成事件
              </Button>
            </SectionCard>
          ) : null}

          {/* 作息表编辑器：作息表模式下常驻，其他模式下点「编辑」展开 */}
          {(isScheduleMode || scheduleOpen) && !loading ? (
            <ScheduleEditor
              template={scheduleTemplate}
              onChange={updateScheduleTemplate}
              onReset={resetSchedule}
              externalIssues={scheduleIssues}
              onClose={isScheduleMode ? undefined : () => setScheduleOpen(false)}
            />
          ) : null}
        </div>

        {/* 侧栏 */}
        <aside className="space-y-5">
          <SectionCard
            icon="calendar"
            title="学期起始"
            description="填第一周周一，课程周次按这个日期换算。"
          >
            <label>
              <span className="field-label">第一周周一</span>
              <input
                type="date"
                value={semesterStart}
                onChange={(event) => setSemesterStart(event.target.value)}
                className="input"
              />
            </label>
          </SectionCard>

          <SectionCard
            icon="clock"
            title="作息概览"
            description={scheduleMessage}
            action={
              isScheduleMode ? undefined : (
                <Button size="sm" variant="ghost" onClick={() => setScheduleOpen((open) => !open)}>
                  {scheduleOpen ? "收起" : "编辑"}
                </Button>
              )
            }
          >
            {/* 按上午 / 下午 / 晚上分组，读起来更接近纸质作息表 */}
            <div className="scroll-area max-h-64 space-y-3">
              {groupPeriodsByDayPart(scheduleTemplate.periods).map((group) => (
                <div key={group.part}>
                  <p className="mb-1.5 text-xs font-bold tracking-wide text-subtle">
                    {DAY_PART_LABELS[group.part]}
                    <span className="tabular ml-1.5 font-normal">{group.periods.length} 节</span>
                  </p>
                  <div className="grid grid-cols-2 gap-1.5 text-xs">
                    {group.periods.map((period) => (
                      <div key={period.periodNumber} className="rounded-lg bg-surface-2 px-2 py-1.5">
                        <span className="font-semibold text-fg">
                          {period.label ?? `第${period.periodNumber}节`}
                        </span>
                        <span className="tabular ml-1 text-muted">
                          {period.startTime}-{period.endTime}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {scheduleTemplate.periods.length === 0 ? (
                <p className="text-sm text-muted">作息表是空的，去左边添加节次。</p>
              ) : null}
            </div>
          </SectionCard>

          <section className="card-quiet p-5">
            <h2 className="flex items-center gap-2 font-bold text-fg">
              <Icon name="shield" size={17} className="text-primary" />
              当前约束
            </h2>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-muted">
              {["不做登录", "不写数据库，只用内存态", "只导出 ICS", "输入都围绕时间事件生成"].map(
                (item) => (
                  <li key={item} className="flex gap-2">
                    <Icon name="check" size={15} className="mt-1 shrink-0 text-primary" />
                    {item}
                  </li>
                ),
              )}
            </ul>
          </section>
        </aside>
      </div>

      {error ? (
        <div role="alert" className="alert alert-danger mt-6 animate-rise">
          <Icon name="alert" size={18} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}
    </div>
  );
}


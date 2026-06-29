"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { StepIndicator } from "@/app/_components/step-indicator";
import { useEventStore } from "@/stores/use-event-store";
import { useStepStore } from "@/stores/use-step-store";
import { parseScheduleTemplateText } from "@/lib/schedule/schedule-template-parser";
import type { CampusEvent, EventSource, RecognitionIntent } from "@/lib/types/campus-event";

const SUPPORTED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/jpg",
  "application/pdf",
  "text/csv",
  "text/plain",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

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
  const { setEvents, scheduleTemplate, setScheduleTemplate, resetScheduleTemplate } = useEventStore();
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

        const parseResponse = await fetch("/api/parse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ naturalInput: value, source, intent, scheduleTemplate }),
        }).then((response) => response.json());

        if (!parseResponse.success) {
          throw new Error(parseResponse.error?.message ?? "事件生成失败");
        }

        finishWithEvents(parseResponse.data.events ?? [], value, "manual");
      } catch (err) {
        setError(err instanceof Error ? err.message : "处理失败，请稍后重试。");
      } finally {
        setLoading(false);
      }
    },
    [applyScheduleText, finishWithEvents, isScheduleMode, scheduleTemplate],
  );

  const handleFile = useCallback(
    async (file: File) => {
      setError("");

      if (!SUPPORTED_TYPES.has(file.type)) {
        setError("请上传图片、PDF、Excel、CSV 或文本文件。");
        return;
      }

      if (file.size > 10 * 1024 * 1024) {
        setError("文件不能超过 10MB。");
        return;
      }

      const objectUrl = file.type.startsWith("image/") ? URL.createObjectURL(file) : null;
      setPreview(objectUrl);
      setImageUrl(objectUrl);
      setLoading(true);
      setStatus(isScheduleMode ? "正在读取作息表..." : "正在读取来源...");

      try {
        const formData = new FormData();
        formData.append("file", file);
        if (isScheduleMode) formData.append("purpose", "schedule");

        const uploadResponse = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        }).then((response) => response.json());

        if (!uploadResponse.success) {
          throw new Error(uploadResponse.error?.message ?? "文件上传失败");
        }

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
        const parseResponse = await fetch("/api/parse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ocrText: uploadResponse.data.ocrText,
            intent: selectedPreset.intent,
            source: uploadResponse.data.source ?? selectedPreset.source,
            semesterStart: uploadResponse.data.semesterStart,
            scheduleTemplate,
          }),
        }).then((response) => response.json());

        if (!parseResponse.success) {
          throw new Error(parseResponse.error?.message ?? "事件生成失败");
        }

        finishWithEvents(
          parseResponse.data.events ?? [],
          uploadResponse.data.ocrText,
          uploadResponse.data.inputHash,
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "处理失败，请稍后重试。");
      } finally {
        setLoading(false);
      }
    },
    [applyScheduleText, finishWithEvents, isScheduleMode, scheduleTemplate, selectedPreset.intent, selectedPreset.source, setImageUrl, setOcrResult],
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
    <div className="mx-auto max-w-6xl">
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

      <section className="mb-5 overflow-x-auto rounded-xl border border-emerald-100 bg-white p-2 shadow-sm">
        <div className="flex min-w-max gap-2">
          {SOURCE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              onClick={() => choosePreset(preset.id)}
              className={[
                "rounded-lg px-4 py-3 text-left transition",
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
                  <p className="mt-4 text-sm text-stone-500">支持图片、PDF、Excel 和文本；最大 10MB。</p>
                </div>
                <label className="inline-flex cursor-pointer items-center justify-center rounded-lg bg-emerald-700 px-5 py-3 font-semibold text-white shadow-lg shadow-emerald-100 transition hover:bg-emerald-800">
                  {isScheduleMode ? "上传作息表" : "选择文件"}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,application/pdf,text/csv,text/plain,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void handleFile(file);
                    }}
                  />
                </label>
              </div>
            )}
          </section>

          {(acceptsText || isScheduleMode) && !loading ? (
            <section className="rounded-xl border border-emerald-100 bg-white p-5 shadow-sm">
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
            <section className="rounded-xl border border-emerald-100 bg-white p-5 shadow-sm">
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
          <section className="rounded-xl border border-emerald-100 bg-white p-5 shadow-sm">
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



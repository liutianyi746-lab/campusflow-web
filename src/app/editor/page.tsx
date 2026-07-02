"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { StepIndicator } from "@/app/_components/step-indicator";
import {
  eventLocation,
  eventTypeLabel,
  eventTypeTone,
  formatEventRule,
  formatEventTime,
  sourceLabel,
} from "@/lib/ui/event-format";
import { apiUrl } from "@/lib/http/api-client";
import type { CampusEvent, CampusEventType, CourseFields, WeekType } from "@/lib/types/campus-event";
import { useEventStore } from "@/stores/use-event-store";

const EVENT_TYPES: CampusEventType[] = ["COURSE", "EXAM", "HOMEWORK", "MEETING", "ACTIVITY", "REMINDER"];
const WEEK_TYPES: Array<{ value: WeekType; label: string }> = [
  { value: "EVERY_WEEK", label: "每周" },
  { value: "ODD_WEEK", label: "单周" },
  { value: "EVEN_WEEK", label: "双周" },
  { value: "SPECIFIC_WEEKS", label: "指定周" },
];

type EventDraft = {
  title: string;
  type: CampusEventType;
  startTime: string;
  endTime: string;
  location: string;
  seatNumber: string;
  description: string;
  reminderMinutes: string;
  courseName: string;
  teacher: string;
  classroom: string;
  dayOfWeek: string;
  periodStart: string;
  periodEnd: string;
  weekStart: string;
  weekEnd: string;
  weekType: WeekType;
};

type EventEditorProps = {
  event: CampusEvent;
  updateEvent: (id: string, patch: Partial<CampusEvent>) => void;
  removeEvent: (id: string) => void;
  setMessage: (message: string) => void;
};

function toLocalInput(value?: string) {
  return value ? value.slice(0, 16) : "";
}

function fromLocalInput(value: string) {
  return value ? `${value}:00` : undefined;
}

function safeNumber(value: string, fallback: number, min = 1, max = 99) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function buildDraft(event: CampusEvent): EventDraft {
  const course = event.course;
  return {
    title: event.title,
    type: event.type,
    startTime: toLocalInput(event.startTime),
    endTime: toLocalInput(event.endTime),
    location: event.location ?? course?.classroom ?? "",
    seatNumber: event.seatNumber ?? "",
    description: event.description ?? "",
    reminderMinutes: String(event.reminderMinutes ?? 30),
    courseName: course?.courseName ?? event.title,
    teacher: course?.teacher ?? "",
    classroom: course?.classroom ?? event.location ?? "",
    dayOfWeek: String(course?.dayOfWeek ?? 1),
    periodStart: String(course?.periodStart ?? 1),
    periodEnd: String(course?.periodEnd ?? course?.periodStart ?? 1),
    weekStart: String(course?.weekStart ?? 1),
    weekEnd: String(course?.weekEnd ?? 16),
    weekType: course?.weekType ?? event.weekType ?? "EVERY_WEEK",
  };
}

function EventEditor({ event, updateEvent, removeEvent, setMessage }: EventEditorProps) {
  const [draft, setDraft] = useState<EventDraft>(() => buildDraft(event));

  const setDraftField = <K extends keyof EventDraft>(key: K, value: EventDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const saveDraft = () => {
    const title = draft.title.trim();
    if (!title) {
      setMessage("标题不能为空。");
      return;
    }

    const shouldSaveCourse = draft.type === "COURSE" || Boolean(event.course);
    const previousCourse = event.course;
    const coursePatch: CourseFields | undefined = shouldSaveCourse
      ? {
          courseName: draft.courseName.trim() || title,
          teacher: draft.teacher.trim() || undefined,
          classroom: draft.classroom.trim() || draft.location.trim() || undefined,
          dayOfWeek: safeNumber(draft.dayOfWeek, previousCourse?.dayOfWeek ?? 1, 1, 7),
          periodStart: safeNumber(draft.periodStart, previousCourse?.periodStart ?? 1, 1, 14),
          periodEnd: safeNumber(draft.periodEnd, previousCourse?.periodEnd ?? previousCourse?.periodStart ?? 1, 1, 14),
          weekStart: safeNumber(draft.weekStart, previousCourse?.weekStart ?? 1, 1, 30),
          weekEnd: safeNumber(draft.weekEnd, previousCourse?.weekEnd ?? 16, 1, 30),
          weekType: draft.weekType,
          specificWeeks: previousCourse?.specificWeeks,
        }
      : undefined;

    updateEvent(event.id, {
      title,
      type: draft.type,
      startTime: fromLocalInput(draft.startTime),
      endTime: fromLocalInput(draft.endTime),
      location: draft.location.trim() || coursePatch?.classroom || undefined,
      seatNumber: draft.type === "EXAM" ? draft.seatNumber.trim() || undefined : undefined,
      description: draft.description.trim() || undefined,
      reminderMinutes: safeNumber(draft.reminderMinutes, event.reminderMinutes ?? 30, 0, 1440),
      weekType: coursePatch?.weekType ?? event.weekType,
      course: coursePatch,
    });
    setMessage("已保存修改，导出 ICS 时会使用最新内容。");
  };

  const deleteCurrent = () => {
    removeEvent(event.id);
    setMessage("已删除当前事件。");
  };

  return (
    <section className="rounded-xl border border-emerald-100 bg-white p-5 shadow-sm">
      <div className="flex flex-col justify-between gap-3 border-b border-stone-100 pb-4 sm:flex-row sm:items-start">
        <div>
          <h2 className="font-bold text-emerald-950">编辑事件</h2>
          <p className="mt-1 text-sm text-stone-500">当前来源：{sourceLabel(event.source)}</p>
        </div>
        <span className="w-fit rounded-full bg-stone-50 px-3 py-1 text-xs font-semibold text-stone-600 ring-1 ring-stone-200">
          置信度 {Math.round(event.confidence * 100)}%
        </span>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="md:col-span-2">
          <span className="text-sm font-semibold text-stone-700">标题 / 课程</span>
          <input
            value={draft.title}
            onChange={(inputEvent) => setDraftField("title", inputEvent.target.value)}
            className="mt-2 w-full rounded-lg border border-stone-200 px-3 py-2 outline-emerald-700"
          />
        </label>
        <label>
          <span className="text-sm font-semibold text-stone-700">类型</span>
          <select
            value={draft.type}
            onChange={(inputEvent) => setDraftField("type", inputEvent.target.value as CampusEventType)}
            className="mt-2 w-full rounded-lg border border-stone-200 px-3 py-2 outline-emerald-700"
          >
            {EVENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {eventTypeLabel(type)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="text-sm font-semibold text-stone-700">地点</span>
          <input
            value={draft.location}
            onChange={(inputEvent) => setDraftField("location", inputEvent.target.value)}
            className="mt-2 w-full rounded-lg border border-stone-200 px-3 py-2 outline-emerald-700"
            placeholder="例如：教学楼 A301"
          />
        </label>
        {draft.type === "EXAM" ? (
          <label>
            <span className="text-sm font-semibold text-stone-700">座位号</span>
            <input
              value={draft.seatNumber}
              onChange={(inputEvent) => setDraftField("seatNumber", inputEvent.target.value)}
              className="mt-2 w-full rounded-lg border border-stone-200 px-3 py-2 outline-emerald-700"
              placeholder="例如：57"
            />
          </label>
        ) : null}
        <label>
          <span className="text-sm font-semibold text-stone-700">开始时间</span>
          <input
            type="datetime-local"
            value={draft.startTime}
            onChange={(inputEvent) => setDraftField("startTime", inputEvent.target.value)}
            className="mt-2 w-full rounded-lg border border-stone-200 px-3 py-2 outline-emerald-700"
          />
        </label>
        <label>
          <span className="text-sm font-semibold text-stone-700">结束时间</span>
          <input
            type="datetime-local"
            value={draft.endTime}
            onChange={(inputEvent) => setDraftField("endTime", inputEvent.target.value)}
            className="mt-2 w-full rounded-lg border border-stone-200 px-3 py-2 outline-emerald-700"
          />
        </label>
        <label>
          <span className="text-sm font-semibold text-stone-700">提醒提前分钟</span>
          <input
            type="number"
            min={0}
            value={draft.reminderMinutes}
            onChange={(inputEvent) => setDraftField("reminderMinutes", inputEvent.target.value)}
            className="mt-2 w-full rounded-lg border border-stone-200 px-3 py-2 outline-emerald-700"
          />
        </label>
        <label className="md:col-span-2">
          <span className="text-sm font-semibold text-stone-700">备注</span>
          <textarea
            value={draft.description}
            onChange={(inputEvent) => setDraftField("description", inputEvent.target.value)}
            rows={3}
            className="mt-2 w-full resize-none rounded-lg border border-stone-200 px-3 py-2 outline-emerald-700"
          />
        </label>
      </div>

      {draft.type === "COURSE" || event.course ? (
        <div className="mt-5 border-t border-stone-100 pt-5">
          <h3 className="font-bold text-emerald-950">课程映射</h3>
          <div className="mt-4 grid gap-4 md:grid-cols-4">
            <label className="md:col-span-2">
              <span className="text-sm font-semibold text-stone-700">课程名</span>
              <input
                value={draft.courseName}
                onChange={(inputEvent) => setDraftField("courseName", inputEvent.target.value)}
                className="mt-2 w-full rounded-lg border border-stone-200 px-3 py-2 outline-emerald-700"
              />
            </label>
            <label>
              <span className="text-sm font-semibold text-stone-700">教师</span>
              <input
                value={draft.teacher}
                onChange={(inputEvent) => setDraftField("teacher", inputEvent.target.value)}
                className="mt-2 w-full rounded-lg border border-stone-200 px-3 py-2 outline-emerald-700"
              />
            </label>
            <label>
              <span className="text-sm font-semibold text-stone-700">教室</span>
              <input
                value={draft.classroom}
                onChange={(inputEvent) => setDraftField("classroom", inputEvent.target.value)}
                className="mt-2 w-full rounded-lg border border-stone-200 px-3 py-2 outline-emerald-700"
              />
            </label>
            <label>
              <span className="text-sm font-semibold text-stone-700">星期</span>
              <select
                value={draft.dayOfWeek}
                onChange={(inputEvent) => setDraftField("dayOfWeek", inputEvent.target.value)}
                className="mt-2 w-full rounded-lg border border-stone-200 px-3 py-2 outline-emerald-700"
              >
                {["周一", "周二", "周三", "周四", "周五", "周六", "周日"].map((label, index) => (
                  <option key={label} value={index + 1}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="text-sm font-semibold text-stone-700">开始节次</span>
              <input
                type="number"
                min={1}
                value={draft.periodStart}
                onChange={(inputEvent) => setDraftField("periodStart", inputEvent.target.value)}
                className="mt-2 w-full rounded-lg border border-stone-200 px-3 py-2 outline-emerald-700"
              />
            </label>
            <label>
              <span className="text-sm font-semibold text-stone-700">结束节次</span>
              <input
                type="number"
                min={1}
                value={draft.periodEnd}
                onChange={(inputEvent) => setDraftField("periodEnd", inputEvent.target.value)}
                className="mt-2 w-full rounded-lg border border-stone-200 px-3 py-2 outline-emerald-700"
              />
            </label>
            <label>
              <span className="text-sm font-semibold text-stone-700">周次规则</span>
              <select
                value={draft.weekType}
                onChange={(inputEvent) => setDraftField("weekType", inputEvent.target.value as WeekType)}
                className="mt-2 w-full rounded-lg border border-stone-200 px-3 py-2 outline-emerald-700"
              >
                {WEEK_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="text-sm font-semibold text-stone-700">起始周</span>
              <input
                type="number"
                min={1}
                value={draft.weekStart}
                onChange={(inputEvent) => setDraftField("weekStart", inputEvent.target.value)}
                className="mt-2 w-full rounded-lg border border-stone-200 px-3 py-2 outline-emerald-700"
              />
            </label>
            <label>
              <span className="text-sm font-semibold text-stone-700">结束周</span>
              <input
                type="number"
                min={1}
                value={draft.weekEnd}
                onChange={(inputEvent) => setDraftField("weekEnd", inputEvent.target.value)}
                className="mt-2 w-full rounded-lg border border-stone-200 px-3 py-2 outline-emerald-700"
              />
            </label>
          </div>
        </div>
      ) : null}

      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <button
          onClick={saveDraft}
          className="rounded-lg bg-emerald-700 px-5 py-3 font-semibold text-white hover:bg-emerald-800"
        >
          保存修改
        </button>
        <button
          onClick={deleteCurrent}
          className="rounded-lg border border-rose-200 px-5 py-3 font-semibold text-rose-700 hover:bg-rose-50"
        >
          删除当前事件
        </button>
      </div>
    </section>
  );
}

export default function EditorPage() {
  const router = useRouter();
  const {
    events,
    selectedIds,
    scheduleTemplate,
    semesterStart,
    noClassDates,
    setSemesterStart,
    addNoClassDate,
    removeNoClassDate,
    resetNoClassDates,
    toggleSelect,
    selectAll,
    removeEvent,
    appendEvents,
    updateEvent,
  } = useEventStore();
  const [input, setInput] = useState("下周五晚上七点开班会，地点线上会议");
  const [newNoClassDate, setNewNoClassDate] = useState("");
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState("");
  const [editingId, setEditingId] = useState<string | null>(events[0]?.id ?? null);

  const selectedEvent = useMemo(
    () => events.find((event) => event.id === editingId) ?? events[0] ?? null,
    [editingId, events],
  );

  const addFromText = async () => {
    if (!input.trim()) return;
    setAdding(true);
    setMessage("");

    try {
      const response = await fetch(apiUrl("/api/parse"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ naturalInput: input, source: "TEXT", semesterStart, scheduleTemplate }),
      }).then((res) => res.json());

      const parsedEvents = response.data?.events ?? [];
      if (response.success && parsedEvents.length) {
        appendEvents(parsedEvents);
        setInput("");
        setEditingId(parsedEvents[0].id);
        setMessage(`已添加 ${parsedEvents.length} 个时间事件。`);
      } else {
        setMessage("没有识别到可执行时间事件，请换一种更明确的说法。");
      }
    } catch {
      setMessage("添加失败，请稍后再试。");
    } finally {
      setAdding(false);
    }
  };

  const exportIcs = async () => {
    const selectedEvents = events.filter((event) => selectedIds.has(event.id));
    if (!selectedEvents.length) {
      setMessage("请至少选择一个事件再导出。");
      return;
    }

    const response = await fetch(apiUrl("/api/ics"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        events: selectedEvents,
        semesterStart,
        calendarName: "CampusFlow 校园事件",
        periods: scheduleTemplate.periods,
        noClassDates,
      }),
    });

    if (!response.ok) {
      setMessage("导出失败，请稍后再试。");
      return;
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "campusflow-events.ics";
    anchor.click();
    URL.revokeObjectURL(url);
    router.push("/export");
  };

  if (!events.length) {
    return (
      <div className="mx-auto max-w-2xl rounded-2xl border border-emerald-100 bg-white p-8 text-center shadow-sm">
        <h1 className="text-2xl font-black text-emerald-950">编辑台还没有事件</h1>
        <p className="mt-3 text-stone-600">上传校园信息后，可以在这里校对地点、时间和课程字段。</p>
        <button
          onClick={() => router.push("/upload")}
          className="mt-6 rounded-lg bg-emerald-700 px-5 py-3 font-semibold text-white hover:bg-emerald-800"
        >
          去生成事件
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <StepIndicator current="editor" />
      <div className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">Step 3</p>
          <h1 className="mt-2 text-3xl font-black text-emerald-950">核对识别结果</h1>
          <p className="mt-3 max-w-2xl text-stone-600">逐条修正识别错的课程、地点和时间，再导出 ICS。</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-[180px_auto] sm:items-end">
          <label>
            <span className="text-sm font-semibold text-stone-700">第一周周一</span>
            <input
              type="date"
              value={semesterStart}
              onChange={(event) => setSemesterStart(event.target.value)}
              className="mt-2 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 outline-emerald-700"
            />
          </label>
          <button
            onClick={exportIcs}
            className="rounded-lg bg-emerald-900 px-5 py-3 font-black text-lime-200 transition hover:bg-emerald-800"
          >
            导出 ICS（{selectedIds.size}）
          </button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
        <section className="overflow-hidden rounded-xl border border-emerald-100 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-emerald-100 px-4 py-3">
            <div>
              <h2 className="font-bold text-emerald-950">事件列表</h2>
              <p className="mt-1 text-xs text-stone-500">
                已选择 {selectedIds.size} / {events.length}
              </p>
            </div>
            <button onClick={selectAll} className="rounded-md px-3 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-50">
              全选
            </button>
          </div>
          <div className="max-h-[620px] overflow-auto">
            {events.map((event) => {
              const active = event.id === selectedEvent?.id;
              return (
                <article
                  key={event.id}
                  onClick={() => setEditingId(event.id)}
                  className={[
                    "grid cursor-pointer grid-cols-[22px_1fr] gap-3 border-b border-stone-100 px-4 py-3 transition last:border-b-0",
                    active ? "bg-emerald-50" : "bg-white hover:bg-stone-50",
                  ].join(" ")}
                >
                  <input
                    aria-label={`选择 ${event.title}`}
                    type="checkbox"
                    checked={selectedIds.has(event.id)}
                    onClick={(clickEvent) => clickEvent.stopPropagation()}
                    onChange={() => toggleSelect(event.id)}
                    className="mt-1 size-4 accent-emerald-700"
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate font-semibold text-emerald-950">{event.title}</h3>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${eventTypeTone(event.type)}`}>
                        {eventTypeLabel(event.type)}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-sm text-stone-600">
                      {formatEventTime(event)} · {eventLocation(event)}{event.type === "EXAM" && event.seatNumber ? ` · 座位 ${event.seatNumber}` : ""}
                    </p>
                    <p className="mt-1 truncate text-xs text-stone-400">
                      {formatEventRule(event)} · {sourceLabel(event.source)}
                    </p>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <main className="space-y-5">
          <section className="rounded-xl border border-emerald-100 bg-white p-5 shadow-sm">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
              <div>
                <h2 className="font-bold text-emerald-950">节假日停课</h2>
                <p className="mt-1 text-sm text-stone-600">
                  导出 ICS 时，课程落在这些日期会自动跳过。默认包含 2026 年中国法定节假日，可补充学校校历停课日。
                </p>
              </div>
              <button
                onClick={() => {
                  resetNoClassDates();
                  setMessage("已恢复 2026 年默认节假日停课日期。");
                }}
                className="w-fit rounded-lg border border-emerald-200 px-4 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-50"
              >
                恢复默认
              </button>
            </div>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <input
                type="date"
                value={newNoClassDate}
                onChange={(event) => setNewNoClassDate(event.target.value)}
                className="rounded-lg border border-stone-200 bg-white px-3 py-2 outline-emerald-700"
              />
              <button
                onClick={() => {
                  if (!newNoClassDate) return;
                  addNoClassDate(newNoClassDate);
                  setNewNoClassDate("");
                  setMessage("已添加停课日期，导出 ICS 时会跳过当天课程。");
                }}
                className="rounded-lg bg-emerald-700 px-5 py-2 font-semibold text-white hover:bg-emerald-800"
              >
                添加停课日
              </button>
            </div>
            <div className="mt-4 flex max-h-36 flex-wrap gap-2 overflow-auto">
              {noClassDates.map((date) => (
                <button
                  key={date}
                  onClick={() => removeNoClassDate(date)}
                  className="rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-900 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
                  title="点击移除"
                >
                  {date}
                </button>
              ))}
            </div>
          </section>

          {selectedEvent ? (
            <EventEditor
              key={selectedEvent.id}
              event={selectedEvent}
              updateEvent={updateEvent}
              removeEvent={removeEvent}
              setMessage={setMessage}
            />
          ) : null}

          <section className="grid gap-4 rounded-xl border border-emerald-100 bg-white p-5 shadow-sm lg:grid-cols-[1fr_auto] lg:items-end">
            <label>
              <span className="font-bold text-emerald-950">补充一条事件</span>
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                rows={3}
                className="mt-3 w-full resize-none rounded-lg border border-stone-200 px-3 py-2 text-sm outline-emerald-700"
                placeholder="例如：6月20日 23:59 前提交实验报告"
              />
            </label>
            <button
              onClick={addFromText}
              disabled={adding}
              className="rounded-lg border border-emerald-200 px-5 py-3 font-semibold text-emerald-800 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {adding ? "生成中..." : "添加事件"}
            </button>
          </section>
        </main>
      </div>

      {message ? (
        <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {message}
        </div>
      ) : null}
    </div>
  );
}

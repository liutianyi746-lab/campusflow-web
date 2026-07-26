"use client";

import { useMemo, useState, type ReactNode } from "react";
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
import { cn } from "@/lib/utils/cn";
import { Button, Chip, EmptyState, SectionCard } from "@/components/ui";
import { Icon } from "@/components/ui/icon";
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

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
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
    <section className="card p-5 sm:p-6">
      <div className="flex flex-col justify-between gap-3 border-b border-line pb-4 sm:flex-row sm:items-start">
        <div className="flex gap-3">
          <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary-soft-fg">
            <Icon name="sliders" size={18} />
          </span>
          <div>
            <h2 className="text-base font-bold text-fg">编辑事件</h2>
            <p className="mt-1 text-sm text-muted">当前来源：{sourceLabel(event.source)}</p>
          </div>
        </div>
        <Chip tone="chip-neutral" dot>
          置信度 {Math.round(event.confidence * 100)}%
        </Chip>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <Field label="标题 / 课程" className="md:col-span-2">
          <input
            value={draft.title}
            onChange={(inputEvent) => setDraftField("title", inputEvent.target.value)}
            className="input"
          />
        </Field>
        <Field label="类型">
          <select
            value={draft.type}
            onChange={(inputEvent) => setDraftField("type", inputEvent.target.value as CampusEventType)}
            className="select"
          >
            {EVENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {eventTypeLabel(type)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="地点">
          <input
            value={draft.location}
            onChange={(inputEvent) => setDraftField("location", inputEvent.target.value)}
            className="input"
            placeholder="例如：教学楼 A301"
          />
        </Field>
        {draft.type === "EXAM" ? (
          <Field label="座位号">
            <input
              value={draft.seatNumber}
              onChange={(inputEvent) => setDraftField("seatNumber", inputEvent.target.value)}
              className="input"
              placeholder="例如：57"
            />
          </Field>
        ) : null}
        <Field label="开始时间">
          <input
            type="datetime-local"
            value={draft.startTime}
            onChange={(inputEvent) => setDraftField("startTime", inputEvent.target.value)}
            className="input"
          />
        </Field>
        <Field label="结束时间">
          <input
            type="datetime-local"
            value={draft.endTime}
            onChange={(inputEvent) => setDraftField("endTime", inputEvent.target.value)}
            className="input"
          />
        </Field>
        <Field label="提醒提前分钟">
          <input
            type="number"
            min={0}
            value={draft.reminderMinutes}
            onChange={(inputEvent) => setDraftField("reminderMinutes", inputEvent.target.value)}
            className="input"
          />
        </Field>
        <Field label="备注" className="md:col-span-2">
          <textarea
            value={draft.description}
            onChange={(inputEvent) => setDraftField("description", inputEvent.target.value)}
            rows={3}
            className="textarea"
          />
        </Field>
      </div>

      {draft.type === "COURSE" || event.course ? (
        <div className="mt-6 border-t border-line pt-5">
          <h3 className="flex items-center gap-2 font-bold text-fg">
            <Icon name="calendar" size={16} className="text-primary" />
            课程映射
          </h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="课程名" className="sm:col-span-2">
              <input
                value={draft.courseName}
                onChange={(inputEvent) => setDraftField("courseName", inputEvent.target.value)}
                className="input"
              />
            </Field>
            <Field label="教师">
              <input
                value={draft.teacher}
                onChange={(inputEvent) => setDraftField("teacher", inputEvent.target.value)}
                className="input"
              />
            </Field>
            <Field label="教室">
              <input
                value={draft.classroom}
                onChange={(inputEvent) => setDraftField("classroom", inputEvent.target.value)}
                className="input"
              />
            </Field>
            <Field label="星期">
              <select
                value={draft.dayOfWeek}
                onChange={(inputEvent) => setDraftField("dayOfWeek", inputEvent.target.value)}
                className="select"
              >
                {["周一", "周二", "周三", "周四", "周五", "周六", "周日"].map((label, index) => (
                  <option key={label} value={index + 1}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="开始节次">
              <input
                type="number"
                min={1}
                value={draft.periodStart}
                onChange={(inputEvent) => setDraftField("periodStart", inputEvent.target.value)}
                className="input"
              />
            </Field>
            <Field label="结束节次">
              <input
                type="number"
                min={1}
                value={draft.periodEnd}
                onChange={(inputEvent) => setDraftField("periodEnd", inputEvent.target.value)}
                className="input"
              />
            </Field>
            <Field label="周次规则">
              <select
                value={draft.weekType}
                onChange={(inputEvent) => setDraftField("weekType", inputEvent.target.value as WeekType)}
                className="select"
              >
                {WEEK_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="起始周">
              <input
                type="number"
                min={1}
                value={draft.weekStart}
                onChange={(inputEvent) => setDraftField("weekStart", inputEvent.target.value)}
                className="input"
              />
            </Field>
            <Field label="结束周">
              <input
                type="number"
                min={1}
                value={draft.weekEnd}
                onChange={(inputEvent) => setDraftField("weekEnd", inputEvent.target.value)}
                className="input"
              />
            </Field>
          </div>
        </div>
      ) : null}

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Button variant="primary" icon="check" onClick={saveDraft}>
          保存修改
        </Button>
        <Button variant="danger" icon="trash" onClick={deleteCurrent}>
          删除当前事件
        </Button>
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
      <EmptyState
        icon="sliders"
        title="编辑台还没有事件"
        description="上传校园信息后，可以在这里校对地点、时间和课程字段。"
        action={
          <Button variant="primary" icon="upload" onClick={() => router.push("/upload")}>
            去生成事件
          </Button>
        }
      />
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <StepIndicator current="editor" />

      <header className="mb-7 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="eyebrow">Step 3</p>
          <h1 className="mt-2 text-3xl font-extrabold text-fg">核对识别结果</h1>
          <p className="mt-2.5 max-w-2xl text-muted">
            逐条修正识别错的课程、地点和时间，再导出 ICS。
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="sm:w-44">
            <span className="field-label">第一周周一</span>
            <input
              type="date"
              value={semesterStart}
              onChange={(event) => setSemesterStart(event.target.value)}
              className="input"
            />
          </label>
          <Button variant="primary" icon="download" onClick={exportIcs}>
            导出 ICS（{selectedIds.size}）
          </Button>
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        {/* 事件列表 */}
        <section className="card overflow-hidden lg:sticky lg:top-24 lg:self-start">
          <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
            <div>
              <h2 className="font-bold text-fg">事件列表</h2>
              <p className="tabular mt-0.5 text-xs text-subtle">
                已选择 {selectedIds.size} / {events.length}
              </p>
            </div>
            <Button size="sm" variant="ghost" icon="check" onClick={selectAll}>
              全选
            </Button>
          </div>
          {/* 手机上不做内层滚动，嵌套滚动在 iOS 上很难操作 */}
          <div className="scroll-area max-h-none lg:max-h-[560px]">
            {events.map((event) => {
              const active = event.id === selectedEvent?.id;
              return (
                <article
                  key={event.id}
                  onClick={() => setEditingId(event.id)}
                  className={cn(
                    "relative grid cursor-pointer grid-cols-[22px_minmax(0,1fr)] gap-3 border-b border-line px-4 py-3 transition-colors last:border-b-0",
                    active ? "bg-primary-soft/60" : "hover:bg-surface-2",
                  )}
                >
                  {active ? (
                    <span
                      aria-hidden="true"
                      className="absolute inset-y-0 left-0 w-[3px] rounded-r bg-primary"
                    />
                  ) : null}
                  <input
                    aria-label={`选择 ${event.title}`}
                    type="checkbox"
                    checked={selectedIds.has(event.id)}
                    onClick={(clickEvent) => clickEvent.stopPropagation()}
                    onChange={() => toggleSelect(event.id)}
                    className="checkbox mt-1"
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate font-semibold text-fg">{event.title}</h3>
                      <Chip tone={eventTypeTone(event.type)} className="shrink-0">
                        {eventTypeLabel(event.type)}
                      </Chip>
                    </div>
                    <p className="tabular mt-1 truncate text-sm text-muted">
                      {formatEventTime(event)} · {eventLocation(event)}
                      {event.type === "EXAM" && event.seatNumber ? ` · 座位 ${event.seatNumber}` : ""}
                    </p>
                    <p className="mt-1 truncate text-xs text-subtle">
                      {formatEventRule(event)} · {sourceLabel(event.source)}
                    </p>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <div className="space-y-5">
          <SectionCard
            icon="calendar"
            title="节假日停课"
            description="导出 ICS 时，课程落在这些日期会自动跳过。默认包含 2026 年中国法定节假日，可补充学校校历停课日。"
            action={
              <Button
                size="sm"
                icon="refresh"
                onClick={() => {
                  resetNoClassDates();
                  setMessage("已恢复 2026 年默认节假日停课日期。");
                }}
              >
                恢复默认
              </Button>
            }
          >
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                type="date"
                value={newNoClassDate}
                onChange={(event) => setNewNoClassDate(event.target.value)}
                className="input sm:w-52"
              />
              <Button
                variant="primary"
                icon="plus"
                onClick={() => {
                  if (!newNoClassDate) return;
                  addNoClassDate(newNoClassDate);
                  setNewNoClassDate("");
                  setMessage("已添加停课日期，导出 ICS 时会跳过当天课程。");
                }}
              >
                添加停课日
              </Button>
            </div>
            <div className="scroll-area mt-4 flex max-h-36 flex-wrap gap-2">
              {noClassDates.map((date) => (
                <button
                  key={date}
                  type="button"
                  onClick={() => removeNoClassDate(date)}
                  title="点击移除"
                  className="tabular group inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2.5 py-1 text-xs font-semibold text-muted transition-colors hover:border-danger/45 hover:bg-danger-soft hover:text-danger-soft-fg"
                >
                  {date}
                  <Icon name="close" size={12} className="opacity-50 group-hover:opacity-100" />
                </button>
              ))}
            </div>
          </SectionCard>

          {selectedEvent ? (
            <EventEditor
              key={selectedEvent.id}
              event={selectedEvent}
              updateEvent={updateEvent}
              removeEvent={removeEvent}
              setMessage={setMessage}
            />
          ) : null}

          <SectionCard
            icon="plus"
            title="补充一条事件"
            description="用一句自然语言描述，会直接追加到事件列表。"
          >
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                rows={3}
                className="textarea"
                placeholder="例如：6月20日 23:59 前提交实验报告"
              />
              <Button icon="sparkles" onClick={addFromText} disabled={adding}>
                {adding ? "生成中..." : "添加事件"}
              </Button>
            </div>
          </SectionCard>
        </div>
      </div>

      {message ? (
        <div role="status" className="alert alert-info mt-6 animate-rise">
          <Icon name="check-circle" size={18} className="mt-0.5 shrink-0" />
          <span>{message}</span>
        </div>
      ) : null}
    </div>
  );
}

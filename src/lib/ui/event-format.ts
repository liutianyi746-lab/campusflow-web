import type { CampusEvent, CampusEventType, EventSource } from "../types/campus-event.ts";
import { formatCourseSlot, formatWeekRule, weekdayName } from "./course-format.ts";

const EVENT_TYPE_LABELS: Record<CampusEventType, string> = {
  COURSE: "课程",
  EXAM: "考试",
  HOMEWORK: "作业",
  MEETING: "会议",
  ACTIVITY: "活动",
  REMINDER: "提醒",
};

const SOURCE_LABELS: Record<EventSource, string> = {
  IMAGE: "图片",
  PDF: "PDF",
  EXCEL: "Excel",
  TEXT: "文本",
  MANUAL: "手动",
  OCR_STUB: "识别示例",
  AI: "AI",
};

export function eventTypeLabel(type: CampusEventType): string {
  return EVENT_TYPE_LABELS[type] ?? type;
}

export function sourceLabel(source: EventSource): string {
  return SOURCE_LABELS[source] ?? source;
}

export function eventTypeTone(type: CampusEventType): string {
  switch (type) {
    case "COURSE":
      return "bg-sky-50 text-sky-700 ring-sky-200";
    case "EXAM":
      return "bg-rose-50 text-rose-700 ring-rose-200";
    case "HOMEWORK":
      return "bg-amber-50 text-amber-700 ring-amber-200";
    case "MEETING":
      return "bg-violet-50 text-violet-700 ring-violet-200";
    case "ACTIVITY":
      return "bg-lime-50 text-lime-700 ring-lime-200";
    default:
      return "bg-stone-50 text-stone-700 ring-stone-200";
  }
}

export function formatEventTime(event: Pick<CampusEvent, "type" | "startTime" | "endTime" | "course">): string {
  if (event.type === "COURSE" && event.course) {
    return `${weekdayName(event.course.dayOfWeek)} ${formatCourseSlot(event.course.periodStart, event.course.periodEnd)}`;
  }

  if (!event.startTime) return "时间待确认";

  const start = event.startTime.replace("T", " ").slice(0, 16);
  if (!event.endTime) return start;

  const end = event.endTime.slice(0, 10) === event.startTime.slice(0, 10)
    ? event.endTime.slice(11, 16)
    : event.endTime.replace("T", " ").slice(0, 16);

  return `${start}-${end}`;
}

export function formatEventRule(event: CampusEvent): string {
  if (event.type === "COURSE" && event.course) {
    return formatWeekRule(event.course.weekStart, event.course.weekEnd, event.course.weekType);
  }

  return event.rrule ? "重复事件" : "单次事件";
}

export function eventLocation(event: CampusEvent): string {
  return event.location ?? event.course?.classroom ?? "地点待补充";
}



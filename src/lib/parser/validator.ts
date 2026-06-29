import type {
  CampusEvent,
  CampusEventType,
  EventSource,
  WeekType,
} from "@/lib/types/campus-event";

interface RawCourse {
  name?: string;
  teacher?: string | null;
  location?: string | null;
  dayOfWeek?: number;
  periodStart?: number;
  periodEnd?: number;
  weekStart?: number;
  weekEnd?: number;
  weekType?: string | null;
  specificWeeks?: number[] | null;
  confidence?: number;
}

interface RawGeneralEvent {
  title?: string;
  type?: string;
  eventType?: string;
  date?: string;
  timeStart?: string;
  timeEnd?: string;
  location?: string | null;
  seatNumber?: string | number | null;
  description?: string | null;
  confidence?: number;
  uncertainFields?: string[];
}

function id(): string {
  return globalThis.crypto?.randomUUID?.() ?? `event-${Date.now()}-${Math.random()}`;
}

function clampConfidence(value?: number): number {
  if (typeof value !== "number" || Number.isNaN(value)) return 0.5;
  return Math.max(0, Math.min(1, value));
}

function isWeekType(value?: string | null): value is WeekType {
  return (
    value === "EVERY_WEEK" ||
    value === "ODD_WEEK" ||
    value === "EVEN_WEEK" ||
    value === "SPECIFIC_WEEKS"
  );
}

function isEventType(value?: string): value is CampusEventType {
  return (
    value === "COURSE" ||
    value === "EXAM" ||
    value === "HOMEWORK" ||
    value === "MEETING" ||
    value === "ACTIVITY" ||
    value === "REMINDER"
  );
}

function normalizeDateTime(date?: string, time?: string): string | undefined {
  if (!date) return undefined;
  const safeTime = time && /^\d{2}:\d{2}$/.test(time) ? time : "09:00";
  return `${date}T${safeTime}:00`;
}

export function validateCourses(
  raw: RawCourse[],
  source: EventSource = "AI",
): { events: CampusEvent[]; unrecognizedItems: string[] } {
  const events: CampusEvent[] = [];
  const unrecognizedItems: string[] = [];

  for (const item of raw) {
    if (!item.name?.trim()) {
      unrecognizedItems.push("缺少课程名称");
      continue;
    }
    if (!item.dayOfWeek || item.dayOfWeek < 1 || item.dayOfWeek > 7) {
      unrecognizedItems.push(`${item.name}: 缺少星期信息`);
      continue;
    }
    if (!item.periodStart || item.periodStart < 1) {
      unrecognizedItems.push(`${item.name}: 缺少节次信息`);
      continue;
    }

    const weekType = isWeekType(item.weekType) ? item.weekType : "EVERY_WEEK";
    const weekStart = item.weekStart ?? 1;
    const weekEnd = item.weekEnd ?? weekStart;
    const location = item.location ?? undefined;
    const name = item.name.trim();

    events.push({
      id: id(),
      title: name,
      type: "COURSE",
      location,
      reminderMinutes: 10,
      weekType,
      source,
      confidence: clampConfidence(item.confidence),
      userEdited: false,
      course: {
        courseName: name,
        teacher: item.teacher ?? undefined,
        classroom: location,
        dayOfWeek: item.dayOfWeek,
        periodStart: item.periodStart,
        periodEnd: item.periodEnd ?? item.periodStart,
        weekStart,
        weekEnd,
        weekType,
        specificWeeks: item.specificWeeks ?? undefined,
      },
    });
  }

  events.sort((a, b) => {
    const ac = a.course;
    const bc = b.course;
    if (!ac || !bc) return 0;
    return ac.dayOfWeek !== bc.dayOfWeek
      ? ac.dayOfWeek - bc.dayOfWeek
      : ac.periodStart - bc.periodStart;
  });

  return { events, unrecognizedItems };
}

export function validateGeneralEvents(
  raw: RawGeneralEvent[],
  source: EventSource = "AI",
): { events: CampusEvent[]; unrecognizedItems: string[] } {
  const events: CampusEvent[] = [];
  const unrecognizedItems: string[] = [];

  for (const item of raw) {
    const title = item.title?.trim();
    if (!title) {
      unrecognizedItems.push("缺少事件标题");
      continue;
    }

    const typeCandidate = item.type ?? item.eventType;
    const type = isEventType(typeCandidate) ? typeCandidate : "REMINDER";
    const startTime = normalizeDateTime(item.date, item.timeStart);
    if (!startTime) {
      unrecognizedItems.push(`${title}: 缺少日期`);
      continue;
    }

    events.push({
      id: id(),
      title,
      type,
      startTime,
      endTime: normalizeDateTime(item.date, item.timeEnd),
      location: item.location ?? undefined,
      seatNumber: item.seatNumber == null ? undefined : String(item.seatNumber).trim() || undefined,
      description: item.description ?? undefined,
      reminderMinutes: type === "HOMEWORK" ? 120 : 30,
      source,
      confidence: clampConfidence(item.confidence),
      userEdited: false,
      warnings: item.uncertainFields?.length
        ? item.uncertainFields.map((field) => `字段不确定: ${field}`)
        : undefined,
    });
  }

  return { events, unrecognizedItems };
}


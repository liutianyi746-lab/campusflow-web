import type { CampusEvent, LegacyCourseEvent, Period } from "../types/campus-event.ts";
import { expandWeekNumbers, resolveCourseDateTime } from "../events/week-engine.ts";
import { DEFAULT_PERIODS } from "../schedule/default-template.ts";

type ExportableEvent = CampusEvent | LegacyCourseEvent;

function escapeIcsText(value = ""): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function normalizeDateTime(value: string | Date): string {
  if (value instanceof Date) {
    return [
      value.getUTCFullYear(),
      String(value.getUTCMonth() + 1).padStart(2, "0"),
      String(value.getUTCDate()).padStart(2, "0"),
      "T",
      String(value.getUTCHours()).padStart(2, "0"),
      String(value.getUTCMinutes()).padStart(2, "0"),
      String(value.getUTCSeconds()).padStart(2, "0"),
    ].join("");
  }

  const normalized = value.replace(/[-:]/g, "");
  if (/^\d{8}T\d{4}$/.test(normalized)) return `${normalized}00`;
  if (/^\d{8}T\d{6}$/.test(normalized)) return normalized;
  if (/^\d{8}$/.test(normalized)) return `${normalized}T000000`;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid event datetime: ${value}`);
  }
  return normalizeDateTime(parsed);
}

function addMinutes(dateTime: string, minutes: number): string {
  const compact = normalizeDateTime(dateTime);
  const year = Number(compact.slice(0, 4));
  const month = Number(compact.slice(4, 6));
  const day = Number(compact.slice(6, 8));
  const hour = Number(compact.slice(9, 11));
  const minute = Number(compact.slice(11, 13));
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  date.setUTCMinutes(date.getUTCMinutes() + minutes);
  return `${date.toISOString().slice(0, 16)}:00`;
}

function uidFor(event: CampusEvent, suffix = "0"): string {
  return `${event.id}-${suffix}@campusflow.ai`;
}

function hasLegacyCourseShape(event: ExportableEvent): event is LegacyCourseEvent {
  return "courseName" in event && "periodStart" in event && !("title" in event);
}

function normalizeEvent(event: ExportableEvent): CampusEvent {
  if (!hasLegacyCourseShape(event)) return event;

  return {
    id: event.id,
    title: event.courseName,
    type: "COURSE",
    location: event.location,
    source: "AI",
    confidence: event.confidence,
    userEdited: event.userEdited,
    weekType: event.weekType,
    course: {
      courseName: event.courseName,
      teacher: event.teacher,
      classroom: event.location,
      dayOfWeek: event.dayOfWeek,
      periodStart: event.periodStart,
      periodEnd: event.periodEnd,
      weekStart: event.weekStart,
      weekEnd: event.weekEnd,
      weekType: event.weekType,
      specificWeeks: event.specificWeeks,
    },
  };
}

function rruleForCourse(
  event: CampusEvent,
  semesterStart: string,
  periods: Period[],
): { start: Date; end: Date; rrule: string | null }[] {
  if (!event.course) return [];

  const weeks = expandWeekNumbers(event.course);
  if (!weeks.length) return [];

  if (event.course.weekType === "SPECIFIC_WEEKS") {
    return weeks.map((week) => ({
      ...resolveCourseDateTime({
        semesterStart,
        dayOfWeek: event.course!.dayOfWeek,
        week,
        periodStart: event.course!.periodStart,
        periodEnd: event.course!.periodEnd,
        periods,
      }),
      rrule: null,
    }));
  }

  const firstWeek = weeks[0];
  const lastWeek = weeks[weeks.length - 1];
  const first = resolveCourseDateTime({
    semesterStart,
    dayOfWeek: event.course.dayOfWeek,
    week: firstWeek,
    periodStart: event.course.periodStart,
    periodEnd: event.course.periodEnd,
    periods,
  });
  const last = resolveCourseDateTime({
    semesterStart,
    dayOfWeek: event.course.dayOfWeek,
    week: lastWeek,
    periodStart: event.course.periodStart,
    periodEnd: event.course.periodEnd,
    periods,
  });
  const interval = event.course.weekType === "EVERY_WEEK" ? 1 : 2;

  return [
    {
      start: first.start,
      end: first.end,
      rrule: `FREQ=WEEKLY;INTERVAL=${interval};UNTIL=${normalizeDateTime(last.end)}`,
    },
  ];
}

function eventDescription(event: CampusEvent): string {
  const details = [
    event.description,
    event.course?.teacher ? `教师: ${event.course.teacher}` : undefined,
    event.course?.weekType ? `周次规则: ${event.course.weekType}` : undefined,
    event.seatNumber ? `座位号: ${event.seatNumber}` : undefined,
    `来源: ${event.source}`,
    `置信度: ${Math.round(event.confidence * 100)}%`,
  ].filter(Boolean);

  return details.join("\n");
}

function vevent(input: {
  event: CampusEvent;
  start: string | Date;
  end: string | Date;
  uidSuffix?: string;
  rrule?: string | null;
}): string[] {
  const reminder = input.event.reminderMinutes ?? 10;
  const lines = [
    "BEGIN:VEVENT",
    `UID:${uidFor(input.event, input.uidSuffix)}`,
    `DTSTAMP:${normalizeDateTime(new Date())}`,
    `DTSTART:${normalizeDateTime(input.start)}`,
    `DTEND:${normalizeDateTime(input.end)}`,
    `SUMMARY:${escapeIcsText(input.event.title)}`,
  ];

  const location = input.event.location ?? input.event.course?.classroom;
  if (location) lines.push(`LOCATION:${escapeIcsText(location)}`);

  const description = eventDescription(input.event);
  if (description) lines.push(`DESCRIPTION:${escapeIcsText(description)}`);

  if (input.rrule) lines.push(`RRULE:${input.rrule}`);

  if (reminder > 0) {
    lines.push(
      "BEGIN:VALARM",
      `TRIGGER:-PT${reminder}M`,
      "ACTION:DISPLAY",
      `DESCRIPTION:${escapeIcsText(`${input.event.title} 即将开始`)}`,
      "END:VALARM",
    );
  }

  lines.push("END:VEVENT");
  return lines;
}

export function buildIcs(
  rawEvents: ExportableEvent[],
  semesterStart: string,
  calendarName: string,
  periods: Period[] = DEFAULT_PERIODS,
): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "PRODID:-//CampusFlow AI//Campus Calendar//CN",
    `X-WR-CALNAME:${escapeIcsText(calendarName)}`,
    "X-WR-TIMEZONE:Asia/Shanghai",
  ];

  for (const rawEvent of rawEvents) {
    const event = normalizeEvent(rawEvent);
    if (event.type === "COURSE" && event.course) {
      const occurrences = rruleForCourse(event, semesterStart, periods);
      occurrences.forEach((occurrence, index) => {
        lines.push(
          ...vevent({
            event,
            start: occurrence.start,
            end: occurrence.end,
            uidSuffix: String(index + 1),
            rrule: occurrence.rrule,
          }),
        );
      });
      continue;
    }

    if (!event.startTime) continue;
    const endTime = event.endTime ?? addMinutes(event.startTime, 60);
    lines.push(
      ...vevent({
        event,
        start: event.startTime,
        end: endTime,
        rrule: event.rrule,
      }),
    );
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

import type { CampusEvent, ScheduleTemplate } from "../types/campus-event.ts";
import { expandWeekNumbers, resolveCourseDateTime } from "../events/week-engine.ts";

function toLocalIso(date: Date): string {
  return date.toISOString().slice(0, 19);
}

export function applyTemplate(
  events: CampusEvent[],
  template: ScheduleTemplate,
  semesterStart = "2026-02-23",
): CampusEvent[] {
  return events.map((event) => {
    if (event.type !== "COURSE" || !event.course) return event;

    const firstWeek =
      expandWeekNumbers(event.course)[0] ?? event.course.weekStart ?? 1;

    try {
      const resolved = resolveCourseDateTime({
        semesterStart,
        dayOfWeek: event.course.dayOfWeek,
        week: firstWeek,
        periodStart: event.course.periodStart,
        periodEnd: event.course.periodEnd,
        periods: template.periods,
      });

      return {
        ...event,
        startTime: toLocalIso(resolved.start),
        endTime: toLocalIso(resolved.end),
        location: event.location ?? event.course.classroom,
      };
    } catch {
      return {
        ...event,
        warnings: [
          ...(event.warnings ?? []),
          `作息模板缺少第 ${event.course.periodStart}-${event.course.periodEnd} 节`,
        ],
      };
    }
  });
}


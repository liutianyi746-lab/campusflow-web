import type { Period, WeekRule, WeekType } from "@/lib/types/campus-event";

const DAYS_IN_WEEK = 7;

interface FirstOccurrenceInput extends WeekRule {
  semesterStart: string;
  dayOfWeek: number;
}

interface ResolveCourseInput {
  semesterStart: string;
  dayOfWeek: number;
  week: number;
  periodStart: number;
  periodEnd: number;
  periods: Period[];
}

function parseDate(date: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function getWeekday(date: Date): number {
  const day = date.getUTCDay();
  return day === 0 ? 7 : day;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function withTime(date: Date, time: string): Date {
  const [hour, minute] = time.split(":").map(Number);
  const next = new Date(date);
  next.setUTCHours(hour, minute, 0, 0);
  return next;
}

function inWeekType(week: number, weekType: WeekType): boolean {
  if (weekType === "ODD_WEEK") return week % 2 === 1;
  if (weekType === "EVEN_WEEK") return week % 2 === 0;
  return true;
}

export function expandWeekNumbers(rule: WeekRule): number[] {
  if (rule.weekType === "SPECIFIC_WEEKS") {
    return [...new Set(rule.specificWeeks ?? [])]
      .filter((week) => week >= rule.weekStart && week <= rule.weekEnd)
      .sort((a, b) => a - b);
  }

  const weeks: number[] = [];
  for (let week = rule.weekStart; week <= rule.weekEnd; week += 1) {
    if (inWeekType(week, rule.weekType)) weeks.push(week);
  }
  return weeks;
}

export function getCourseDate(input: {
  semesterStart: string;
  dayOfWeek: number;
  week: number;
}): Date {
  const semesterStart = parseDate(input.semesterStart);
  const semesterWeekday = getWeekday(semesterStart);
  const dayOffset = (input.dayOfWeek - semesterWeekday + DAYS_IN_WEEK) % DAYS_IN_WEEK;
  return addDays(semesterStart, dayOffset + DAYS_IN_WEEK * (input.week - 1));
}

export function getCourseFirstOccurrence(input: FirstOccurrenceInput): Date {
  const weeks = expandWeekNumbers(input);
  const firstWeek = weeks[0] ?? input.weekStart;
  return getCourseDate({
    semesterStart: input.semesterStart,
    dayOfWeek: input.dayOfWeek,
    week: firstWeek,
  });
}

export function resolveCourseDateTime(input: ResolveCourseInput): {
  date: string;
  start: Date;
  end: Date;
} {
  const date = getCourseDate(input);
  const startPeriod = input.periods.find(
    (period) => period.periodNumber === input.periodStart,
  );
  const endPeriod = input.periods.find(
    (period) => period.periodNumber === input.periodEnd,
  );

  if (!startPeriod || !endPeriod) {
    throw new Error(
      `Missing period definition for ${input.periodStart}-${input.periodEnd}`,
    );
  }

  return {
    date: toIsoDate(date),
    start: withTime(date, startPeriod.startTime),
    end: withTime(date, endPeriod.endTime),
  };
}

export function weekTypeLabel(weekType?: WeekType): string {
  switch (weekType) {
    case "ODD_WEEK":
      return "单周";
    case "EVEN_WEEK":
      return "双周";
    case "SPECIFIC_WEEKS":
      return "指定周";
    case "EVERY_WEEK":
    default:
      return "全周";
  }
}

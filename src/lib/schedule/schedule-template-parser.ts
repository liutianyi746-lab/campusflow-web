import type { EventSource, Period, ScheduleTemplate } from "../types/campus-event.ts";

const CHINESE_NUMBERS: Record<string, number> = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  十: 10,
  十一: 11,
  十二: 12,
  十三: 13,
  十四: 14,
  十五: 15,
};

type ParseScheduleTemplateOptions = {
  name?: string;
  schoolName?: string;
  semester?: string;
  source?: EventSource;
};

export type ParseScheduleTemplateResult = {
  template: ScheduleTemplate;
  warnings: string[];
  source: EventSource;
};

function normalizeChineseTime(value: string): string {
  return value
    .replace(/(\d{1,2})\s*点\s*半/g, "$1:30")
    .replace(/(\d{1,2})\s*点\s*(\d{1,2})\s*分?/g, (_match, hour: string, minute: string) => `${hour}:${minute.padStart(2, "0")}`)
    .replace(/(\d{1,2})\s*点/g, "$1:00");
}

function normalizeLine(value: string): string {
  return normalizeChineseTime(value)
    .replace(/[：]/g, ":")
    .replace(/[—–－]/g, "-")
    .replace(/[~～]/g, "~")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTime(value: string): string {
  const [hour, minute] = value.split(":");
  return `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
}

function periodNumberFrom(raw: string): number | undefined {
  const cleaned = raw.replace(/第|节|课/g, "").trim();
  if (/^\d+$/.test(cleaned)) return Number(cleaned);
  return CHINESE_NUMBERS[cleaned];
}

function periodLabel(periodNumber: number): string {
  const chinese = Object.entries(CHINESE_NUMBERS).find(([, value]) => value === periodNumber)?.[0];
  return chinese ? `第${chinese}节` : `第${periodNumber}节`;
}

function periodFromMatch(periodRaw: string, startRaw: string, endRaw: string): Period | undefined {
  const periodNumber = periodNumberFrom(periodRaw);
  if (!periodNumber) return undefined;

  return {
    periodNumber,
    startTime: normalizeTime(startRaw),
    endTime: normalizeTime(endRaw),
    label: periodLabel(periodNumber),
  };
}

function parsePeriodLine(rawLine: string): Period | undefined {
  const line = normalizeLine(rawLine);
  if (/节次|上课时间|下课时间|开始时间|结束时间/.test(line) && !/\d{1,2}:\d{2}/.test(line)) {
    return undefined;
  }

  const periodFirst = line.match(/(?:第\s*)?([一二三四五六七八九十]{1,2}|\d{1,2})\s*(?:节|课)?\D+(\d{1,2}:\d{2})\D+(\d{1,2}:\d{2})/);
  if (periodFirst) return periodFromMatch(periodFirst[1], periodFirst[2], periodFirst[3]);

  const timeFirst = line.match(/(\d{1,2}:\d{2})\s*[-~至到]\s*(\d{1,2}:\d{2})\D+(?:第\s*)?([一二三四五六七八九十]{1,2}|\d{1,2})\s*(?:节|课)?/);
  if (timeFirst) return periodFromMatch(timeFirst[3], timeFirst[1], timeFirst[2]);

  return undefined;
}

function compactLines(text: string): string[] {
  return text
    .split(/[\n\r；;]/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function parseScheduleTemplateText(
  text: string,
  options: ParseScheduleTemplateOptions = {},
): ParseScheduleTemplateResult {
  const periods: Period[] = [];
  const warnings: string[] = [];

  compactLines(text).forEach((line, index) => {
    const period = parsePeriodLine(line);
    if (!period) {
      if (!/节次|上课时间|下课时间|开始时间|结束时间/.test(line)) {
        warnings.push(`第 ${index + 1} 行未识别为作息节次：${line}`);
      }
      return;
    }

    periods.push(period);
  });

  const sortedPeriods = [...periods]
    .filter((period, index, all) => all.findIndex((item) => item.periodNumber === period.periodNumber) === index)
    .sort((a, b) => a.periodNumber - b.periodNumber);

  return {
    template: {
      id: "memory-schedule-template",
      name: options.name ?? "自定义学校作息表",
      schoolName: options.schoolName ?? null,
      semester: options.semester ?? null,
      isActive: true,
      periods: sortedPeriods,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    warnings,
    source: options.source ?? "MANUAL",
  };
}

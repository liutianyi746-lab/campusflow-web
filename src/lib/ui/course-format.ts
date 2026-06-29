import type { WeekType } from "@/lib/types/campus-event";

const WEEKDAY_NAMES = ["", "周一", "周二", "周三", "周四", "周五", "周六", "周日"];

const WEEK_TYPE_LABELS: Record<WeekType, string> = {
  EVERY_WEEK: "每周",
  ODD_WEEK: "单周",
  EVEN_WEEK: "双周",
  SPECIFIC_WEEKS: "指定周",
};

export function weekdayName(dayOfWeek: number): string {
  return WEEKDAY_NAMES[dayOfWeek] ?? "未知星期";
}

export function formatWeekRule(
  weekStart: number,
  weekEnd: number,
  weekType: WeekType,
): string {
  return `第 ${weekStart}-${weekEnd} 周 ${WEEK_TYPE_LABELS[weekType] ?? weekType}`;
}

export function formatCourseSlot(periodStart: number, periodEnd: number): string {
  return `第 ${periodStart}-${periodEnd} 节`;
}

export function confidenceLabel(confidence: number): string {
  if (confidence >= 0.85) return "高置信";
  if (confidence >= 0.7) return "需核对";
  return "低置信";
}

export function confidenceTone(confidence: number): string {
  if (confidence >= 0.85) return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (confidence >= 0.7) return "bg-amber-50 text-amber-700 ring-amber-200";
  return "bg-rose-50 text-rose-700 ring-rose-200";
}

import type { Period } from "../types/campus-event.ts";
import { toMinutes } from "./schedule-text-normalize.ts";

export type ScheduleIssueLevel = "error" | "warning";

export interface ScheduleIssue {
  level: ScheduleIssueLevel;
  message: string;
  /** 原文行号（从 1 开始），仅文本解析时有 */
  line?: number;
  /** 关联节次，便于界面上定位到具体一行 */
  periodNumber?: number;
}

/** 一节课的合理时长区间，超出说明多半识别错了 */
const MIN_DURATION_MINUTES = 10;
const MAX_DURATION_MINUTES = 240;

/** 单节校验：时间本身是否成立 */
export function validatePeriod(period: Period): ScheduleIssue[] {
  const issues: ScheduleIssue[] = [];
  const start = toMinutes(period.startTime);
  const end = toMinutes(period.endTime);
  const label = period.label ?? `第${period.periodNumber}节`;

  if (end === start) {
    issues.push({
      level: "error",
      periodNumber: period.periodNumber,
      message: `${label} 的开始和结束时间相同`,
    });
    return issues;
  }

  if (end < start) {
    issues.push({
      level: "error",
      periodNumber: period.periodNumber,
      message: `${label} 的结束时间 ${period.endTime} 早于开始时间 ${period.startTime}`,
    });
    return issues;
  }

  const duration = end - start;
  if (duration < MIN_DURATION_MINUTES) {
    issues.push({
      level: "warning",
      periodNumber: period.periodNumber,
      message: `${label} 只有 ${duration} 分钟，请确认是否识别错了`,
    });
  } else if (duration > MAX_DURATION_MINUTES) {
    issues.push({
      level: "warning",
      periodNumber: period.periodNumber,
      message: `${label} 长达 ${Math.round(duration / 60)} 小时，请确认是否把两节合并了`,
    });
  }

  return issues;
}

/** 整表校验：节次编号连续性、时间是否递增、是否互相重叠 */
export function validatePeriods(periods: Period[]): ScheduleIssue[] {
  const issues: ScheduleIssue[] = [];
  if (!periods.length) return issues;

  const sorted = [...periods].sort((a, b) => a.periodNumber - b.periodNumber);

  sorted.forEach((period) => {
    issues.push(...validatePeriod(period));
  });

  // 编号缺口：课程写「3-4 节」时如果缺第 3 节，导出会直接失败
  const missing: number[] = [];
  for (let number = sorted[0].periodNumber; number <= sorted[sorted.length - 1].periodNumber; number += 1) {
    if (!sorted.some((period) => period.periodNumber === number)) missing.push(number);
  }
  if (missing.length) {
    issues.push({
      level: "warning",
      message: `缺少第 ${missing.join("、")} 节，跨这些节次的课程会无法换算时间`,
    });
  }

  // 相邻节次时间倒挂或重叠
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    const previousEnd = toMinutes(previous.endTime);
    const currentStart = toMinutes(current.startTime);

    if (currentStart < previousEnd) {
      issues.push({
        level: "warning",
        periodNumber: current.periodNumber,
        message: `第${current.periodNumber}节 ${current.startTime} 早于第${previous.periodNumber}节的结束时间 ${previous.endTime}`,
      });
    }
  }

  return issues;
}

/** 按节次排序并去重（保留先出现的一条，和历史行为一致） */
export function sortAndDedupePeriods(periods: Period[]): Period[] {
  return periods
    .filter((period, index, all) => all.findIndex((item) => item.periodNumber === period.periodNumber) === index)
    .sort((a, b) => a.periodNumber - b.periodNumber);
}

export type DayPart = "morning" | "afternoon" | "evening";

/** 按上午 / 下午 / 晚上分组，界面上展示更接近纸质作息表 */
export function dayPartOf(period: Period): DayPart {
  const start = toMinutes(period.startTime);
  if (start < 12 * 60) return "morning";
  if (start < 18 * 60) return "afternoon";
  return "evening";
}

export const DAY_PART_LABELS: Record<DayPart, string> = {
  morning: "上午",
  afternoon: "下午",
  evening: "晚上",
};

export function groupPeriodsByDayPart(periods: Period[]): Array<{ part: DayPart; periods: Period[] }> {
  const order: DayPart[] = ["morning", "afternoon", "evening"];
  return order
    .map((part) => ({ part, periods: periods.filter((period) => dayPartOf(period) === part) }))
    .filter((group) => group.periods.length > 0);
}

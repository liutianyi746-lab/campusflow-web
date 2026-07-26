import type { EventSource, Period, ScheduleTemplate } from "../types/campus-event.ts";
import {
  normalizeScheduleLine,
  normalizeTimeToken,
  toMinutes,
} from "./schedule-text-normalize.ts";
import {
  sortAndDedupePeriods,
  validatePeriods,
  type ScheduleIssue,
} from "./schedule-validation.ts";

type ParseScheduleTemplateOptions = {
  name?: string;
  schoolName?: string;
  semester?: string;
  source?: EventSource;
};

export type ParseScheduleTemplateResult = {
  template: ScheduleTemplate;
  /** 兼容旧接口：所有问题的文字描述 */
  warnings: string[];
  /** 结构化问题，界面上可以按严重程度分开展示 */
  issues: ScheduleIssue[];
  source: EventSource;
  stats: {
    totalLines: number;
    recognizedLines: number;
    /** 表头、午休、校名这类主动跳过的行 */
    skippedLines: number;
  };
};

/* ------------------------------------------------------------------ 中文数字 */

const CHINESE_DIGITS: Record<string, number> = {
  零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5,
  六: 6, 七: 7, 八: 8, 九: 9,
};

/** 支持 一~二十九 与阿拉伯数字，覆盖「第二十一节」这类写法 */
export function parsePeriodNumber(raw: string): number | undefined {
  const cleaned = raw.replace(/[第节課课大小\s]/g, "");
  if (!cleaned) return undefined;

  if (/^\d+$/.test(cleaned)) {
    const value = Number(cleaned);
    return value >= 1 && value <= 30 ? value : undefined;
  }

  const tenIndex = cleaned.indexOf("十");
  if (tenIndex === -1) {
    const digit = CHINESE_DIGITS[cleaned];
    return digit && digit >= 1 ? digit : undefined;
  }

  const highRaw = cleaned.slice(0, tenIndex);
  const lowRaw = cleaned.slice(tenIndex + 1);
  const high = highRaw ? CHINESE_DIGITS[highRaw] : 1;
  const low = lowRaw ? CHINESE_DIGITS[lowRaw] : 0;
  if (high === undefined || low === undefined) return undefined;

  const value = high * 10 + low;
  return value >= 1 && value <= 30 ? value : undefined;
}

const CHINESE_LABEL = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];

export function periodLabel(periodNumber: number): string {
  if (periodNumber >= 1 && periodNumber <= 10) return `第${CHINESE_LABEL[periodNumber]}节`;
  if (periodNumber > 10 && periodNumber < 20) return `第十${CHINESE_LABEL[periodNumber - 10]}节`;
  if (periodNumber === 20) return "第二十节";
  if (periodNumber > 20 && periodNumber < 30) return `第二十${CHINESE_LABEL[periodNumber - 20]}节`;
  return `第${periodNumber}节`;
}

/* ------------------------------------------------------------------ 行分类 */

/** 表头 / 说明行，识别不出节次也不该报警 */
const HEADER_PATTERN = /节次|节数|上课时间|下课时间|开始时间|结束时间|时间安排|作息时间|课时|时段|序号/;

/** 非上课时段，即使带时间也不能当成节次 */
const NON_CLASS_PATTERN =
  /午休|午间|休息|大课间|课间操|早操|升旗|早自习|晚自习|自修|就餐|午餐|晚餐|早餐|放学|归寝|熄灯|午睡/;

/** 星期表头，课表截图里常和作息混在一起 */
const WEEKDAY_PATTERN = /^(?:周|星期|礼拜)[一二三四五六日天]/;

function isNoiseLine(line: string): boolean {
  if (!line) return true;
  if (NON_CLASS_PATTERN.test(line)) return true;
  if (WEEKDAY_PATTERN.test(line)) return true;
  // 纯符号或分隔线，没有任何数字
  if (!/[\d一二三四五六七八九十]/.test(line)) return true;
  return false;
}

function isHeaderLine(line: string): boolean {
  return HEADER_PATTERN.test(line) && !/\d{1,2}:\d{2}/.test(line);
}

/* ------------------------------------------------------------------ 行内提取 */

interface TimeToken {
  time: string;
  index: number;
}

function extractTimes(line: string): TimeToken[] {
  const tokens: TimeToken[] = [];
  const pattern = /(\d{1,2}:\d{2})/g;
  let match = pattern.exec(line);

  while (match) {
    const normalized = normalizeTimeToken(match[1]);
    if (normalized) tokens.push({ time: normalized, index: match.index });
    match = pattern.exec(line);
  }

  return tokens;
}

interface PeriodMarker {
  /** 大节写法「第1-2节」会给出多个编号 */
  numbers: number[];
  index: number;
}

const NUMBER_CLASS = "[一二三四五六七八九十零〇两\\d]{1,3}";

function extractMarkers(line: string): PeriodMarker[] {
  const markers: PeriodMarker[] = [];
  const consumed: Array<[number, number]> = [];

  const pushMarker = (numbers: number[], index: number, length: number) => {
    markers.push({ numbers, index });
    consumed.push([index, index + length]);
  };

  const overlaps = (index: number) => consumed.some(([start, end]) => index >= start && index < end);

  // 「第1-2节」「1~2节」这类大节写法
  const rangePattern = new RegExp(
    `(?:第\\s*)?(${NUMBER_CLASS})\\s*[-~至到]\\s*(${NUMBER_CLASS})\\s*[大小]?\\s*[节課课]`,
    "g",
  );
  let rangeMatch = rangePattern.exec(line);
  while (rangeMatch) {
    const from = parsePeriodNumber(rangeMatch[1]);
    const to = parsePeriodNumber(rangeMatch[2]);
    if (from && to && to > from && to - from < 6) {
      const numbers: number[] = [];
      for (let n = from; n <= to; n += 1) numbers.push(n);
      pushMarker(numbers, rangeMatch.index, rangeMatch[0].length);
    }
    rangeMatch = rangePattern.exec(line);
  }

  // 「第三节」「3节」「第一大节」；排除「节次」「节数」表头词
  const singlePattern = new RegExp(`(?:第\\s*)?(${NUMBER_CLASS})\\s*[大小]?\\s*[节課课](?!次|数)`, "g");
  let singleMatch = singlePattern.exec(line);
  while (singleMatch) {
    if (!overlaps(singleMatch.index)) {
      const number = parsePeriodNumber(singleMatch[1]);
      if (number) pushMarker([number], singleMatch.index, singleMatch[0].length);
    }
    singleMatch = singlePattern.exec(line);
  }

  if (markers.length) return markers.sort((a, b) => a.index - b.index);

  // 表格第一列只有裸数字：「1 08:20 09:05」
  const leading = line.match(/^(\d{1,2})(?=[\s.、,，)）]|$)/);
  if (leading) {
    const number = parsePeriodNumber(leading[1]);
    if (number) return [{ numbers: [number], index: 0 }];
  }

  return [];
}

function formatMinutes(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/**
 * 表格里「上课/下课」两列被 OCR 颠倒时，结束时间会早于开始时间。
 * 上课节次不可能跨零点，所以直接换回来比丢弃更有用。
 */
function orderPair(first: string, second: string): [string, string] {
  return toMinutes(second) < toMinutes(first) ? [second, first] : [first, second];
}

/** 把一个时间跨度平均切成 n 段，用于「第1-2节 08:00-09:40」这种合并写法 */
function splitSpan(numbers: number[], rawStart: string, rawEnd: string): Period[] {
  const [startTime, endTime] = orderPair(rawStart, rawEnd);

  if (numbers.length === 1) {
    return [{ periodNumber: numbers[0], startTime, endTime, label: periodLabel(numbers[0]) }];
  }

  const start = toMinutes(startTime);
  const end = toMinutes(endTime);
  const step = (end - start) / numbers.length;

  return numbers.map((number, index) => ({
    periodNumber: number,
    startTime: formatMinutes(Math.round(start + step * index)),
    endTime: formatMinutes(Math.round(start + step * (index + 1))),
    label: periodLabel(number),
  }));
}

/* ------------------------------------------------------------------ 主流程 */

interface LineResult {
  periods: Period[];
  /** 有时间但没节次编号，可能需要按顺序补号 */
  pendingTimes?: [string, string];
  /** 只有节次编号没有时间，多半是竖排表格的编号列 */
  orphanNumbers?: number[];
  status: "recognized" | "pending" | "marker-only" | "skipped" | "unrecognized";
}

function parseLine(rawLine: string): LineResult {
  const line = normalizeScheduleLine(rawLine);

  if (isNoiseLine(line) || isHeaderLine(line)) {
    return { periods: [], status: "skipped" };
  }

  const times = extractTimes(line);
  if (times.length < 2) {
    // 「第一节」独占一行：截图里节次和时间被切成了两栏
    if (!times.length && line.length <= 8) {
      const soloMarkers = extractMarkers(line);
      if (soloMarkers.length === 1) {
        return { periods: [], orphanNumbers: soloMarkers[0].numbers, status: "marker-only" };
      }
    }
    return { periods: [], status: "unrecognized" };
  }

  const markers = extractMarkers(line);

  // 没有节次编号：先挂起，等全篇扫完再决定要不要顺序补号
  if (!markers.length) {
    return { periods: [], pendingTimes: [times[0].time, times[1].time], status: "pending" };
  }

  // 只有一个标记时不看位置，「08:00-08:45 第一节」这种倒装也能吃下
  if (markers.length === 1) {
    return {
      periods: splitSpan(markers[0].numbers, times[0].time, times[1].time),
      status: "recognized",
    };
  }

  // 一行写了多节：按出现位置给每个标记配最近的两个时间
  const used = new Set<number>();
  const periods: Period[] = [];

  markers.forEach((marker) => {
    const remaining = times
      .map((token, index) => ({ token, index }))
      .filter((item) => !used.has(item.index));
    const after = remaining.filter((item) => item.token.index > marker.index);
    const pool = after.length >= 2 ? after : remaining;
    if (pool.length < 2) return;

    const [first, second] = pool;
    used.add(first.index);
    used.add(second.index);
    periods.push(...splitSpan(marker.numbers, first.token.time, second.token.time));
  });

  return { periods, status: periods.length ? "recognized" : "unrecognized" };
}

/**
 * 兜底：整篇一条都没解析出来时，把所有时间摊平成一条流，
 * 两两配对再顺序编号。对应「节次和时间被 OCR 拆成上下两栏」的截图。
 */
function parseAsTimeStream(lines: string[]): Period[] {
  const times: string[] = [];

  lines.forEach((rawLine) => {
    const line = normalizeScheduleLine(rawLine);
    if (isNoiseLine(line) || isHeaderLine(line)) return;
    extractTimes(line).forEach((token) => times.push(token.time));
  });

  if (times.length < 4 || times.length % 2 !== 0) return [];

  const periods: Period[] = [];
  for (let index = 0; index + 1 < times.length; index += 2) {
    const start = times[index];
    const end = times[index + 1];
    if (toMinutes(end) <= toMinutes(start)) return [];
    const number = periods.length + 1;
    periods.push({ periodNumber: number, startTime: start, endTime: end, label: periodLabel(number) });
  }

  return periods;
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
  const lines = compactLines(text);
  const collected: Period[] = [];
  const issues: ScheduleIssue[] = [];
  const pending: Array<{ times: [string, string]; line: number }> = [];
  const orphanNumbers: number[] = [];
  let recognizedLines = 0;
  let skippedLines = 0;
  let sawExplicitMarker = false;

  lines.forEach((rawLine, index) => {
    const result = parseLine(rawLine);

    if (result.status === "skipped") {
      skippedLines += 1;
      return;
    }

    if (result.status === "recognized") {
      recognizedLines += 1;
      sawExplicitMarker = true;
      collected.push(...result.periods);
      return;
    }

    if (result.status === "pending" && result.pendingTimes) {
      pending.push({ times: result.pendingTimes, line: index + 1 });
      return;
    }

    if (result.status === "marker-only" && result.orphanNumbers) {
      orphanNumbers.push(...result.orphanNumbers);
      skippedLines += 1;
      return;
    }

    issues.push({
      level: "warning",
      line: index + 1,
      message: `第 ${index + 1} 行未识别为作息节次：${rawLine}`,
    });
  });

  // 时间行没带编号：优先套用单独成列的节次号，否则按出现顺序补号
  if (!sawExplicitMarker && pending.length >= 2) {
    const useOrphan = orphanNumbers.length === pending.length;

    pending.forEach((item, order) => {
      const number = useOrphan ? orphanNumbers[order] : order + 1;
      collected.push({
        periodNumber: number,
        startTime: item.times[0],
        endTime: item.times[1],
        label: periodLabel(number),
      });
      recognizedLines += 1;
    });

    issues.push({
      level: "warning",
      message: useOrphan
        ? `原文的节次和时间分成了两栏，已按顺序对应为第 ${orphanNumbers[0]}-${orphanNumbers[orphanNumbers.length - 1]} 节，请核对`
        : `原文没有写节次编号，已按出现顺序编为第 1-${pending.length} 节，请核对`,
    });
  } else {
    pending.forEach((item) => {
      issues.push({
        level: "warning",
        line: item.line,
        message: `第 ${item.line} 行有时间但没有节次编号，已跳过：${item.times[0]}-${item.times[1]}`,
      });
    });
  }

  let periods = sortAndDedupePeriods(collected);

  // 逐行都没结果时，退回到时间流配对
  if (!periods.length) {
    const streamed = parseAsTimeStream(lines);
    if (streamed.length) {
      periods = streamed;
      recognizedLines = streamed.length;
      issues.length = 0;
      issues.push({
        level: "warning",
        message: `原文的节次和时间没有对齐，已按时间先后编为第 1-${streamed.length} 节，请核对`,
      });
    }
  }

  issues.push(...validatePeriods(periods));

  return {
    template: {
      id: "memory-schedule-template",
      name: options.name ?? "自定义学校作息表",
      schoolName: options.schoolName ?? null,
      semester: options.semester ?? null,
      isActive: true,
      periods,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    warnings: issues.map((issue) => issue.message),
    issues,
    source: options.source ?? "MANUAL",
    stats: {
      totalLines: lines.length,
      recognizedLines,
      skippedLines,
    },
  };
}

/** 把节次列表还原成可编辑文本，界面上「导出为文本」用 */
export function formatPeriodsAsText(periods: Period[]): string {
  return periods
    .map((period) => `${period.label ?? periodLabel(period.periodNumber)} ${period.startTime}-${period.endTime}`)
    .join("\n");
}

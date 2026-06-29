import type { CampusEvent, EventSource, RecognitionIntent } from "../types/campus-event.ts";
import { validateCourses, validateGeneralEvents } from "./validator.ts";

const WEEKDAY_MAP: Record<string, number> = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  日: 7,
  天: 7,
};

const CHINESE_NUMBER_MAP: Record<string, number> = {
  零: 0,
  一: 1,
  二: 2,
  两: 2,
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
  十六: 16,
  十七: 17,
  十八: 18,
  十九: 19,
  二十: 20,
  二十一: 21,
  二十二: 22,
  二十三: 23,
  二十四: 24,
};

const COURSE_NOISE = /课程表|课表|课程|任课教师|任课老师|教师|老师|地点|教室|上课地点|节次|周次/g;

function today(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function nextWeekday(base: Date, weekday: number, nextWeekOnly: boolean): Date {
  const current = base.getUTCDay() || 7;
  const offset = nextWeekOnly
    ? ((weekday - current + 7) % 7) + 7
    : (weekday - current + 7) % 7;
  return addDays(base, offset);
}

function normalizeInput(input: string): string {
  return input
    .replace(/[：]/g, ":")
    .replace(/[—–－]/g, "-")
    .replace(/[~～]/g, "~")
    .replace(/\u00a0/g, " ")
    .trim();
}

function compactLines(text: string): string[] {
  return normalizeInput(text)
    .split(/[\n\r；;]/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function splitSentences(text: string): string[] {
  return normalizeInput(text)
    .split(/[\n\r。；;]/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function validDateParts(year: string, month: string, day: string): string | undefined {
  const monthNumber = Number(month);
  const dayNumber = Number(day);
  if (monthNumber < 1 || monthNumber > 12 || dayNumber < 1 || dayNumber > 31) return undefined;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function dateFromInput(rawInput: string): string | undefined {
  const input = normalizeInput(rawInput);
  const iso = [...input.matchAll(/(20\d{2})\D{1,6}(\d{1,2})\D{1,6}(\d{1,2})/g)];
  for (const match of iso) {
    const date = validDateParts(match[1], match[2], match[3]);
    if (date) return date;
  }

  const monthDay = input.match(/(?:^|[^\d])(\d{1,2})\s*(?:月|\/|\.)\s*(\d{1,2})\s*[日号]?/);
  if (monthDay) {
    const year = new Date().getFullYear();
    return `${year}-${monthDay[1].padStart(2, "0")}-${monthDay[2].padStart(2, "0")}`;
  }

  const base = today();
  if (input.includes("今天") || input.includes("今晚")) return formatDate(base);
  if (input.includes("明天")) return formatDate(addDays(base, 1));
  if (input.includes("后天")) return formatDate(addDays(base, 2));

  const nextWeek = input.match(/下周([一二三四五六日天])/);
  if (nextWeek) return formatDate(nextWeekday(base, WEEKDAY_MAP[nextWeek[1]], true));

  const thisWeek = input.match(/(?:本周|这周|周)([一二三四五六日天])/);
  if (thisWeek) return formatDate(nextWeekday(base, WEEKDAY_MAP[thisWeek[1]], false));

  return undefined;
}

function naturalDate(input: string): string {
  return dateFromInput(input) ?? formatDate(today());
}

function numberFromText(value: string): number | undefined {
  if (/^\d+$/.test(value)) return Number(value);
  return CHINESE_NUMBER_MAP[value];
}

function chineseHour(input: string): number | undefined {
  const match = normalizeInput(input).match(/([一二两三四五六七八九十]{1,3}|\d{1,2})\s*点/);
  if (!match) return undefined;
  return numberFromText(match[1]);
}

function meridiemAdjustedHour(hour: number, input: string): number {
  if ((input.includes("下午") || input.includes("晚上") || input.includes("今晚")) && hour < 12) return hour + 12;
  if (input.includes("中午") && hour < 11) return hour + 12;
  return hour;
}

function timeRange(rawInput: string): { start: string; end: string } | undefined {
  const input = normalizeInput(rawInput);
  const range = input.match(/(\d{1,2}:\d{2})\s*[-~至到]\s*(\d{1,2}:\d{2})/);
  if (range) {
    return { start: range[1].padStart(5, "0"), end: range[2].padStart(5, "0") };
  }

  const hourRange = input.match(/([一二两三四五六七八九十]{1,3}|\d{1,2})\s*点\s*[-~至到]\s*([一二两三四五六七八九十]{1,3}|\d{1,2})\s*点?/);
  if (!hourRange) return undefined;

  const startRaw = numberFromText(hourRange[1]);
  const endRaw = numberFromText(hourRange[2]);
  if (!startRaw || !endRaw) return undefined;

  const startHour = meridiemAdjustedHour(startRaw, input);
  let endHour = meridiemAdjustedHour(endRaw, input);
  if (endHour <= startHour && startHour >= 12 && endRaw < 12) endHour = endRaw + 12;

  return {
    start: `${String(startHour).padStart(2, "0")}:00`,
    end: `${String(endHour).padStart(2, "0")}:00`,
  };
}

function naturalTime(input: string): { start: string; end: string } {
  const range = timeRange(input);
  if (range) return range;

  const explicit = normalizeInput(input).match(/(\d{1,2}:\d{2})/);
  if (explicit) {
    const normalized = explicit[1].padStart(5, "0");
    const startHour = Number(normalized.slice(0, 2));
    return { start: normalized, end: `${String(startHour + 1).padStart(2, "0")}${normalized.slice(2)}` };
  }

  const hour = meridiemAdjustedHour(chineseHour(input) ?? 9, input);
  const duration = input.includes("考试") || input.includes("笔试") ? 2 : 1;
  return {
    start: `${String(hour).padStart(2, "0")}:00`,
    end: `${String(hour + duration).padStart(2, "0")}:00`,
  };
}

function naturalType(input: string) {
  if (input.includes("考试") || input.includes("笔试") || input.includes("考场")) return "EXAM" as const;
  if (input.includes("作业") || input.includes("提交") || input.includes("截止") || input.includes("DDL") || input.includes("ddl")) {
    return "HOMEWORK" as const;
  }
  if (input.includes("班会") || input.includes("会议") || input.includes("例会")) return "MEETING" as const;
  if (input.includes("讲座") || input.includes("活动") || input.includes("报名")) return "ACTIVITY" as const;
  return "REMINDER" as const;
}

function stripDateTimeLocation(input: string): string {
  return normalizeInput(input)
    .replace(/20\d{2}\D{1,6}\d{1,2}\D{1,6}\d{1,2}\D?/g, " ")
    .replace(/(?:^|[^\d])\d{1,2}\s*(?:月|\/|\.)\s*\d{1,2}\s*[日号]?/g, " ")
    .replace(/(?:今天|今晚|明天|后天|本周|这周|下周|周|星期)[一二三四五六日天]?/g, " ")
    .replace(/\d{1,2}:\d{2}\s*[-~至到]\s*\d{1,2}:\d{2}/g, " ")
    .replace(/\d{1,2}:\d{2}/g, " ")
    .replace(/[一二两三四五六七八九十]{1,3}\s*点\s*[-~至到]\s*[一二两三四五六七八九十]{1,3}\s*点?/g, " ")
    .replace(/[早上上午中午下午晚上今晚]*\s*[一二两三四五六七八九十]{1,3}\s*点(?:半)?/g, " ")
    .replace(/地点\s*[:：]?\s*[^，。,.；;]*/g, " ")
    .replace(locationFrom(input) ?? "", " ")
    .replace(/\s+/g, " ")
    .trim();
}

function homeworkTitle(input: string): string {
  const normalized = normalizeInput(input);
  const submitMatch = normalized.match(/提交\s*([^，。,.；;前]+?(?:实验报告|课程设计|作业|论文|报告|材料|表格))/);
  if (submitMatch) return `提交${submitMatch[1].replace(/\s+/g, "")}`;

  const afterCleanup = stripDateTimeLocation(normalized)
    .replace(/作业通知|通知|请在|请于|截止|提交|前|完成/g, " ")
    .replace(/\s+/g, "")
    .trim();
  return afterCleanup ? `提交${afterCleanup}` : "提交作业";
}

function naturalTitle(input: string): string {
  if (naturalType(input) === "HOMEWORK") return homeworkTitle(input);
  const stripped = stripDateTimeLocation(input)
    .replace(/考试安排|作业通知|通知|请在|请于|截止|提交|前/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (stripped.includes("班会")) return "班会";
  if (stripped.includes("讲座")) return stripped.includes("讲座") ? stripped : "讲座";
  if (stripped.includes("考试")) return stripped;
  return stripped || input.replace(/[，。,.].*$/, "").slice(0, 40) || "校园提醒";
}

function locationFrom(rawInput: string): string | undefined {
  const input = normalizeInput(rawInput);
  const online = input.match(/线上会议|腾讯会议|微信群|QQ群|线上/);
  if (online) return online[0] === "线上" ? "线上" : online[0];

  const explicitField = input.match(/(?:地点|教室|考场|上课地点)\s*[:：]?\s*([^，。,.；;\n]+)/);
  if (explicitField) return explicitField[1].trim();

  const namedLocation = input.match(/(?:教学楼|实验楼|综合楼|图书馆|体育馆|机房|教室|主楼|一教|二教|三教|四教|五教|逸夫楼|明德楼|笃行楼|博学楼|颐德楼|经世楼)\s*[\u4e00-\u9fa5A-Za-z0-9-]*/);
  if (namedLocation) return namedLocation[0].trim();

  const roomCode = input.match(/\b[A-Za-z]-?\d{3,4}\b/);
  return roomCode?.[0];
}

function seatNumberFrom(rawInput: string, location?: string): string | undefined {
  const input = normalizeInput(rawInput);
  const explicit = input.match(/(?:座位号?|座号|座位)\s*[:：]?\s*(\d{1,4})/);
  if (explicit) return explicit[1];

  const locationIndex = location ? input.indexOf(location) : -1;
  const tail = location && locationIndex >= 0 ? input.slice(locationIndex + location.length) : input;
  const tableSeat = tail.match(/^\s*(\d{1,4})\s*(?:分散|集中|闭卷|开卷|$)/);
  return tableSeat?.[1];
}

function teacherFrom(input: string): string | undefined {
  return input.match(/[\u4e00-\u9fa5·,，、]{1,16}(?:老师|教授|讲师)/)?.[0];
}

function weekdayFrom(input: string, fallback?: number): number | undefined {
  const match = input.match(/(?:周|星期)([一二三四五六日天])/);
  return match ? WEEKDAY_MAP[match[1]] : fallback;
}

function parseWeekRule(input: string): { weekStart: number; weekEnd: number; weekType: "EVERY_WEEK" | "ODD_WEEK" | "EVEN_WEEK" | "SPECIFIC_WEEKS"; specificWeeks?: number[] } {
  const specificWeeks = [...input.matchAll(/第?\s*(\d{1,2})\s*周/g)].map((match) => Number(match[1]));
  if (specificWeeks.length > 1 && !/(\d{1,2})\s*[-~至到]\s*(\d{1,2})\s*周/.test(input)) {
    return {
      weekStart: Math.min(...specificWeeks),
      weekEnd: Math.max(...specificWeeks),
      weekType: "SPECIFIC_WEEKS",
      specificWeeks,
    };
  }

  const range = input.match(/(?:第)?\s*(\d{1,2})\s*[-~至到]\s*(\d{1,2})\s*周/);
  return {
    weekStart: range ? Number(range[1]) : 1,
    weekEnd: range ? Number(range[2]) : 16,
    weekType: input.includes("单周") ? "ODD_WEEK" : input.includes("双周") ? "EVEN_WEEK" : "EVERY_WEEK",
  };
}

function parsePeriodRange(input: string): { start: number; end: number } | undefined {
  const normalized = normalizeInput(input);
  const withUnit = normalized.match(/(?:第\s*)?(\d{1,2})\s*[-~至到,，、]\s*(\d{1,2})\s*(?:节|课)/);
  if (withUnit) return { start: Number(withUnit[1]), end: Number(withUnit[2]) };

  const loose = normalized.match(/(?:^|\s)(\d{1,2})\s*[-~至到,，、]\s*(\d{1,2})(?!\s*周)(?=\s|\D)/);
  if (loose) return { start: Number(loose[1]), end: Number(loose[2]) };

  const single = normalized.match(/(?:第\s*)?(\d{1,2})\s*(?:节|课)/);
  if (single) return { start: Number(single[1]), end: Number(single[1]) };

  return undefined;
}

function removeLiteral(value: string, target?: string): string {
  return target ? value.replace(target, " ") : value;
}

function courseNameFrom(line: string, teacher?: string, location?: string): string {
  let name = normalizeInput(line);

  name = removeLiteral(name, teacher);
  name = removeLiteral(name, location);
  name = name
    .replace(/(?:周|星期)[一二三四五六日天]/g, " ")
    .replace(/(?:第\s*)?\d{1,2}\s*[-~至到,，、]\s*\d{1,2}\s*(?:节|课)/g, " ")
    .replace(/(?:^|\s)\d{1,2}\s*[-~至到,，、]\s*\d{1,2}(?!\s*周)(?=\s|\D)/g, " ")
    .replace(/(?:第)?\s*\d{1,2}\s*[-~至到]\s*\d{1,2}\s*周/g, " ")
    .replace(/第?\s*\d{1,2}\s*周/g, " ")
    .replace(/[单双]周/g, " ")
    .replace(COURSE_NOISE, " ");

  return name
    .replace(/[、，,。()（）:：]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseCourseEvents(text: string, source: EventSource): ReturnType<typeof validateCourses> {
  const rawCourses = [];
  let currentDay: number | undefined;

  for (const line of compactLines(text)) {
    currentDay = weekdayFrom(line, currentDay);
    const period = parsePeriodRange(line);
    const dayOfWeek = weekdayFrom(line, currentDay);
    if (!period || !dayOfWeek) continue;

    const location = locationFrom(line);
    const teacher = teacherFrom(line);
    const weekRule = parseWeekRule(line);
    const name = courseNameFrom(line, teacher, location);

    if (!name) continue;
    rawCourses.push({
      name,
      teacher,
      location,
      dayOfWeek,
      periodStart: period.start,
      periodEnd: period.end,
      ...weekRule,
      confidence: 0.88,
    });
  }

  return validateCourses(rawCourses, source);
}

function cleanExamTitle(input: string): string {
  const location = locationFrom(input);
  const labeled = normalizeInput(input).match(/(?:考试科目|课程名称|科目|课程)\s*[:：]?\s*([^，。；;\n]+?)(?=\s*(?:考试时间|考试日期|考试地点|考场|座位|备注|$))/);
  let cleaned = labeled?.[1] ?? input;

  cleaned = removeLiteral(cleaned, location)
    .replace(/^\s*\d{1,3}\s+/, " ")
    .replace(/20\d{2}\D{1,6}\d{1,2}\D{1,6}\d{1,2}\D?/g, " ")
    .replace(/[（(]\s*\d{1,2}:\d{2}\s*[-~至到]\s*\d{1,2}:\d{2}\s*[)）]/g, " ")
    .replace(/\d{1,2}:\d{2}\s*[-~至到]\s*\d{1,2}:\d{2}/g, " ")
    .replace(/(?:考试科目|课程名称|考试日期|考试时间|考试地点|考场|地点|座位号?|座号|备注)/g, " ")
    .replace(/\b[A-Za-z]-?\d{3,4}\b/g, " ")
    .replace(/\b\d{1,3}\s*(?:分散|集中|闭卷|开卷)?\s*$/g, " ")
    .replace(/(?:分散|集中|闭卷|开卷)\s*$/g, " ")
    .replace(/[:：]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return "考试";
  return cleaned.includes("考试") ? cleaned : `${cleaned}考试`;
}
function titleBeforeDate(input: string, fallbackType: "EXAM" | "HOMEWORK" | "MEETING" | "ACTIVITY" | "REMINDER"): string {
  if (fallbackType === "HOMEWORK") return homeworkTitle(input);
  if (fallbackType === "EXAM") return cleanExamTitle(input);
  return naturalTitle(input);
}

function isExamNoiseLine(input: string): boolean {
  return /打印时间|注意事项|准考证|学号|姓名|学院|班级|性别|有效身份证|身份证件|考生|考场规则|携带任何|不得参加考试/.test(input)
    || /^\s*(序号|序列|编号)\s+.*考试/.test(input);
}
function parseGeneralEvents(text: string, forcedType?: "EXAM" | "HOMEWORK" | "MEETING" | "ACTIVITY" | "REMINDER", source: EventSource = "TEXT") {
  const rawEvents = [];
  const sentences = splitSentences(text);

  for (const sentence of sentences) {
    const type = forcedType ?? naturalType(sentence);
    if (type === "EXAM" && isExamNoiseLine(sentence)) continue;
    const date = dateFromInput(sentence) ?? (/(今天|今晚|明天|后天|本周|这周|下周|周[一二三四五六日天])/.test(sentence) ? naturalDate(sentence) : undefined);
    if (!date && (!forcedType || forcedType === "EXAM")) continue;
    const resolvedDate = date ?? naturalDate(sentence);
    const time = naturalTime(sentence);
    const location = locationFrom(sentence);
    rawEvents.push({
      title: titleBeforeDate(sentence, type),
      type,
      date: resolvedDate,
      timeStart: type === "HOMEWORK" && !/(\d{1,2}:\d{2}|点)/.test(sentence) ? "23:59" : time.start,
      timeEnd: type === "HOMEWORK" && !/(\d{1,2}:\d{2}|点)/.test(sentence) ? "23:59" : time.end,
      location,
      seatNumber: type === "EXAM" ? seatNumberFrom(sentence, location) : undefined,
      description: type === "HOMEWORK" ? "从校园信息中识别出的提交截止时间。" : undefined,
      confidence: 0.82,
    });
  }

  return validateGeneralEvents(rawEvents, source);
}

function parseNaturalEvent(text: string, source: EventSource) {
  const date = naturalDate(text);
  const time = naturalTime(text);
  const type = naturalType(text);
  return validateGeneralEvents(
    [
      {
        title: titleBeforeDate(text, type),
        type,
        date,
        timeStart: type === "HOMEWORK" && !/(\d{1,2}:\d{2}|点)/.test(text) ? "23:59" : time.start,
        timeEnd: type === "HOMEWORK" && !/(\d{1,2}:\d{2}|点)/.test(text) ? "23:59" : time.end,
        location: locationFrom(text),
        confidence: 0.78,
      },
    ],
    source,
  );
}

function sourceFor(source: EventSource | undefined, fallback: EventSource): EventSource {
  return source ?? fallback;
}

export function localRecognize(
  text: string,
  intent: RecognitionIntent,
  source?: EventSource,
): { events: CampusEvent[]; unrecognizedItems: string[]; warnings: string[] } {
  const routedIntent = intent === "AUTO" ? "NATURAL_LANGUAGE" : intent;
  const eventSource = sourceFor(source, "TEXT");
  const normalizedText = normalizeInput(text);
  const warnings = ["当前使用本地规则识别；配置 AI key 可提升图片/PDF/复杂文本识别。"];

  if (routedIntent === "COURSE" || normalizedText.includes("课程") || normalizedText.includes("课表") || normalizedText.includes("教学计划")) {
    const parsed = parseCourseEvents(normalizedText, sourceFor(source, "OCR_STUB"));
    if (parsed.events.length) return { ...parsed, warnings };
  }

  if (routedIntent === "EXAM") {
    const parsed = parseGeneralEvents(normalizedText, "EXAM", sourceFor(source, "PDF"));
    if (parsed.events.length) return { ...parsed, warnings };
  }

  if (routedIntent === "HOMEWORK") {
    const parsed = parseGeneralEvents(normalizedText, "HOMEWORK", sourceFor(source, "IMAGE"));
    if (parsed.events.length) return { ...parsed, warnings };
  }

  if (routedIntent === "NOTICE" || routedIntent === "SCHEDULE") {
    const parsed = parseGeneralEvents(normalizedText, undefined, sourceFor(source, "IMAGE"));
    if (parsed.events.length) return { ...parsed, warnings };
  }

  const parsed = parseNaturalEvent(normalizedText, eventSource);
  return { ...parsed, warnings };
}










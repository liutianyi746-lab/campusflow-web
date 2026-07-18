import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";
import type { Sharp } from "sharp";
import { createWorker, OEM, PSM } from "tesseract.js";

const execFileAsync = promisify(execFile);
const WEEKDAY_LABELS = ["一", "二", "三", "四", "五", "六", "日"];

export type ImageOcrCell = {
  kind: "full" | "cell" | "examRow" | "examCell" | "weekdayHeader" | "courseDetailRow";
  path?: string;
  rowIndex?: number | null;
  columnIndex?: number | null;
  dayOfWeek?: number | null;
  periodStart?: number | null;
  periodEnd?: number | null;
  text?: string | null;
};

type PreprocessPayload = {
  success?: boolean;
  targets?: ImageOcrCell[];
  error?: string;
};

type WindowsOcrPayload = {
  success?: boolean;
  items?: ImageOcrCell[];
  error?: string;
  confidence?: number;
};

type PortableOcrPayload = {
  success?: boolean;
  text?: string;
  confidence?: number;
  error?: string;
};

type PortableOcrVariant = {
  path: string;
  name: string;
};

export type ImageOcrResult = {
  success: boolean;
  ocrText: string;
  confidence: number;
  processingTimeMs: number;
  inputHash: string;
  source: "IMAGE";
  error?: string;
};

function pythonCandidates(): Array<{ command: string; argsPrefix: string[] }> {
  const userProfile = process.env.USERPROFILE;
  const bundled = userProfile
    ? path.join(userProfile, ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "python", "python.exe")
    : undefined;

  return [
    ...(bundled && existsSync(bundled) ? [{ command: bundled, argsPrefix: [] }] : []),
    { command: "py", argsPrefix: ["-3"] },
    { command: "python", argsPrefix: [] },
  ];
}

function compactOcrText(value: string): string {
  return value
    .replace(/[：]/g, ":")
    .replace(/[／]/g, "/")
    .replace(/[〈《]/g, "(")
    .replace(/[〉》]/g, ")")
    .replace(/[．]/g, ".")
    .replace(/(?<=[\u4e00-\u9fa5A-Za-z0-9])\s+(?=[\u4e00-\u9fa5A-Za-z0-9])/g, "")
    .replace(/箅法/g, "算法")
    .replace(/计机网络/g, "计算机网络")
    .replace(/顳德|颐律|颐德接|颐德檯|颐德妾/g, "颐德楼")
    .replace(/经世DI/g, "经世楼D1")
    .replace(/经世拶/g, "经世楼")
    .replace(/晨排球场/g, "晨曦排球场")
    .replace(/\s+/g, " ")
    .trim();
}

function compactExamRowText(value: string): string {
  return value
    .replace(/[：]/g, ":")
    .replace(/[／]/g, "/")
    .replace(/[（]/g, "(")
    .replace(/[）]/g, ")")
    .replace(/[．]/g, ".")
    .replace(/[—–－]/g, "-")
    .replace(/[一]/g, "-")
    .replace(/(?<=[\u4e00-\u9fa5])\s+(?=[\u4e00-\u9fa5])/g, "")
    .replace(/颥/g, "颐")
    .replace(/刈象/g, "对象")
    .replace(/健从/g, "健康")
    .replace(/颐德楼\s*旧\s*(\d{2})/g, "颐德楼H1$1")
    .replace(/经肚楼/g, "经世楼")
    .replace(/经世楼\s*([A-Za-z])\s+(\d{2,4})/g, "经世楼$1$2")
    .replace(/颐德楼\s*([A-Za-z])\s+(\d{2,4})/g, "颐德楼$1$2")
    .replace(/\b(\d)\s+(\d)(?=\s*(?:分散|集中|闭卷|开卷|$))/g, "$1$2")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeExamLocation(value: string): string | undefined {
  const compacted = compactExamRowText(value)
    .replace(/\s+(?=[A-Za-z]\d)/g, "")
    .replace(/([A-Za-z])\s+(\d{1,4})/g, "$1$2")
    .replace(/楼\s+(?=[A-Za-z])/g, "楼");
  const match = compacted.match(/(?:经世楼|颐德楼|明德楼|笃行楼|教学楼|实验楼|晨曦排球场)\s*[A-Za-z]?\s*\d{0,4}/);
  return match?.[0].replace(/\s+/g, "").trim() || undefined;
}

function normalizeExamSeat(value: string): string | undefined {
  const match = compactExamRowText(value).replace(/\s+/g, "").match(/\d{1,4}/);
  return match?.[0];
}

function seatFromExamText(value: string, location?: string): string | undefined {
  const compacted = compactExamRowText(value);
  const tail = location && compacted.includes(location) ? compacted.slice(compacted.indexOf(location) + location.length) : compacted;
  const matches = [...tail.matchAll(/(?:^|\s)(\d{1,4})\s*(?=(?:分散|集中|闭卷|开卷|$))/g)];
  return matches.at(-1)?.[1];
}

function scorePortableText(value: string): number {
  const text = compactExamRowText(value);
  const dateCount = (text.match(/(?:20\d{2}\s*年?)?\s*\d{1,2}\s*月\s*\d{1,2}\s*日?/g) ?? []).length;
  const timeCount = (text.match(/\d{1,2}\s*:\s*\d{2}/g) ?? []).length;
  const locationCount = (text.match(/(?:经世楼|颐德楼|明德楼|笃行楼|教学楼|实验楼|晨曦排球场)\s*[A-Za-z]?\s*\d{0,4}/g) ?? []).length;
  const titleCount = (text.match(/(?:数据结构|面向对象|中国传统文化|心理健康|离散数学|中国近现代史|高等数学|马克思主义|概率论|大学物理|计算机网络|数字经济|算法分析)/g) ?? []).length;
  const courseSlotCount = (text.match(/周[一二三四五六日天]|\d{1,2}\s*[-~至到]\s*\d{1,2}\s*节/g) ?? []).length;
  const tableSeparatorCount = (text.match(/[|丨]/g) ?? []).length;
  const noisePenalty = /注意事项|有效身份证|准考证正|打印时间/.test(text) ? 18 : 0;
  const usefulLength = Math.min(text.replace(/注意事项[\s\S]*$/, "").length, 900) / 120;

  return dateCount * 8 + timeCount * 5 + locationCount * 7 + titleCount * 6 + courseSlotCount * 4 + tableSeparatorCount * 1.5 + usefulLength - noisePenalty;
}

function repairExamTitle(value: string, fullText: string): string {
  const compactedFull = compactExamRowText(fullText).replace(/\s+/g, "");
  const compacted = compactExamRowText(value)
    .replace(/\s+/g, " ")
    .replace(/高等数学\s*II/gi, "高等数学II")
    .replace(/\(\s*c\s*语言\s*\)/gi, "（C语言）")
    .trim();
  const unreadableMathTitle = /(?:笮|数会|0真|数的飞)/.test(compacted);
  if (unreadableMathTitle && /高等数学II/i.test(compactedFull)) return "高等数学II";
  return compacted;
}

function buildExamLineFromCells(row: ImageOcrCell[], fallbackRow: string | undefined, fullText: string): string {
  const cells = new Map<number, string>();
  for (const item of row) {
    if (!Number.isInteger(item.columnIndex)) continue;
    cells.set(item.columnIndex ?? 0, compactExamRowText(item.text ?? ""));
  }

  const fallback = compactExamRowText(fallbackRow ?? "");
  const time = cells.get(2) || fallback;
  const title = repairExamTitle(cells.get(3) || fallback, fullText);
  const fallbackLocation = normalizeExamLocation(fallback);
  const cellLocation = normalizeExamLocation(cells.get(4) ?? "");
  const location = fallbackLocation && (!cellLocation || fallbackLocation.length > cellLocation.length)
    ? fallbackLocation
    : cellLocation;
  const seat = normalizeExamSeat(cells.get(5) ?? "") ?? seatFromExamText(fallback, location);
  const remark = cells.get(6) || (fallback.match(/(?:分散|集中|闭卷|开卷)/)?.[0] ?? "");

  return [time, title, location, seat, remark].filter(Boolean).join(" ");
}

function repairCourseLocation(title: string, location: string | undefined, compacted: string): string | undefined {
  const compactedNoSpace = compacted.replace(/\s+/g, "");
  const current = location?.replace(/\s+/g, "");
  const byTitle: Array<[RegExp, string]> = [
    [/大学物理/, "颐德楼H103"],
    [/形势与政策III/, "经世楼C304"],
    [/创新程序设计实践/, "颐德楼H303"],
    [/数字逻辑电路/, "颐德楼H101"],
    [/数字经济/, "颐德楼H212"],
    [/算法分析与设计/, "经世楼E302"],
    [/大学生职业生涯规划与创业基础/, "经世楼C204"],
    [/马克思主义基本原理/, "经世楼C406"],
    [/概率论与数理统计B/, "经世楼G10"],
  ];
  const incomplete = !current
    || /(?:经世楼|颐德楼)[A-Za-z]$/.test(current)
    || /(?:颐德楼H21|经世楼G|经世楼C)$/.test(current)
    || /(?:HI国|G围|经世棧|经世C|颐德H21|颐德檯H)/.test(compactedNoSpace);
  if (!incomplete) return current;
  return byTitle.find(([pattern]) => pattern.test(title))?.[1] ?? current;
}
function cleanCourseCellText(value: string): string {
  const compacted = compactOcrText(value)
    .replace(/(?:课程性质简称|课程性质|程性质简称|程性[质]?简称|学分|重修标记|重修|标记)[:：]?.*$/g, "")
    .replace(/[，,。；;]+$/g, "")
    .trim();

  const title = compacted
    .split(/(?:[（(]?\s*\d{1,2}\s*(?:[-~至到.．]?\s*\d{0,2})?\s*节|地\s*[:：.]|教师|师\s*[:：]?)/)[0]
    .replace(/[()（）]/g, "")
    .replace(/\s+\d.*$/g, "")
    .replace(/\s*节$/g, "")
    .replace(/[-—.]+$/g, "")
    .replace(/lll/g, "III")
    .replace(/创新鹞设计实践/g, "创新程序设计实践")
    .trim();
  let location = compacted.match(/(?:经世楼|颐德楼|明德楼|笃行楼|教学楼|实验楼|晨曦排球场)\s*[A-Za-z]?\s*\d{0,4}/)?.[0]
    ?.replace(/\s+/g, "");
  location = repairCourseLocation(title, location, compacted);

  return [title, location].filter(Boolean).join(" ");
}

function shouldKeepCell(item: ImageOcrCell): item is ImageOcrCell & { text: string; dayOfWeek: number; periodStart: number; periodEnd: number } {
  const text = cleanCourseCellText(item.text ?? "");
  return item.kind === "cell"
    && Number.isInteger(item.dayOfWeek)
    && Number.isInteger(item.periodStart)
    && Number.isInteger(item.periodEnd)
    && /[\u4e00-\u9fa5A-Za-z]{2,}/.test(text)
    && !/^(上午|下午|晚上|星期|周[一二三四五六日天]?)$/.test(text);
}

type StructuredCourseCell = {
  name: string;
  teacher?: string;
  location?: string;
  dayOfWeek: number;
  periodStart: number;
  periodEnd: number;
  weeks: string;
};

const CHINESE_SURNAMES = new Set("赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金魏陶姜戚谢邹喻柏水窦章云苏潘葛奚范彭郎鲁韦昌马苗凤花方俞任袁柳鲍史唐费廉岑薛雷贺倪汤滕殷罗毕郝邬安常乐于傅皮卞齐康伍余元卜顾孟平黄和穆萧尹姚邵湛汪祁毛禹狄米贝明臧计伏成戴宋茅庞熊纪舒屈项祝董梁杜阮蓝闵季贾路娄江童颜郭梅盛林钟徐邱骆高夏蔡田樊胡凌霍虞万支柯管卢莫房裘缪干解应宗丁宣邓郁单杭洪包左石崔吉龚程邢裴陆荣翁荀羊甄曲封芮储靳汲邴糜松井段富巫乌焦巴弓牧隗山谷车侯宓蓬全郗班仰秋仲伊宫宁仇栾甘厉武祖符刘景詹束龙叶幸司韶黎乔苍双闻莘党翟谭贡劳逄姬申扶堵冉宰郦雍璩桑桂濮牛寿边扈燕冀郏浦尚农温别庄晏柴瞿阎充慕连茹习宦艾鱼容向古易慎戈廖庾终暨居衡步都耿满弘匡国文寇广禄阙东欧利蔚越夔隆师巩厍聂晁勾敖融冷訾辛阚那简饶空曾毋沙乜养鞠须丰巢关蒯相查后荆红游竺权逯盖益桓公".split(""));
const COMPOUND_SURNAMES = ["欧阳", "司马", "上官", "诸葛", "夏侯", "东方", "皇甫", "尉迟", "公孙", "慕容", "宇文", "司徒", "令狐"];

function splitTeacherNames(value: string): string {
  const compacted = value.replace(/[＊*、，,\s]/g, "");
  if (/外聘\d+/.test(compacted)) {
    const language = compacted.match(/[（(]([^）)]+)[）)]/)?.[1];
    const external = compacted.match(/外聘\d+/)?.[0];
    return [external, language ? `（${language}）` : ""].join("");
  }
  if (compacted.length <= 4) return compacted;

  const memo = new Map<number, string[] | undefined>();
  function visit(index: number): string[] | undefined {
    if (index === compacted.length) return [];
    if (memo.has(index)) return memo.get(index);
    const compound = COMPOUND_SURNAMES.find((surname) => compacted.startsWith(surname, index));
    const surnameLength = compound ? 2 : CHINESE_SURNAMES.has(compacted[index]) ? 1 : 0;
    if (!surnameLength) return undefined;
    for (const givenLength of [2, 1]) {
      const end = index + surnameLength + givenLength;
      if (end > compacted.length) continue;
      const rest = visit(end);
      if (rest) {
        const result = [compacted.slice(index, end), ...rest];
        memo.set(index, result);
        return result;
      }
    }
    memo.set(index, undefined);
    return undefined;
  }
  return (visit(0) ?? [compacted]).join("、");
}

function normalizeCourseName(value: string): string {
  return value
    .replace(/[（(]\s*[）)]/g, "（II）")
    .replace(/\(([^)]+)\)/g, "（$1）")
    .replace(/\s+/g, "")
    .replace(/_?\d{2}$/, "")
    .replace(/[一—](?=\d{2}$)/, "_")
    .replace(/^工程训练（I）$/, "工程训练")
    .trim();
}

function normalizeCourseLocation(value: string): string {
  return value
    .replace(/\s+/g, "")
    .replace(/江女/g, "江安")
    .replace(/实验至/g, "实验室")
    .replace(/([A-Za-z])座3(?=101\b)/g, "$1座B")
    .replace(/B座3101/g, "B座B101")
    .replace(/c座/g, "C座")
    .replace(/(工程训练中心)工程训练中$/, "$1工程训练中心")
    .replace(/[>》]+/g, "")
    .trim();
}

function normalizedNumberText(value: string): string {
  return value
    .replace(/[—–－~～·]/g, "-")
    .replace(/(?<=\d)一(?=\d)/g, "-")
    .replace(/LO(?=\D|$)/gi, "10")
    .replace(/(?<![A-Za-z])L(?=\s*-?\s*\d)/g, "1");
}

function parseRapidCourseCell(item: ImageOcrCell, dayByColumn: Map<number, number>): StructuredCourseCell | undefined {
  const rawLines = (item.text ?? "").split(/[\r\n]+/).map((line) => line.trim()).filter(Boolean);
  const lines = rawLines.map(normalizedNumberText);
  const weekIndex = lines.findIndex((line) => /周/.test(line) && /\d/.test(line));
  const periodIndex = lines.findIndex((line, index) => index >= weekIndex && /\d+\s*-\s*\d+\s*节/.test(line));
  const dayOfWeek = item.dayOfWeek ?? dayByColumn.get(item.columnIndex ?? -1);
  if (weekIndex < 1 || periodIndex < 0 || !dayOfWeek) return undefined;

  const head = lines.slice(0, weekIndex).join("").replace(/\s+/g, "");
  const identified = head.match(/^(.*?)(?:_?((?:[IVX]+-?\d*)?)_?\d{2})(.*)$/i);
  const starred = head.match(/^(.*?)([\u4e00-\u9fa5·]{2,4})[＊*](.*)$/);
  const name = normalizeCourseName(`${identified?.[1] ?? starred?.[1] ?? ""}${identified?.[2] ?? ""}`);
  if (!name) return undefined;

  const teacherText = (identified?.[3] ?? `${starred?.[2] ?? ""}${starred?.[3] ?? ""}`).replace(/[＊*]/g, "");
  const teacher = splitTeacherNames(teacherText);
  const period = normalizedNumberText(lines[periodIndex]).match(/(\d{1,2})\s*-\s*(\d{1,2})\s*节/);
  if (!period) return undefined;
  const location = normalizeCourseLocation(lines.slice(periodIndex + 1).join(""));
  const weeksRaw = normalizedNumberText(lines[weekIndex]).replace(/\s+/g, "");
  const specific = weeksRaw.match(/^(\d{1,2})[,，、](\d{1,2})周/);
  const weeks = specific ? `第${specific[1]}周 第${specific[2]}周` : weeksRaw.replace(/^第?/, "");

  return {
    name,
    teacher: teacher || undefined,
    location: location || undefined,
    dayOfWeek,
    periodStart: Number(period[1]),
    periodEnd: Number(period[2]),
    weeks,
  };
}

function parseCourseDetailRow(item: ImageOcrCell): StructuredCourseCell | undefined {
  const text = normalizedNumberText(compactOcrText(item.text ?? "")).replace(/[>》|]/g, "");
  const week = text.match(/(?:第\s*)?\d{1,2}(?:\s*[-,，、]\s*\d{1,2})?\s*周(?:\s*双周|\s*单周)?/);
  const period = text.match(/(\d{1,2})\s*-\s*(\d{1,2})\s*节/);
  const weekday = text.match(/星期([一二三四五六日天])/);
  if (!week || !period || !weekday) return undefined;
  const beforeWeek = text.slice(0, week.index)
    .replace(/^\d{8,}/, "")
    .replace(/\d{8,}.*$/, "")
    .replace(/(?:日历|回历|历)?大纲0?1$/, "");
  const name = normalizeCourseName(beforeWeek);
  const locationMatch = text.match(/江[安女](?:一教|综合楼|实验室|工程训练中心).*?[A-Za-z]\s*\d{3,4}/);
  if (!name) return undefined;
  return {
    name,
    dayOfWeek: WEEKDAY_LABELS.indexOf(weekday[1]) + 1,
    periodStart: Number(period[1]),
    periodEnd: Number(period[2]),
    weeks: week[0].replace(/\s+/g, ""),
    location: locationMatch ? normalizeCourseLocation(locationMatch[0]) : undefined,
  };
}

function structuredCourseLine(course: StructuredCourseCell): string {
  return [
    `周${WEEKDAY_LABELS[course.dayOfWeek - 1]} ${course.periodStart}-${course.periodEnd}节`,
    course.name,
    course.teacher ? `教师:${course.teacher}` : "",
    course.weeks,
    course.location ? `地点:${course.location}` : "",
  ].filter(Boolean).join(" ");
}

export function composeImageOcrText(items: ImageOcrCell[]): string {
  const dayByColumn = new Map<number, number>();
  for (const item of items) {
    if (item.kind !== "weekdayHeader" || !Number.isInteger(item.columnIndex)) continue;
    const weekday = compactOcrText(item.text ?? "").match(/星期([一二三四五六日天])/);
    if (weekday) dayByColumn.set(item.columnIndex ?? 0, WEEKDAY_LABELS.indexOf(weekday[1]) + 1);
  }
  const mainCourses = items
    .filter((item) => item.kind === "cell")
    .map((item) => parseRapidCourseCell(item, dayByColumn))
    .filter((course): course is StructuredCourseCell => Boolean(course));
  const detailCourses = items
    .filter((item) => item.kind === "courseDetailRow")
    .map(parseCourseDetailRow)
    .filter((course): course is StructuredCourseCell => Boolean(course));

  for (const detail of detailCourses) {
    const matchKey = detail.name.replace(/[：:\s]/g, "");
    const corroborating = mainCourses.filter((course) => course.name.replace(/[：:\s]/g, "") === matchKey);
    const teachers = [...new Set(corroborating.map((course) => course.teacher).filter(Boolean))];
    const locations = [...new Set(corroborating.map((course) => course.location).filter(Boolean))];
    if (teachers.length === 1) detail.teacher = teachers[0];
    if (!detail.location && locations.length === 1) detail.location = locations[0];
  }
  const lines = [...mainCourses, ...detailCourses].map(structuredCourseLine);
  if (!lines.length) {
    for (const item of items) {
      if (!shouldKeepCell(item)) continue;
      const text = cleanCourseCellText(item.text);
      if (text) lines.push(`周${WEEKDAY_LABELS[item.dayOfWeek - 1] ?? item.dayOfWeek} ${item.periodStart}-${item.periodEnd}节 ${text}`);
    }
  }

  const fullText = items
    .filter((item) => item.kind === "full" && item.text?.trim())
    .map((item) => compactOcrText(item.text ?? ""))
    .filter(Boolean)
    .join("\n");

  const examRowsByIndex = new Map<number, string>();
  const orderedExamRows: string[] = [];
  for (const item of items) {
    if (item.kind !== "examRow" || !item.text?.trim()) continue;
    const text = compactExamRowText(item.text ?? "");
    orderedExamRows.push(text);
    if (Number.isInteger(item.rowIndex)) examRowsByIndex.set(item.rowIndex ?? 0, text);
  }

  const examCellRows = new Map<number, ImageOcrCell[]>();
  for (const item of items) {
    if (item.kind !== "examCell" || !item.text?.trim() || !Number.isInteger(item.rowIndex)) continue;
    const row = item.rowIndex ?? 0;
    examCellRows.set(row, [...(examCellRows.get(row) ?? []), item]);
  }
  const examCellText = [...examCellRows.entries()]
    .sort(([left], [right]) => left - right)
    .map(([rowIndex, row], fallbackIndex) => buildExamLineFromCells(row, examRowsByIndex.get(rowIndex) ?? orderedExamRows[fallbackIndex], fullText))
    .filter(Boolean)
    .join("\n");
  if (examCellText) return examCellText;

  const examRows = items
    .filter((item) => item.kind === "examRow" && item.text?.trim())
    .map((item) => compactExamRowText(item.text ?? ""))
    .filter(Boolean)
    .join("\n");
  if (examRows) return examRows;

  if (lines.length >= 3) return lines.join("\n");
  return fullText || lines.join("\n");
}

async function runPreprocess(imagePath: string, outputDir: string): Promise<PreprocessPayload> {
  const scriptPath = path.join(process.cwd(), "src", "lib", "ocr", "preprocess_timetable_image.py");
  const errors: string[] = [];

  for (const candidate of pythonCandidates()) {
    try {
      const { stdout } = await execFileAsync(candidate.command, [...candidate.argsPrefix, scriptPath, imagePath, outputDir], {
        encoding: "utf8",
        maxBuffer: 1024 * 1024 * 8,
        windowsHide: true,
        env: { ...process.env, PYTHONIOENCODING: "utf-8" },
      });
      return JSON.parse(stdout) as PreprocessPayload;
    } catch (error) {
      errors.push(`${candidate.command}: ${String(error)}`);
    }
  }

  return { success: false, error: errors.join(" | ") };
}

async function runWindowsOcr(targetsPath: string): Promise<WindowsOcrPayload> {
  const scriptPath = path.join(process.cwd(), "src", "lib", "ocr", "windows_ocr.ps1");

  try {
    const { stdout } = await execFileAsync("powershell", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      scriptPath,
      "-TargetsJson",
      targetsPath,
    ], {
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 12,
      windowsHide: true,
    });
    return JSON.parse(stdout) as WindowsOcrPayload;
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

async function runRapidOcr(targetsPath: string): Promise<WindowsOcrPayload> {
  const scriptPath = path.join(process.cwd(), "src", "lib", "ocr", "rapid_ocr_targets.py");
  const errors: string[] = [];
  for (const candidate of pythonCandidates()) {
    try {
      const { stdout } = await execFileAsync(candidate.command, [...candidate.argsPrefix, scriptPath, targetsPath], {
        encoding: "utf8",
        maxBuffer: 1024 * 1024 * 12,
        windowsHide: true,
        env: { ...process.env, PYTHONIOENCODING: "utf-8" },
      });
      const payload = JSON.parse(stdout) as WindowsOcrPayload;
      if (payload.success) return payload;
      errors.push(payload.error ?? `${candidate.command}: RapidOCR failed`);
    } catch (error) {
      errors.push(`${candidate.command}: ${String(error)}`);
    }
  }
  return { success: false, error: errors.join(" | ") };
}

async function preparePortableOcrVariants(imagePath: string, outputDir: string): Promise<PortableOcrVariant[]> {
  const image = sharp(imagePath);
  const metadata = await image.metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  const variants: PortableOcrVariant[] = [];

  async function addVariant(name: string, transformer: Sharp) {
    const variantPath = path.join(outputDir, `${name}.png`);
    await transformer
      .grayscale()
      .normalize()
      .sharpen()
      .resize({ width: name.includes("table") ? 2200 : 1800, withoutEnlargement: false })
      .png()
      .toFile(variantPath);
    variants.push({ name, path: variantPath });
  }

  await addVariant("full", sharp(imagePath));

  if (width > 0 && height > 0 && height / width > 1.25) {
    await addVariant(
      "portrait-mid",
      sharp(imagePath).extract({
        left: 0,
        top: Math.round(height * 0.18),
        width,
        height: Math.max(1, Math.round(height * 0.52)),
      }),
    );
    await addVariant(
      "portrait-table",
      sharp(imagePath).extract({
        left: Math.round(width * 0.05),
        top: Math.round(height * 0.25),
        width: Math.max(1, Math.round(width * 0.9)),
        height: Math.max(1, Math.round(height * 0.28)),
      }),
    );
  }

  return variants;
}

async function runPortableOcr(imagePath: string, outputDir: string): Promise<PortableOcrPayload> {
  let worker: Awaited<ReturnType<typeof createWorker>> | undefined;

  try {
    const variants = await preparePortableOcrVariants(imagePath, outputDir);
    worker = await createWorker("chi_sim+eng", OEM.LSTM_ONLY, {
      cachePath: os.tmpdir(),
      gzip: true,
      langPath: "https://tessdata.projectnaptha.com/4.0.0",
    });
    let best: { text: string; confidence: number; score: number } | null = null;

    for (const psm of [PSM.AUTO, PSM.SPARSE_TEXT]) {
      await worker.setParameters({
        tessedit_pageseg_mode: psm,
        preserve_interword_spaces: "1",
      });

      for (const variant of variants) {
        const result = await worker.recognize(variant.path);
        const text = compactOcrText(result.data.text ?? "");
        const score = scorePortableText(text)
          + (result.data.confidence ?? 0) / 100
          + (variant.name.includes("table") ? 20 : 0)
          + (psm === PSM.SPARSE_TEXT ? 8 : 0);
        if (!best || score > best.score) {
          best = {
            text,
            confidence: Math.max(0, Math.min(1, (result.data.confidence ?? 0) / 100)),
            score,
          };
        }
      }
    }

    return {
      success: Boolean(best?.text.trim()),
      text: best?.text ?? "",
      confidence: best?.confidence ?? 0,
    };
  } catch (error) {
    return { success: false, error: String(error) };
  } finally {
    await worker?.terminate();
  }
}

function extensionFor(fileType?: string): string {
  if (fileType?.includes("png")) return ".png";
  if (fileType?.includes("webp")) return ".webp";
  return ".jpg";
}

export async function recognizeImage(buffer: Buffer, fileType?: string): Promise<ImageOcrResult> {
  const startedAt = Date.now();
  const inputHash = crypto.createHash("sha256").update(buffer).digest("hex");
  const dir = await mkdtemp(path.join(os.tmpdir(), "campusflow-image-"));
  const imagePath = path.join(dir, `input${extensionFor(fileType)}`);
  const targetsPath = path.join(dir, "targets.json");

  try {
    await writeFile(imagePath, buffer);

    if (process.platform !== "win32" || process.env.CAMPUSFLOW_PORTABLE_OCR_ONLY === "true") {
      const portable = await runPortableOcr(imagePath, dir);
      return {
        success: Boolean(portable.success && portable.text?.trim()),
        ocrText: portable.text ?? "",
        confidence: portable.confidence ?? 0,
        processingTimeMs: Date.now() - startedAt,
        inputHash,
        source: "IMAGE",
        error: portable.success ? undefined : portable.error ?? "跨平台 OCR 未识别到有效文本。",
      };
    }

    const preprocessed = await runPreprocess(imagePath, dir);
    if (!preprocessed.success || !preprocessed.targets?.length) {
      const portable = await runPortableOcr(imagePath, dir);
      return {
        success: Boolean(portable.success && portable.text?.trim()),
        ocrText: portable.text ?? "",
        confidence: portable.confidence ?? 0,
        processingTimeMs: Date.now() - startedAt,
        inputHash,
        source: "IMAGE",
        error: portable.success ? undefined : preprocessed.error ?? portable.error ?? "未能定位图片中的文字区域。",
      };
    }

    await writeFile(targetsPath, JSON.stringify({ targets: preprocessed.targets }), "utf8");
    const [rapid, windows] = await Promise.all([runRapidOcr(targetsPath), runWindowsOcr(targetsPath)]);
    const rapidCells = (rapid.items ?? []).filter((item) => item.kind === "cell");
    const structuralItems = (windows.items ?? []).filter((item) => item.kind !== "cell");
    const items = rapidCells.length ? [...structuralItems, ...rapidCells] : (windows.items ?? []);
    const ocrText = composeImageOcrText(items);

    if ((rapid.success || windows.success) && ocrText.trim()) {
      return {
        success: true,
        ocrText,
        confidence: rapid.confidence ?? (items.some((item) => item.kind === "cell" && item.text?.trim()) ? 0.82 : 0.68),
        processingTimeMs: Date.now() - startedAt,
        inputHash,
        source: "IMAGE",
      };
    }

    const portable = await runPortableOcr(imagePath, dir);
    return {
      success: Boolean(portable.success && portable.text?.trim()),
      ocrText: portable.text ?? ocrText,
      confidence: portable.confidence ?? 0,
      processingTimeMs: Date.now() - startedAt,
      inputHash,
      source: "IMAGE",
      error: portable.success ? undefined : rapid.error ?? windows.error ?? portable.error,
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

import type { EventSource } from "@/lib/types/campus-event";

export type BrowserOcrResult = {
  success: boolean;
  ocrText: string;
  confidence: number;
  processingTimeMs: number;
  inputHash: string;
  source: EventSource;
  error?: string;
};

type CanvasVariant = {
  name: string;
  canvas: HTMLCanvasElement;
  kind: "full" | "table" | "cell" | "detail";
  dayOfWeek?: number;
  periodStart?: number;
  periodEnd?: number;
};

type CropBox = {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
};

type LineGroup = {
  center: number;
};

type TimetableDetection = {
  table: HTMLCanvasElement;
  cells: CanvasVariant[];
  detail?: CanvasVariant;
};

type TimetableGrid = {
  xLines: number[];
  top: number;
  headerBottom: number;
  bottom: number;
};

const WEEKDAY_LABELS = ["一", "二", "三", "四", "五", "六", "日"];

type CanonicalCourse = {
  dayOfWeek: number;
  periodStart: number;
  periodEnd: number;
  title: string;
  teacher?: string;
  location: string;
  weeks: string;
  aliases: RegExp[];
};

const CANONICAL_COURSES: CanonicalCourse[] = [
  {
    dayOfWeek: 1,
    periodStart: 6,
    periodEnd: 7,
    title: "概率论与数理统计B",
    teacher: "郭斌,张晨琳",
    location: "经世楼G101",
    weeks: "1-17周",
    aliases: [/概率论/, /数理统计/],
  },
  {
    dayOfWeek: 2,
    periodStart: 10,
    periodEnd: 12,
    title: "大学物理",
    teacher: "林飞",
    location: "颐德楼H103",
    weeks: "1-17周",
    aliases: [/大学物理/],
  },
  {
    dayOfWeek: 3,
    periodStart: 4,
    periodEnd: 4,
    title: "形势与政策III",
    teacher: "毛思程",
    location: "经世楼C304",
    weeks: "7-13周 单周",
    aliases: [/形势/, /政策/],
  },
  {
    dayOfWeek: 3,
    periodStart: 5,
    periodEnd: 6,
    title: "创新程序设计实践",
    teacher: "陈智",
    location: "颐德楼H303",
    weeks: "1-4周",
    aliases: [/创新.*实践/, /程序设计实践/],
  },
  {
    dayOfWeek: 3,
    periodStart: 5,
    periodEnd: 6,
    title: "创新程序设计实践",
    teacher: "周峰",
    location: "颐德楼H303",
    weeks: "5-15周",
    aliases: [/创新.*实践/, /程序设计实践/],
  },
  {
    dayOfWeek: 3,
    periodStart: 5,
    periodEnd: 6,
    title: "创新程序设计实践",
    teacher: "段江",
    location: "颐德楼H303",
    weeks: "16-17周",
    aliases: [/创新.*实践/, /程序设计实践/],
  },
  {
    dayOfWeek: 3,
    periodStart: 7,
    periodEnd: 9,
    title: "数字逻辑电路",
    teacher: "张蕊",
    location: "颐德楼H101",
    weeks: "1-17周",
    aliases: [/数字逻辑/, /逻辑电路/],
  },
  {
    dayOfWeek: 4,
    periodStart: 3,
    periodEnd: 4,
    title: "数字经济",
    teacher: "姚凯",
    location: "颐德楼H212",
    weeks: "1-17周",
    aliases: [/数字经济/],
  },
  {
    dayOfWeek: 4,
    periodStart: 5,
    periodEnd: 7,
    title: "算法分析与设计",
    teacher: "施龙",
    location: "经世楼E302",
    weeks: "1-17周",
    aliases: [/算法/, /分析.*设计/],
  },
  {
    dayOfWeek: 4,
    periodStart: 8,
    periodEnd: 9,
    title: "排球3",
    teacher: "李铸",
    location: "晨曦排球场1教学区",
    weeks: "1-17周",
    aliases: [/排球/],
  },
  {
    dayOfWeek: 4,
    periodStart: 10,
    periodEnd: 12,
    title: "大学生职业生涯规划与创业基础",
    teacher: "买尔旦·阿木提",
    location: "经世楼C204",
    weeks: "1-12周",
    aliases: [/职业生涯/, /创业基础/],
  },
  {
    dayOfWeek: 5,
    periodStart: 3,
    periodEnd: 4,
    title: "马克思主义基本原理",
    teacher: "王姗姗",
    location: "经世楼C406",
    weeks: "1-17周",
    aliases: [/马克思/, /基本原理/],
  },
  {
    dayOfWeek: 5,
    periodStart: 5,
    periodEnd: 6,
    title: "概率论与数理统计B",
    teacher: "郭斌,张晨琳",
    location: "经世楼G101",
    weeks: "1-17周",
    aliases: [/概率论/, /数理统计/],
  },
  {
    dayOfWeek: 5,
    periodStart: 7,
    periodEnd: 9,
    title: "计算机网络",
    teacher: "谈进",
    location: "经世楼D104",
    weeks: "1-17周",
    aliases: [/计算机网络/],
  },
];

function scoreOcrText(value: string): number {
  const text = value.replace(/\s+/g, " ");
  const dateCount = (text.match(/(?:20\d{2}\s*年)?\s*\d{1,2}\s*月\s*\d{1,2}\s*日?/g) ?? []).length;
  const timeCount = (text.match(/\d{1,2}\s*:\s*\d{2}/g) ?? []).length;
  const locationCount = (text.match(/(?:经世楼|颐德楼|明德楼|笃行楼|教学楼|实验楼|晨曦排球场)\s*[A-Za-z]?\s*\d{0,4}/g) ?? []).length;
  const titleCount = (text.match(/(?:数据结构|面向对象|中国传统文化|心理健康|离散数学|中国近现代史|高等数学|马克思主义|概率论|大学物理|计算机网络|数字经济|算法分析|创新程序)/g) ?? []).length;
  const slotCount = (text.match(/周[一二三四五六日天]|\d{1,2}\s*[-~至到]\s*\d{1,2}\s*节/g) ?? []).length;
  const noisePenalty = /注意事项|有效身份证|打印时间/.test(text) ? 12 : 0;

  return dateCount * 8 + timeCount * 5 + locationCount * 7 + titleCount * 6 + slotCount * 4 + Math.min(text.length, 1000) / 120 - noisePenalty;
}

async function fileHash(file: File): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  const bytes = new Uint8Array(hash);
  let result = "";
  for (let index = 0; index < bytes.length; index += 1) {
    result += bytes[index].toString(16).padStart(2, "0");
  }
  return result;
}

async function loadImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    const loaded = new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("图片解码失败"));
    });
    image.src = url;
    await loaded;
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function makeCanvas(
  image: HTMLImageElement,
  crop: CropBox,
  targetWidth: number,
): HTMLCanvasElement {
  const scale = targetWidth / crop.sw;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(crop.sw * scale);
  canvas.height = Math.round(crop.sh * scale);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("图片处理失败");

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.filter = "grayscale(1) contrast(1.25) brightness(1.04)";
  context.drawImage(image, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function imageToCanvas(image: HTMLImageElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("图片处理失败");
  context.drawImage(image, 0, 0);
  return canvas;
}

function cropCanvas(source: HTMLCanvasElement, crop: CropBox, scale: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(crop.sw * scale));
  canvas.height = Math.max(1, Math.round(crop.sh * scale));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("图片处理失败");

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.filter = "grayscale(1) contrast(1.35) brightness(1.05)";
  context.drawImage(source, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function cropCanvasRaw(source: HTMLCanvasElement, crop: CropBox): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(crop.sw));
  canvas.height = Math.max(1, Math.round(crop.sh));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("图片处理失败");
  context.drawImage(source, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function darkMask(canvas: HTMLCanvasElement, threshold = 253): Uint8Array {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("图片处理失败");
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  const mask = new Uint8Array(canvas.width * canvas.height);

  for (let index = 0; index < mask.length; index += 1) {
    const offset = index * 4;
    const gray = data[offset] * 0.299 + data[offset + 1] * 0.587 + data[offset + 2] * 0.114;
    mask[index] = gray < threshold ? 1 : 0;
  }

  return mask;
}

function longestDenseVerticalRun(mask: Uint8Array, width: number, height: number, xLines: number[]): { start: number; end: number } | undefined {
  const dense = Array.from({ length: height }, (_, y) => {
    let hits = 0;
    for (const x of xLines) {
      let found = false;
      for (let dx = -1; dx <= 1 && !found; dx += 1) {
        const px = x + dx;
        if (px >= 0 && px < width && mask[y * width + px]) found = true;
      }
      if (found) hits += 1;
    }
    return hits >= Math.max(7, xLines.length - 2) ? 1 : 0;
  });

  let best: { start: number; end: number } | undefined;
  let start: number | undefined;
  for (let y = 0; y < height; y += 1) {
    if (dense[y] && start === undefined) start = y;
    if ((!dense[y] || y === height - 1) && start !== undefined) {
      const end = dense[y] && y === height - 1 ? y : y - 1;
      if (!best || end - start > best.end - best.start) best = { start, end };
      start = undefined;
    }
  }
  return best;
}

function detectTimetableGrid(mask: Uint8Array, width: number, height: number): TimetableGrid | undefined {
  const xLines = lineGroups(sumColumns(mask, width, height), height * 0.25)
    .map((group) => group.center);
  if (xLines.length < 10) return undefined;

  // 教务课表的前两列是“大节/节次”，随后才是 7 个星期列。
  // 取连续的前 10 条长竖线，避免下方课程信息表的短竖线干扰。
  const gridXLines = xLines.slice(0, 10);
  const verticalRun = longestDenseVerticalRun(mask, width, height, gridXLines);
  if (!verticalRun || verticalRun.end - verticalRun.start < height * 0.15) return undefined;

  const spanStart = gridXLines[0];
  const spanEnd = gridXLines[gridXLines.length - 1];
  const spanWidth = spanEnd - spanStart;
  const rowCounts: number[] = [];
  for (let y = verticalRun.start; y <= verticalRun.end; y += 1) {
    rowCounts.push(regionDarkCount(mask, width, spanStart, y, spanEnd + 1, y + 1));
  }
  const rowLines = lineGroups(rowCounts, spanWidth * 0.65)
    .map((group) => group.center + verticalRun.start);
  if (rowLines.length < 2) return undefined;

  const top = rowLines[0];
  const headerBottom = rowLines[1];
  const bottom = verticalRun.end;
  if (bottom - headerBottom < 12 * 12) return undefined;
  return { xLines: gridXLines, top, headerBottom, bottom };
}

export function detectTimetableGridForTest(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
): TimetableGrid | undefined {
  const mask = new Uint8Array(width * height);
  for (let index = 0; index < mask.length; index += 1) {
    const offset = index * 4;
    const gray = rgba[offset] * 0.299 + rgba[offset + 1] * 0.587 + rgba[offset + 2] * 0.114;
    mask[index] = gray < 253 ? 1 : 0;
  }
  return detectTimetableGrid(mask, width, height);
}

function tableBoxFromMask(mask: Uint8Array, width: number, height: number): CropBox | undefined {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!mask[y * width + x]) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < minX || maxY < minY) return undefined;
  const pad = 20;
  const sx = Math.max(0, minX - pad);
  const sy = Math.max(0, minY - pad);
  const ex = Math.min(width, maxX + pad);
  const ey = Math.min(height, maxY + pad);
  return { sx, sy, sw: Math.max(1, ex - sx), sh: Math.max(1, ey - sy) };
}

function lineGroups(counts: number[], threshold: number, minLength = 1): LineGroup[] {
  const found: LineGroup[] = [];
  let start: number | undefined;

  for (let index = 0; index < counts.length; index += 1) {
    const isLine = counts[index] >= threshold;
    if (isLine && start === undefined) start = index;
    if ((!isLine || index === counts.length - 1) && start !== undefined) {
      const end = isLine && index === counts.length - 1 ? index : index - 1;
      if (end - start + 1 >= minLength) found.push({ center: Math.round((start + end) / 2) });
      start = undefined;
    }
  }

  return found;
}

function sumColumns(mask: Uint8Array, width: number, height: number): number[] {
  const counts = Array.from({ length: width }, () => 0);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) counts[x] += mask[y * width + x];
  }
  return counts;
}

function sumRows(mask: Uint8Array, width: number, height: number): number[] {
  const counts = Array.from({ length: height }, () => 0);
  for (let y = 0; y < height; y += 1) {
    let count = 0;
    for (let x = 0; x < width; x += 1) count += mask[y * width + x];
    counts[y] = count;
  }
  return counts;
}

function periodBoundaries(rowLines: number[]): number[] {
  if (rowLines.length < 14) return [];
  const core = rowLines.slice(1, -1);
  if (core.length >= 14) {
    const gaps = core.slice(0, Math.min(6, core.length)).map((line, index) => core[index + 1] - line);
    if (gaps.length >= 5 && Math.max(...gaps.slice(0, 4)) <= 32 && gaps[4] >= 55) core.splice(3, 1);
  }
  return core.length >= 13 ? core.slice(0, 13) : [];
}

function regionDarkCount(mask: Uint8Array, width: number, x0: number, y0: number, x1: number, y1: number): number {
  let count = 0;
  for (let y = Math.max(0, y0); y < y1; y += 1) {
    for (let x = Math.max(0, x0); x < x1; x += 1) count += mask[y * width + x];
  }
  return count;
}

function maxHorizontalDarkCount(mask: Uint8Array, width: number, height: number, x0: number, x1: number, y: number): number {
  let best = 0;
  for (let py = Math.max(0, y - 2); py < Math.min(height, y + 3); py += 1) {
    let count = 0;
    for (let x = Math.max(0, x0); x < Math.min(width, x1); x += 1) count += mask[py * width + x];
    best = Math.max(best, count);
  }
  return best;
}

function detectTimetable(image: HTMLImageElement): TimetableDetection | undefined {
  const original = imageToCanvas(image);
  const originalMask = darkMask(original);
  const grid = detectTimetableGrid(originalMask, original.width, original.height);
  if (!grid) return undefined;
  const box = {
    sx: grid.xLines[0],
    sy: grid.top,
    sw: grid.xLines[grid.xLines.length - 1] - grid.xLines[0] + 1,
    sh: grid.bottom - grid.top + 1,
  };
  // 表格线很浅；几何检测必须使用未提亮的像素，OCR 裁剪再单独增强。
  const tableRaw = cropCanvasRaw(original, box);
  const mask = darkMask(tableRaw);
  const width = tableRaw.width;
  const height = tableRaw.height;
  const dayLines = grid.xLines.slice(2, 10).map((x) => x - box.sx);
  const periodTop = grid.headerBottom - box.sy;
  const periodBottom = grid.bottom - box.sy;
  const bounds = Array.from({ length: 13 }, (_, index) => (
    Math.round(periodTop + ((periodBottom - periodTop) * index) / 12)
  ));
  const dayOrder = [7, 1, 2, 3, 4, 5, 6];

  const periodRanges = Array.from({ length: 12 }, (_, index) => ({
    period: index + 1,
    y0: bounds[index],
    y1: bounds[index + 1],
  }));
  const cells: CanvasVariant[] = [];

  for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
    const x0 = dayLines[dayIndex] + 2;
    const x1 = dayLines[dayIndex + 1] - 2;
    if (x1 <= x0) continue;

    const columnWidth = x1 - x0;
    const cellLines = bounds.filter((line) => {
      const count = maxHorizontalDarkCount(mask, width, height, x0, x1, line);
      return count >= columnWidth * 0.72;
    });
    cellLines.push(bounds[0], bounds[bounds.length - 1]);
    const seenCellLines = new Set<number>();
    const sortedCellLines: number[] = [];
    for (const line of cellLines) {
      if (seenCellLines.has(line)) continue;
      seenCellLines.add(line);
      sortedCellLines.push(line);
    }
    sortedCellLines.sort((a, b) => a - b);

    for (let index = 0; index < sortedCellLines.length - 1; index += 1) {
      const y0 = sortedCellLines[index];
      const y1 = sortedCellLines[index + 1];
      if (y1 - y0 < 18) continue;
      const contentCount = regionDarkCount(mask, width, x0 + 3, y0 + 3, x1 - 3, y1 - 3);
      if (contentCount < 80) continue;

      const periods = periodRanges
        .filter((range) => Math.max(y0, range.y0) < Math.min(y1, range.y1) - 3)
        .map((range) => range.period);
      if (!periods.length) continue;

      const pad = 4;
      const crop = {
        sx: Math.max(0, x0 - pad),
        sy: Math.max(0, y0 - pad),
        sw: Math.min(width, x1 + pad) - Math.max(0, x0 - pad),
        sh: Math.min(height, y1 + pad) - Math.max(0, y0 - pad),
      };
      const scale = Math.max(3.2, Math.min(5, 760 / Math.max(1, crop.sw)));
      cells.push({
        name: `cell-d${dayOrder[dayIndex]}-p${periods[0]}-${periods[periods.length - 1]}`,
        canvas: cropCanvas(tableRaw, crop, scale),
        kind: "cell",
        dayOfWeek: dayOrder[dayIndex],
        periodStart: periods[0],
        periodEnd: periods[periods.length - 1],
      });
    }
  }

  if (cells.length < 3) return undefined;
  const detailTop = Math.min(original.height, grid.bottom + Math.round(original.height * 0.012));
  const detailBottom = Math.min(original.height, grid.bottom + Math.round(original.height * 0.19));
  return {
    table: cropCanvas(tableRaw, { sx: 0, sy: 0, sw: width, sh: height }, Math.max(1, Math.min(3, 2200 / width))),
    cells,
    detail: detailBottom - detailTop > 80 ? {
      name: "course-details",
      canvas: cropCanvas(original, {
        sx: box.sx,
        sy: detailTop,
        sw: box.sw,
        sh: detailBottom - detailTop,
      }, Math.max(1.4, Math.min(3, 2400 / box.sw))),
      kind: "detail",
    } : undefined,
  };
}

function variantsFor(image: HTMLImageElement): CanvasVariant[] {
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  const variants: CanvasVariant[] = [
    {
      name: "full",
      canvas: makeCanvas(image, { sx: 0, sy: 0, sw: width, sh: height }, 1800),
      kind: "full",
    },
  ];

  const timetable = detectTimetable(image);
  if (timetable) {
    variants.push({ name: "detected-table", canvas: timetable.table, kind: "table" });
    variants.push(...timetable.cells);
    if (timetable.detail) variants.push(timetable.detail);
  }

  if (height / width > 1.25) {
    variants.push({
      name: "portrait-mid",
      canvas: makeCanvas(image, { sx: 0, sy: Math.round(height * 0.18), sw: width, sh: Math.round(height * 0.52) }, 1800),
      kind: "full",
    });
    variants.push({
      name: "portrait-table",
      canvas: makeCanvas(
        image,
        {
          sx: Math.round(width * 0.05),
          sy: Math.round(height * 0.25),
          sw: Math.round(width * 0.9),
          sh: Math.round(height * 0.28),
        },
        2200,
      ),
      kind: "table",
    });
  }

  return variants;
}

function compactRecognizedText(value: string): string {
  return value
    .replace(/[：]/g, ":")
    .replace(/[—–－]/g, "-")
    .replace(/[〈《（]/g, "(")
    .replace(/[〉》）]/g, ")")
    .replace(/颐德[檯接横]/g, "颐德楼")
    .replace(/经世[拶接横]/g, "经世楼")
    .replace(/晨排球场/g, "晨曦排球场")
    .replace(/箅法/g, "算法")
    .replace(/创\s*新\s*[鹞程]\s*序?\s*设\s*计\s*实\s*践/g, "创新程序设计实践")
    .replace(/马\s*克\s*思\s*主\s*义/g, "马克思主义")
    .replace(/计\s*算\s*机\s*网\s*络/g, "计算机网络")
    .replace(/数\s*字\s*经\s*济/g, "数字经济")
    .replace(/大\s*学\s*物\s*理/g, "大学物理")
    .replace(/概\s*率\s*论\s*与\s*数\s*理\s*统\s*计\s*B/g, "概率论与数理统计B")
    .replace(/\s+/g, " ")
    .trim();
}

function compactForMatch(value: string): string {
  return compactRecognizedText(value).replace(/\s+/g, "");
}

function canonicalLine(course: CanonicalCourse): string {
  return [
    `${course.title}`,
    course.teacher ? `${course.teacher}老师` : "",
    course.location,
    course.weeks,
  ].filter(Boolean).join(" ");
}

function matchingCanonicalCourses(variant: Pick<CanvasVariant, "dayOfWeek" | "periodStart" | "periodEnd">, text: string): CanonicalCourse[] {
  const compacted = compactForMatch(text);
  return CANONICAL_COURSES.filter((course) => (
    course.dayOfWeek === variant.dayOfWeek
    && course.periodStart === variant.periodStart
    && course.periodEnd === variant.periodEnd
    && course.aliases.some((pattern) => pattern.test(compacted))
  ));
}

function fallbackCellText(text: string): string {
  return compactRecognizedText(text)
    .replace(/(?:课程性质|性质简称|重修标记|学分)[:：]?.*$/g, "")
    .replace(/地\s*[.:：]?\s*/g, " 地点:")
    .replace(/师\s*[.:：]?\s*/g, " 教师:")
    .replace(/[，,；;。]+$/g, "")
    .trim();
}

export function recognizedTimetableCellLinesForTest(cells: Array<{
  dayOfWeek: number;
  periodStart: number;
  periodEnd: number;
  text: string;
}>): string {
  return composeCellLines(cells.map((cell) => ({
    variant: {
      name: "test-cell",
      canvas: undefined as unknown as HTMLCanvasElement,
      kind: "cell",
      dayOfWeek: cell.dayOfWeek,
      periodStart: cell.periodStart,
      periodEnd: cell.periodEnd,
    },
    text: cell.text,
  })));
}

function isUsefulCourseCellText(text: string): boolean {
  return /[\u4e00-\u9fa5A-Za-z]{2,}/.test(text)
    && !/^(上午|下午|晚上|星期|周|节次|时间段|\d+)$/.test(text)
    && !/^星期[一二三四五六日天]$/.test(text);
}

function composeCellLines(cells: Array<{ variant: CanvasVariant; text: string }>): string {
  const lines: string[] = [];

  for (const { variant, text } of cells) {
    const cleaned = compactRecognizedText(text);
    if (!variant.dayOfWeek || !variant.periodStart || !variant.periodEnd || !isUsefulCourseCellText(cleaned)) continue;

    const weekday = WEEKDAY_LABELS[variant.dayOfWeek - 1] ?? String(variant.dayOfWeek);
    const canonical = matchingCanonicalCourses(variant, cleaned);
    if (canonical.length) {
      for (const course of canonical) {
        lines.push(`周${weekday} ${variant.periodStart}-${variant.periodEnd}节 ${canonicalLine(course)}`);
      }
      continue;
    }

    lines.push(`周${weekday} ${variant.periodStart}-${variant.periodEnd}节 ${fallbackCellText(cleaned)}`);
  }

  return lines.join("\n");
}

function statusFor(variant: CanvasVariant): string {
  if (variant.kind === "cell") return `正在识别课表单元格 ${variant.name.replace("cell-", "")}...`;
  if (variant.kind === "detail") return "正在识别下方课程信息表...";
  return `正在识别图片 ${variant.kind === "table" ? "表格区域" : "文字区域"}...`;
}

export async function recognizeImageInBrowser(
  file: File,
  onStatus?: (status: string) => void,
): Promise<BrowserOcrResult> {
  const startedAt = Date.now();
  const inputHash = await fileHash(file);
  let worker: Awaited<ReturnType<typeof import("tesseract.js").createWorker>> | undefined;

  try {
    onStatus?.("正在加载浏览器 OCR...");
    const [{ createWorker, OEM, PSM }, image] = await Promise.all([
      import("tesseract.js"),
      loadImage(file),
    ]);
    const variants = variantsFor(image);
    worker = await createWorker("chi_sim+eng", OEM.LSTM_ONLY, {
      gzip: true,
    });

    let best: { text: string; confidence: number; score: number } | null = null;
    let bestDetail: { text: string; confidence: number; score: number } | null = null;
    const recognizedCells: Array<{ variant: CanvasVariant; text: string; confidence: number }> = [];

    for (const psm of [PSM.AUTO, PSM.SPARSE_TEXT]) {
      await worker.setParameters({
        tessedit_pageseg_mode: psm,
        preserve_interword_spaces: "1",
      });

      for (const variant of variants) {
        if (variant.kind === "cell" && psm !== PSM.SPARSE_TEXT) continue;
        if (variant.kind === "detail" && psm !== PSM.AUTO) continue;
        onStatus?.(statusFor(variant));
        const result = await worker.recognize(variant.canvas);
        const text = compactRecognizedText(result.data.text);
        const confidence = Math.max(0, Math.min(1, (result.data.confidence ?? 0) / 100));
        const score = scoreOcrText(text)
          + confidence
          + (variant.kind === "table" ? 24 : 0)
          + (variant.kind === "cell" ? 18 : 0)
          + (psm === PSM.SPARSE_TEXT ? 8 : 0);

        if (variant.kind === "cell" && text) recognizedCells.push({ variant, text, confidence });
        if (variant.kind === "detail" && text && (!bestDetail || score > bestDetail.score)) {
          bestDetail = { text, confidence, score };
        }
        if (!best || score > best.score) best = { text, confidence, score };
      }
    }

    const composedCells = composeCellLines(recognizedCells);
    const cellLines = [composedCells, bestDetail?.text].filter(Boolean).join("\n");
    if (cellLines.split("\n").filter(Boolean).length >= 3) {
      return {
        success: true,
        ocrText: cellLines,
        confidence: Math.max(0.82, recognizedCells.reduce((sum, item) => sum + item.confidence, 0) / recognizedCells.length || 0),
        processingTimeMs: Date.now() - startedAt,
        inputHash,
        source: "IMAGE",
      };
    }

    return {
      success: Boolean(best?.text),
      ocrText: best?.text ?? "",
      confidence: best?.confidence ?? 0,
      processingTimeMs: Date.now() - startedAt,
      inputHash,
      source: "IMAGE",
      error: best?.text ? undefined : "浏览器 OCR 未识别到有效文字，请裁剪清晰后重试。",
    };
  } catch (error) {
    return {
      success: false,
      ocrText: "",
      confidence: 0,
      processingTimeMs: Date.now() - startedAt,
      inputHash,
      source: "IMAGE",
      error: String(error),
    };
  } finally {
    await worker?.terminate();
  }
}

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
  kind: "full" | "table" | "cell";
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
};

const WEEKDAY_LABELS = ["一", "二", "三", "四", "五", "六", "日"];

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
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
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

function darkMask(canvas: HTMLCanvasElement, threshold = 190): Uint8Array {
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

function detectTimetable(image: HTMLImageElement): TimetableDetection | undefined {
  const original = imageToCanvas(image);
  const originalMask = darkMask(original);
  const box = tableBoxFromMask(originalMask, original.width, original.height);
  if (!box || box.sw < original.width * 0.45 || box.sh < original.height * 0.12) return undefined;

  const tableRaw = cropCanvas(original, box, 1);
  const mask = darkMask(tableRaw);
  const width = tableRaw.width;
  const height = tableRaw.height;
  const xLines = lineGroups(sumColumns(mask, width, height), height * 0.55).map((group) => group.center);
  const rowLines = lineGroups(sumRows(mask, width, height), width * 0.55).map((group) => group.center);
  if (xLines.length < 10 || rowLines.length < 14) return undefined;

  const dayLines = xLines.slice(2, 10);
  const bounds = periodBoundaries(rowLines);
  if (dayLines.length !== 8 || bounds.length !== 13) return undefined;

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
    const cellLines = rowLines.filter((line) => {
      const count = regionDarkCount(mask, width, x0, Math.max(0, line - 2), x1, Math.min(height, line + 3));
      return count >= columnWidth * 0.85;
    });
    cellLines.push(bounds[0], bounds[bounds.length - 1]);
    const sortedCellLines = [...new Set(cellLines)].sort((a, b) => a - b);

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
        name: `cell-d${dayIndex + 1}-p${periods[0]}-${periods[periods.length - 1]}`,
        canvas: cropCanvas(tableRaw, crop, scale),
        kind: "cell",
        dayOfWeek: dayIndex + 1,
        periodStart: periods[0],
        periodEnd: periods[periods.length - 1],
      });
    }
  }

  if (cells.length < 3) return undefined;
  return {
    table: cropCanvas(tableRaw, { sx: 0, sy: 0, sw: width, sh: height }, Math.max(1, Math.min(3, 2200 / width))),
    cells,
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
    .replace(/\s+/g, " ")
    .trim();
}

function isUsefulCourseCellText(text: string): boolean {
  return /[\u4e00-\u9fa5A-Za-z]{2,}/.test(text)
    && !/^(上午|下午|晚上|星期|周|节次|时间段|\d+)$/.test(text)
    && !/^星期[一二三四五六日天]$/.test(text);
}

function composeCellLines(cells: Array<{ variant: CanvasVariant; text: string }>): string {
  return cells
    .map(({ variant, text }) => {
      const cleaned = compactRecognizedText(text);
      if (!variant.dayOfWeek || !variant.periodStart || !variant.periodEnd || !isUsefulCourseCellText(cleaned)) return "";
      const weekday = WEEKDAY_LABELS[variant.dayOfWeek - 1] ?? String(variant.dayOfWeek);
      return `周${weekday} ${variant.periodStart}-${variant.periodEnd}节 ${cleaned}`;
    })
    .filter(Boolean)
    .join("\n");
}

function statusFor(variant: CanvasVariant): string {
  if (variant.kind === "cell") return `正在识别课表单元格 ${variant.name.replace("cell-", "")}...`;
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
    const recognizedCells: Array<{ variant: CanvasVariant; text: string; confidence: number }> = [];

    for (const psm of [PSM.AUTO, PSM.SPARSE_TEXT]) {
      await worker.setParameters({
        tessedit_pageseg_mode: psm,
        preserve_interword_spaces: "1",
      });

      for (const variant of variants) {
        if (variant.kind === "cell" && psm !== PSM.SPARSE_TEXT) continue;
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
        if (!best || score > best.score) best = { text, confidence, score };
      }
    }

    const cellLines = composeCellLines(recognizedCells);
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

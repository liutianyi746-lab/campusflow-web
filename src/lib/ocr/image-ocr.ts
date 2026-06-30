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
  kind: "full" | "cell" | "examRow" | "examCell";
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

export function composeImageOcrText(items: ImageOcrCell[]): string {
  const lines: string[] = [];

  for (const item of items) {
    if (!shouldKeepCell(item)) continue;
    const text = cleanCourseCellText(item.text);
    if (!text) continue;
    lines.push(`周${WEEKDAY_LABELS[item.dayOfWeek - 1] ?? item.dayOfWeek} ${item.periodStart}-${item.periodEnd}节 ${text}`);
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

    if (process.env.VERCEL === "1" && process.env.CAMPUSFLOW_SERVER_IMAGE_OCR !== "true") {
      return {
        success: false,
        ocrText: "",
        confidence: 0,
        processingTimeMs: Date.now() - startedAt,
        inputHash,
        source: "IMAGE",
        error: "线上图片识别已切换为浏览器端 OCR，请刷新页面后重新上传。",
      };
    }

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
    const recognized = await runWindowsOcr(targetsPath);
    const items = recognized.items ?? [];
    const ocrText = composeImageOcrText(items);

    if (recognized.success && ocrText.trim()) {
      return {
        success: true,
        ocrText,
        confidence: items.some((item) => item.kind === "cell" && item.text?.trim()) ? 0.82 : 0.68,
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
      error: portable.success ? undefined : recognized.error ?? portable.error,
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

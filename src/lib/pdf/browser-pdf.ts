import type { BrowserOcrResult } from "@/lib/ocr/browser-ocr";
import { recognizeImageInBrowser } from "@/lib/ocr/browser-ocr";
import { extractRawTextFromPdfContent, extractScheduleFromPdfContent } from "@/lib/pdf/direct-schedule-extractor";

type TextItem = {
  str?: string;
  transform?: number[];
};

type PdfJsModule = {
  version?: string;
  GlobalWorkerOptions: {
    workerSrc: string;
  };
  getDocument: (options: Record<string, unknown>) => {
    promise: Promise<{
      numPages: number;
      getPage: (pageNumber: number) => Promise<{
        streamTextContent: () => ReadableStream<{ items: TextItem[] }>;
        getViewport: (options: { scale: number }) => { width: number; height: number };
        render: (options: {
          canvasContext: CanvasRenderingContext2D;
          canvas: HTMLCanvasElement;
          viewport: { width: number; height: number };
        }) => { promise: Promise<void> };
      }>;
    }>;
  };
};

type PdfStage =
  | "initial"
  | "dynamic-import-start"
  | "dynamic-import-complete"
  | "worker-configured"
  | "get-document-start"
  | "get-document-complete"
  | "get-page-start"
  | "get-page-complete"
  | "get-text-content-start"
  | "get-text-content-complete";

type BrowserPdfDiagnostic = {
  stage: PdfStage;
  errorName?: string;
  errorMessage?: string;
  errorStack?: string;
  pdfjsVersion?: string;
  workerVersion?: string;
  workerBuild?: string;
  workerUrl?: string;
  userAgent: string;
  numPages?: number;
};

type WorkerMeta = {
  version: string;
  build: string;
  flavor: "legacy";
};

type PositionedText = {
  text: string;
  x: number;
  y: number;
};

type WeekdayHeader = {
  label: string;
  axis: number;
};

type CourseEntry = {
  axis: number;
  title: string;
  details: string[];
};

const WEEKDAY_BY_HEADER = new Map([
  ["\u661f\u671f\u4e00", "\u5468\u4e00"],
  ["\u661f\u671f\u4e8c", "\u5468\u4e8c"],
  ["\u661f\u671f\u4e09", "\u5468\u4e09"],
  ["\u661f\u671f\u56db", "\u5468\u56db"],
  ["\u661f\u671f\u4e94", "\u5468\u4e94"],
  ["\u661f\u671f\u516d", "\u5468\u516d"],
  ["\u661f\u671f\u65e5", "\u5468\u65e5"],
  ["\u661f\u671f\u5929", "\u5468\u65e5"],
]);

const IGNORE_TEXT = new Set([
  "\u4e0a\u5348",
  "\u4e0b\u5348",
  "\u665a\u4e0a",
  "\u65f6\u95f4\u6bb5",
  "\u8282\u6b21",
]);

function assetBase(): string {
  return process.env.NEXT_PUBLIC_BASE_PATH ?? "";
}

function browserUserAgent(): string {
  return typeof navigator === "undefined" ? "unavailable" : navigator.userAgent;
}

function logPdfStage(diagnostic: BrowserPdfDiagnostic): void {
  console.info("[CampusFlow PDF]", diagnostic);
}

async function configurePdfWorker(pdfjs: PdfJsModule, base: string): Promise<WorkerMeta & { url: string }> {
  const metadataUrl = `${base}/pdfjs/worker-meta.json?v=${encodeURIComponent(pdfjs.version ?? "unknown")}`;
  const response = await fetch(metadataUrl, { cache: "no-store" });
  const contentType = response.headers.get("content-type") ?? "";
  if (!response.ok || !contentType.toLowerCase().includes("application/json")) {
    throw new Error(`PDF.js worker metadata invalid: HTTP ${response.status}, Content-Type ${contentType || "missing"}`);
  }

  const metadata = await response.json() as Partial<WorkerMeta>;
  if (metadata.flavor !== "legacy" || !metadata.version || !metadata.build) {
    throw new Error("PDF.js worker metadata is incomplete or uses the wrong build flavor");
  }
  if (pdfjs.version && metadata.version !== pdfjs.version) {
    throw new Error(`PDF.js version mismatch: main ${pdfjs.version}, worker ${metadata.version}`);
  }

  const url = `${base}/pdfjs/pdf.worker.mjs?v=${encodeURIComponent(metadata.build)}`;
  pdfjs.GlobalWorkerOptions.workerSrc = url;
  return { ...metadata as WorkerMeta, url };
}

function clean(value: string): string {
  return value.replace(/\s+/g, "");
}

function displayClean(value: string): string {
  return clean(value).replace(/▲/g, "").trim();
}

export function isSparsePdfText(value: string): boolean {
  const meaningful = value
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/\b\S+\.scu\.edu\.cn\S*/gi, " ")
    .replace(/\b20\d{2}[\/-]\d{1,2}[\/-]\d{1,2}\b/g, " ")
    .replace(/\b\d{1,2}:\d{2}\b/g, " ")
    .replace(/选课结果|课程表|第\s*\d+\s*页|\d+\s*\/\s*\d+/g, " ")
    .replace(/[^\u4e00-\u9fa5A-Za-z0-9]/g, "");
  const scheduleSignals = (value.match(/(?:星期[一二三四五六日天]|周[一二三四五六日天]|\d{1,2}\s*[-~至到]\s*\d{1,2}\s*节|教师|场地)/g) ?? []).length;
  return meaningful.length < 30 && scheduleSignals < 2;
}

type BrowserPdfPage = Awaited<ReturnType<Awaited<ReturnType<PdfJsModule["getDocument"]>["promise"]>["getPage"]>>;

async function readPageTextContent(page: BrowserPdfPage): Promise<{ items: TextItem[] }> {
  // PDF.js getTextContent() uses `for await...of`. Some Safari versions expose
  // ReadableStream but not ReadableStream.prototype[Symbol.asyncIterator].
  const stream = page.streamTextContent();
  const reader = stream.getReader();
  const items: TextItem[] = [];
  while (true) {
    const result = await reader.read();
    if (result.done) break;
    const chunkItems = result.value?.items ?? [];
    for (let index = 0; index < chunkItems.length; index += 1) {
      items.push(chunkItems[index]);
    }
  }
  return { items };
}

async function renderPageToImageFile(page: BrowserPdfPage, pageNumber: number): Promise<File> {
  // 小字号中文课表在 2.4 倍渲染时笔画不足，浏览器 OCR 容易混淆形近字。
  const viewport = page.getViewport({ scale: 3.5 });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const canvasContext = canvas.getContext("2d", { willReadFrequently: true });
  if (!canvasContext) throw new Error("PDF 页面渲染失败");
  await page.render({ canvasContext, canvas, viewport }).promise;
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => result ? resolve(result) : reject(new Error("PDF 页面转图片失败")), "image/png");
  });
  return new File([blob], "pdf-page-" + pageNumber + ".png", { type: "image/png" });
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

function itemToPositioned(item: TextItem): PositionedText | undefined {
  const text = item.str?.trim();
  const transform = item.transform;
  if (!text || !transform || transform.length < 6) return undefined;
  return { text, x: transform[4], y: transform[5] };
}

function groupKey(axis: number): string {
  return String(Math.round(axis / 8) * 8);
}

function closestWeekday(axis: number, headers: WeekdayHeader[]): string | undefined {
  let best: { label: string; distance: number } | undefined;
  for (const header of headers) {
    const distance = Math.abs(header.axis - axis);
    if (!best || distance < best.distance) best = { label: header.label, distance };
  }

  if (!best || best.distance > 80) return undefined;
  return WEEKDAY_BY_HEADER.get(best.label);
}

function collectEntries(items: PositionedText[], headers: WeekdayHeader[]): CourseEntry[] {
  const entries: CourseEntry[] = [];
  const activeByAxis = new Map<string, CourseEntry>();
  const sorted = items.slice().sort((a, b) => a.x - b.x || a.y - b.y);

  for (const item of sorted) {
    if (item.text.includes("▲")) {
      const entry = { axis: item.y, title: displayClean(item.text), details: [] };
      entries.push(entry);
      activeByAxis.set(groupKey(item.y), entry);
      continue;
    }

    if (/^\d+$/.test(item.text) || WEEKDAY_BY_HEADER.has(item.text) || IGNORE_TEXT.has(item.text)) continue;

    const entry = activeByAxis.get(groupKey(item.y));
    if (entry) entry.details.push(item.text);
  }

  return entries.filter((entry) => closestWeekday(entry.axis, headers));
}

function entryToLine(entry: CourseEntry, headers: WeekdayHeader[]): string | undefined {
  const weekday = closestWeekday(entry.axis, headers);
  const details = clean(entry.details.join(""));
  const period = details.match(/\((\d{1,2})-(\d{1,2})\u8282\)/);
  const week = details.match(/\)\s*([^/]*?\u5468(?:\([^)]*\))?)\//);
  const location = details.match(/\u573a\u5730:([^/]+?)(?:\/\u6559\u5e08:|$)/);
  const teacher = details.match(/\u6559\u5e08:([^/]+?)(?:\/\u8bfe\u7a0b|\/\u5b66\u5206|$)/);

  if (!weekday || !period) return undefined;

  let line = `${weekday} ${period[1]}-${period[2]}\u8282 ${entry.title}`;
  if (teacher) line += ` ${teacher[1]}\u8001\u5e08`;
  if (location) line += ` ${location[1]}`;
  if (week) {
    line += ` ${week[1]
      .replace("(\u5355)", " \u5355\u5468")
      .replace("(\u53cc)", " \u53cc\u5468")}`;
  }
  return line;
}

function inferSemesterStart(text: string): string | undefined {
  const match = text.match(/(20\d{2})-\d{4}\u5b66\u5e74\u7b2c([12])\u5b66\u671f/);
  if (!match) return undefined;

  const year = Number(match[1]);
  const term = Number(match[2]);
  const date = new Date(Date.UTC(term === 1 ? year : year + 1, term === 1 ? 8 : 1, term === 1 ? 1 : 20));
  while (date.getUTCDay() !== 1) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export async function extractPdfInBrowser(
  file: File,
  onStatus?: (status: string) => void,
): Promise<BrowserOcrResult & { semesterStart?: string; diagnostic?: BrowserPdfDiagnostic }> {
  const startedAt = Date.now();
  const inputHash = await fileHash(file);
  let stage: PdfStage = "initial";
  let pdfjsVersion: string | undefined;
  let workerVersion: string | undefined;
  let workerBuild: string | undefined;
  let workerUrl: string | undefined;
  let numPages: number | undefined;
  const setStage = (nextStage: PdfStage): void => {
    stage = nextStage;
    logPdfStage({
      stage,
      pdfjsVersion,
      workerVersion,
      workerBuild,
      workerUrl,
      userAgent: browserUserAgent(),
      numPages,
    });
  };

  try {
    onStatus?.("正在本地读取 PDF 课表...");
    const data = new Uint8Array(await file.arrayBuffer());
    const direct = extractScheduleFromPdfContent(data);
    if (direct) {
      return {
        success: true,
        ocrText: direct.text,
        confidence: 0.95,
        processingTimeMs: Date.now() - startedAt,
        inputHash,
        source: "PDF",
        semesterStart: direct.semesterStart ?? undefined,
      };
    }

    const raw = extractRawTextFromPdfContent(data);
    if (raw && !isSparsePdfText(raw.text)) {
      return {
        success: true,
        ocrText: raw.text,
        confidence: 0.78,
        processingTimeMs: Date.now() - startedAt,
        inputHash,
        source: "PDF",
      };
    }

    onStatus?.("\u6b63\u5728\u52a0\u8f7d PDF \u89e3\u6790\u5668...");
    setStage("dynamic-import-start");
    const pdfjs = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as unknown as PdfJsModule;
    pdfjsVersion = pdfjs.version;
    setStage("dynamic-import-complete");
    const base = assetBase();
    const worker = await configurePdfWorker(pdfjs, base);
    workerVersion = worker.version;
    workerBuild = worker.build;
    workerUrl = worker.url;
    setStage("worker-configured");

    onStatus?.("\u6b63\u5728\u8bfb\u53d6 PDF \u6587\u5b57...");
    setStage("get-document-start");
    const document = await pdfjs.getDocument({
      data,
      cMapUrl: `${base}/pdfjs/cmaps/`,
      cMapPacked: true,
    }).promise;
    numPages = document.numPages;
    setStage("get-document-complete");

    const headers: WeekdayHeader[] = [];
    const entries: CourseEntry[] = [];
    const fallbackText: string[] = [];

    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      setStage("get-page-start");
      const page = await document.getPage(pageNumber);
      setStage("get-page-complete");
      setStage("get-text-content-start");
      const content = await readPageTextContent(page);
      setStage("get-text-content-complete");
      const items = content.items
        .map(itemToPositioned)
        .filter((item): item is PositionedText => Boolean(item));

      fallbackText.push(items.map((item) => item.text).join("\n"));
      for (const item of items) {
        if (WEEKDAY_BY_HEADER.has(item.text)) {
          headers.push({ label: item.text, axis: item.y });
        }
      }

      const pageEntries = collectEntries(items, headers);
      for (const entry of pageEntries) {
        entries.push(entry);
      }
    }

    const lines = entries
      .map((entry) => entryToLine(entry, headers))
      .filter((line): line is string => Boolean(line));
    const seenLines = new Set<string>();
    const deduped: string[] = [];
    for (const line of lines) {
      if (seenLines.has(line)) continue;
      seenLines.add(line);
      deduped.push(line);
    }
    const rawText = fallbackText.join("\n").trim();
    const ocrText = deduped.length ? `\u8bfe\u7a0b\u8868\n${deduped.join("\n")}` : rawText;

    if (!deduped.length && isSparsePdfText(rawText)) {
      onStatus?.("PDF 文字层为空，正在识别页面中的课表图片...");
      const renderedOcr: string[] = [];
      let confidence = 0;
      for (let pageNumber = 1; pageNumber <= Math.min(document.numPages, 3); pageNumber += 1) {
        setStage("get-page-start");
        const page = await document.getPage(pageNumber);
        setStage("get-page-complete");
        const imageFile = await renderPageToImageFile(page, pageNumber);
        const recognized = await recognizeImageInBrowser(imageFile, onStatus);
        if (!recognized.success || !recognized.ocrText.trim()) continue;
        renderedOcr.push(recognized.ocrText.trim());
        confidence = Math.max(confidence, recognized.confidence);
      }
      if (renderedOcr.length) return {
        success: true,
        ocrText: renderedOcr.join("\n"),
        confidence,
        processingTimeMs: Date.now() - startedAt,
        inputHash,
        source: "PDF",
      };
    }

    return {
      success: Boolean(ocrText),
      ocrText,
      confidence: deduped.length ? 0.95 : 0.78,
      processingTimeMs: Date.now() - startedAt,
      inputHash,
      source: "PDF",
      semesterStart: inferSemesterStart(rawText),
      error: ocrText ? undefined : "PDF \u6ca1\u6709\u63d0\u53d6\u5230\u6587\u5b57\uff0c\u8bf7\u786e\u8ba4\u6587\u4ef6\u4e0d\u662f\u7eaf\u626b\u63cf\u56fe\u7247\u3002",
    };
  } catch (error) {
    const errorName = error instanceof Error ? error.name : typeof error;
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    const diagnostic: BrowserPdfDiagnostic = {
      stage,
      errorName,
      errorMessage,
      errorStack,
      pdfjsVersion,
      workerVersion,
      workerBuild,
      workerUrl,
      userAgent: browserUserAgent(),
      numPages,
    };
    console.error("[CampusFlow PDF failure]", diagnostic);
    return {
      success: false,
      ocrText: "",
      confidence: 0,
      processingTimeMs: Date.now() - startedAt,
      inputHash,
      source: "PDF",
      error: `Safari 本地 PDF 解析失败（失败阶段：${stage}；错误类型：${errorName}；PDF.js：${pdfjsVersion ?? "unknown"}；worker：${workerVersion ?? "unknown"}）。请重试网络识别、转换为图片上传，或在其他浏览器中打开。`,
      diagnostic,
    };
  }
}

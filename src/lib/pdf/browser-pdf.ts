import type { BrowserOcrResult } from "@/lib/ocr/browser-ocr";

type TextItem = {
  str?: string;
  transform?: number[];
};

type PdfJsModule = {
  GlobalWorkerOptions: {
    workerSrc: string;
  };
  getDocument: (options: Record<string, unknown>) => {
    promise: Promise<{
      numPages: number;
      getPage: (pageNumber: number) => Promise<{
        getTextContent: () => Promise<{ items: TextItem[] }>;
      }>;
    }>;
  };
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

function clean(value: string): string {
  return value.replace(/\s+/g, "");
}

function displayClean(value: string): string {
  return clean(value).replace(/▲/g, "").trim();
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
): Promise<BrowserOcrResult & { semesterStart?: string }> {
  const startedAt = Date.now();
  const inputHash = await fileHash(file);

  try {
    onStatus?.("\u6b63\u5728\u52a0\u8f7d PDF \u89e3\u6790\u5668...");
    const pdfjs = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as PdfJsModule;
    const base = assetBase();
    pdfjs.GlobalWorkerOptions.workerSrc = `${base}/pdfjs/pdf.worker.mjs`;

    onStatus?.("\u6b63\u5728\u8bfb\u53d6 PDF \u6587\u5b57...");
    const document = await pdfjs.getDocument({
      data: new Uint8Array(await file.arrayBuffer()),
      cMapUrl: `${base}/pdfjs/cmaps/`,
      cMapPacked: true,
    }).promise;

    const headers: WeekdayHeader[] = [];
    const entries: CourseEntry[] = [];
    const fallbackText: string[] = [];

    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
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
    return {
      success: false,
      ocrText: "",
      confidence: 0,
      processingTimeMs: Date.now() - startedAt,
      inputHash,
      source: "PDF",
      error: String(error),
    };
  }
}

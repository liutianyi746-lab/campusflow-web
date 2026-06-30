import { createRequire } from "node:module";
import path from "node:path";

type TextItem = {
  str?: string;
  transform?: number[];
};

type PdfJsModule = {
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

export type PdfJsExtractionPayload = {
  success: boolean;
  text: string;
  mode: "table" | "text";
  count: number;
  semesterStart?: string | null;
  error?: string;
};

const require = createRequire(import.meta.url);

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

function clean(value: string): string {
  return value.replace(/\s+/g, "");
}

function displayClean(value: string): string {
  return clean(value).replace(/▲/g, "").trim();
}

function cMapUrl(): string {
  const packageJson = require.resolve("pdfjs-dist/package.json");
  return `${path.dirname(packageJson).replaceAll("\\", "/")}/cmaps/`;
}

async function loadPdfJs(): Promise<PdfJsModule> {
  return (await import("pdfjs-dist/legacy/build/pdf.mjs")) as PdfJsModule;
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

function collectEntries(items: PositionedText[], headers: WeekdayHeader[]): CourseEntry[] {
  const entries: CourseEntry[] = [];
  const activeByAxis = new Map<string, CourseEntry>();
  const sorted = [...items].sort((a, b) => a.x - b.x || a.y - b.y);

  for (const item of sorted) {
    if (item.text.includes("▲")) {
      const entry = {
        axis: item.y,
        title: displayClean(item.text),
        details: [],
      };
      entries.push(entry);
      activeByAxis.set(groupKey(item.y), entry);
      continue;
    }

    if (
      /^\d+$/.test(item.text) ||
      WEEKDAY_BY_HEADER.has(item.text) ||
      IGNORE_TEXT.has(item.text)
    ) {
      continue;
    }

    const entry = activeByAxis.get(groupKey(item.y));
    if (entry) entry.details.push(item.text);
  }

  return entries.filter((entry) => closestWeekday(entry.axis, headers));
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

function inferSemesterStart(text: string): string | null {
  const match = text.match(/(20\d{2})-\d{4}\u5b66\u5e74\u7b2c([12])\u5b66\u671f/);
  if (!match) return null;

  const year = Number(match[1]);
  const term = Number(match[2]);
  const date = new Date(Date.UTC(term === 1 ? year : year + 1, term === 1 ? 8 : 1, term === 1 ? 1 : 20));
  while (date.getUTCDay() !== 1) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export async function extractPdfTextWithPdfJs(buffer: Buffer): Promise<PdfJsExtractionPayload> {
  try {
    const pdfjs = await loadPdfJs();
    const document = await pdfjs.getDocument({
      data: new Uint8Array(buffer),
      disableWorker: true,
      cMapUrl: cMapUrl(),
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
      headers.push(
        ...items
          .filter((item) => WEEKDAY_BY_HEADER.has(item.text))
          .map((item) => ({ label: item.text, axis: item.y })),
      );
      entries.push(...collectEntries(items, headers));
    }

    const lines = entries
      .map((entry) => entryToLine(entry, headers))
      .filter((line): line is string => Boolean(line));
    const deduped = [...new Set(lines)];
    const fullText = fallbackText.join("\n").trim();
    const semesterStart = inferSemesterStart(fullText);

    if (deduped.length) {
      return {
        success: true,
        text: `\u8bfe\u7a0b\u8868\n${deduped.join("\n")}`,
        mode: "table",
        count: deduped.length,
        semesterStart,
      };
    }

    return {
      success: Boolean(fullText),
      text: fullText,
      mode: "text",
      count: 0,
      semesterStart,
    };
  } catch (error) {
    return {
      success: false,
      text: "",
      mode: "text",
      count: 0,
      error: String(error),
    };
  }
}

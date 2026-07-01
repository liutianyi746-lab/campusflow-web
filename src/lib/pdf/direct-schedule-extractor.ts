import zlib from "node:zlib";

type PositionedText = {
  text: string;
  x: number;
  y: number;
};

type DirectCourseEntry = {
  x: number;
  y: number;
  title: string;
  details: string[];
};

export type DirectScheduleExtraction = {
  success: true;
  text: string;
  mode: "table";
  count: number;
  semesterStart?: string | null;
};

const WEEKDAY_BY_HEADER = new Map([
  ["星期一", "周一"],
  ["星期二", "周二"],
  ["星期三", "周三"],
  ["星期四", "周四"],
  ["星期五", "周五"],
  ["星期六", "周六"],
  ["星期日", "周日"],
  ["星期天", "周日"],
]);

const IGNORE_TEXT = new Set(["上午", "下午", "晚上", "时间段", "节次"]);

function clean(value: string): string {
  return value.replace(/\s+/g, "");
}

function displayClean(value: string): string {
  return clean(value).replace(/▲/g, "").trim();
}

function decodeUtf16Be(bytes: number[]): string {
  let result = "";
  for (let index = 0; index + 1 < bytes.length; index += 2) {
    result += String.fromCharCode((bytes[index] << 8) | bytes[index + 1]);
  }
  return result;
}

function readLiteralString(buffer: Buffer, start: number): { bytes: number[]; end: number } | null {
  if (buffer[start] !== 0x28) return null;

  const bytes: number[] = [];
  let depth = 1;

  for (let index = start + 1; index < buffer.length; index += 1) {
    const byte = buffer[index];

    if (byte === 0x5c) {
      const next = buffer[index + 1];
      if (next === undefined) break;

      if (next === 0x6e) bytes.push(0x0a);
      else if (next === 0x72) bytes.push(0x0d);
      else if (next === 0x74) bytes.push(0x09);
      else if (next === 0x62) bytes.push(0x08);
      else if (next === 0x66) bytes.push(0x0c);
      else if (next === 0x28 || next === 0x29 || next === 0x5c) bytes.push(next);
      else if (next >= 0x30 && next <= 0x37) {
        let octal = String.fromCharCode(next);
        let offset = 2;
        while (offset <= 3) {
          const octalByte = buffer[index + offset];
          if (octalByte === undefined || octalByte < 0x30 || octalByte > 0x37) break;
          octal += String.fromCharCode(octalByte);
          offset += 1;
        }
        bytes.push(Number.parseInt(octal, 8));
        index += offset - 1;
        continue;
      } else if (next === 0x0d || next === 0x0a) {
        if (next === 0x0d && buffer[index + 2] === 0x0a) index += 1;
      } else {
        bytes.push(next);
      }

      index += 1;
      continue;
    }

    if (byte === 0x28) {
      depth += 1;
      bytes.push(byte);
      continue;
    }

    if (byte === 0x29) {
      depth -= 1;
      if (depth === 0) return { bytes, end: index + 1 };
      bytes.push(byte);
      continue;
    }

    bytes.push(byte);
  }

  return null;
}

function inflateStreams(buffer: Buffer): Buffer[] {
  const source = buffer.toString("latin1");
  const streams: Buffer[] = [];
  const pattern = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(source))) {
    try {
      streams.push(zlib.inflateSync(Buffer.from(match[1], "latin1")));
    } catch {
      // Non-Flate streams are not useful for the generated timetable PDFs we handle here.
    }
  }

  return streams;
}

function extractPositionedTextFromStream(stream: Buffer): PositionedText[] {
  const source = stream.toString("latin1");
  const matches = [...source.matchAll(/1 0 0 1\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+Tm/g)];
  const items: PositionedText[] = [];

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const start = (match.index ?? 0) + match[0].length;
    const nextTextMatrix = matches[index + 1]?.index ?? source.length;
    const textObjectEnd = source.indexOf("\nET", start);
    const end = textObjectEnd >= 0 ? Math.min(nextTextMatrix, textObjectEnd) : nextTextMatrix;
    const literalStart = stream.indexOf(0x28, start);

    if (literalStart < 0 || literalStart >= end) continue;

    const literal = readLiteralString(stream, literalStart);
    if (!literal) continue;

    const suffix = source.slice(literal.end, Math.min(literal.end + 12, source.length));
    if (!/^\s*Tj/.test(suffix)) continue;

    const text = decodeUtf16Be(literal.bytes).trim();
    if (text) {
      items.push({
        text,
        x: Number(match[1]),
        y: Number(match[2]),
      });
    }
  }

  return items;
}

function closestWeekday(x: number, headers: PositionedText[]): string | undefined {
  let best: { label: string; distance: number } | undefined;
  for (const header of headers) {
    const distance = Math.abs(header.x - x);
    if (!best || distance < best.distance) best = { label: header.text, distance };
  }

  if (!best || best.distance > 80) return undefined;
  return WEEKDAY_BY_HEADER.get(best.label);
}

function collectEntries(items: PositionedText[]): { entries: DirectCourseEntry[]; headers: PositionedText[] } {
  const headers = items.filter((item) => WEEKDAY_BY_HEADER.has(item.text));
  const titles = items
    .filter((item) => item.text.includes("▲"))
    .map((item) => ({
      x: item.x,
      y: item.y,
      title: displayClean(item.text),
      details: [] as string[],
    }));

  for (const item of items) {
    if (
      item.text.includes("▲") ||
      /^\d+$/.test(item.text) ||
      WEEKDAY_BY_HEADER.has(item.text) ||
      IGNORE_TEXT.has(item.text)
    ) {
      continue;
    }

    const candidates = titles
      .filter((title) => Math.abs(title.x - item.x) < 2 && title.y > item.y)
      .sort((a, b) => a.y - b.y);

    const owner = candidates[0];
    if (owner) owner.details.push(item.text);
  }

  return {
    headers,
    entries: titles.filter((entry) => closestWeekday(entry.x, headers)),
  };
}

function entryToLine(entry: DirectCourseEntry, headers: PositionedText[]): string | undefined {
  const weekday = closestWeekday(entry.x, headers);
  const details = clean(entry.details.join(""));
  const period = details.match(/\((\d{1,2})-(\d{1,2})节\)/);
  const week = details.match(/\)\s*([^/]*?周(?:\([^)]*\))?)\//);
  const location = details.match(/场地:([^/]+?)(?:\/教师:|$)/);
  const teacher = details.match(/教师:([^/]+?)(?:\/课程|\/学分|$)/);

  if (!weekday || !period) return undefined;

  let line = `${weekday} ${period[1]}-${period[2]}节 ${entry.title}`;
  if (teacher) line += ` ${teacher[1]}老师`;
  if (location) line += ` ${location[1]}`;
  if (week) {
    line += ` ${week[1].replace("(单)", " 单周").replace("(双)", " 双周")}`;
  }
  return line;
}

function inferSemesterStart(text: string): string | null {
  const match = text.match(/(20\d{2})-\d{4}学年第([12])学期/);
  if (!match) return null;

  const year = Number(match[1]);
  const term = Number(match[2]);
  const date = new Date(Date.UTC(term === 1 ? year : year + 1, term === 1 ? 8 : 1, term === 1 ? 1 : 20));
  while (date.getUTCDay() !== 1) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export function extractScheduleFromPdfContent(buffer: Buffer): DirectScheduleExtraction | null {
  const items = inflateStreams(buffer).flatMap(extractPositionedTextFromStream);
  if (!items.length) return null;

  const fullText = items.map((item) => item.text).join("\n");
  if (!fullText.includes("课表") || !fullText.includes("学期")) return null;

  const { entries, headers } = collectEntries(items);
  const deduped = [
    ...new Set(
      entries
        .map((entry) => entryToLine(entry, headers))
        .filter((line): line is string => Boolean(line)),
    ),
  ];

  if (!deduped.length) return null;

  return {
    success: true,
    text: `课程表\n${deduped.join("\n")}`,
    mode: "table",
    count: deduped.length,
    semesterStart: inferSemesterStart(fullText),
  };
}

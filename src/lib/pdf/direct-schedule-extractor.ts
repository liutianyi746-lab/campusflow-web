import { decompressSync } from "fflate";

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

export type DirectRawTextExtraction = {
  success: true;
  text: string;
  mode: "text";
  count: number;
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

function collectMatches(value: string, pattern: RegExp): RegExpExecArray[] {
  const matches: RegExpExecArray[] = [];
  pattern.lastIndex = 0;
  let match = pattern.exec(value);
  while (match) {
    matches.push(match);
    match = pattern.exec(value);
  }
  pattern.lastIndex = 0;
  return matches;
}

function decodeUtf16Be(bytes: number[]): string {
  let result = "";
  for (let index = 0; index + 1 < bytes.length; index += 2) {
    result += String.fromCharCode((bytes[index] << 8) | bytes[index + 1]);
  }
  return result;
}

function hexToBytes(hex: string): number[] {
  const bytes: number[] = [];
  for (let index = 0; index + 1 < hex.length; index += 2) {
    bytes.push(Number.parseInt(hex.slice(index, index + 2), 16));
  }
  return bytes;
}

function decodeUtf16Hex(hex: string): string {
  return decodeUtf16Be(hexToBytes(hex));
}

function decodeTextBytes(bytes: number[], unicodeMap: Map<number, string>): string {
  if (!unicodeMap.size) return decodeUtf16Be(bytes);

  let result = "";
  for (let index = 0; index + 1 < bytes.length; index += 2) {
    const code = (bytes[index] << 8) | bytes[index + 1];
    result += unicodeMap.get(code) ?? "";
  }
  return result || decodeUtf16Be(bytes);
}

function bytesToBinaryString(bytes: Uint8Array): string {
  const chunks: string[] = [];
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    let chunk = "";
    const end = Math.min(bytes.length, index + chunkSize);
    for (let cursor = index; cursor < end; cursor += 1) {
      chunk += String.fromCharCode(bytes[cursor]);
    }
    chunks.push(chunk);
  }
  return chunks.join("");
}

function asciiBytes(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length);
  for (let index = 0; index < value.length; index += 1) {
    bytes[index] = value.charCodeAt(index);
  }
  return bytes;
}

function indexOfBytes(source: Uint8Array, needle: Uint8Array, from = 0): number {
  if (!needle.length) return from;
  for (let index = from; index <= source.length - needle.length; index += 1) {
    let matched = true;
    for (let offset = 0; offset < needle.length; offset += 1) {
      if (source[index + offset] !== needle[offset]) {
        matched = false;
        break;
      }
    }
    if (matched) return index;
  }
  return -1;
}

function readLiteralString(buffer: Uint8Array, start: number): { bytes: number[]; end: number } | null {
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

function inflateStreams(buffer: Uint8Array): Uint8Array[] {
  const streams: Uint8Array[] = [];
  const streamMarker = asciiBytes("stream");
  const endstreamMarker = asciiBytes("endstream");
  let cursor = 0;

  while (cursor < buffer.length) {
    const streamStart = indexOfBytes(buffer, streamMarker, cursor);
    if (streamStart < 0) break;
    let dataStart = streamStart + streamMarker.length;
    if (buffer[dataStart] === 0x0d && buffer[dataStart + 1] === 0x0a) dataStart += 2;
    else if (buffer[dataStart] === 0x0a) dataStart += 1;

    const streamEnd = indexOfBytes(buffer, endstreamMarker, dataStart);
    if (streamEnd < 0) break;
    let dataEnd = streamEnd;
    if (buffer[dataEnd - 2] === 0x0d && buffer[dataEnd - 1] === 0x0a) dataEnd -= 2;
    else if (buffer[dataEnd - 1] === 0x0a) dataEnd -= 1;

    try {
      streams.push(decompressSync(buffer.slice(dataStart, dataEnd)));
    } catch {
      // Non-Flate streams are not useful for the generated timetable PDFs we handle here.
    }
    cursor = streamEnd + endstreamMarker.length;
  }

  return streams;
}

function parseToUnicodeMapFromStream(stream: Uint8Array): Map<number, string> {
  const source = bytesToBinaryString(stream);
  const map = new Map<number, string>();

  const bfCharBlocks = source.match(/beginbfchar[\s\S]*?endbfchar/g) ?? [];
  for (const block of bfCharBlocks) {
    const matches = collectMatches(block, /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g);
    for (const match of matches) {
      map.set(Number.parseInt(match[1], 16), decodeUtf16Hex(match[2]));
    }
  }

  const bfRangeBlocks = source.match(/beginbfrange[\s\S]*?endbfrange/g) ?? [];
  for (const block of bfRangeBlocks) {
    const arrayMatches = collectMatches(block, /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*\[([^\]]+)\]/g);
    for (const match of arrayMatches) {
      const start = Number.parseInt(match[1], 16);
      const values = match[3].match(/<([0-9A-Fa-f]+)>/g) ?? [];
      for (let offset = 0; offset < values.length; offset += 1) {
        const value = values[offset].replace(/[<>]/g, "");
        map.set(start + offset, decodeUtf16Hex(value));
      }
    }

    const rangeMatches = collectMatches(block, /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g);
    for (const match of rangeMatches) {
      const start = Number.parseInt(match[1], 16);
      const end = Number.parseInt(match[2], 16);
      const targetBytes = hexToBytes(match[3]);
      if (targetBytes.length !== 2) {
        if (start === end) map.set(start, decodeUtf16Be(targetBytes));
        continue;
      }

      const targetStart = (targetBytes[0] << 8) | targetBytes[1];
      for (let code = start; code <= end; code += 1) {
        map.set(code, String.fromCharCode(targetStart + code - start));
      }
    }
  }

  return map;
}

function buildToUnicodeMap(streams: Uint8Array[]): Map<number, string> {
  const combined = new Map<number, string>();
  for (const stream of streams) {
    const streamMap = parseToUnicodeMapFromStream(stream);
    for (const [code, value] of streamMap) {
      combined.set(code, value);
    }
  }
  return combined;
}

function extractPositionedTextFromStream(stream: Uint8Array, unicodeMap = new Map<number, string>()): PositionedText[] {
  const source = bytesToBinaryString(stream);
  const numberPattern = "-?\\d+(?:\\.\\d+)?";
  const matrixPattern = new RegExp(
    `${numberPattern}\\s+${numberPattern}\\s+${numberPattern}\\s+${numberPattern}\\s+(${numberPattern})\\s+(${numberPattern})\\s+Tm`,
    "g",
  );
  const matches = collectMatches(source, matrixPattern);
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

    const text = decodeTextBytes(literal.bytes, unicodeMap).trim();
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

function extractPositionedTextFromPdfContent(buffer: Uint8Array): PositionedText[] {
  const items: PositionedText[] = [];
  const streams = inflateStreams(buffer);
  const unicodeMap = buildToUnicodeMap(streams);
  for (const stream of streams) {
    for (const item of extractPositionedTextFromStream(stream, unicodeMap)) {
      items.push(item);
    }
  }
  return items;
}

function positionedItemsToLines(items: PositionedText[]): string[] {
  const sorted = items
    .filter((item) => displayClean(item.text))
    .slice()
    .sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: Array<{ y: number; items: PositionedText[] }> = [];

  for (const item of sorted) {
    let line = lines.find((candidate) => Math.abs(candidate.y - item.y) <= 4);
    if (!line) {
      line = { y: item.y, items: [] };
      lines.push(line);
    }
    line.items.push(item);
  }

  return lines.map((line) => joinPositionedLine(line.items)).filter(Boolean);
}

function joinPositionedLine(items: PositionedText[]): string {
  const sorted = items
    .slice()
    .sort((a, b) => a.x - b.x)
    .map((item) => ({ ...item, text: displayClean(item.text) }))
    .filter((item) => item.text);
  let line = "";
  let previousX: number | null = null;

  for (const item of sorted) {
    if (line && previousX !== null && item.x - previousX > 18) line += " ";
    line += item.text;
    previousX = item.x;
  }

  return line;
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

export function extractScheduleFromPdfContent(buffer: Uint8Array): DirectScheduleExtraction | null {
  const items = extractPositionedTextFromPdfContent(buffer);
  if (!items.length) return null;

  const fullText = items.map((item) => item.text).join("\n");
  if (!fullText.includes("课表") || !fullText.includes("学期")) return null;

  const { entries, headers } = collectEntries(items);
  const seenLines = new Set<string>();
  const deduped: string[] = [];
  for (const entry of entries) {
    const line = entryToLine(entry, headers);
    if (!line || seenLines.has(line)) continue;
    seenLines.add(line);
    deduped.push(line);
  }

  if (!deduped.length) return null;

  return {
    success: true,
    text: `课程表\n${deduped.join("\n")}`,
    mode: "table",
    count: deduped.length,
    semesterStart: inferSemesterStart(fullText),
  };
}

export function extractRawTextFromPdfContent(buffer: Uint8Array): DirectRawTextExtraction | null {
  const items = extractPositionedTextFromPdfContent(buffer);
  if (!items.length) return null;

  const lines = positionedItemsToLines(items);
  const text = lines.join("\n").trim();
  if (!text) return null;

  return {
    success: true,
    text,
    mode: "text",
    count: lines.length,
  };
}

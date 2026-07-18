import type { RecognitionIntent } from "../types/campus-event.ts";

export function shouldPreferDeterministicCourseParser(
  text: string,
  intent: RecognitionIntent,
): boolean {
  if (intent !== "COURSE") return false;

  const structuredRows = text
    .split(/[\r\n]+/)
    .map((line) => line.trim())
    .filter((line) => /^(?:周|星期)[一二三四五六日天]\s+\d{1,2}\s*[-~至到]\s*\d{1,2}\s*节/.test(line));

  if (structuredRows.length < 3) return false;
  const rowsWithCourseFields = structuredRows.filter((line) => (
    /\d{1,2}\s*(?:[-~至到]\s*\d{1,2})?\s*周/.test(line)
    && /(?:教师\s*[:：]|地点\s*[:：])/.test(line)
  ));

  return rowsWithCourseFields.length / structuredRows.length >= 0.8;
}

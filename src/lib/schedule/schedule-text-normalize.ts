/**
 * 作息表文本归一化。
 *
 * 输入可能来自截图 OCR、PDF 文本层或用户手输，脏数据形态差别很大：
 * 全角数字、冒号被识别成句点、0 被识别成字母 O、时间没有分隔符等等。
 * 这里把它们统一成 `HH:MM`，后面的解析只需要面对干净格式。
 */

/** 全角数字、全角冒号、各种破折号统一成半角 */
export function toHalfWidth(value: string): string {
  return value
    .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/[Ａ-Ｚａ-ｚ]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/[：﹕︓]/g, ":")
    .replace(/[—–－ー─]/g, "-")
    .replace(/[～]/g, "~")
    .replace(/[．。｡·]/g, ".")
    .replace(/ /g, " ");
}

/**
 * 只在「像时间」的位置修正 OCR 字形混淆，避免误伤课程名里的字母。
 * O/o/〇 -> 0，l/I/| -> 1，S -> 5，B -> 8
 */
function fixOcrDigits(token: string): string {
  return token
    .replace(/[Oo〇oO]/g, "0")
    .replace(/[lI|丨]/g, "1")
    .replace(/[Ss]/g, "5")
    .replace(/[B]/g, "8");
}

/** 把 `8点`、`8点半`、`8点45`、`8时45分` 这类中文表达换成 `8:45` */
export function normalizeChineseClock(value: string): string {
  return value
    .replace(/(\d{1,2})\s*[点時时]\s*半/g, "$1:30")
    .replace(/(\d{1,2})\s*[点時时]\s*(\d{1,2})\s*分?/g, (_m, h: string, m: string) => `${h}:${m.padStart(2, "0")}`)
    .replace(/(\d{1,2})\s*[点時时]\s*(?![\d:])/g, "$1:00");
}

/**
 * 冒号被 OCR 成 `.`、`;`、`'` 或直接丢失的情况。
 * 只处理「1~2 位 + 分隔符 + 2 位」且后面不再跟数字的片段，避免动到 1.5 这类小数。
 */
function repairTimeSeparators(value: string): string {
  return value
    .replace(/(?<!\d)(\d{1,2})\s*[.;；'’`,，]\s*(\d{2})(?!\d)/g, "$1:$2")
    .replace(/(?<!\d)(\d{1,2})\s*:\s*(\d{2})(?!\d)/g, "$1:$2");
}

/**
 * 紧凑写法 `0800-0845` / `800~845`。
 * 只在整行都没有冒号时间时才启用，否则容易把周次、教室号误判成时间。
 */
function expandCompactTimeRange(value: string): string {
  if (/\d{1,2}:\d{2}/.test(value)) return value;

  return value.replace(
    /(?<!\d)(\d{3,4})\s*[-~至到]\s*(\d{3,4})(?!\d)/g,
    (match, left: string, right: string) => {
      const parsed = [left, right].map((raw) => {
        const padded = raw.padStart(4, "0");
        const hour = Number(padded.slice(0, 2));
        const minute = Number(padded.slice(2));
        if (hour > 23 || minute > 59) return null;
        return `${String(hour).padStart(2, "0")}:${padded.slice(2)}`;
      });

      if (parsed.some((item) => item === null)) return match;
      return `${parsed[0]}-${parsed[1]}`;
    },
  );
}

/** 对疑似时间的片段做字形纠正：至少含一个数字，且整体由数字和易混字符组成 */
function repairOcrTimeTokens(value: string): string {
  return value.replace(/(?<![一-龥A-Za-z])[0-9OolI|丨SsB]{1,2}\s*[:.]\s*[0-9OolI|丨SsB]{2}(?![一-龥])/g, (token) =>
    fixOcrDigits(token).replace(/\s+/g, ""),
  );
}

/** 整行归一化：返回可以直接用 `\d{1,2}:\d{2}` 匹配的文本 */
export function normalizeScheduleLine(rawLine: string): string {
  const halfWidth = toHalfWidth(rawLine);
  const ocrFixed = repairOcrTimeTokens(halfWidth);
  const chineseClock = normalizeChineseClock(ocrFixed);
  const separated = repairTimeSeparators(chineseClock);
  const compact = expandCompactTimeRange(separated);

  return compact.replace(/\s+/g, " ").trim();
}

/** 补零成 HH:MM；小时或分钟越界时返回 undefined */
export function normalizeTimeToken(value: string): string | undefined {
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return undefined;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return undefined;

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** HH:MM -> 当天分钟数，便于比较时长与先后 */
export function toMinutes(time: string): number {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

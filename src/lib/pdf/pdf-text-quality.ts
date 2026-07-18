export function isSparsePdfText(value: string): boolean {
  const meaningful = value
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/\b\S+\.scu\.edu\.cn\S*/gi, " ")
    .replace(/\b20\d{2}[\/-]\d{1,2}[\/-]\d{1,2}\b/g, " ")
    .replace(/\b\d{1,2}:\d{2}\b/g, " ")
    .replace(/\u9009\u8bfe\u7ed3\u679c|\u8bfe\u7a0b\u8868|\u7b2c\s*\d+\s*\u9875|\d+\s*\/\s*\d+/g, " ")
    .replace(/[^\u4e00-\u9fa5A-Za-z0-9]/g, "");
  const scheduleSignals = (value.match(/(?:\u661f\u671f[\u4e00\u4e8c\u4e09\u56db\u4e94\u516d\u65e5\u5929]|\u5468[\u4e00\u4e8c\u4e09\u56db\u4e94\u516d\u65e5\u5929]|\d{1,2}\s*[-~\u81f3\u5230]\s*\d{1,2}\s*\u8282|\u6559\u5e08|\u573a\u5730)/g) ?? []).length;

  return meaningful.length < 30 && scheduleSignals < 2;
}

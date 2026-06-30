export const DEFAULT_SEMESTER_START = "2026-09-07";

export function normalizeSemesterStart(value?: string | null) {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return DEFAULT_SEMESTER_START;
}
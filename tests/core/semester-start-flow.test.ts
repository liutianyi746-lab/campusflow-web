import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(path: string) {
  return readFileSync(path, "utf8");
}

test("semester start is editable and carried into parse and ICS export", () => {
  const store = read("src/stores/use-event-store.ts");
  const upload = read("src/app/upload/page.tsx");
  const editor = read("src/app/editor/page.tsx");
  const icsRoute = read("src/app/api/ics/route.ts");
  const icsBuilder = read("src/lib/ics/ics-builder.ts");

  assert.match(store, /semesterStart:\s*string/);
  assert.match(store, /setSemesterStart:\s*\(date:\s*string\)\s*=>\s*void/);
  assert.match(store, /noClassDates:\s*string\[\]/);
  assert.match(store, /addNoClassDate/);

  assert.match(upload, /semesterStart/);
  assert.match(upload, /setSemesterStart\(uploadResponse\.data\.semesterStart\)/);
  assert.match(upload, /semesterStart:\s*resolvedSemesterStart/);

  assert.match(editor, /setSemesterStart/);
  assert.doesNotMatch(editor, /semesterStart:\s*"2026-02-23"/);
  assert.match(editor, /semesterStart,\s*calendarName/);
  assert.match(editor, /periods:\s*scheduleTemplate\.periods/);
  assert.match(editor, /noClassDates/);
  assert.match(editor, /节假日停课/);

  assert.match(icsRoute, /periods\?:\s*Period\[\]/);
  assert.match(icsRoute, /noClassDates\?:\s*string\[\]/);
  assert.match(icsRoute, /body\.periods/);
  assert.match(icsRoute, /body\.noClassDates/);
  assert.match(icsBuilder, /EXDATE/);
});

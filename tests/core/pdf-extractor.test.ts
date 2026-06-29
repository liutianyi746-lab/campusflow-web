import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { applyTemplate } from "../../src/lib/parser/template-matcher.ts";
import { localRecognize } from "../../src/lib/parser/local-recognizer.ts";
import { extractPdfText } from "../../src/lib/pdf/pdf-text-extractor.ts";
import { DEFAULT_SCHEDULE_TEMPLATE } from "../../src/lib/schedule/default-template.ts";

describe("pdf schedule extraction", () => {
  it("extracts a real education-system PDF schedule into parseable course text", async () => {
    const pdfPath = "tmp/pdfs/schedule.pdf";
    if (!existsSync(pdfPath)) return;

    const extracted = await extractPdfText(readFileSync(pdfPath));
    assert.ok(extracted);
    assert.equal(extracted.semesterStart, "2026-09-07");
    assert.match(extracted.ocrText, /黄子信课表|课程表/);
    assert.match(extracted.ocrText, /数字经济/);
    assert.match(extracted.ocrText, /马克思主义基本原理/);

    const recognized = localRecognize(extracted.ocrText, "COURSE", "PDF");
    assert.ok(recognized.events.length >= 10);
    assert.ok(recognized.events.some((event) => event.title === "数字经济" && event.course?.dayOfWeek === 4));

    const events = applyTemplate(recognized.events, DEFAULT_SCHEDULE_TEMPLATE, extracted.semesterStart);
    assert.ok(events.some((event) => event.title === "大学物理" && event.startTime === "2026-09-08T19:55:00"));
  });
});

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { applyTemplate } from "../../src/lib/parser/template-matcher.ts";
import { localRecognize } from "../../src/lib/parser/local-recognizer.ts";
import { extractRawTextFromPdfContent, extractScheduleFromPdfContent } from "../../src/lib/pdf/direct-schedule-extractor.ts";
import { extractPdfText } from "../../src/lib/pdf/pdf-text-extractor.ts";
import { extractPdfTextWithPdfJs } from "../../src/lib/pdf/pdfjs-fallback-extractor.ts";
import { isSparsePdfText } from "../../src/lib/pdf/pdf-text-quality.ts";
import { DEFAULT_SCHEDULE_TEMPLATE } from "../../src/lib/schedule/default-template.ts";

describe("pdf schedule extraction", () => {
  it("treats print headers without embedded page content as sparse PDF text", () => {
    assert.equal(isSparsePdfText([
      "2026/7/18 17:44 \u9009\u8bfe\u7ed3\u679c",
      "zhjw.scu.edu.cn/student/courseSelect/courseSelectResult/index 1/1",
    ].join("\n")), true);
    assert.equal(isSparsePdfText("\u5468\u4e00 1-2\u8282 \u9ad8\u7b49\u6570\u5b66 \u6559\u5e08\u5f20\u8001\u5e08 \u573a\u5730A101"), false);
  });

  it("OCRs the embedded selection-result image when the PDF text layer is only a print header", async () => {
    const pdfPath = "C:/Users/32916/Documents/xwechat_files/wxid_mjn1s6jfsbqz22_fa4f/msg/file/2026-07/\u9009\u8bfe\u7ed3\u679c.pdf";
    if (!existsSync(pdfPath)) return;

    const extracted = await extractPdfText(readFileSync(pdfPath));

    assert.ok(extracted);
    assert.equal(isSparsePdfText(extracted.ocrText), false);
    assert.match(extracted.ocrText, /(?:\u6982\u7387\u7edf\u8ba1|\u5de5\u7a0b\u6570\u5b66|\u5927\u5b66\u7269\u7406)/);
  });

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

  it("extracts the same schedule with the JS fallback used on serverless deploys", async () => {
    const pdfPath = "tmp/pdfs/schedule.pdf";
    if (!existsSync(pdfPath)) return;

    const extracted = await extractPdfTextWithPdfJs(readFileSync(pdfPath));

    assert.equal(extracted.success, true);
    assert.equal(extracted.semesterStart, "2026-09-07");
    assert.equal(extracted.count, 14);
    assert.match(extracted.text, /周四 3-4节 数字经济/);
    assert.match(extracted.text, /周二 10-12节 大学物理/);

    const recognized = localRecognize(extracted.text, "COURSE", "PDF");
    assert.ok(recognized.events.length >= 10);
    assert.ok(recognized.events.some((event) => event.title === "数字经济" && event.course?.dayOfWeek === 4));
  });

  it("extracts iText education-system schedules without PDF.js rendering dependencies", async () => {
    const pdfPath = "tmp/pdfs/schedule.pdf";
    if (!existsSync(pdfPath)) return;

    const extracted = extractScheduleFromPdfContent(readFileSync(pdfPath));

    assert.ok(extracted);
    assert.equal(extracted.semesterStart, "2026-09-07");
    assert.equal(extracted.count, 14);
    assert.match(extracted.text, /周四 3-4节 数字经济 姚凯老师 颐德楼H212 1-17周/);
    assert.match(extracted.text, /周五 5-6节 概率论与数理统计B 郭斌,张晨琳老师 经世楼G101 1-17周/);
  });

  it("extracts exam admission-ticket text without PDF.js dynamic loading", async () => {
    const pdfPath = "C:/Users/32916/Documents/xwechat_files/wxid_mjn1s6jfsbqz22_fa4f/msg/file/2026-06/ReportServer.pdf";
    if (!existsSync(pdfPath)) return;

    const extracted = extractRawTextFromPdfContent(readFileSync(pdfPath));

    assert.ok(extracted);
    assert.match(extracted.text, /西南财经大学2025-2026-2学期期末考试准考证/);
    assert.match(extracted.text, /2026年06月23日\(13:00-15:00\) 数据结构（C语言） 经世楼E202 57/);
    assert.match(extracted.text, /2026年07月02日\(09:00-11:00\) 高等数学(?:II|Ⅱ) 经世楼B404 17/);

    const recognized = localRecognize(extracted.text, "EXAM", "PDF");
    assert.equal(recognized.events.length, 7);
    assert.equal(recognized.events[0].title, "数据结构（C语言）考试");
    assert.equal(recognized.events[0].seatNumber, "57");
  });
});

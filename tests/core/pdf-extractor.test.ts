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
import { detectTimetableGridForTest } from "../../src/lib/ocr/browser-ocr.ts";

type ExpectedCourse = {
  name: string;
  teacher: string;
  dayOfWeek: number;
  periodStart: number;
  periodEnd: number;
  weekStart: number;
  weekEnd: number;
  weekType: string;
  specificWeeks?: number[];
  location: string;
};

const courseSelectionGroundTruth = JSON.parse(
  readFileSync("tests/fixtures/course-selection-ground-truth.json", "utf8"),
) as ExpectedCourse[];

function courseRecord(event: ReturnType<typeof localRecognize>["events"][number]): ExpectedCourse | undefined {
  if (!event.course) return undefined;
  return {
    name: event.course.courseName,
    teacher: event.course.teacher ?? "",
    dayOfWeek: event.course.dayOfWeek,
    periodStart: event.course.periodStart,
    periodEnd: event.course.periodEnd,
    weekStart: event.course.weekStart,
    weekEnd: event.course.weekEnd,
    weekType: event.course.weekType,
    specificWeeks: event.course.specificWeeks,
    location: event.course.classroom ?? "",
  };
}

function stableRecord(record: ExpectedCourse): string {
  const name = record.name.replace(/_\d{2}$/, "").replace(/（I{1,3}）/g, "");
  return JSON.stringify({
    name,
    teacher: record.teacher,
    dayOfWeek: record.dayOfWeek,
    periodStart: record.periodStart,
    periodEnd: record.periodEnd,
    weekStart: record.weekStart,
    weekEnd: record.weekEnd,
    weekType: record.weekType,
    specificWeeks: record.specificWeeks ?? [],
    location: record.location,
  });
}

describe("pdf schedule extraction", () => {
  it("detects the light-gray timetable grid used by the browser PDF fallback", async () => {
    const renderedPage = "tmp/target-page.png";
    if (!existsSync(renderedPage)) return;

    const sharp = (await import("sharp")).default;
    const { data, info } = await sharp(renderedPage).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const grid = detectTimetableGridForTest(data, info.width, info.height);

    assert.ok(grid, "the embedded timetable uses light-gray rules that must not be treated as blank");
    assert.equal(grid.xLines.length, 10);
    assert.ok(grid.headerBottom > grid.top);
    assert.ok(grid.bottom - grid.headerBottom > 600);
  });

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
    const recognized = localRecognize(extracted.ocrText, "COURSE", "PDF");
    const actual = recognized.events.map(courseRecord).filter((record): record is ExpectedCourse => Boolean(record));
    assert.deepEqual(actual.map(stableRecord).sort(), courseSelectionGroundTruth.map(stableRecord).sort());
    assert.equal(actual.length, 20, "must retain every independent week arrangement without duplicates");
    assert.ok(actual.every((record) => !/(?:教学日历|教学大纲|课程信息|实习课安排|zhjw|打印时间)/.test(record.name)));
    assert.ok(recognized.warnings.some((warning) => /低置信度|不确定/.test(warning)) || actual.every((record) => record.teacher && record.location));
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

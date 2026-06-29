import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { applyTemplate } from "../../src/lib/parser/template-matcher.ts";
import { localRecognize } from "../../src/lib/parser/local-recognizer.ts";
import { recognize } from "../../src/lib/ocr/paddle-ocr-stub.ts";
import { parseScheduleTemplateText } from "../../src/lib/schedule/schedule-template-parser.ts";

const scheduleText = `
第一节 08:20-09:05
第二节 09:15-10:00
第三节 10:20-11:05
第四节 11:15-12:00
第五节 14:30-15:15
第六节 15:25-16:10
`;

describe("school schedule template", () => {
  it("parses manually entered period rows into a schedule template", () => {
    const result = parseScheduleTemplateText(scheduleText, {
      name: "夏季作息",
      source: "MANUAL",
    });

    assert.equal(result.template.name, "夏季作息");
    assert.equal(result.template.periods.length, 6);
    assert.deepEqual(result.template.periods[0], {
      periodNumber: 1,
      startTime: "08:20",
      endTime: "09:05",
      label: "第一节",
    });
    assert.equal(result.warnings.length, 0);
  });

  it("maps course periods through the custom schedule template", () => {
    const template = parseScheduleTemplateText(scheduleText, { name: "夏季作息" }).template;
    const recognized = localRecognize("周一 1-2节 操作系统 刘老师 教学楼B404 1-16周", "COURSE", "TEXT");
    const [event] = applyTemplate(recognized.events, template, "2026-02-23");

    assert.equal(event.startTime, "2026-02-23T08:20:00");
    assert.equal(event.endTime, "2026-02-23T10:00:00");
  });

  it("extracts schedule text when uploaded image is marked as schedule", async () => {
    const ocr = await recognize(Buffer.from("fake-image"), "image/png", { purpose: "schedule" });
    const result = parseScheduleTemplateText(ocr.ocrText, { source: ocr.source });

    assert.equal(ocr.source, "IMAGE");
    assert.ok(result.template.periods.length >= 10);
    assert.equal(result.template.periods[0].startTime, "08:00");
  });

  it("parses schedule rows from screenshots and PDF table text", () => {
    const result = parseScheduleTemplateText(`
节次 上课时间 下课时间
1 08:20 09:05
第2节 09:15 10:00
第三节 上课 10:20 下课 11:05
08:00-08:45 第一节
`, { name: "截图作息", source: "IMAGE" });

    assert.equal(result.template.periods.length, 3);
    assert.equal(result.template.periods[0].startTime, "08:20");
    assert.equal(result.template.periods[1].endTime, "10:00");
    assert.equal(result.template.periods[2].label, "第三节");
  });


  it("recognizes natural text descriptions of school periods", () => {
    const result = parseScheduleTemplateText(`
第一节从8点开始，8点45下课
第2节 8点55 到 9点40
第三节 上午10点10至10点55
`, { name: "文本识别作息", source: "TEXT" });

    assert.equal(result.template.periods.length, 3);
    assert.equal(result.template.periods[0].startTime, "08:00");
    assert.equal(result.template.periods[0].endTime, "08:45");
    assert.equal(result.template.periods[1].startTime, "08:55");
    assert.equal(result.template.periods[2].endTime, "10:55");
  });
  it("reports invalid period rows without silently creating broken mappings", () => {
    const result = parseScheduleTemplateText("第一节 08:20-09:05\n第二节 09:10", { name: "错误作息" });

    assert.equal(result.template.periods.length, 1);
    assert.match(result.warnings[0], /第 2 行/);
  });
});


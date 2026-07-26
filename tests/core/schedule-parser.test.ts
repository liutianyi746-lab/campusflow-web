import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatPeriodsAsText,
  parsePeriodNumber,
  parseScheduleTemplateText,
} from "../../src/lib/schedule/schedule-template-parser.ts";
import { validatePeriods } from "../../src/lib/schedule/schedule-validation.ts";
import { normalizeScheduleLine } from "../../src/lib/schedule/schedule-text-normalize.ts";

const periodsOf = (text: string) => parseScheduleTemplateText(text).template.periods;

describe("作息表文本归一化", () => {
  it("全角数字和全角冒号转半角", () => {
    assert.equal(normalizeScheduleLine("第一节　０８：００－０８：４５"), "第一节 08:00-08:45");
  });

  it("句点被当成冒号时能修回来", () => {
    assert.equal(normalizeScheduleLine("第一节 08.00-08.45"), "第一节 08:00-08:45");
    assert.equal(normalizeScheduleLine("第一节 08。00-08。45"), "第一节 08:00-08:45");
  });

  it("OCR 把 0 认成字母 O、把 1 认成 l 时能纠正", () => {
    assert.equal(normalizeScheduleLine("第一节 O8:OO-O8:45"), "第一节 08:00-08:45");
    assert.equal(normalizeScheduleLine("第二节 l0:10-l0:55"), "第二节 10:10-10:55");
  });

  it("没有分隔符的紧凑时间能还原", () => {
    assert.equal(normalizeScheduleLine("第一节 0800-0845"), "第一节 08:00-08:45");
    assert.equal(normalizeScheduleLine("第一节 800~845"), "第一节 08:00-08:45");
  });

  it("不会把周次、教室号误当成时间", () => {
    assert.equal(normalizeScheduleLine("1-16周 教学楼A301"), "1-16周 教学楼A301");
  });
});

describe("节次编号解析", () => {
  it("支持阿拉伯数字与中文数字", () => {
    assert.equal(parsePeriodNumber("3"), 3);
    assert.equal(parsePeriodNumber("第三节"), 3);
    assert.equal(parsePeriodNumber("十"), 10);
    assert.equal(parsePeriodNumber("十一"), 11);
    assert.equal(parsePeriodNumber("二十"), 20);
    assert.equal(parsePeriodNumber("二十一"), 21);
  });

  it("越界或无法解析时返回 undefined", () => {
    assert.equal(parsePeriodNumber("0"), undefined);
    assert.equal(parsePeriodNumber("99"), undefined);
    assert.equal(parsePeriodNumber("甲"), undefined);
  });
});

describe("作息表识别", () => {
  it("标准写法", () => {
    const periods = periodsOf("第一节 08:00-08:45\n第二节 08:55-09:40");
    assert.equal(periods.length, 2);
    assert.deepEqual(periods[0], {
      periodNumber: 1,
      startTime: "08:00",
      endTime: "08:45",
      label: "第一节",
    });
  });

  it("表格三列：节次 上课 下课", () => {
    const periods = periodsOf(`节次 上课时间 下课时间
1 08:20 09:05
2 09:15 10:00
3 10:20 11:05`);
    assert.equal(periods.length, 3);
    assert.equal(periods[2].endTime, "11:05");
  });

  it("时间在前、节次在后的倒装写法", () => {
    const periods = periodsOf("08:00-08:45 第一节\n08:55-09:40 第二节");
    assert.equal(periods.length, 2);
    assert.equal(periods[1].startTime, "08:55");
  });

  it("一行写多节也能拆开", () => {
    const periods = periodsOf("第一节 08:00-08:45 第二节 08:55-09:40 第三节 10:10-10:55");
    assert.equal(periods.length, 3);
    assert.equal(periods[0].endTime, "08:45");
    assert.equal(periods[1].startTime, "08:55");
    assert.equal(periods[2].startTime, "10:10");
  });

  it("大节写法「第1-2节 08:00-09:40」平均拆成两节", () => {
    const periods = periodsOf("第1-2节 08:00-09:40\n第3-4节 10:00-11:40");
    assert.equal(periods.length, 4);
    assert.equal(periods[0].startTime, "08:00");
    assert.equal(periods[1].endTime, "09:40");
    // 拆分后 1-2 节连起来仍然是原来的整段
    assert.equal(periods[0].endTime, periods[1].startTime);
  });

  it("午休、早操、升旗这类非上课行不会被当成节次", () => {
    const result = parseScheduleTemplateText(`第四节 11:15-12:00
午休 12:00-14:00
大课间 09:40-10:10
第五节 14:30-15:15`);
    assert.equal(result.template.periods.length, 2);
    assert.deepEqual(
      result.template.periods.map((period) => period.periodNumber),
      [4, 5],
    );
    // 跳过的行不该产生噪声告警
    assert.equal(result.issues.filter((issue) => issue.line).length, 0);
  });

  it("表头行不产生告警", () => {
    const result = parseScheduleTemplateText("节次 上课时间 下课时间\n第一节 08:00-08:45");
    assert.equal(result.warnings.length, 0);
    assert.equal(result.stats.skippedLines, 1);
  });

  it("节次和时间被 OCR 拆成上下两栏时按顺序配对", () => {
    const result = parseScheduleTemplateText(`08:00
08:45
08:55
09:40
10:10
10:55`);
    assert.equal(result.template.periods.length, 3);
    assert.equal(result.template.periods[0].startTime, "08:00");
    assert.equal(result.template.periods[2].endTime, "10:55");
    assert.match(result.warnings.join(" "), /按时间先后编/);
  });

  it("纯时间列表没有节次号时按顺序补号", () => {
    const result = parseScheduleTemplateText(`08:00-08:45
08:55-09:40
10:10-10:55`);
    assert.equal(result.template.periods.length, 3);
    assert.equal(result.template.periods[1].periodNumber, 2);
    assert.match(result.warnings.join(" "), /按出现顺序编/);
  });

  it("节次单独成列时按顺序对应，不再逐行报警", () => {
    const result = parseScheduleTemplateText(`第一节
第二节
第三节
08:00-08:45
08:55-09:40
10:10-10:55`);
    assert.equal(result.template.periods.length, 3);
    assert.equal(result.template.periods[2].startTime, "10:10");
    assert.equal(result.issues.filter((issue) => issue.line).length, 0);
    assert.match(result.warnings.join(" "), /分成了两栏/);
  });

  it("上课下课两列被颠倒时自动换回来", () => {
    const periods = periodsOf("第一节 08:45-08:00\n第二节 09:40-08:55");
    assert.equal(periods.length, 2);
    assert.deepEqual(periods[0], {
      periodNumber: 1,
      startTime: "08:00",
      endTime: "08:45",
      label: "第一节",
    });
    assert.equal(periods[1].startTime, "08:55");
  });

  it("中文口语描述", () => {
    const periods = periodsOf(`第一节从8点开始，8点45下课
第2节 8点55 到 9点40
第三节 上午10点10至10点55
第四节 11点半到12点15`);
    assert.equal(periods.length, 4);
    assert.equal(periods[0].startTime, "08:00");
    assert.equal(periods[3].startTime, "11:30");
  });

  it("重复节次保留先出现的一条", () => {
    const periods = periodsOf("第一节 08:20-09:05\n第一节 08:00-08:45");
    assert.equal(periods.length, 1);
    assert.equal(periods[0].startTime, "08:20");
  });

  it("只有一个时间的行会报出具体行号", () => {
    const result = parseScheduleTemplateText("第一节 08:20-09:05\n第二节 09:10");
    assert.equal(result.template.periods.length, 1);
    assert.match(result.warnings[0], /第 2 行/);
  });
});

describe("节次校验", () => {
  it("结束早于开始判为错误", () => {
    const issues = validatePeriods([
      { periodNumber: 1, startTime: "09:05", endTime: "08:20", label: "第一节" },
    ]);
    assert.equal(issues[0].level, "error");
    assert.match(issues[0].message, /早于开始时间/);
  });

  it("时长异常给出提醒", () => {
    const short = validatePeriods([
      { periodNumber: 1, startTime: "08:00", endTime: "08:05", label: "第一节" },
    ]);
    assert.match(short[0].message, /只有 5 分钟/);

    const long = validatePeriods([
      { periodNumber: 1, startTime: "08:00", endTime: "13:00", label: "第一节" },
    ]);
    assert.match(long[0].message, /小时/);
  });

  it("节次编号有缺口时提醒", () => {
    const issues = validatePeriods([
      { periodNumber: 1, startTime: "08:00", endTime: "08:45", label: "第一节" },
      { periodNumber: 3, startTime: "10:10", endTime: "10:55", label: "第三节" },
    ]);
    assert.match(issues.map((issue) => issue.message).join(" "), /缺少第 2 节/);
  });

  it("相邻节次时间重叠时提醒", () => {
    const issues = validatePeriods([
      { periodNumber: 1, startTime: "08:00", endTime: "09:00", label: "第一节" },
      { periodNumber: 2, startTime: "08:30", endTime: "09:15", label: "第二节" },
    ]);
    assert.match(issues.map((issue) => issue.message).join(" "), /早于第1节的结束时间/);
  });

  it("正常作息表没有任何问题", () => {
    const result = parseScheduleTemplateText(`第一节 08:20-09:05
第二节 09:15-10:00
第三节 10:20-11:05
第四节 11:15-12:00
第五节 14:30-15:15
第六节 15:25-16:10`);
    assert.equal(result.warnings.length, 0);
    assert.equal(result.template.periods.length, 6);
  });
});

describe("节次转文本", () => {
  it("可以还原成可编辑文本", () => {
    const periods = periodsOf("第一节 08:00-08:45\n第二节 08:55-09:40");
    assert.equal(formatPeriodsAsText(periods), "第一节 08:00-08:45\n第二节 08:55-09:40");
  });
});

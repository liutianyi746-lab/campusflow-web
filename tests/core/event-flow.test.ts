import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { localRecognize } from "../../src/lib/parser/local-recognizer.ts";
import { route } from "../../src/lib/parser/parser-router.ts";
import {
  eventTypeLabel,
  formatEventTime,
  sourceLabel,
} from "../../src/lib/ui/event-format.ts";

describe("campus event flow", () => {
  it("routes all supported campus inputs toward time events", () => {
    assert.equal(route("课程表 周一 1-2节 高等数学 教学楼A301"), "COURSE");
    assert.equal(route("考试安排 6月20日 15:00 教学楼A301"), "EXAM");
    assert.equal(route("作业通知 6月20日 23:59 截止提交实验报告"), "HOMEWORK");
    assert.equal(route("微信群截图 下周五晚上七点班会"), "NOTICE");
    assert.equal(route("1 2026��06��23��(13:00-15:00) 数据结构 明德楼E202 57 分散"), "EXAM");
  });

  it("parses real course lines instead of returning canned courses", () => {
    const result = localRecognize("周一 1-2节 操作系统 刘老师 教学楼B404 1-16周", "COURSE", "TEXT");

    assert.equal(result.events.length, 1);
    assert.equal(result.events[0].title, "操作系统");
    assert.equal(result.events[0].course?.teacher, "刘老师");
    assert.equal(result.events[0].course?.classroom, "教学楼B404");
    assert.equal(result.events[0].course?.dayOfWeek, 1);
  });

  it("parses table-like course rows from OCR and education-system exports", () => {
    const text = [
      "星期二 第3,4节 大学英语 王老师 二教305 1-8周 单周",
      "周三 5-6 数据结构 李老师 主楼A-301 第1-16周",
      "星期四",
      "7、8节 计算机网络 赵老师 实验楼 3-201 9-16周",
    ].join("\n");
    const result = localRecognize(text, "COURSE", "EXCEL");

    assert.equal(result.events.length, 3);
    assert.equal(result.events[0].title, "大学英语");
    assert.equal(result.events[0].course?.periodStart, 3);
    assert.equal(result.events[0].course?.periodEnd, 4);
    assert.equal(result.events[0].course?.classroom, "二教305");
    assert.equal(result.events[0].course?.weekType, "ODD_WEEK");
    assert.equal(result.events[1].title, "数据结构");
    assert.equal(result.events[1].course?.periodStart, 5);
    assert.equal(result.events[1].course?.periodEnd, 6);
    assert.equal(result.events[1].course?.classroom, "主楼A-301");
    assert.equal(result.events[2].title, "计算机网络");
    assert.equal(result.events[2].course?.classroom, "实验楼 3-201");
  });

  it("parses real exam, homework, and notice text", () => {
    const exam = localRecognize("操作系统 2026-06-21 14:00-16:00 教学楼C201", "EXAM", "PDF");
    assert.equal(exam.events[0].title, "操作系统考试");
    assert.equal(exam.events[0].startTime, "2026-06-21T14:00:00");
    assert.equal(exam.events[0].location, "教学楼C201");

    const homework = localRecognize("6月22日 23:59 截止提交实验报告", "HOMEWORK", "IMAGE");
    assert.equal(homework.events[0].title, "提交实验报告");
    assert.match(homework.events[0].startTime ?? "", /-06-22T23:59:00$/);

    const notice = localRecognize("下周五晚上七点开班会，地点线上会议", "NOTICE", "IMAGE");
    assert.equal(notice.events[0].type, "MEETING");
    assert.match(notice.events[0].startTime ?? "", /T19:00:00$/);
  });

  it("parses date-first exam notices and Chinese punctuation time ranges", () => {
    const exam = localRecognize("2026年6月21日 14：30—16：30 操作系统考试 地点：教学楼 A301", "EXAM", "PDF");

    assert.equal(exam.events[0].title, "操作系统考试");
    assert.equal(exam.events[0].startTime, "2026-06-21T14:30:00");
    assert.equal(exam.events[0].endTime, "2026-06-21T16:30:00");
    assert.equal(exam.events[0].location, "教学楼 A301");
  });
  it("parses exam admission-ticket table rows without mixing seat numbers into rooms", () => {
    const text = [
      "序号 考试时间 考试科目 考试地点 座位 备注",
      "1 2026年06月23日(13:00-15:00) 数据结构（C语言） 明德楼E202 57 分散",
      "2 2026年06月23日(16:00-18:00) 面向对象程序设计（JAVASE） 笃行楼H109 43 分散",
      "3 2026��06��27��(09:00-11:00) 中国传统文化概论 H107 38 分散",
      "打印时间：2026-06-22 16:13:35",
    ].join("\n");
    const result = localRecognize(text, "EXAM", "PDF");

    assert.equal(result.events.length, 3);
    assert.equal(result.events[0].title, "数据结构（C语言）考试");
    assert.equal(result.events[0].startTime, "2026-06-23T13:00:00");
    assert.equal(result.events[0].endTime, "2026-06-23T15:00:00");
    assert.equal(result.events[0].location, "明德楼E202");
    assert.equal(result.events[0].seatNumber, "57");
    assert.equal(result.events[1].title, "面向对象程序设计（JAVASE）考试");
    assert.equal(result.events[1].location, "笃行楼H109");
    assert.equal(result.events[1].seatNumber, "43");
    assert.equal(result.events[2].startTime, "2026-06-27T09:00:00");
    assert.equal(result.events[2].location, "H107");
  });


  it("recognizes natural language deadlines with slash dates and Chinese hours", () => {
    const result = localRecognize("请在6/22晚上8点前提交数据库实验报告", "HOMEWORK", "TEXT");

    assert.equal(result.events[0].title, "提交数据库实验报告");
    assert.match(result.events[0].startTime ?? "", /-06-22T20:00:00$/);
    assert.equal(result.events[0].type, "HOMEWORK");
  });

  it("recognizes natural language as executable events", () => {
    const result = localRecognize("下周五晚上七点开班会，地点线上会议", "NATURAL_LANGUAGE", "TEXT");

    assert.equal(result.events.length, 1);
    assert.equal(result.events[0].type, "MEETING");
    assert.match(result.events[0].title, /班会/);
    assert.match(result.events[0].startTime ?? "", /T19:00:00$/);
  });

  it("formats event labels for mixed event types and sources", () => {
    assert.equal(eventTypeLabel("COURSE"), "课程");
    assert.equal(eventTypeLabel("EXAM"), "考试");
    assert.equal(sourceLabel("TEXT"), "文本");
    assert.equal(formatEventTime({ type: "EXAM", startTime: "2026-06-20T15:00:00" }), "2026-06-20 15:00");
  });

  it("keeps parse route free of database persistence", () => {
    const routeSource = readFileSync("src/app/api/parse/route.ts", "utf8");

    assert.doesNotMatch(routeSource, /@prisma\/client|prisma|recognitionHistory/);
  });
});








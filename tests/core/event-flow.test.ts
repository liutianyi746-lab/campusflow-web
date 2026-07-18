import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { composeImageOcrText } from "../../src/lib/ocr/image-ocr.ts";
import { recognizedTimetableCellLinesForTest } from "../../src/lib/ocr/browser-ocr.ts";
import { localRecognize } from "../../src/lib/parser/local-recognizer.ts";
import { parseWithLocalFallback } from "../../src/lib/parser/network-parse-fallback.ts";
import { shouldPreferDeterministicCourseParser } from "../../src/lib/parser/parser-strategy.ts";
import { route } from "../../src/lib/parser/parser-router.ts";
import { DEFAULT_SCHEDULE_TEMPLATE } from "../../src/lib/schedule/default-template.ts";
import {
  eventTypeLabel,
  formatEventTime,
  sourceLabel,
} from "../../src/lib/ui/event-format.ts";

describe("campus event flow", () => {
  it("does not send structured timetable OCR back through a generative parser", () => {
    const structured = [
      "周一 3-4节 体育-3跆拳道 教师:谢云龙 1-12周 地点:江安体育场体育馆4楼",
      "周二 1-2节 概率统计（理工） 教师:常寅山 1-17周 地点:江安一教A座A507",
      "周三 10-12节 大学物理（理工）II-2 教师:张软玉 1-16周 地点:江安一教B座B505",
    ].join("\n");

    assert.equal(shouldPreferDeterministicCourseParser(structured, "COURSE"), true);
    assert.equal(shouldPreferDeterministicCourseParser("下周一提醒我交作业", "HOMEWORK"), false);
  });

  it("keeps OCR results usable when the remote parse request cannot be fetched", () => {
    const events = parseWithLocalFallback(
      "周一 1-2节 高等数学 张老师 A101 1-16周",
      "COURSE",
      "PDF",
      DEFAULT_SCHEDULE_TEMPLATE,
      "2026-09-07",
    );

    assert.equal(events.length, 1);
    assert.equal(events[0].title, "高等数学");
    assert.equal(events[0].startTime, "2026-09-07T08:00:00");
  });

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
      "7、8节 计算机网络 赵老师 实验楼3-201 9-16周",
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
    assert.equal(result.events[2].course?.classroom, "实验楼3-201");
  });

  it("turns timetable cell OCR into parseable course events", () => {
    const ocrText = composeImageOcrText([
      { kind: "cell", dayOfWeek: 4, periodStart: 3, periodEnd: 4, text: "数 字 经 济 04 节 ） 1 凋 地 顳 德 接 H 之 师 姚 凯 程 性 质 简 称 嗵 核 分 ： 20 厘 修 标 记 ：" },
      { kind: "cell", dayOfWeek: 2, periodStart: 10, periodEnd: 12, text: "大 学 物 理 〈 1 2 节 ） 1 巪 7 周 地 ． 颐 德 檯 HI ／ 教 师 ： 林 飞 / 课 程 性 质 简 称 ： 学 基 分 愈 0@修 标 记 ：" },
      { kind: "cell", dayOfWeek: 5, periodStart: 7, periodEnd: 9, text: "计 算 机 网 络 《 7 节 ） 07 周 地 ： 经 世 DI 师 ： 谈 进 程 性 质 简 称 ： 大 平 分 ： 3.0 唾 0 标 记 ：" },
    ]);

    const result = localRecognize(ocrText, "COURSE", "IMAGE");

    assert.ok(result.events.some((event) => event.title === "数字经济" && event.course?.dayOfWeek === 4));
    assert.ok(result.events.some((event) => event.title === "大学物理" && event.course?.periodStart === 10));
    assert.ok(result.events.some((event) => event.title === "计算机网络" && event.course?.dayOfWeek === 5));
  });

  it("repairs noisy room codes from mobile timetable screenshots", () => {
    const ocrText = composeImageOcrText([
      { kind: "cell", dayOfWeek: 2, periodStart: 10, periodEnd: 12, text: "大 学 物 理 〈 1 2 节 ） 1q7 周 地 ： 颐 德 楼 HI 国 师 ， 林 飞 程 性 质 同 称 ： 学 基 分 ： 30 唾 修 标" },
      { kind: "cell", dayOfWeek: 3, periodStart: 4, periodEnd: 4, text: "形 势 与 政 策 III 04 节 ） （ 单 ） 地 ： 经 世 C ／ 教 师 ： 毛 思 程 乪 程 性 质 简 称 ： 思 政 分 ： 唾 修 标 记 ：" },
      { kind: "cell", dayOfWeek: 3, periodStart: 7, periodEnd: 9, text: "数 字 逻 辑 电 路 〈 7 节 ） 1 闫 7 周 地 ： 颐 德 檯 H 加 ： 张 蕊 程 性 质 简 称 ： 专 核 分 ： 3 邙 重 修 标 记 ，" },
      { kind: "cell", dayOfWeek: 4, periodStart: 3, periodEnd: 4, text: "数 字 经 济 （ 节 ） 1 7 周 肠 地 ： 颐 德 H21 教 师 ： 姚 凯 程 性 质 简 称 嗵 核 分 ： 20 地 修 标 记 ，" },
      { kind: "cell", dayOfWeek: 4, periodStart: 5, periodEnd: 7, text: "算 法 分 析 与 设 计 07 节 ） 1 闫 7 周 肠 地 ： 经 世 棧 E ， 师 ： 施 龙 程 性 质 简 称 ： 大 平 分 ： 30 唾 修 标 记 ：" },
      { kind: "cell", dayOfWeek: 4, periodStart: 10, periodEnd: 12, text: "大 学 生 职 业 生 涯 规 划 与 创 业 基 础 0 2 节 ） 1 巪 刽 场 地 ： 经 世 楼 C 瞒 ' 教 师 ： 买 尔 旦 ， 阿 木 提 能 程 性 质 简 称 嗵 基 存 分 ． 20 小 记 ：" },
      { kind: "cell", dayOfWeek: 5, periodStart: 3, periodEnd: 4, text: "马 克 思 主 义 基 本 原 理 （ 节 ） 07 周 地 ： 经 世 楼 C / 教 师 ： 王 妩 程 性 质 简 称 ． 思 政 脖 分 ： 30 逋 修 标 记 ：" },
      { kind: "cell", dayOfWeek: 5, periodStart: 5, periodEnd: 6, text: "概 率 论 与 数 理 统 计 B 06 节 ） 惘 7 周 地 ． 经 世 楼 G 围 师 ： 郭 斌 ， 张 晨 琳 乪 程 性 质 简 称 嗵 基 分 40 唾 修 标 记 ：" },
    ]);
    const result = localRecognize(ocrText, "COURSE", "IMAGE");
    const byTitle = new Map(result.events.map((event) => [event.title, event.course?.classroom]));

    assert.equal(byTitle.get("大学物理"), "颐德楼H103");
    assert.equal(byTitle.get("形势与政策III"), "经世楼C304");
    assert.equal(byTitle.get("数字逻辑电路"), "颐德楼H101");
    assert.equal(byTitle.get("数字经济"), "颐德楼H212");
    assert.equal(byTitle.get("算法分析与设计"), "经世楼E302");
    assert.equal(byTitle.get("大学生职业生涯规划与创业基础"), "经世楼C204");
    assert.equal(byTitle.get("马克思主义基本原理"), "经世楼C406");
    assert.equal(byTitle.get("概率论与数理统计B"), "经世楼G10");
  });
  it("repairs browser OCR timetable cells into complete course lines with locations", () => {
    const ocrText = recognizedTimetableCellLinesForTest([
      {
        dayOfWeek: 4,
        periodStart: 3,
        periodEnd: 4,
        text: "数 字 经 济 04 节 ） 1 凋 地 顳 德 接 H 之 师 姚 凯 程 性 质 简 称",
      },
      {
        dayOfWeek: 3,
        periodStart: 5,
        periodEnd: 6,
        text: "创 新 鹞 设 计 实 践 地 ： 颐 德 楼 H 娌 / 师 ： 陈 智 创 新 程 序 设 计 实 践 颐 德 接 H33()/ 师 ： 周",
      },
      {
        dayOfWeek: 5,
        periodStart: 7,
        periodEnd: 9,
        text: "计 算 机 网 络 《 7 节 ） 07 周 地 ： 经 世 DI 师 ： 谈 进",
      },
    ]);

    assert.match(ocrText, /周四 3-4节 数字经济 姚凯老师 颐德楼H212 1-17周/);
    assert.match(ocrText, /周三 5-6节 创新程序设计实践 陈智老师 颐德楼H303 1-4周/);
    assert.match(ocrText, /周三 5-6节 创新程序设计实践 周峰老师 颐德楼H303 5-15周/);
    assert.match(ocrText, /周三 5-6节 创新程序设计实践 段江老师 颐德楼H303 16-17周/);
    assert.match(ocrText, /周五 7-9节 计算机网络 谈进老师 经世楼D104 1-17周/);

    const result = localRecognize(ocrText, "COURSE", "IMAGE");
    assert.ok(result.events.some((event) => event.title === "数字经济" && event.course?.classroom === "颐德楼H212"));
    assert.ok(result.events.some((event) => event.title === "计算机网络" && event.course?.classroom === "经世楼D104"));
  });

  it("falls back to full-image OCR when timetable cell OCR is too sparse", () => {
    const ocrText = composeImageOcrText([
      { kind: "full", text: "星期二 10-12节 大学物理 颐德楼H103 1-17周" },
      { kind: "cell", dayOfWeek: 4, periodStart: 3, periodEnd: 4, text: "数字经济 颐德楼H212" },
    ]);

    assert.match(ocrText, /大学物理/);
    assert.doesNotMatch(ocrText, /^周四 3-4节/m);
  });
  it("rebuilds exam rows from OCR table cells", () => {
    const ocrText = composeImageOcrText([
      { kind: "examCell", rowIndex: 1, columnIndex: 1, text: "1" },
      { kind: "examCell", rowIndex: 1, columnIndex: 2, text: "2026年06月23日（13:00-15:00）" },
      { kind: "examCell", rowIndex: 1, columnIndex: 3, text: "数据结构（C语言）" },
      { kind: "examCell", rowIndex: 1, columnIndex: 4, text: "经世楼E202" },
      { kind: "examCell", rowIndex: 1, columnIndex: 5, text: "57" },
    ]);
    const result = localRecognize(ocrText, "EXAM", "IMAGE");

    assert.equal(result.events.length, 1);
    assert.equal(result.events[0].startTime, "2026-06-23T13:00:00");
    assert.equal(result.events[0].endTime, "2026-06-23T15:00:00");
    assert.equal(result.events[0].location, "经世楼E202");
    assert.equal(result.events[0].seatNumber, "57");
  });
  it("turns exam table row OCR into separate exam events with seats", () => {
    const ocrText = composeImageOcrText([
      { kind: "examRow", text: "1 2026年06月23日（13:00-15:00） 数据结构（C语言） 经世楼E202 57 分散" },
      { kind: "examRow", text: "2 2026年06月23日（16:00-18:00） 面向对象程序设计（JAVASE） 颐德楼H109 43 分散" },
    ]);
    const result = localRecognize(ocrText, "EXAM", "IMAGE");

    assert.equal(result.events.length, 2);
    assert.equal(result.events[0].title, "数据结构（C语言）考试");
    assert.equal(result.events[0].location, "经世楼E202");
    assert.equal(result.events[0].seatNumber, "57");
    assert.equal(result.events[1].seatNumber, "43");
  });
  it("repairs noisy OCR from mobile admission-ticket screenshots", () => {
    const ocrText = composeImageOcrText([
      { kind: "examRow", rowIndex: 2, text: "2 2026 年 06 月 23 日 （ 16 ： 00 一 18 ： 00 ） 面 向 刈 象 程 序 设 计 (JAVASE) 颐 德 楼 旧 09 43 分 散" },
      { kind: "examCell", rowIndex: 2, columnIndex: 2, text: "2026 年 06 月 23 日 （ 16 ： 00 一 18 ： 00 ）" },
      { kind: "examCell", rowIndex: 2, columnIndex: 3, text: "面 向 刈 象 程 序 设 计 (JAVASE)" },
      { kind: "examCell", rowIndex: 2, columnIndex: 4, text: "颥 德 楼 旧 09" },
      { kind: "examCell", rowIndex: 2, columnIndex: 6, text: "分 散" },
      { kind: "examRow", rowIndex: 5, text: "2026 年 06 月 29 日 （ 16 ： 0 0 一 18 ： 00 ） 5 离 散 数 ' 冫 颐 德 楼 旧 08 凵 分 散" },
      { kind: "examCell", rowIndex: 5, columnIndex: 2, text: "2026 年 06 月 29 日 （ 1 6 ： 00 一 18 ： 00 ）" },
      { kind: "examCell", rowIndex: 5, columnIndex: 3, text: "离 散 数 学" },
      { kind: "examCell", rowIndex: 5, columnIndex: 4, text: "颐 德 楼 H108" },
      { kind: "examCell", rowIndex: 5, columnIndex: 5, text: "1 4" },
      { kind: "examCell", rowIndex: 5, columnIndex: 6, text: "分 散" },
      { kind: "examRow", rowIndex: 6, text: "2026 年 07 月 01 日 0 3 ： 00 一 15 ： 00 ） 6 中 国 近 现 代 史 纲 要 经 世 楼 B103 2 集 中" },
      { kind: "examCell", rowIndex: 6, columnIndex: 2, text: "2026 年 07 月 01 日 03 ： 00 一 15 ： 00 ）" },
      { kind: "examCell", rowIndex: 6, columnIndex: 3, text: "中 国 近 现 代 史 纲 要" },
      { kind: "examCell", rowIndex: 6, columnIndex: 4, text: "经 世 楼 B 3" },
      { kind: "examRow", rowIndex: 7, text: "一 11 ： 00 ） II 7 2026 年 07 月 02 日 （ 09 ： 00 0 的 在 《 数 的 飞 经 世 楼 B404 1 7 集 中" },
      { kind: "full", text: "考试科目 数据结构（c语言） 面向对象程序设计 (JAVASE) 中国传统文化概论 大学生心理健康与人生发展 离散数学 中国近现代史纲要 高等数学 II 教室名称 经世楼E202 颐德楼H109 颐德楼H107 经世楼E302 颐德楼H108 经世楼B103 经世楼B404" },
      { kind: "examCell", rowIndex: 7, columnIndex: 2, text: "2026 年 07 月 02 日 （ 09 ： 00 一 11 ： 00 ）" },
      { kind: "examCell", rowIndex: 7, columnIndex: 3, text: "笮 了 0 真 《 数 会" },
      { kind: "examCell", rowIndex: 7, columnIndex: 4, text: "经 世 楼 B404" },
    ]);
    const result = localRecognize(ocrText, "EXAM", "IMAGE");

    assert.equal(result.events.length, 4);
    assert.equal(result.events[0].title, "面向对象程序设计 (JAVASE)考试");
    assert.equal(result.events[0].location, "颐德楼H109");
    assert.equal(result.events[0].seatNumber, "43");
    assert.equal(result.events[1].title, "离散数学考试");
    assert.equal(result.events[1].seatNumber, "14");
    assert.equal(result.events[2].startTime, "2026-07-01T13:00:00");
    assert.equal(result.events[2].location, "经世楼B103");
    assert.equal(result.events[2].seatNumber, "2");
    assert.equal(result.events[3].title, "高等数学II考试");
    assert.equal(result.events[3].seatNumber, "17");
  });
  it("routes date-first admission ticket OCR as exams in AUTO mode", () => {
    const ocrText = [
      "2026 年 06 月 23 日 ( 13 : 00 - 15 : 00 ) 数据结构 （C语言） 经世楼E202 57 分散",
      "2026 年 06 月 23 日 ( 16 : 00 - 18 : 00 ) 面向对象程序设计 (JAVASE) 颐德楼H109 43 分散",
      "2026 年 06 月 27 日 ( 09 : 00 - 11 : 00 ) 中国传统文化概论 颐德楼H107 38 分散",
      "2026 年 06 月 28 日 ( 19 : 00 - 21 : 00 ) 大学生心理健康与人生发展 经世楼E302 18 分散",
      "2026 年 06 月 29 日 ( 1 6 : 00 - 18 : 00 ) 离散数学 颐德楼H108 14 分散",
      "2026 年 07 月 01 日 03 : 00 - 15 : 00 ) 中国近现代史纲要 经世楼B103 2 集中",
      "2026 年 07 月 02 日 ( 09 : 00 - 11 : 00 ) 高等数学II 经世楼B404 17 集中",
    ].join("\n");

    assert.equal(route(ocrText), "EXAM");
    const result = localRecognize(ocrText, "AUTO", "IMAGE");

    assert.equal(result.events.length, 7);
    assert.equal(result.events[0].type, "EXAM");
    assert.equal(result.events[0].title, "数据结构（C语言）考试");
    assert.equal(result.events[5].startTime, "2026-07-01T13:00:00");
    assert.equal(result.events[6].seatNumber, "17");
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
    const exam = localRecognize("2026年6月21日 14：30-16：30 操作系统考试 地点：教学楼 A301", "EXAM", "PDF");

    assert.equal(exam.events[0].title, "操作系统考试");
    assert.equal(exam.events[0].startTime, "2026-06-21T14:30:00");
    assert.equal(exam.events[0].endTime, "2026-06-21T16:30:00");
    assert.equal(exam.events[0].location, "教学楼 A301");
  });

  it("normalizes OCR-spaced exam time ranges", () => {
    const text = "2026 年 06 月 23 日 （ 13 : 00 一 15 : 00 ） 数据结构（C语言） 经世楼 E202 57 分散";
    const result = localRecognize(text, "EXAM", "IMAGE");

    assert.equal(result.events[0].title, "数据结构（C语言）考试");
    assert.equal(result.events[0].startTime, "2026-06-23T13:00:00");
    assert.equal(result.events[0].endTime, "2026-06-23T15:00:00");
    assert.equal(result.events[0].location, "经世楼 E202");
    assert.equal(result.events[0].seatNumber, "57");
  });
  it("parses exam admission-ticket table rows without mixing seat numbers into rooms", () => {
    const text = [
      "序号 考试时间 考试科目 考试地点 座位 备注",
      "1 2026年6月23日(13:00-15:00) 数据结构（C语言） 明德楼E202 57 分散",
      "2 2026年6月23日(16:00-18:00) 面向对象程序设计（JAVASE） 笃行楼H109 43 分散",
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

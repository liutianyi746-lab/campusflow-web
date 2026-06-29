import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  confidenceLabel,
  formatCourseSlot,
  formatWeekRule,
  weekdayName,
} from "../../src/lib/ui/course-format.ts";

describe("course display formatting", () => {
  it("formats course schedule labels for the web UI", () => {
    assert.equal(weekdayName(1), "周一");
    assert.equal(weekdayName(7), "周日");
    assert.equal(weekdayName(9), "未知星期");

    assert.equal(formatWeekRule(1, 16, "EVERY_WEEK"), "第 1-16 周 每周");
    assert.equal(formatWeekRule(3, 15, "ODD_WEEK"), "第 3-15 周 单周");
    assert.equal(formatWeekRule(2, 12, "EVEN_WEEK"), "第 2-12 周 双周");
    assert.equal(formatWeekRule(1, 16, "SPECIFIC_WEEKS"), "第 1-16 周 指定周");

    assert.equal(formatCourseSlot(3, 4), "第 3-4 节");
    assert.equal(confidenceLabel(0.92), "高置信");
    assert.equal(confidenceLabel(0.76), "需核对");
    assert.equal(confidenceLabel(0.48), "低置信");
  });
});

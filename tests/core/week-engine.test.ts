import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  expandWeekNumbers,
  getCourseFirstOccurrence,
  resolveCourseDateTime,
} from "../../src/lib/events/week-engine.ts";

describe("week engine", () => {
  it("expands every, odd, even, and specific week rules", () => {
    assert.deepEqual(
      expandWeekNumbers({ weekStart: 1, weekEnd: 6, weekType: "EVERY_WEEK" }),
      [1, 2, 3, 4, 5, 6],
    );
    assert.deepEqual(
      expandWeekNumbers({ weekStart: 1, weekEnd: 6, weekType: "ODD_WEEK" }),
      [1, 3, 5],
    );
    assert.deepEqual(
      expandWeekNumbers({ weekStart: 1, weekEnd: 6, weekType: "EVEN_WEEK" }),
      [2, 4, 6],
    );
    assert.deepEqual(
      expandWeekNumbers({
        weekStart: 1,
        weekEnd: 16,
        weekType: "SPECIFIC_WEEKS",
        specificWeeks: [3, 7, 12],
      }),
      [3, 7, 12],
    );
  });

  it("resolves course dates from semester start, weekday, and periods", () => {
    const first = getCourseFirstOccurrence({
      semesterStart: "2026-02-23",
      dayOfWeek: 5,
      weekStart: 1,
      weekEnd: 16,
      weekType: "EVEN_WEEK",
    });

    assert.equal(first.toISOString().slice(0, 10), "2026-03-06");

    const resolved = resolveCourseDateTime({
      semesterStart: "2026-02-23",
      dayOfWeek: 5,
      week: 2,
      periodStart: 3,
      periodEnd: 4,
      periods: [
        { periodNumber: 3, startTime: "10:10", endTime: "10:55" },
        { periodNumber: 4, startTime: "11:05", endTime: "11:50" },
      ],
    });

    assert.equal(resolved.start.toISOString().slice(0, 16), "2026-03-06T10:10");
    assert.equal(resolved.end.toISOString().slice(0, 16), "2026-03-06T11:50");
  });
});

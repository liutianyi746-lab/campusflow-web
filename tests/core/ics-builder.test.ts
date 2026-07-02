import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildIcs } from "../../src/lib/ics/ics-builder.ts";

describe("ics builder", () => {
  it("exports all campus event types and expands specific course weeks", () => {
    const ics = buildIcs(
      [
        {
          id: "course-1",
          title: "鏁版嵁缁撴瀯璇剧▼璁捐",
          type: "COURSE",
          source: "TEXT",
          confidence: 0.95,
          reminderMinutes: 15,
          weekType: "SPECIFIC_WEEKS",
          course: {
            courseName: "鏁版嵁缁撴瀯璇剧▼璁捐",
            teacher: "鍛ㄤ節",
            classroom: "鏈烘埧E501",
            dayOfWeek: 3,
            periodStart: 7,
            periodEnd: 8,
            weekStart: 1,
            weekEnd: 16,
            weekType: "SPECIFIC_WEEKS",
            specificWeeks: [3, 7, 12],
          },
        },
        {
          id: "exam-1",
          title: "鏁版嵁缁撴瀯鑰冭瘯",
          type: "EXAM",
          startTime: "2026-06-20T15:00:00",
          endTime: "2026-06-20T17:00:00",
          location: "鏁欏妤糀301",
          seatNumber: "57",
          source: "TEXT",
          confidence: 0.9,
          reminderMinutes: 60,
        },
      ],
      "2026-02-23",
      "CampusFlow 娴嬭瘯鏃ュ巻",
    );

    assert.equal((ics.match(/BEGIN:VEVENT/g) ?? []).length, 4);
    assert.match(ics, /SUMMARY:鏁版嵁缁撴瀯璇剧▼璁捐/);
    assert.match(ics, /SUMMARY:鏁版嵁缁撴瀯鑰冭瘯/);
    assert.match(ics, /LOCATION:鏈烘埧E501/);
    assert.match(ics, /座位号: 57/);
    assert.match(ics, /TRIGGER:-PT60M/);
  });

  it("excludes course occurrences that land on no-class holiday dates", () => {
    const ics = buildIcs(
      [
        {
          id: "course-holiday",
          title: "数字经济",
          type: "COURSE",
          source: "PDF",
          confidence: 0.95,
          reminderMinutes: 10,
          weekType: "EVERY_WEEK",
          course: {
            courseName: "数字经济",
            teacher: "姚凯",
            classroom: "颐德楼H212",
            dayOfWeek: 5,
            periodStart: 1,
            periodEnd: 2,
            weekStart: 1,
            weekEnd: 5,
            weekType: "EVERY_WEEK",
          },
        },
      ],
      "2026-09-07",
      "CampusFlow 测试日历",
      undefined,
      ["2026-09-25", "2026-10-02"],
    );

    assert.match(ics, /RRULE:FREQ=WEEKLY;INTERVAL=1/);
    assert.match(ics, /EXDATE:20260925T080000,20261002T080000/);
  });
});



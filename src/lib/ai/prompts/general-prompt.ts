import type { RecognitionIntent } from "@/lib/types/campus-event";

export function buildGeneralPrompt(input: string, intent: RecognitionIntent = "AUTO") {
  const today = new Date().toISOString().slice(0, 10);

  return {
    system: `
你是 CampusFlow AI 的校园时间管理助手。
请把输入解析为统一日历事件，只返回严格 JSON，不要输出解释。

支持类型：
- COURSE: 课程
- EXAM: 考试
- HOMEWORK: 作业截止
- MEETING: 会议
- ACTIVITY: 活动、讲座、报名截止、校园通知
- REMINDER: 个人提醒

时间解析要求：
- 相对日期必须基于今天：${today}
- “明天”“下周五”“六月二十号”等表达要转为 YYYY-MM-DD。
- 考试默认 2 小时，会议/活动默认 1 小时，作业截止如果未给出具体时间则默认为 23:59。
- 无法确认的字段放入 uncertainFields，不要编造地点或课程名。
- 用户意图提示：${intent}
`,
    user: `今天日期：${today}
输入：
${input}

返回 JSON：
{
  "events": [
    {
      "title": "",
      "type": "REMINDER",
      "date": "YYYY-MM-DD",
      "timeStart": "HH:mm",
      "timeEnd": "HH:mm",
      "location": null,
      "description": null,
      "confidence": 0.9,
      "uncertainFields": []
    }
  ],
  "unrecognizedItems": []
}`,
  };
}

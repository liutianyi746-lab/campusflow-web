import type { RecognitionIntent } from "@/lib/types/campus-event";

const KEYWORDS: Record<Exclude<RecognitionIntent, "AUTO" | "NATURAL_LANGUAGE">, string[]> = {
  COURSE: ["课程", "课表", "星期", "周一", "周二", "周三", "周四", "周五", "节", "教室", "教师", "任课"],
  SCHEDULE: ["作息", "时间表", "第一节", "第二节", "上课时间", "下课时间", "教学计划"],
  EXAM: ["考试", "考场", "笔试", "座位", "监考", "期末", "期中", "补考"],
  HOMEWORK: ["作业", "提交", "截止", "DDL", "ddl", "课程设计", "实验报告", "论文"],
  NOTICE: ["会议", "班会", "讲座", "活动", "报名", "通知", "微信", "微信群", "QQ", "QQ群", "截图"],
};

function looksLikeExamTable(text: string): boolean {
  return /(?:^|\n)\s*\d{1,3}\s+20\d{2}\D{1,6}\d{1,2}\D{1,6}\d{1,2}\D{0,12}[（(]?\d{1,2}:\d{2}\s*[-~至到]\s*\d{1,2}:\d{2}/.test(text);
}

export function route(text: string): RecognitionIntent {
  if (looksLikeExamTable(text)) return "EXAM";
  const scores = Object.entries(KEYWORDS).map(([intent, words]) => ({
    intent: intent as RecognitionIntent,
    score: words.reduce((total, word) => total + (text.includes(word) ? 1 : 0), 0),
  }));

  const best = scores.sort((a, b) => b.score - a.score)[0];
  return best && best.score > 0 ? best.intent : "NATURAL_LANGUAGE";
}



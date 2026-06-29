import crypto from "node:crypto";
import type { EventSource } from "@/lib/types/campus-event";

const COURSE_SAMPLE = `课程表
周一 1-2节 高等数学 A 张老师 教学楼 A301 1-16周
周二 3-4节 大学英语 李老师 教学楼 B205 1-16周
周三 7-8节 数据结构课程设计 周老师 机房 E501 第3周、第7周、第12周
周四 3-4节 计算机组成原理 王老师 实验楼 C102 2-16周（双周）`;

const SCHEDULE_SAMPLE = `学校作息时间表
节次 上课时间 下课时间
1 08:00 08:45
2 08:55 09:40
3 10:10 10:55
4 11:05 11:50
5 14:00 14:45
6 14:55 15:40
7 16:10 16:55
8 17:05 17:50
9 19:00 19:45
10 19:55 20:40
11 20:50 21:35
12 21:45 22:30`;

const EXAM_SAMPLE = `考试安排
数据结构 2026-06-20 15:00-17:00 教学楼 A301
大学英语 2026-06-24 09:00-11:00 教学楼 B205`;

const HOMEWORK_SAMPLE = `作业通知
请在 6月20日 23:59 前提交课程设计报告。课程：数据结构课程设计`;

const NOTICE_SAMPLE = `班级通知
下周五晚上七点召开班会，地点线上会议。
创新创业讲座报名截止时间：6月18日 23:59。`;

type RecognizeOptions = {
  purpose?: "schedule" | "event";
};

function sampleFor(fileType?: string, options: RecognizeOptions = {}): string {
  if (options.purpose === "schedule") return SCHEDULE_SAMPLE;
  if (fileType?.includes("pdf")) return EXAM_SAMPLE;
  if (fileType?.includes("sheet") || fileType?.includes("excel")) return COURSE_SAMPLE;
  if (fileType?.includes("csv")) return COURSE_SAMPLE;
  if (fileType?.includes("homework")) return HOMEWORK_SAMPLE;
  if (fileType?.includes("notice")) return NOTICE_SAMPLE;
  return COURSE_SAMPLE;
}

function sourceFor(fileType?: string): EventSource {
  if (fileType?.includes("pdf")) return "PDF";
  if (
    fileType?.includes("sheet") ||
    fileType?.includes("excel") ||
    fileType?.includes("csv")
  ) {
    return "EXCEL";
  }
  return "IMAGE";
}

export async function recognize(buffer: Buffer, fileType?: string, options: RecognizeOptions = {}) {
  const startedAt = Date.now();
  await new Promise((resolve) => setTimeout(resolve, 250));

  return {
    success: true,
    ocrText: sampleFor(fileType, options),
    confidence: options.purpose === "schedule" ? 0.9 : 0.88,
    processingTimeMs: Date.now() - startedAt,
    inputHash: crypto.createHash("sha256").update(buffer).digest("hex"),
    source: sourceFor(fileType),
  };
}


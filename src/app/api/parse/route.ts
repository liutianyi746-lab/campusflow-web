import { NextRequest } from "next/server";

import { corsJson, corsPreflight } from "@/lib/http/cors";

import { chat, hasDeepSeekKey } from "@/lib/ai/deepseek-client";
import { buildCoursePrompt } from "@/lib/ai/prompts/course-prompt";
import { buildGeneralPrompt } from "@/lib/ai/prompts/general-prompt";
import { DEFAULT_SCHEDULE_TEMPLATE } from "@/lib/schedule/default-template";
import { normalizeSemesterStart } from "@/lib/semester/default-semester";
import { route } from "@/lib/parser/parser-router";
import { applyTemplate } from "@/lib/parser/template-matcher";
import { localRecognize } from "@/lib/parser/local-recognizer";
import { shouldPreferDeterministicCourseParser } from "@/lib/parser/parser-strategy";
import { validateCourses, validateGeneralEvents } from "@/lib/parser/validator";
import type {
  CampusEvent,
  EventSource,
  RecognitionIntent,
  ScheduleTemplate,
} from "@/lib/types/campus-event";

type ParseBody = {
  ocrText?: string;
  naturalInput?: string;
  intent?: RecognitionIntent;
  source?: EventSource;
  semesterStart?: string;
  scheduleTemplate?: ScheduleTemplate;
};

function requestedIntent(body: ParseBody, text: string): RecognitionIntent {
  if (body.intent && body.intent !== "AUTO" && body.intent !== "NATURAL_LANGUAGE") {
    return body.intent;
  }
  return route(text);
}

function fallbackSource(body: ParseBody): EventSource {
  if (body.source) return body.source;
  return body.naturalInput ? "TEXT" : "OCR_STUB";
}

function scheduleTemplateFrom(body: ParseBody): ScheduleTemplate {
  return body.scheduleTemplate?.periods?.length
    ? body.scheduleTemplate
    : DEFAULT_SCHEDULE_TEMPLATE;
}

async function recognizeWithDeepSeek(
  text: string,
  intent: RecognitionIntent,
): Promise<{
  events: CampusEvent[];
  unrecognizedItems: string[];
}> {
  if (intent === "COURSE") {
    const { system, user } = buildCoursePrompt(text, "2025-2026 学年第二学期");
    const result = await chat({ systemPrompt: system, userMessage: user });
    return validateCourses(
      (result.courses as Array<Record<string, unknown>> | undefined) ?? [],
      "AI",
    );
  }

  const { system, user } = buildGeneralPrompt(text, intent);
  const result = await chat({ systemPrompt: system, userMessage: user });
  return validateGeneralEvents(
    (result.events as Array<Record<string, unknown>> | undefined) ?? [],
    "AI",
  );
}

export function OPTIONS(req: NextRequest) {
  return corsPreflight(req);
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ParseBody;
    const text = body.naturalInput ?? body.ocrText;
    if (!text?.trim()) {
      return corsJson(
        {
          success: false,
          error: { code: "INVALID_INPUT", message: "需要 ocrText 或 naturalInput" },
        },
        { status: 400 },
        req,
      );
    }

    const semesterStart = normalizeSemesterStart(body.semesterStart);
    const scheduleTemplate = scheduleTemplateFrom(body);
    const intent = requestedIntent(body, text);
    const source = fallbackSource(body);
    const warnings: string[] = [];

    let recognized: {
      events: CampusEvent[];
      unrecognizedItems: string[];
      warnings?: string[];
    };

    if (shouldPreferDeterministicCourseParser(text, intent)) {
      recognized = localRecognize(text, intent, source);
      warnings.push("检测到结构化课表，已保留 OCR 的星期、节次、周次、教师和地点绑定，未使用生成式模型重写。");
    } else if (hasDeepSeekKey()) {
      try {
        recognized = await recognizeWithDeepSeek(text, intent);
      } catch (error) {
        recognized = localRecognize(text, intent, source);
        warnings.push(`DeepSeek 调用失败，已使用本地规则: ${String(error)}`);
      }
    } else {
      recognized = localRecognize(text, intent, source);
      warnings.push("未配置 DEEPSEEK_API_KEY，已使用本地规则。没有写入数据库。");
    }

    const events = applyTemplate(
      recognized.events,
      scheduleTemplate,
      semesterStart,
    );
    const allWarnings = [...warnings, ...(recognized.warnings ?? [])];
    const overallConfidence =
      events.reduce((sum, event) => sum + event.confidence, 0) / events.length || 0;

    return corsJson({
      success: true,
      data: {
        events,
        courses: events.filter((event) => event.type === "COURSE"),
        rawText: text,
        intent,
        source,
        unrecognizedItems: recognized.unrecognizedItems,
        overallConfidence,
        templateApplied: events.some((event) => event.type === "COURSE"),
        warnings: allWarnings,
      },
    }, undefined, req);
  } catch (error) {
    return corsJson(
      {
        success: false,
        error: { code: "PARSE_FAILED", message: String(error) },
      },
      { status: 500 },
      req,
    );
  }
}


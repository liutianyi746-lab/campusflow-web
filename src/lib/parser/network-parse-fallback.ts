import { applyTemplate } from "./template-matcher.ts";
import { localRecognize } from "./local-recognizer.ts";
import type { CampusEvent, EventSource, RecognitionIntent, ScheduleTemplate } from "../types/campus-event.ts";

export function parseWithLocalFallback(
  text: string,
  intent: RecognitionIntent,
  source: EventSource,
  scheduleTemplate: ScheduleTemplate,
  semesterStart: string,
): CampusEvent[] {
  const recognized = localRecognize(text, intent, source);
  return applyTemplate(recognized.events, scheduleTemplate, semesterStart);
}

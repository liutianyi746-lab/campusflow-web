"use client";

import { useRouter } from "next/navigation";
import { StepIndicator } from "@/app/_components/step-indicator";
import { confidenceLabel, confidenceTone } from "@/lib/ui/course-format";
import {
  eventLocation,
  eventTypeLabel,
  eventTypeTone,
  formatEventRule,
  formatEventTime,
  sourceLabel,
} from "@/lib/ui/event-format";
import { useEventStore } from "@/stores/use-event-store";

export default function ResultPage() {
  const router = useRouter();
  const { events } = useEventStore();

  if (!events.length) {
    return (
      <div className="mx-auto max-w-2xl rounded-2xl border border-emerald-100 bg-white p-8 text-center shadow-sm">
        <h1 className="text-2xl font-black text-emerald-950">还没有生成事件</h1>
        <p className="mt-3 text-stone-600">先上传校园信息或输入文本，再回来确认时间事件。</p>
        <button
          onClick={() => router.push("/upload")}
          className="mt-6 rounded-lg bg-emerald-700 px-5 py-3 font-semibold text-white hover:bg-emerald-800"
        >
          去生成事件
        </button>
      </div>
    );
  }

  const averageConfidence = events.reduce((sum, event) => sum + event.confidence, 0) / events.length;
  const reviewCount = events.filter((event) => event.confidence < 0.85 || !event.startTime).length;
  const typeCount = new Set(events.map((event) => event.type)).size;

  return (
    <div className="workflow-page mx-auto max-w-5xl">
      <StepIndicator current="result" />
      <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">Step 2</p>
          <h1 className="mt-2 text-3xl font-black text-emerald-950">确认时间事件</h1>
          <p className="mt-3 text-stone-600">共生成 {events.length} 个事件，覆盖 {typeCount} 类校园信息。</p>
        </div>
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div className="metric-card rounded-xl border border-emerald-200/10 bg-emerald-950/40 px-4 py-3">
            <p className="text-stone-500">平均置信度</p>
            <p className="mt-1 text-2xl font-black text-emerald-900">{Math.round(averageConfidence * 100)}%</p>
          </div>
          <div className="metric-card rounded-xl border border-amber-200/10 bg-emerald-950/40 px-4 py-3">
            <p className="text-stone-500">需核对</p>
            <p className="mt-1 text-2xl font-black text-amber-700">{reviewCount}</p>
          </div>
          <div className="metric-card rounded-xl border border-cyan-200/10 bg-emerald-950/40 px-4 py-3">
            <p className="text-stone-500">事件类型</p>
            <p className="mt-1 text-2xl font-black text-sky-700">{typeCount}</p>
          </div>
        </div>
      </div>

      <div className="result-table glass-panel overflow-hidden rounded-2xl">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-sm">
            <thead className="bg-emerald-950 text-left text-white">
              <tr>
                <th className="px-4 py-3 font-semibold">事件</th>
                <th className="px-4 py-3 font-semibold">类型</th>
                <th className="px-4 py-3 font-semibold">时间</th>
                <th className="px-4 py-3 font-semibold">地点</th>
                <th className="px-4 py-3 font-semibold">规则</th>
                <th className="px-4 py-3 font-semibold">来源</th>
                <th className="px-4 py-3 font-semibold">状态</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id} className="border-b border-stone-100 last:border-b-0 hover:bg-emerald-50/50">
                  <td className="px-4 py-4 font-semibold text-emerald-950">
                    {event.title}
                    {event.description ? <p className="mt-1 text-xs font-normal text-stone-500">{event.description}</p> : null}
                  </td>
                  <td className="px-4 py-4">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${eventTypeTone(event.type)}`}>
                      {eventTypeLabel(event.type)}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-stone-700">{formatEventTime(event)}</td>
                  <td className="px-4 py-4 text-stone-600">
                    {eventLocation(event)}
                    {event.type === "EXAM" && event.seatNumber ? (
                      <p className="mt-1 text-xs text-stone-500">座位号：{event.seatNumber}</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-4 text-stone-600">{formatEventRule(event)}</td>
                  <td className="px-4 py-4 text-stone-600">{sourceLabel(event.source)}</td>
                  <td className="px-4 py-4">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${confidenceTone(event.confidence)}`}>
                      {confidenceLabel(event.confidence)} {Math.round(event.confidence * 100)}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-8 flex flex-col justify-between gap-3 sm:flex-row">
        <button
          onClick={() => router.push("/upload")}
          className="rounded-lg border border-stone-200 bg-white px-5 py-3 font-semibold text-stone-700 hover:bg-stone-50"
        >
          继续添加来源
        </button>
        <button
          onClick={() => router.push("/editor")}
          className="rounded-lg bg-emerald-700 px-6 py-3 font-semibold text-white shadow-lg shadow-emerald-100 hover:bg-emerald-800"
        >
          进入事件编辑
        </button>
      </div>
    </div>
  );
}


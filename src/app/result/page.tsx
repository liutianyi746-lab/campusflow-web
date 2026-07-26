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
import { Button, Chip, EmptyState, Stat } from "@/components/ui";
import { Icon } from "@/components/ui/icon";
import { useEventStore } from "@/stores/use-event-store";

export default function ResultPage() {
  const router = useRouter();
  const { events } = useEventStore();

  if (!events.length) {
    return (
      <EmptyState
        icon="sparkles"
        title="还没有生成事件"
        description="先上传校园信息或输入文本，再回来确认时间事件。"
        action={
          <Button variant="primary" icon="upload" onClick={() => router.push("/upload")}>
            去生成事件
          </Button>
        }
      />
    );
  }

  const averageConfidence = events.reduce((sum, event) => sum + event.confidence, 0) / events.length;
  const reviewCount = events.filter((event) => event.confidence < 0.85 || !event.startTime).length;
  const typeCount = new Set(events.map((event) => event.type)).size;

  return (
    <div className="mx-auto max-w-5xl">
      <StepIndicator current="result" />

      <header className="mb-7 flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div>
          <p className="eyebrow">Step 2</p>
          <h1 className="mt-2 text-3xl font-extrabold text-fg">确认时间事件</h1>
          <p className="mt-2.5 text-muted">
            共生成 <span className="tabular font-semibold text-fg">{events.length}</span> 个事件，覆盖{" "}
            <span className="tabular font-semibold text-fg">{typeCount}</span> 类校园信息。
          </p>
        </div>
        <div className="grid shrink-0 grid-cols-3 gap-3">
          <Stat label="平均置信度" value={`${Math.round(averageConfidence * 100)}%`} />
          <Stat label="需核对" value={reviewCount} tone={reviewCount ? "text-warn" : "text-fg"} />
          <Stat label="事件类型" value={typeCount} />
        </div>
      </header>

      {reviewCount > 0 ? (
        <div className="alert alert-warn mb-5">
          <Icon name="alert" size={18} className="mt-0.5 shrink-0" />
          <span>有 {reviewCount} 条事件置信度偏低或缺时间，建议进编辑台逐条核对后再导出。</span>
        </div>
      ) : null}

      {/* 桌面端表格 */}
      <div className="card hidden overflow-hidden md:block">
        <div className="scroll-area">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-line bg-surface-2 text-left">
                {["事件", "类型", "时间", "地点", "规则", "来源", "状态"].map((header) => (
                  <th
                    key={header}
                    className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-subtle"
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr
                  key={event.id}
                  className="border-b border-line transition-colors last:border-b-0 hover:bg-surface-2"
                >
                  <td className="px-4 py-3.5">
                    <p className="font-semibold text-fg">{event.title}</p>
                    {event.description ? (
                      <p className="mt-1 text-xs text-subtle">{event.description}</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3.5">
                    <Chip tone={eventTypeTone(event.type)}>{eventTypeLabel(event.type)}</Chip>
                  </td>
                  <td className="tabular px-4 py-3.5 text-muted">{formatEventTime(event)}</td>
                  <td className="px-4 py-3.5 text-muted">
                    {eventLocation(event)}
                    {event.type === "EXAM" && event.seatNumber ? (
                      <p className="mt-1 text-xs text-subtle">座位号：{event.seatNumber}</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3.5 text-muted">{formatEventRule(event)}</td>
                  <td className="px-4 py-3.5 text-muted">{sourceLabel(event.source)}</td>
                  <td className="px-4 py-3.5">
                    <Chip tone={confidenceTone(event.confidence)} dot>
                      {confidenceLabel(event.confidence)} {Math.round(event.confidence * 100)}%
                    </Chip>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 移动端卡片：小屏横滚表格很难用，改成卡片列表 */}
      <ul className="space-y-3 md:hidden">
        {events.map((event) => (
          <li key={event.id} className="card p-4">
            <div className="flex items-start justify-between gap-3">
              <h2 className="min-w-0 font-semibold text-fg">{event.title}</h2>
              <Chip tone={eventTypeTone(event.type)}>{eventTypeLabel(event.type)}</Chip>
            </div>
            <div className="mt-3 space-y-1.5 text-sm text-muted">
              <div className="flex gap-2">
                <Icon name="clock" size={15} className="mt-0.5 shrink-0 text-subtle" />
                <span className="tabular">{formatEventTime(event)}</span>
              </div>
              <div className="flex gap-2">
                <Icon name="pin" size={15} className="mt-0.5 shrink-0 text-subtle" />
                <span>
                  {eventLocation(event)}
                  {event.type === "EXAM" && event.seatNumber ? ` · 座位 ${event.seatNumber}` : ""}
                </span>
              </div>
              <div className="flex gap-2">
                <Icon name="refresh" size={15} className="mt-0.5 shrink-0 text-subtle" />
                <span>
                  {formatEventRule(event)} · {sourceLabel(event.source)}
                </span>
              </div>
            </div>
            <div className="mt-3">
              <Chip tone={confidenceTone(event.confidence)} dot>
                {confidenceLabel(event.confidence)} {Math.round(event.confidence * 100)}%
              </Chip>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-8 flex flex-col justify-between gap-3 sm:flex-row">
        <Button icon="arrow-left" onClick={() => router.push("/upload")}>
          继续添加来源
        </Button>
        <Button variant="primary" iconRight="arrow-right" onClick={() => router.push("/editor")}>
          进入事件编辑
        </Button>
      </div>
    </div>
  );
}

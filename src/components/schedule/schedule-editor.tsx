"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils/cn";
import { Button, Chip } from "@/components/ui";
import { Icon } from "@/components/ui/icon";
import {
  formatPeriodsAsText,
  parseScheduleTemplateText,
  periodLabel,
} from "@/lib/schedule/schedule-template-parser";
import {
  sortAndDedupePeriods,
  validatePeriods,
  type ScheduleIssue,
} from "@/lib/schedule/schedule-validation";
import { toMinutes } from "@/lib/schedule/schedule-text-normalize";
import type { Period, ScheduleTemplate } from "@/lib/types/campus-event";

type Mode = "table" | "text";

type ScheduleEditorProps = {
  template: ScheduleTemplate;
  onChange: (template: ScheduleTemplate) => void;
  onReset: () => void;
  /** 上一次识别（上传/文本）带来的问题，和本地校验合并展示 */
  externalIssues?: ScheduleIssue[];
  onClose?: () => void;
};

function durationLabel(period: Period): string {
  const minutes = toMinutes(period.endTime) - toMinutes(period.startTime);
  if (minutes <= 0) return "—";
  return `${minutes} 分钟`;
}

/** 新增一行时，按上一节的时长和课间自动往后推 */
function nextPeriod(periods: Period[]): Period {
  const last = periods[periods.length - 1];
  if (!last) {
    return { periodNumber: 1, startTime: "08:00", endTime: "08:45", label: periodLabel(1) };
  }

  const previous = periods[periods.length - 2];
  const lastDuration = toMinutes(last.endTime) - toMinutes(last.startTime);
  const gap = previous ? toMinutes(last.startTime) - toMinutes(previous.endTime) : 10;
  const duration = lastDuration > 0 ? lastDuration : 45;
  const safeGap = gap > 0 && gap <= 60 ? gap : 10;

  const start = Math.min(toMinutes(last.endTime) + safeGap, 23 * 60 + 30);
  const end = Math.min(start + duration, 23 * 60 + 59);
  const format = (value: number) =>
    `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;

  const number = last.periodNumber + 1;
  return { periodNumber: number, startTime: format(start), endTime: format(end), label: periodLabel(number) };
}

export function ScheduleEditor({
  template,
  onChange,
  onReset,
  externalIssues = [],
  onClose,
}: ScheduleEditorProps) {
  const [mode, setMode] = useState<Mode>("table");
  const [draftText, setDraftText] = useState(() => formatPeriodsAsText(template.periods));
  const [importMessage, setImportMessage] = useState("");
  const [importIssues, setImportIssues] = useState<ScheduleIssue[]>([]);

  const periods = template.periods;
  const localIssues = useMemo(() => validatePeriods(periods), [periods]);
  const allIssues = useMemo(
    () => [...externalIssues, ...importIssues, ...localIssues],
    [externalIssues, importIssues, localIssues],
  );
  const errors = allIssues.filter((issue) => issue.level === "error");
  const warnings = allIssues.filter((issue) => issue.level === "warning");

  const commit = (nextPeriods: Period[]) => {
    onChange({ ...template, periods: sortAndDedupePeriods(nextPeriods), updatedAt: new Date().toISOString() });
  };

  const updatePeriod = (index: number, patch: Partial<Period>) => {
    commit(periods.map((period, current) => (current === index ? { ...period, ...patch } : period)));
  };

  const removePeriod = (index: number) => {
    commit(periods.filter((_, current) => current !== index));
  };

  const applyText = () => {
    const result = parseScheduleTemplateText(draftText, { name: template.name, source: "MANUAL" });

    if (!result.template.periods.length) {
      setImportIssues([]);
      setImportMessage("没有识别到有效节次，请按「第一节 08:00-08:45」的格式写。");
      return;
    }

    setImportIssues(result.issues);
    setImportMessage(
      `识别到 ${result.template.periods.length} 个节次` +
        (result.stats.skippedLines ? `，跳过 ${result.stats.skippedLines} 行表头或非上课时段` : ""),
    );
    onChange({ ...template, periods: result.template.periods, updatedAt: new Date().toISOString() });
    setMode("table");
  };

  const issueForPeriod = (periodNumber: number) =>
    allIssues.find((issue) => issue.periodNumber === periodNumber);

  return (
    <section className="card p-5 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3">
          <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary-soft-fg">
            <Icon name="clock" size={18} />
          </span>
          <div>
            <h2 className="text-base font-bold text-fg">作息映射</h2>
            <p className="mt-1 text-sm leading-6 text-muted">
              课表识别出「第几节」后，按这张表换算成具体时间。改完立即生效。
            </p>
          </div>
        </div>
        {onClose ? (
          <Button size="sm" variant="ghost" onClick={onClose}>
            收起
          </Button>
        ) : null}
      </div>

      {/* 模式切换 */}
      <div className="mt-5 flex gap-1 rounded-xl bg-surface-2 p-1">
        {(
          [
            { id: "table", label: "逐节编辑", icon: "sliders" },
            { id: "text", label: "文本导入", icon: "type" },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              if (item.id === "text") setDraftText(formatPeriodsAsText(periods));
              setMode(item.id);
            }}
            aria-pressed={mode === item.id}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-semibold transition-colors",
              mode === item.id
                ? "bg-surface text-fg shadow-[var(--shadow-xs)]"
                : "text-muted hover:text-fg",
            )}
          >
            <Icon name={item.icon} size={15} />
            {item.label}
          </button>
        ))}
      </div>

      {mode === "table" ? (
        <div className="mt-5">
          {periods.length ? (
            <>
              {/* 表头：手机上隐藏，用每行的 label 代替 */}
              <div className="hidden gap-2 px-1 pb-2 text-xs font-bold uppercase tracking-wider text-subtle sm:grid sm:grid-cols-[5.5rem_1fr_1fr_4.5rem_2.25rem]">
                <span>节次</span>
                <span>开始</span>
                <span>结束</span>
                <span>时长</span>
                <span className="sr-only">操作</span>
              </div>

              <ul className="scroll-area max-h-[22rem] space-y-2">
                {periods.map((period, index) => {
                  const issue = issueForPeriod(period.periodNumber);
                  return (
                    <li
                      key={period.periodNumber}
                      className={cn(
                        "grid grid-cols-2 gap-2 rounded-xl border p-2 sm:grid-cols-[5.5rem_1fr_1fr_4.5rem_2.25rem] sm:items-center sm:border-transparent sm:p-1",
                        issue?.level === "error"
                          ? "border-danger/40 bg-danger-soft/40 sm:border-danger/40"
                          : "border-line bg-surface-2/50 sm:bg-transparent",
                      )}
                    >
                      <span className="col-span-2 text-sm font-semibold text-fg sm:col-span-1 sm:pl-2">
                        {period.label ?? periodLabel(period.periodNumber)}
                      </span>
                      <label className="block">
                        <span className="field-label mb-1 sm:sr-only">开始</span>
                        <input
                          type="time"
                          value={period.startTime}
                          onChange={(event) => updatePeriod(index, { startTime: event.target.value })}
                          className="input"
                        />
                      </label>
                      <label className="block">
                        <span className="field-label mb-1 sm:sr-only">结束</span>
                        <input
                          type="time"
                          value={period.endTime}
                          onChange={(event) => updatePeriod(index, { endTime: event.target.value })}
                          className="input"
                        />
                      </label>
                      <span className="tabular self-center text-xs text-subtle">{durationLabel(period)}</span>
                      <button
                        type="button"
                        onClick={() => removePeriod(index)}
                        aria-label={`删除${period.label ?? periodLabel(period.periodNumber)}`}
                        className="grid size-9 place-items-center justify-self-end rounded-lg text-subtle transition-colors hover:bg-danger-soft hover:text-danger"
                      >
                        <Icon name="trash" size={16} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <p className="rounded-xl border border-dashed border-line-strong px-4 py-8 text-center text-sm text-muted">
              还没有节次，点下面「添加一节」或切到「文本导入」粘贴学校作息表。
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" icon="plus" onClick={() => commit([...periods, nextPeriod(periods)])}>
              添加一节
            </Button>
            <Button size="sm" icon="refresh" onClick={onReset}>
              恢复默认作息
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-5">
          <label className="block">
            <span className="field-label">
              每行一节，支持「第一节 08:00-08:45」「1 08:00 08:45」「第一节从8点到8点45」等写法
            </span>
            <textarea
              value={draftText}
              onChange={(event) => setDraftText(event.target.value)}
              rows={10}
              className="textarea font-mono text-sm"
              placeholder={"第一节 08:00-08:45\n第二节 08:55-09:40"}
            />
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="primary" size="sm" icon="check" onClick={applyText}>
              识别并应用
            </Button>
            <Button size="sm" onClick={() => setDraftText(formatPeriodsAsText(periods))}>
              还原当前作息
            </Button>
          </div>
          {importMessage ? <p className="mt-3 text-sm text-muted">{importMessage}</p> : null}
        </div>
      )}

      {/* 校验结果 */}
      {errors.length || warnings.length ? (
        <div className="mt-5 space-y-2">
          {errors.map((issue) => (
            <div key={issue.message} className="alert alert-danger">
              <Icon name="alert" size={16} className="mt-1 shrink-0" />
              <span>{issue.message}</span>
            </div>
          ))}
          {warnings.slice(0, 4).map((issue) => (
            <div key={issue.message} className="alert alert-warn">
              <Icon name="alert" size={16} className="mt-1 shrink-0" />
              <span>{issue.message}</span>
            </div>
          ))}
          {warnings.length > 4 ? (
            <p className="text-xs text-subtle">另有 {warnings.length - 4} 条提示未展开。</p>
          ) : null}
        </div>
      ) : periods.length ? (
        <div className="mt-5 flex items-center gap-2 text-sm text-muted">
          <Chip tone="chip-emerald" dot>
            共 {periods.length} 节
          </Chip>
          <span>时间连贯，没有发现问题。</span>
        </div>
      ) : null}
    </section>
  );
}

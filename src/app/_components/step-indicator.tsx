import Link from "next/link";
import { cn } from "@/lib/utils/cn";
import { Icon } from "@/components/ui/icon";

type StepId = "upload" | "result" | "editor" | "export";

const STEPS: Array<{ id: StepId; label: string; hint: string; href: string }> = [
  { id: "upload", label: "上传", hint: "选择来源", href: "/upload" },
  { id: "result", label: "确认", hint: "核对识别", href: "/result" },
  { id: "editor", label: "编辑", hint: "修正字段", href: "/editor" },
  { id: "export", label: "导出", hint: "生成 ICS", href: "/export" },
];

export function StepIndicator({ current }: { current: StepId }) {
  const currentIndex = STEPS.findIndex((step) => step.id === current);
  const progress = (currentIndex / (STEPS.length - 1)) * 100;

  return (
    <nav aria-label="处理进度" className="mb-8">
      <ol className="relative grid grid-cols-4 gap-2">
        {/* 步骤之间的连接线，宽度跟随当前进度 */}
        <div
          aria-hidden="true"
          className="absolute left-[12.5%] right-[12.5%] top-[18px] h-0.5 rounded-full bg-line-strong"
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
            style={{ width: `${progress}%` }}
          />
        </div>

        {STEPS.map((step, index) => {
          const state = index < currentIndex ? "done" : index === currentIndex ? "active" : "idle";

          return (
            <li key={step.id} className="relative min-w-0">
              <Link
                href={step.href}
                aria-current={state === "active" ? "step" : undefined}
                className="group flex flex-col items-center gap-2 text-center"
              >
                <span
                  className={cn(
                    "grid size-9 place-items-center rounded-full border-2 text-sm font-bold transition-all duration-300",
                    state === "active" &&
                      "scale-110 border-primary bg-primary text-primary-fg shadow-[var(--shadow-primary)]",
                    state === "done" && "border-primary bg-primary/12 text-primary-soft-fg",
                    state === "idle" && "border-line-strong bg-surface text-subtle",
                  )}
                >
                  {state === "done" ? <Icon name="check" size={16} /> : index + 1}
                </span>
                <span className="min-w-0">
                  <span
                    className={cn(
                      "block truncate text-sm font-semibold transition-colors",
                      state === "idle" ? "text-subtle" : "text-fg",
                      state !== "active" && "group-hover:text-primary-soft-fg",
                    )}
                  >
                    {step.label}
                  </span>
                  <span className="mt-0.5 hidden truncate text-xs text-subtle sm:block">
                    {step.hint}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

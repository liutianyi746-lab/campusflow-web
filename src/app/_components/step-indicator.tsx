import Link from "next/link";

type StepId = "upload" | "result" | "editor" | "export";

const STEPS: Array<{ id: StepId; label: string; href: string }> = [
  { id: "upload", label: "上传", href: "/upload" },
  { id: "result", label: "确认", href: "/result" },
  { id: "editor", label: "编辑", href: "/editor" },
  { id: "export", label: "导出", href: "/export" },
];

export function StepIndicator({ current }: { current: StepId }) {
  const currentIndex = STEPS.findIndex((step) => step.id === current);

  return (
    <nav aria-label="处理进度" className="mb-8">
      <ol className="step-track grid grid-cols-4 overflow-hidden rounded-2xl border border-emerald-200/10 bg-emerald-950/35 p-1.5 text-sm backdrop-blur-xl">
        {STEPS.map((step, index) => {
          const state = index < currentIndex ? "done" : index === currentIndex ? "active" : "idle";
          return (
            <li key={step.id} className="min-w-0">
              <Link
                href={step.href}
                aria-current={state === "active" ? "step" : undefined}
                className={[
                  "flex h-11 items-center justify-center gap-2 rounded-xl px-2 font-semibold transition",
                  state === "active"
                    ? "bg-emerald-200 text-emerald-950 shadow-[0_0_24px_rgba(52,211,153,.2)]"
                    : state === "done"
                      ? "text-emerald-200 hover:bg-emerald-300/10"
                      : "text-emerald-100/35 hover:bg-white/5 hover:text-emerald-100/60",
                ].join(" ")}
              >
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-current text-xs">
                  {index + 1}
                </span>
                <span className="truncate">{step.label}</span>
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

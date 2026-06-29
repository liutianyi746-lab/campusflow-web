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
      <ol className="grid grid-cols-4 overflow-hidden rounded-lg border border-emerald-100 bg-white text-sm shadow-sm">
        {STEPS.map((step, index) => {
          const state =
            index < currentIndex ? "done" : index === currentIndex ? "active" : "idle";

          return (
            <li key={step.id} className="min-w-0 border-r border-emerald-100 last:border-r-0">
              <Link
                href={step.href}
                className={[
                  "flex h-12 items-center justify-center gap-2 px-2 font-medium transition",
                  state === "active"
                    ? "bg-emerald-700 text-white"
                    : state === "done"
                      ? "bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                      : "text-stone-400 hover:bg-stone-50",
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

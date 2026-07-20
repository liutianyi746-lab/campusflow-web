import Link from "next/link";
import { GlassPanel, GlowButton } from "@/app/_components/ui-shell";

const PREVIEW_EVENTS = [
  { title: "高等数学 A", source: "课程表截图", time: "周一 08:00", dot: "bg-cyan-300" },
  { title: "数据结构考试", source: "考试 PDF", time: "6月20日 15:00", dot: "bg-violet-300" },
  { title: "提交实验报告", source: "群通知截图", time: "6月20日 23:59", dot: "bg-rose-300" },
  { title: "班会", source: "文本输入", time: "下周五 19:00", dot: "bg-amber-300" },
];

const FLOW = [
  ["接收", "收集截图、PDF、Excel 和文本。"],
  ["识别", "判断课程、考试、作业、会议、活动或提醒。"],
  ["确认", "核对时间、地点、来源和置信度。"],
  ["导出", "生成 ICS 文件，由用户自行导入日历。"],
];

export default function LandingPage() {
  return (
    <div className="space-y-16 pb-8">
      <section className="grid min-h-[calc(100vh-10rem)] items-center gap-12 py-10 lg:grid-cols-[1.08fr_0.92fr]">
        <div className="relative max-w-2xl">
          <div className="hero-orbit absolute -left-28 -top-32 -z-10 size-96 rounded-full border border-emerald-300/10 shadow-[0_0_100px_rgba(52,211,153,.12)]" aria-hidden="true" />
          <p className="eyebrow">From campus to calendar</p>
          <h1 className="mt-5 text-4xl font-black leading-[1.08] tracking-[-0.05em] text-emerald-50 sm:text-6xl">
            让每条校园信息，<br />准时发生。
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-emerald-50/60">
            智能识别图片、PDF、Excel 和群通知中的课程、考试与截止事项，确认后一键导入你的日历。
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <GlowButton href="/upload">开始生成事件</GlowButton>
            <Link href="/editor" className="secondary-button">探索事件编辑台</Link>
          </div>
          <dl className="mt-12 grid max-w-xl grid-cols-3 gap-4 text-sm">
            {[["5 类", "输入来源"], ["1 条", "事件链路"], ["ICS", "唯一导出"]].map(([value, label]) => (
              <div key={label} className="border-l border-emerald-200/15 pl-4">
                <dt className="text-2xl font-black text-emerald-100">{value}</dt>
                <dd className="mt-1 text-emerald-100/40">{label}</dd>
              </div>
            ))}
          </dl>
        </div>

        <GlassPanel className="event-stream relative overflow-hidden p-5 sm:p-6">
          <div className="absolute right-0 top-0 size-48 rounded-full bg-emerald-300/10 blur-3xl" aria-hidden="true" />
          <div className="relative mb-6 flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-emerald-100/45">事件流预览</p>
              <h2 className="mt-1 text-xl font-black text-emerald-50">来源不同，输出一致</h2>
            </div>
            <span className="rounded-full border border-emerald-200/15 bg-emerald-300/10 px-3 py-1 text-xs font-semibold text-emerald-200">内存态</span>
          </div>
          <div className="relative grid gap-2.5">
            {PREVIEW_EVENTS.map((event) => (
              <div key={event.title} className="grid grid-cols-[6.5rem_1fr] items-center gap-3 rounded-xl border border-white/5 bg-white/[0.035] p-3 transition hover:border-emerald-200/20 hover:bg-emerald-300/[0.06]">
                <span className="font-mono text-xs text-emerald-100/40">{event.time}</span>
                <div className="flex min-w-0 items-center gap-3">
                  <span className={`size-2 shrink-0 rounded-full shadow-[0_0_12px_currentColor] ${event.dot}`} />
                  <div className="min-w-0"><p className="truncate font-semibold text-emerald-50">{event.title}</p><p className="mt-0.5 text-xs text-emerald-100/40">{event.source}</p></div>
                </div>
              </div>
            ))}
          </div>
          <div className="relative mt-5 rounded-xl border border-emerald-200/10 bg-emerald-950/65 p-4">
            <p className="text-xs font-bold uppercase tracking-widest text-emerald-300">导出后</p>
            <p className="mt-2 font-semibold leading-6 text-emerald-50/80">课程自动重复，考试和截止时间按单次事件提醒。</p>
          </div>
        </GlassPanel>
      </section>

      <section>
        <div className="mb-6 flex items-end justify-between gap-6"><div><p className="eyebrow">One clear flow</p><h2 className="mt-2 text-2xl font-black text-emerald-50">从信息到日历，只需四步</h2></div><span className="hidden text-sm text-emerald-100/35 sm:block">无需登录 · 不保存原始文件</span></div>
        <div className="grid gap-4 md:grid-cols-4">
          {FLOW.map(([title, description], index) => (
            <GlassPanel key={title} className="shine-card p-5">
              <span className="text-xs font-black tracking-widest text-emerald-300">0{index + 1}</span>
              <h3 className="mt-7 text-lg font-bold text-emerald-50">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-emerald-100/45">{description}</p>
            </GlassPanel>
          ))}
        </div>
      </section>
    </div>
  );
}

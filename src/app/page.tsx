"use client";

import { useRouter } from "next/navigation";

const PREVIEW_EVENTS = [
  { title: "高等数学 A", source: "课程表截图", time: "周一 08:00", color: "bg-sky-100 text-sky-800" },
  { title: "数据结构考试", source: "考试 PDF", time: "6月20日 15:00", color: "bg-rose-100 text-rose-800" },
  { title: "提交实验报告", source: "群通知截图", time: "6月20日 23:59", color: "bg-amber-100 text-amber-800" },
  { title: "班会", source: "文本输入", time: "下周五 19:00", color: "bg-violet-100 text-violet-800" },
];

export default function LandingPage() {
  const router = useRouter();

  return (
    <div className="space-y-12">
      <section className="grid min-h-[calc(100vh-11rem)] items-center gap-10 py-8 lg:grid-cols-[1fr_0.9fr]">
        <div className="max-w-2xl">
          <p className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">
            Campus event generator
          </p>
          <h1 className="text-4xl font-black leading-tight text-emerald-950 sm:text-6xl">
            所有校园信息，都变成可执行时间事件。
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-stone-600">
            图片、PDF、Excel、文本和微信/QQ群截图都会进入同一条事件生成链路，
            最后只导出 ICS 文件，不登录、不建用户系统、不做数据库持久化。
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <button
              onClick={() => router.push("/upload")}
              className="rounded-lg bg-emerald-700 px-6 py-3 font-semibold text-white shadow-lg shadow-emerald-100 transition hover:bg-emerald-800"
            >
              开始生成事件
            </button>
            <button
              onClick={() => router.push("/editor")}
              className="rounded-lg border border-emerald-200 bg-white px-6 py-3 font-semibold text-emerald-800 transition hover:bg-emerald-50"
            >
              查看事件编辑台
            </button>
          </div>
          <dl className="mt-10 grid max-w-xl grid-cols-3 gap-4 text-sm">
            {[
              ["5类", "输入来源"],
              ["1条", "事件链路"],
              ["ICS", "唯一导出"],
            ].map(([value, label]) => (
              <div key={label} className="border-l border-emerald-200 pl-4">
                <dt className="text-2xl font-black text-emerald-900">{value}</dt>
                <dd className="mt-1 text-stone-500">{label}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-xl shadow-emerald-950/5">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-stone-500">事件流预览</p>
              <h2 className="text-xl font-black text-emerald-950">来源不同，输出一致</h2>
            </div>
            <span className="rounded-full bg-lime-100 px-3 py-1 text-xs font-semibold text-lime-800">
              内存态
            </span>
          </div>
          <div className="grid gap-3">
            {PREVIEW_EVENTS.map((event) => (
              <div
                key={event.title}
                className="grid grid-cols-[104px_1fr] items-center gap-3 rounded-lg border border-stone-100 bg-stone-50/70 p-3"
              >
                <span className="font-mono text-sm text-stone-500">{event.time}</span>
                <div className={`rounded-md px-3 py-2 ${event.color}`}>
                  <p className="font-semibold">{event.title}</p>
                  <p className="mt-0.5 text-xs opacity-80">{event.source}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-5 rounded-lg bg-emerald-950 p-4 text-white">
            <p className="text-sm text-emerald-100">导出后</p>
            <p className="mt-1 text-lg font-bold">课程自动重复，考试和截止时间按单次事件提醒。</p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        {[
          ["接收", "收集截图、PDF、Excel 和文本。"],
          ["识别", "判断课程、考试、作业、会议、活动或提醒。"],
          ["确认", "核对时间、地点、来源和置信度。"],
          ["导出", "生成 ICS 文件，由用户自行导入日历。"],
        ].map(([title, description], index) => (
          <article key={title} className="rounded-lg border border-emerald-100 bg-white p-5 shadow-sm">
            <span className="text-xs font-black text-emerald-700">0{index + 1}</span>
            <h3 className="mt-3 font-bold text-emerald-950">{title}</h3>
            <p className="mt-2 text-sm leading-6 text-stone-600">{description}</p>
          </article>
        ))}
      </section>
    </div>
  );
}


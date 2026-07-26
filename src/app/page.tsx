import Link from "next/link";
import { Icon, type IconName } from "@/components/ui/icon";

const PREVIEW_EVENTS: Array<{
  title: string;
  source: string;
  time: string;
  tone: string;
  icon: IconName;
}> = [
  { title: "高等数学 A", source: "课程表截图", time: "周一 08:00", tone: "chip-sky", icon: "image" },
  { title: "数据结构考试", source: "考试 PDF", time: "6月20日 15:00", tone: "chip-rose", icon: "file-text" },
  { title: "提交实验报告", source: "群通知截图", time: "6月20日 23:59", tone: "chip-amber", icon: "message" },
  { title: "班会", source: "文本输入", time: "下周五 19:00", tone: "chip-violet", icon: "type" },
];

const STEPS: Array<{ title: string; description: string; icon: IconName }> = [
  { title: "接收", description: "收集截图、PDF、Excel 和文本，六种来源走同一个入口。", icon: "upload" },
  { title: "识别", description: "判断课程、考试、作业、会议、活动或提醒，并给出置信度。", icon: "sparkles" },
  { title: "确认", description: "核对时间、地点和来源，低置信的条目会被单独标出来。", icon: "check-circle" },
  { title: "导出", description: "生成 ICS 文件，由你自己导入系统日历，全程不留数据。", icon: "download" },
];

const SOURCES: Array<{ label: string; icon: IconName }> = [
  { label: "课表截图", icon: "image" },
  { label: "考试 PDF", icon: "file-text" },
  { label: "教务 Excel", icon: "table" },
  { label: "群通知", icon: "message" },
  { label: "自然语言", icon: "type" },
  { label: "作息表", icon: "clock" },
];

export default function LandingPage() {
  return (
    <div className="space-y-20 sm:space-y-24">
      {/* ---------------------------------------------------- Hero */}
      <section className="aurora relative -mt-8 pt-8 sm:-mt-10 sm:pt-10">
        <div
          aria-hidden="true"
          className="grid-lines pointer-events-none absolute inset-x-0 -top-16 -z-10 h-[420px]"
        />

        <div className="grid items-center gap-12 py-6 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10">
          <div className="animate-rise max-w-2xl">
            <span className="chip chip-emerald chip-dot">Campus event generator</span>

            <h1 className="mt-5 text-[2.25rem] font-extrabold leading-[1.12] text-fg sm:text-5xl lg:text-[3.5rem]">
              所有校园信息，
              <br className="hidden sm:block" />
              都变成
              <span className="relative whitespace-nowrap text-primary">
                可执行时间事件
                <svg
                  aria-hidden="true"
                  viewBox="0 0 300 12"
                  preserveAspectRatio="none"
                  className="absolute -bottom-1 left-0 h-2.5 w-full text-accent/55"
                >
                  <path
                    d="M2 8.5C60 3 120 2.5 180 5c40 1.6 80 3.6 118 4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="4"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
              。
            </h1>

            <p className="mt-7 max-w-xl text-[1.0625rem] leading-8 text-muted">
              图片、PDF、Excel、文本和微信 / QQ 群截图都会进入同一条事件生成链路，
              最后只导出 ICS 文件——不登录、不建用户系统、不做数据库持久化。
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/upload" className="btn btn-primary btn-lg">
                <Icon name="sparkles" size={18} />
                开始生成事件
              </Link>
              <Link href="/editor" className="btn btn-secondary btn-lg">
                查看事件编辑台
                <Icon name="arrow-right" size={18} />
              </Link>
            </div>

            <dl className="mt-10 grid max-w-lg grid-cols-3 gap-4">
              {[
                ["6类", "输入来源"],
                ["1条", "事件链路"],
                ["ICS", "唯一导出"],
              ].map(([value, label]) => (
                <div key={label} className="border-l-2 border-primary/30 pl-4">
                  <dt className="tabular text-2xl font-extrabold text-fg">{value}</dt>
                  <dd className="mt-1 text-sm text-muted">{label}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* 事件流预览卡 */}
          <div className="animate-rise card p-4 shadow-[var(--shadow-lg)] [animation-delay:120ms] sm:p-5">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-subtle">
                  事件流预览
                </p>
                <h2 className="mt-1 text-lg font-bold text-fg">来源不同，输出一致</h2>
              </div>
              <span className="chip chip-lime chip-dot">内存态</span>
            </div>

            <ul className="space-y-2.5">
              {PREVIEW_EVENTS.map((event, index) => (
                <li
                  key={event.title}
                  className="animate-rise flex items-center gap-3 rounded-xl border border-line bg-surface-2 p-3 transition-colors hover:border-primary/30"
                  style={{ animationDelay: `${200 + index * 90}ms` }}
                >
                  <span className={`chip ${event.tone} size-9 justify-center rounded-xl !px-0`}>
                    <Icon name={event.icon} size={17} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-fg">{event.title}</p>
                    <p className="mt-0.5 truncate text-xs text-subtle">{event.source}</p>
                  </div>
                  <time className="tabular shrink-0 text-xs font-medium text-muted">
                    {event.time}
                  </time>
                </li>
              ))}
            </ul>

            <div className="callout-primary mt-4">
              <p className="text-xs font-semibold uppercase tracking-wider opacity-75">导出之后</p>
              <p className="mt-1.5 text-[0.9375rem] font-semibold leading-6">
                课程自动按周重复，考试和截止时间按单次事件提醒。
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------- 支持来源 */}
      <section>
        <div className="flex flex-col gap-2 text-center">
          <p className="eyebrow">Inputs</p>
          <h2 className="text-2xl font-extrabold text-fg sm:text-3xl">六种来源，一个入口</h2>
        </div>
        <ul className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {SOURCES.map((source) => (
            <li
              key={source.label}
              className="card card-lift flex flex-col items-center gap-2.5 px-3 py-5 text-center"
            >
              <span className="grid size-10 place-items-center rounded-xl bg-primary-soft text-primary-soft-fg">
                <Icon name={source.icon} size={19} />
              </span>
              <span className="text-sm font-semibold text-fg">{source.label}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* ---------------------------------------------------- 四步流程 */}
      <section>
        <div className="flex flex-col gap-2 text-center">
          <p className="eyebrow">Pipeline</p>
          <h2 className="text-2xl font-extrabold text-fg sm:text-3xl">从一张截图到一条日程</h2>
          <p className="mx-auto mt-1 max-w-lg text-muted">
            每一步都可以回退，识别不准的地方在编辑台逐条改。
          </p>
        </div>

        <ol className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, index) => (
            <li key={step.title} className="card card-lift relative p-5">
              <span className="tabular absolute right-4 top-4 text-3xl font-extrabold text-primary/12">
                0{index + 1}
              </span>
              <span className="grid size-10 place-items-center rounded-xl bg-primary-soft text-primary-soft-fg">
                <Icon name={step.icon} size={19} />
              </span>
              <h3 className="mt-4 font-bold text-fg">{step.title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted">{step.description}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ---------------------------------------------------- CTA */}
      <section className="card relative overflow-hidden px-6 py-12 text-center sm:px-12">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 opacity-70"
          style={{
            background:
              "radial-gradient(60% 120% at 50% 0%, hsl(var(--primary) / 0.16), transparent 70%)",
          }}
        />
        <h2 className="text-2xl font-extrabold text-fg sm:text-3xl">先拿一张课表截图试试</h2>
        <p className="mx-auto mt-3 max-w-md text-muted">
          不需要注册，识别结果只存在这一次会话里，关掉页面就没了。
        </p>
        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
          <Link href="/upload" className="btn btn-primary btn-lg">
            上传课表
            <Icon name="arrow-right" size={18} />
          </Link>
          <Link href="/upload" className="btn btn-secondary btn-lg">
            用示例数据体验
          </Link>
        </div>
      </section>
    </div>
  );
}

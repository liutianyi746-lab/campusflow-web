"use client";

import { useRouter } from "next/navigation";
import { StepIndicator } from "@/app/_components/step-indicator";
import { Button } from "@/components/ui";
import { Icon, type IconName } from "@/components/ui/icon";

const CALENDARS: Array<{ name: string; step: string; icon: IconName }> = [
  {
    name: "Apple Calendar",
    step: "双击下载的 .ics 文件，选择日历并导入。",
    icon: "calendar",
  },
  {
    name: "Google Calendar",
    step: "进入设置，选择导入与导出，再上传 .ics 文件。",
    icon: "upload",
  },
  {
    name: "Outlook",
    step: "打开日历，选择添加日历，导入本地 .ics 文件。",
    icon: "layers",
  },
];

export default function ExportPage() {
  const router = useRouter();

  return (
    <div className="mx-auto max-w-4xl">
      <StepIndicator current="export" />

      <section className="card animate-rise relative overflow-hidden px-6 py-12 text-center sm:px-10">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(65% 110% at 50% 0%, hsl(var(--primary) / 0.16), transparent 70%)",
          }}
        />
        <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-primary text-primary-fg shadow-[var(--shadow-primary)]">
          <Icon name="check" size={30} />
        </div>
        <h1 className="mt-6 text-3xl font-extrabold text-fg">校园事件 ICS 已生成</h1>
        <p className="mx-auto mt-3 max-w-md leading-7 text-muted">
          文件已经下载到本地。这是唯一导出方式；系统不会同步原生日历，也不会保存你的数据。
        </p>
        <div className="mx-auto mt-6 w-fit">
          <span className="chip chip-emerald chip-dot">campusflow-events.ics</span>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-subtle">
          导入到你的日历
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          {CALENDARS.map((calendar) => (
            <article key={calendar.name} className="card card-lift p-5">
              <span className="grid size-10 place-items-center rounded-xl bg-primary-soft text-primary-soft-fg">
                <Icon name={calendar.icon} size={19} />
              </span>
              <h3 className="mt-4 font-bold text-fg">{calendar.name}</h3>
              <p className="mt-2 text-sm leading-6 text-muted">{calendar.step}</p>
            </article>
          ))}
        </div>
      </section>

      <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
        <Button icon="arrow-left" onClick={() => router.push("/editor")}>
          返回编辑台
        </Button>
        <Button variant="primary" icon="sparkles" onClick={() => router.push("/")}>
          回到首页
        </Button>
      </div>
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { StepIndicator } from "@/app/_components/step-indicator";

const CALENDARS = [
  {
    name: "Apple Calendar",
    step: "双击下载的 .ics 文件，选择日历并导入。",
  },
  {
    name: "Google Calendar",
    step: "进入设置，选择导入与导出，再上传 .ics 文件。",
  },
  {
    name: "Outlook",
    step: "打开日历，选择添加日历，导入本地 .ics 文件。",
  },
];

export default function ExportPage() {
  const router = useRouter();

  return (
    <div className="mx-auto max-w-4xl">
      <StepIndicator current="export" />
      <section className="rounded-2xl border border-emerald-100 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto grid size-20 place-items-center rounded-2xl bg-lime-200 text-4xl font-black text-emerald-950">
          ICS
        </div>
        <h1 className="mt-6 text-3xl font-black text-emerald-950">校园事件 ICS 已生成</h1>
        <p className="mx-auto mt-3 max-w-xl text-stone-600">
          文件已经下载到本地。这是唯一导出方式；系统不会同步原生日历，也不会保存用户数据。
        </p>
      </section>

      <section className="mt-8 grid gap-4 md:grid-cols-3">
        {CALENDARS.map((calendar) => (
          <article key={calendar.name} className="rounded-lg border border-emerald-100 bg-white p-5 shadow-sm">
            <h2 className="font-bold text-emerald-950">{calendar.name}</h2>
            <p className="mt-3 text-sm leading-6 text-stone-600">{calendar.step}</p>
          </article>
        ))}
      </section>

      <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
        <button
          onClick={() => router.push("/editor")}
          className="rounded-lg border border-stone-200 bg-white px-5 py-3 font-semibold text-stone-700 hover:bg-stone-50"
        >
          返回编辑台
        </button>
        <button
          onClick={() => router.push("/")}
          className="rounded-lg bg-emerald-700 px-5 py-3 font-semibold text-white hover:bg-emerald-800"
        >
          回到首页
        </button>
      </div>
    </div>
  );
}

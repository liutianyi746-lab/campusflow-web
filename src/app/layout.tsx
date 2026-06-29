import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "CampusFlow AI - 校园时间事件生成器",
  description: "将课程表、考试、作业、通知和文本转化为可导出的 ICS 时间事件。",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" data-scroll-behavior="smooth">
      <body className="min-h-screen antialiased">
        <header className="sticky top-0 z-50 border-b border-emerald-100 bg-white/90 backdrop-blur">
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
            <Link href="/" className="flex items-center gap-3 font-bold text-emerald-900">
              <span className="grid size-9 grid-cols-2 gap-0.5 rounded-lg bg-emerald-800 p-1 shadow-sm">
                <span className="rounded-sm bg-lime-300" />
                <span className="rounded-sm bg-sky-300" />
                <span className="rounded-sm bg-amber-300" />
                <span className="rounded-sm bg-white" />
              </span>
              <span>CampusFlow AI</span>
            </Link>
            <nav className="flex items-center gap-1 text-sm font-medium text-stone-600">
              <Link href="/upload" className="rounded-md px-3 py-2 hover:bg-emerald-50 hover:text-emerald-800">
                生成
              </Link>
              <Link href="/editor" className="rounded-md px-3 py-2 hover:bg-emerald-50 hover:text-emerald-800">
                编辑
              </Link>
              <Link href="/export" className="rounded-md px-3 py-2 hover:bg-emerald-50 hover:text-emerald-800">
                导出
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">{children}</main>
        <footer className="mx-auto mt-16 max-w-6xl border-t border-emerald-100 px-4 py-8 text-sm text-stone-500 sm:px-6 lg:px-8">
          <div className="flex flex-col justify-between gap-2 sm:flex-row">
            <span>CampusFlow AI</span>
            <span>无登录、无数据库持久化、仅 ICS 导出。</span>
          </div>
        </footer>
      </body>
    </html>
  );
}



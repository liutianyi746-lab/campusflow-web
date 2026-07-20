import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";
import { MOBILE_POLYFILL_SCRIPT } from "@/lib/browser/mobile-polyfill-script";
import "./globals.css";

export const metadata: Metadata = {
  title: "CampusFlow AI - 校园时间事件生成器",
  description: "将课程表、考试、作业、通知和文本转化为可导出的 ICS 时间事件。",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" data-scroll-behavior="smooth">
      <head>
        <Script
          id="campusflow-mobile-polyfills"
          strategy="beforeInteractive"
        >
          {MOBILE_POLYFILL_SCRIPT}
        </Script>
      </head>
      <body className="min-h-screen antialiased">
        <div className="ambient-grid" aria-hidden="true" />
        <header className="glass-nav sticky top-0 z-50 border-b border-emerald-200/10 bg-[#06110d]/80 backdrop-blur-xl">
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
            <Link href="/" className="group flex items-center gap-3 font-bold text-emerald-50">
              <span className="grid size-9 place-items-center rounded-full border border-emerald-300/30 bg-emerald-300/10 shadow-[0_0_25px_rgba(52,211,153,.2)]">
                <span className="size-2.5 rounded-full bg-emerald-200 shadow-[0_0_14px_#6ee7b7] transition group-hover:scale-125" />
              </span>
              <span>CampusFlow AI</span>
            </Link>
            <nav className="flex items-center gap-1 text-sm font-medium text-emerald-100/65">
              <Link href="/upload" className="rounded-lg px-3 py-2 transition hover:bg-emerald-300/10 hover:text-emerald-100">
                生成
              </Link>
              <Link href="/editor" className="rounded-lg px-3 py-2 transition hover:bg-emerald-300/10 hover:text-emerald-100">
                编辑
              </Link>
              <Link href="/export" className="rounded-lg px-3 py-2 transition hover:bg-emerald-300/10 hover:text-emerald-100">
                导出
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">{children}</main>
        <footer className="mx-auto mt-16 max-w-6xl border-t border-emerald-200/10 px-4 py-8 text-sm text-emerald-100/45 sm:px-6 lg:px-8">
          <div className="flex flex-col justify-between gap-2 sm:flex-row">
            <span>CampusFlow AI</span>
            <span>无登录、无数据库持久化、仅 ICS 导出。</span>
          </div>
        </footer>
      </body>
    </html>
  );
}



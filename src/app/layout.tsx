import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { MOBILE_POLYFILL_SCRIPT } from "@/lib/browser/mobile-polyfill-script";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { THEME_INIT_SCRIPT } from "@/components/layout/theme-toggle";
import "./globals.css";

export const metadata: Metadata = {
  title: "CampusFlow AI - 校园时间事件生成器",
  description: "将课程表、考试、作业、通知和文本转化为可导出的 ICS 时间事件。",
  // iPhone 上「添加到主屏幕」后按独立应用显示
  appleWebApp: {
    capable: true,
    title: "CampusFlow",
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    // 关掉 iOS 把课表里的数字识别成电话号码后加蓝色下划线
    telephone: false,
    date: false,
    address: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // 让内容延伸到刘海/灵动岛区域，再用 env(safe-area-inset-*) 单独留白
  viewportFit: "cover",
  // 不锁 maximumScale，保留 iOS 上的双指缩放（无障碍要求）
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7fbf9" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1412" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        {/* 主题要在首屏绘制前决定，所以用原生 script 同步注入 */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <Script id="campusflow-mobile-polyfills" strategy="beforeInteractive">
          {MOBILE_POLYFILL_SCRIPT}
        </Script>
      </head>
      {/* 不用 min-h-screen：100vh 在 iOS 上会把折叠的地址栏也算进去，改由 globals.css 的 100svh 处理 */}
      <body className="antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-fg"
        >
          跳到主要内容
        </a>
        <SiteHeader />
        <main id="main" className="safe-x mx-auto max-w-6xl py-8 sm:px-6 sm:py-10 lg:px-8">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}

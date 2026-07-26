"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { Icon, type IconName } from "@/components/ui/icon";
import { ThemeToggle } from "@/components/layout/theme-toggle";

const NAV: Array<{ href: string; label: string; icon: IconName }> = [
  { href: "/upload", label: "生成", icon: "upload" },
  { href: "/result", label: "确认", icon: "check-circle" },
  { href: "/editor", label: "编辑", icon: "sliders" },
  { href: "/export", label: "导出", icon: "download" },
];

export function SiteHeader() {
  const pathname = usePathname() ?? "/";

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-bg/80 backdrop-blur-xl">
      <div className="safe-x mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="group flex shrink-0 items-center gap-2.5 rounded-lg font-bold text-fg"
        >
          <span className="relative grid size-9 grid-cols-2 gap-[3px] rounded-xl bg-primary p-1.5 shadow-[var(--shadow-primary)] transition-transform duration-300 group-hover:scale-105">
            <span className="rounded-[3px] bg-accent" />
            <span className="rounded-[3px] bg-primary-fg/85" />
            <span className="rounded-[3px] bg-primary-fg/45" />
            <span className="rounded-[3px] bg-primary-fg" />
          </span>
          <span className="text-[15px] tracking-tight">
            CampusFlow<span className="ml-1 text-primary">AI</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-0.5 sm:flex" aria-label="主导航">
          {NAV.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition-colors",
                  active
                    ? "bg-primary-soft text-primary-soft-fg"
                    : "text-muted hover:bg-surface-2 hover:text-fg",
                )}
              >
                <Icon name={item.icon} size={15} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link href="/upload" className="btn btn-primary btn-sm hidden sm:inline-flex">
            开始生成
          </Link>
        </div>
      </div>

      {/* 手机上主导航固定在底部，落在拇指可达区，并避开 iPhone 的 home indicator */}
      <nav className="tabbar sm:hidden" aria-label="移动端导航">
        {NAV.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className="tabbar-item"
            >
              <Icon name={item.icon} size={19} />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}

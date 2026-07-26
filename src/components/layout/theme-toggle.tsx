"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/icon";

export const THEME_STORAGE_KEY = "campusflow-theme";

/**
 * 在 <head> 里同步执行，先于首屏绘制决定主题，避免深色模式闪白。
 */
export const THEME_INIT_SCRIPT = `(function(){try{var k="${THEME_STORAGE_KEY}";var s=localStorage.getItem(k);var d=window.matchMedia("(prefers-color-scheme: dark)").matches;var t=s==="dark"||s==="light"?s:(d?"dark":"light");document.documentElement.classList.toggle("dark",t==="dark");document.documentElement.style.colorScheme=t;}catch(e){}})();`;

type Theme = "light" | "dark";

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const initial: Theme = stored === "dark" || stored === "light" ? stored : prefersDark ? "dark" : "light";
    setTheme(initial);
    setMounted(true);
  }, []);

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* 无痕模式下忽略写入失败 */
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === "dark" ? "切换到浅色模式" : "切换到深色模式"}
      title={theme === "dark" ? "切换到浅色模式" : "切换到深色模式"}
      className="grid size-9 place-items-center rounded-xl border border-line text-muted transition-colors hover:border-primary/45 hover:bg-primary/8 hover:text-primary-soft-fg"
    >
      {/* 未挂载前不渲染图标，避免服务端/客户端主题不一致告警 */}
      {mounted ? <Icon name={theme === "dark" ? "sun" : "moon"} size={17} /> : <span className="size-[17px]" />}
    </button>
  );
}

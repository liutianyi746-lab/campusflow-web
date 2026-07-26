import Link from "next/link";
import { Icon } from "@/components/ui/icon";

const PROMISES = [
  { icon: "shield", text: "不登录、不建用户系统" },
  { icon: "layers", text: "只用内存态，不落库" },
  { icon: "download", text: "唯一导出格式 ICS" },
] as const;

export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-line">
      <div className="safe-x mx-auto flex max-w-6xl flex-col gap-6 py-10 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <div>
          <p className="font-bold text-fg">CampusFlow AI</p>
          <p className="mt-1.5 text-sm text-muted">把校园里散落的信息，收成一条时间线。</p>
        </div>

        <ul className="flex flex-wrap gap-x-6 gap-y-2.5">
          {PROMISES.map((item) => (
            <li key={item.text} className="flex items-center gap-2 text-sm text-muted">
              <Icon name={item.icon} size={15} className="text-primary" />
              {item.text}
            </li>
          ))}
        </ul>

        <Link
          href="/upload"
          className="text-sm font-semibold text-primary-soft-fg transition-opacity hover:opacity-75"
        >
          开始生成 →
        </Link>
      </div>
    </footer>
  );
}

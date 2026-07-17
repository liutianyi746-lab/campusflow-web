import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

export function GlassPanel({ className, ...props }: ComponentPropsWithoutRef<"section">) {
  return <section className={cn("glass-panel", className)} {...props} />;
}

export function PageIntro({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-intro">
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      <p>{description}</p>
      {actions ? <div className="mt-6">{actions}</div> : null}
    </header>
  );
}

export function GlowButton({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link href={href} className={cn("glow-button", className)}>
      <span>{children}</span>
      <span aria-hidden="true">↗</span>
    </Link>
  );
}

import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils/cn";
import { Icon, type IconName } from "@/components/ui/icon";

/* ---------------------------------------------- Button */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: "btn-primary",
  secondary: "btn-secondary",
  ghost: "btn-ghost",
  danger: "btn-danger",
};

const SIZE_CLASS: Record<ButtonSize, string> = {
  sm: "btn-sm",
  md: "",
  lg: "btn-lg",
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  iconRight?: IconName;
  block?: boolean;
};

export function Button({
  variant = "secondary",
  size = "md",
  icon,
  iconRight,
  block,
  className,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn("btn", VARIANT_CLASS[variant], SIZE_CLASS[size], block && "btn-block", className)}
      {...rest}
    >
      {icon ? <Icon name={icon} size={size === "sm" ? 15 : 17} /> : null}
      {children}
      {iconRight ? <Icon name={iconRight} size={size === "sm" ? 15 : 17} /> : null}
    </button>
  );
}

/* ---------------------------------------------- Card */

type CardProps = HTMLAttributes<HTMLDivElement> & {
  quiet?: boolean;
  lift?: boolean;
};

export function Card({ quiet, lift, className, children, ...rest }: CardProps) {
  return (
    <div className={cn(quiet ? "card-quiet" : "card", lift && "card-lift", className)} {...rest}>
      {children}
    </div>
  );
}

type SectionCardProps = {
  title: ReactNode;
  description?: ReactNode;
  icon?: IconName;
  action?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children?: ReactNode;
};

export function SectionCard({
  title,
  description,
  icon,
  action,
  className,
  bodyClassName,
  children,
}: SectionCardProps) {
  return (
    <section className={cn("card p-5 sm:p-6", className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-3">
          {icon ? (
            <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary-soft-fg">
              <Icon name={icon} size={18} />
            </span>
          ) : null}
          <div className="min-w-0">
            <h2 className="text-base font-bold text-fg">{title}</h2>
            {description ? (
              <p className="mt-1 text-sm leading-6 text-muted">{description}</p>
            ) : null}
          </div>
        </div>
        {action ? <div className="flex shrink-0 flex-wrap gap-2">{action}</div> : null}
      </div>
      {children ? <div className={cn("mt-5", bodyClassName)}>{children}</div> : null}
    </section>
  );
}

/* ---------------------------------------------- Chip */

export function Chip({
  tone = "chip-neutral",
  dot,
  className,
  children,
}: {
  tone?: string;
  dot?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return <span className={cn("chip", tone, dot && "chip-dot", className)}>{children}</span>;
}

/* ---------------------------------------------- Stat */

export function Stat({
  label,
  value,
  hint,
  tone = "text-fg",
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  tone?: string;
}) {
  return (
    <div className="card px-4 py-3">
      <p className="text-xs font-semibold tracking-wide text-subtle">{label}</p>
      <p className={cn("tabular mt-1 text-2xl font-extrabold", tone)}>{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-subtle">{hint}</p> : null}
    </div>
  );
}

/* ---------------------------------------------- Empty state */

export function EmptyState({
  icon = "sparkles",
  title,
  description,
  action,
}: {
  icon?: IconName;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-xl animate-rise text-center">
      <div className="card px-6 py-12 sm:px-10">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-primary-soft text-primary-soft-fg">
          <Icon name={icon} size={26} />
        </span>
        <h1 className="mt-5 text-xl font-extrabold text-fg sm:text-2xl">{title}</h1>
        <p className="mx-auto mt-2.5 max-w-sm text-sm leading-6 text-muted">{description}</p>
        {action ? <div className="mt-6 flex justify-center gap-3">{action}</div> : null}
      </div>
    </div>
  );
}

/* ---------------------------------------------- Spinner */

export function Spinner({ size = 40 }: { size?: number }) {
  return (
    <span
      role="status"
      aria-label="加载中"
      className="inline-block animate-spin rounded-full border-[3px] border-line-strong border-t-primary"
      style={{ width: size, height: size }}
    />
  );
}

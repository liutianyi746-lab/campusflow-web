import type { ReactNode, SVGProps } from "react";

/**
 * 轻量图标集：全部内联 SVG，不引入任何图标库依赖。
 * 统一 24x24 视窗、1.75 描边、round 端点，保证视觉重量一致。
 */

export type IconName =
  | "image"
  | "file-text"
  | "table"
  | "message"
  | "type"
  | "clock"
  | "calendar"
  | "upload"
  | "check"
  | "check-circle"
  | "chevron-right"
  | "arrow-right"
  | "arrow-left"
  | "alert"
  | "sun"
  | "moon"
  | "download"
  | "sparkles"
  | "trash"
  | "plus"
  | "sliders"
  | "pin"
  | "refresh"
  | "menu"
  | "close"
  | "shield"
  | "layers";

const PATHS: Record<IconName, ReactNode> = {
  image: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <circle cx="8.5" cy="9.5" r="1.5" />
      <path d="m3.5 17 4.6-4.3a2 2 0 0 1 2.7 0L20.5 21" />
    </>
  ),
  "file-text": (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6M9 17h4" />
    </>
  ),
  table: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <path d="M3 10h18M9 10v10" />
    </>
  ),
  message: (
    <>
      <path d="M20 14a2 2 0 0 1-2 2H8l-4 3.5V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z" />
      <path d="M8.5 9.5h7M8.5 12.5h4" />
    </>
  ),
  type: (
    <>
      <path d="M4 6.5V5h16v1.5M12 5v14M9 19h6" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 1.8" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
      <path d="M3.5 10h17M8 3.5v3M16 3.5v3" />
    </>
  ),
  upload: (
    <>
      <path d="M12 16V4.5M7.5 9 12 4.5 16.5 9" />
      <path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15" />
    </>
  ),
  check: <path d="m5 13 4.5 4.5L19 7" />,
  "check-circle": (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8.5 12.2 2.5 2.5 4.5-5" />
    </>
  ),
  "chevron-right": <path d="m9.5 6 6 6-6 6" />,
  "arrow-right": <path d="M4.5 12h15m-6-6 6 6-6 6" />,
  "arrow-left": <path d="M19.5 12h-15m6-6-6 6 6 6" />,
  alert: (
    <>
      <path d="M10.3 4.3 2.8 17.5A2 2 0 0 0 4.5 20.5h15a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9.5v4M12 17h.01" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2.5 12h2M19.5 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
    </>
  ),
  moon: <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />,
  download: (
    <>
      <path d="M12 4.5V16m-4.5-4.5L12 16l4.5-4.5" />
      <path d="M4 16.5v2A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5v-2" />
    </>
  ),
  sparkles: (
    <>
      <path d="M12 3.5 13.6 8.4 18.5 10 13.6 11.6 12 16.5 10.4 11.6 5.5 10 10.4 8.4 12 3.5Z" />
      <path d="M18.5 15.5l.7 2.1 2.1.7-2.1.7-.7 2.1-.7-2.1-2.1-.7 2.1-.7.7-2.1Z" />
    </>
  ),
  trash: (
    <>
      <path d="M4.5 7h15M9.5 7V5.5A1.5 1.5 0 0 1 11 4h2a1.5 1.5 0 0 1 1.5 1.5V7" />
      <path d="M6.5 7l.8 12A1.5 1.5 0 0 0 8.8 20.5h6.4a1.5 1.5 0 0 0 1.5-1.5l.8-12" />
      <path d="M10.5 11v6M13.5 11v6" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  sliders: (
    <>
      <path d="M4 8h9M17 8h3M4 16h4M12 16h8" />
      <circle cx="15" cy="8" r="2" />
      <circle cx="10" cy="16" r="2" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s7-5.5 7-10.5a7 7 0 1 0-14 0C5 15.5 12 21 12 21Z" />
      <circle cx="12" cy="10.5" r="2.5" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 11.5A8 8 0 0 0 6.3 6.3L4 8.5" />
      <path d="M4 12.5a8 8 0 0 0 13.7 5.2L20 15.5" />
      <path d="M4 4.5v4h4M20 19.5v-4h-4" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  shield: (
    <>
      <path d="M12 3.5 5 6.2v5.1c0 4.3 2.9 8.1 7 9.2 4.1-1.1 7-4.9 7-9.2V6.2Z" />
      <path d="m9.2 12 2 2 3.6-3.8" />
    </>
  ),
  layers: (
    <>
      <path d="m12 3.5 8.5 4.3L12 12.1 3.5 7.8 12 3.5Z" />
      <path d="m3.5 12 8.5 4.3 8.5-4.3M3.5 16.2l8.5 4.3 8.5-4.3" />
    </>
  ),
};

type IconProps = SVGProps<SVGSVGElement> & {
  name: IconName;
  size?: number;
};

export function Icon({ name, size = 18, className, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}

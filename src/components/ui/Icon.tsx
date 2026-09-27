import type { ReactElement } from 'react';

/** Stroke icons from docs/ui/artboards (24×24 grid, currentColor). */
const PATHS = {
  ship: (
    <>
      <path d="M3 17c1.8 1.3 3.4 1.3 4.5 0 1.4 1.3 3.1 1.3 4.5 0 1.4 1.3 3.1 1.3 4.5 0 1.1 1.3 2.7 1.3 4.5 0" />
      <path d="M5 13V6h14v7" />
      <path d="M12 3v3" />
    </>
  ),
  table: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 10h18M9 10v10" />
    </>
  ),
  layers: (
    <>
      <rect x="4" y="5" width="16" height="4" rx="1" />
      <rect x="4" y="11" width="16" height="4" rx="1" />
      <rect x="4" y="17" width="16" height="3" rx="1" />
    </>
  ),
  discharge: (
    <>
      <path d="M12 4v12" />
      <path d="M7 11l5 5 5-5" />
      <path d="M4 20h16" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l3 2" />
    </>
  ),
  document: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
    </>
  ),
  book: (
    <>
      <path d="M4 6a2 2 0 0 1 2-2h12v16H6a2 2 0 0 1-2-2z" />
      <path d="M8 4v16" />
    </>
  ),
  import: (
    <>
      <path d="M12 15V3" />
      <path d="M7 10l5 5 5-5" />
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </>
  ),
  list: <path d="M4 6h16M4 12h16M4 18h10" />,
  export: (
    <>
      <path d="M12 3v12" />
      <path d="M7 10l5 5 5-5" />
      <path d="M4 19h16" />
    </>
  ),
  chevronDown: <path d="M7 9l5 5 5-5" />,
  plus: <path d="M12 5v14M5 12h14" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M16.5 16.5L21 21" />
    </>
  ),
  warning: (
    <>
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
      <path d="M10.3 4.3L2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0z" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <path d="M12 8h.01" />
    </>
  ),
  alert: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v6" />
      <path d="M12 16h.01" />
    </>
  ),
  check: <path d="M20 6L9 17l-5-5" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  arrowUp: (
    <>
      <path d="M12 19V5" />
      <path d="M7 10l5-5 5 5" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 10h18" />
    </>
  ),
} satisfies Record<string, ReactElement>;

export type IconName = keyof typeof PATHS;

interface Props {
  name: IconName;
  size?: number;
  strokeWidth?: number;
}

export function Icon({ name, size = 15, strokeWidth = 2 }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}

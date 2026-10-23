import type { SVGProps } from "react";

// Authored on a 16px grid. All interface pictograms share this geometry.
export const iconPaths = {
  growth: "M2 13V3M2 13h12M4 10l3-4 3 2 4-5M11 3h3v3",
  attack: "M3 13L13 3M8 3h5v5M2 10l4 4",
  build: "M2 14V7h5v7M7 14V2h7v12M10 5h1M10 8h1M10 11h1M1 14h14",
  alliance: "M1 8l4-4 3 2 3-2 4 4-5 5H6L1 8M5 8l3 3 3-3",
  events: "M3 2h10v12H3V2M6 5h4M6 8h4M6 11h2",
  opening: "M2 3h3v3H2V3M8 4h6M2 10l2 2 3-4M9 11h5",
  trade: "M2 5h11l-3-3M14 11H3l3 3",
  goal: "M8 1v2M8 13v2M1 8h2M13 8h2M8 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6M8 3a5 5 0 1 0 0 10 5 5 0 0 0 0-10",
  spawn: "M8 14s5-5 5-8A5 5 0 0 0 3 6c0 3 5 8 5 8ZM8 4v4M6 6h4",
  clock: "M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2M8 4v4l3 2",
  play: "M5 2l8 6-8 6V2Z",
  matches: "M2 3h12v11H2V3M2 6h12M6 6v8M10 6v8",
  profile: "M8 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6M2 14a6 6 0 0 1 12 0",
  themes: "M8 1l6 4v6l-6 4-6-4V5l6-4ZM8 1v14M2 5l12 6",
  settings: "M2 4h12M2 12h12M5 2v4M11 10v4",
  copy: "M6 5h8v9H6V5ZM3 11H2V2h8v1",
  external: "M9 2h5v5M14 2L7 9M6 3H2v11h11v-4",
  check: "M2 8l4 4 8-9",
  warning: "M8 2l7 12H1L8 2ZM8 6v3M8 11v.5",
  info: "M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2M8 7v4M8 5v.5",
  back: "M7 3L2 8l5 5M2 8h12",
  up: "M3 9l5-5 5 5M8 4v10",
  down: "M3 7l5 5 5-5M8 2v10",
  sort: "M5 2v12M2 5l3-3 3 3M11 2v12M8 11l3 3 3-3",
  drag: "M5 3h1M10 3h1M5 8h1M10 8h1M5 13h1M10 13h1",
  plus: "M2 8h12M8 2v12",
  minus: "M2 8h12",
  chevron: "M5 3l5 5-5 5",
  pending: "M3 3h10v10H3V3Z",
} as const;
export type IconName = keyof typeof iconPaths;
export function Icon({ name, size = 16, label, ...props }: Omit<SVGProps<SVGSVGElement>, "name"> & { name: IconName; size?: number; label?: string }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" strokeLinejoin="miter" aria-hidden={label ? undefined : true} role={label ? "img" : undefined} aria-label={label} {...props}><path d={iconPaths[name]} /></svg>;
}
/** Geometry from the approved docs/brand/mark.svg. */
export function FlashFrontMark({ size = 32 }: { size?: number }) {
  if (size < 20) return <svg width={size} height={size} viewBox="0 0 16 16" role="img" aria-label="FlashFront" className="ff-mark">
    <rect width="16" height="16" rx="3" fill="#E8192C" />
    <path d="M9 2H6L4 9H7L6 14L12 6H8Z" fill="#FFFFFF" />
  </svg>;
  return <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="FlashFront" className="ff-mark">
    <rect x="4" y="4" width="56" height="56" rx="12" fill="#121316" stroke="#2A2D34" strokeWidth="2" />
    <path d="M4 16 Q4 4 16 4 H34 L26 28 H36 L22 60 H16 Q4 60 4 48 Z" fill="#E8192C" />
    {size >= 20 && <path d="M34 4 L26 28 H36 L22 60" fill="none" stroke="#F2F3F5" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" />}
  </svg>;
}

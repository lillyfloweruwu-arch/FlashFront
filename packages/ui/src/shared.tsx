import { useEffect, useRef, useState, type ReactNode } from "react";
import { formatTroops } from "@flashfront/core";

export function AnimatedNumber({ value, format = formatTroops }: { value: number; format?: (value: number) => string }) {
  const [display, setDisplay] = useState(value);
  const current = useRef(value);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    const finish = () => { cancelAnimationFrame(frame); current.current = value; setDisplay(value); };
    if (media.matches || document.documentElement.classList.contains("ff-static")) { finish(); return; }
    const start = performance.now(); const from = current.current;
    const animate = (now: number) => {
      if (document.documentElement.classList.contains("ff-static")) { finish(); return; }
      const t = Math.min(1, (now - start) / 180);
      current.current = from + (value - from) * (1 - (1 - t) ** 3);
      setDisplay(current.current);
      if (t < 1) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    const observer = new MutationObserver(() => {
      if (document.documentElement.classList.contains("ff-static")) finish();
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    media.addEventListener("change", finish);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); media.removeEventListener("change", finish); };
  }, [value]);
  return <span className="number">{format(display)}</span>;
}
export function Panel({ title, children, className = "" }: { title?: string; children: ReactNode; className?: string }) {
  return <section className={`panel ${className}`}>{title && <h2 className="panel-title">{title}</h2>}{children}</section>;
}
export function Meter({ value, max = 100, tone = "muted", label }: { value: number; max?: number; tone?: string; label: string }) {
  const pct = Math.max(0, Math.min(100, max > 0 ? value / max * 100 : 0));
  return <div className={`meter ${tone}`} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.max(0, Math.min(max, value))}><span style={{ width: `${pct}%` }} /></div>;
}
export const buildingLabel = (type: string) => type.replace(/([a-z])([A-Z])/g, "$1 $2").replace("SAMLauncher", "SAM launcher");
export const signed = (value: number) => `${value > 0 ? "+" : ""}${Math.round(value)}`;
const matchDay = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const matchTime = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
/** Local wall time, shared by history and chart labels. */
export function formatMatchDate(value: string | number | Date): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Date unavailable";
  const day = matchDay.format(date);
  const time = matchTime.format(date);
  return `${day} · ${time}`;
}
export const integer = (value: number) => Math.round(value).toLocaleString("en-US");
export function Wordmark() { return <span className="wordmark" aria-label="FlashFront">FLASH<span>FRONT</span></span>; }

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Icon, type IconName } from "./icons";

/**
 * Shared controls for every FlashFront surface (0.2.1 polish): one button, one segmented control,
 * one status notice and one keycap. Styles live in theme.css under "Shared controls".
 */
export type ButtonVariant = "primary" | "default" | "ghost";
export function Button({ variant = "default", icon, className = "", children, ...props }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; icon?: IconName }) {
  return <button type="button" {...props} className={`ff-button ff-button-${variant} ${className}`.trim()}>
    {icon && <Icon name={icon} />}{children}
  </button>;
}

export interface SegmentOption<T extends string> { value: T; label: string; detail?: string }
/** One choice out of a few: replaces native selects, preset tiles and step buttons. */
export function Segmented<T extends string>({ label, options, value, onChange, className = "" }:
  { label: string; options: SegmentOption<T>[]; value: T; onChange: (value: T) => void; className?: string }) {
  return <div className={`ff-segmented ${className}`.trim()} role="radiogroup" aria-label={label}>
    {options.map(option => <button type="button" key={option.value} role="radio" aria-checked={option.value === value}
      className={option.value === value ? "selected" : ""} onClick={() => onChange(option.value)} title={option.detail}>
      {option.label}
    </button>)}
  </div>;
}

export type StatusTone = "neutral" | "success" | "caution" | "danger";
const toneIcon: Record<StatusTone, IconName> = { neutral: "info", success: "check", caution: "warning", danger: "warning" };
const toneLabel: Record<StatusTone, string> = { neutral: "Note", success: "Done", caution: "Check", danger: "Problem" };
/** Status colour follows meaning, always with a text label (Labelled State Rule). */
export function Status({ tone = "neutral", title, children, action }:
  { tone?: StatusTone; title: string; children?: ReactNode; action?: ReactNode }) {
  return <div className={`ff-status ff-status-${tone}`} role={tone === "danger" || tone === "caution" ? "alert" : "status"}>
    <Icon name={toneIcon[tone]} label={toneLabel[tone]} />
    <div className="ff-status-body"><strong>{title}</strong>{children && <div className="ff-status-detail">{children}</div>}</div>
    {action && <div className="ff-status-action">{action}</div>}
  </div>;
}

/** A shortcut shown as keycaps, e.g. "Ctrl+Alt+H" or "Space". */
export function Keys({ shortcut, label }: { shortcut: string; label?: string }) {
  return <span className="ff-keys" aria-label={label ?? shortcut}>{shortcut.split("+").map(key => <kbd key={key}>{key}</kbd>)}</span>;
}

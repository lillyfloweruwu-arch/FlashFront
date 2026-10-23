const safe = (value: number) => Number.isFinite(value) ? value : 0;
const decimal = (value: number) => value.toFixed(1).replace(/\.0$/, "");
function compact(value: number): string {
  const n = safe(value);
  const abs = Math.abs(n);
  if (abs >= 999_950) return `${decimal(n / 1_000_000)}M`;
  if (abs >= 999.95) return `${decimal(n / 1_000)}K`;
  return Math.round(n).toString();
}
// OpenFront stores troops at 10x the number it shows (src/client/Utils.ts renderTroops: troops / 10).
// Core keeps the game's internal units; only formatting divides.
export const TROOP_DISPLAY_DIVISOR = 10;
// Port of OpenFront v0.34.25 src/client/Utils.ts renderNumber, so FlashFront shows the game's exact digits.
export function renderNumber(value: number): string {
  const num = Math.max(safe(value), 0);
  if (num >= 10_000_000_000) return (Math.floor(num / 100_000_000) / 10).toFixed(1) + "B";
  if (num >= 1_000_000_000) return (Math.floor(num / 10_000_000) / 100).toFixed(2) + "B";
  if (num >= 10_000_000) return (Math.floor(num / 100_000) / 10).toFixed(1) + "M";
  if (num >= 1_000_000) return (Math.floor(num / 10_000) / 100).toFixed(2) + "M";
  if (num >= 100_000) return Math.floor(num / 1000) + "K";
  if (num >= 10_000) return (Math.floor(num / 100) / 10).toFixed(1) + "K";
  if (num >= 1000) return (Math.floor(num / 10) / 100).toFixed(2) + "K";
  return Math.floor(num).toString();
}
export const formatTroops = (troops: number): string => renderNumber(safe(troops) / TROOP_DISPLAY_DIVISOR);
export const formatGold = (gold: number): string => renderNumber(gold);
export function formatDuration(sec: number): string {
  const n = Math.floor(Math.abs(safe(sec)));
  return `${sec < 0 && n > 0 ? "-" : ""}${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
}
export const formatPct = (value: number): string => `${decimal(safe(value))}%`;
export const formatRate = (perSec: number): string => `${safe(perSec) > 0 ? "+" : ""}${compact(perSec)}/s`;
export const formatTroopRate = (perSec: number): string => { const shown = safe(perSec) / TROOP_DISPLAY_DIVISOR; return shown > 0 ? `+${renderNumber(shown)}/s` : "0/s"; };

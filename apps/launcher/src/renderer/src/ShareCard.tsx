import { useEffect, useRef, useState } from "react";
import { coachMatch, formatDuration, recordedLandPct, type RecordedMatch } from "@flashfront/core";
import type { LauncherApi, Settings } from "../../shared";
import { Icon } from "@flashfront/ui";

const colors = { bg: "#0A0A0B", surface: "#121316", edge: "#2A2D34", fg: "#F2F3F5", muted: "#9AA0AB", red: "#E8192C" };
/** Local canvas only: no player identifiers, network images, or uploaded recordings. */
export function renderShareCard(m: RecordedMatch, showName = true): HTMLCanvasElement {
  const canvas = document.createElement("canvas"); canvas.width = 1200; canvas.height = 630;
  const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("Share card canvas unavailable");
  const text = (value: string, x: number, y: number, size = 20, display = false, color = colors.fg, width = 1104) => {
    ctx.fillStyle = color; ctx.font = display ? `600 ${size}px "Antonio Variable", "Arial Narrow", sans-serif` : `400 ${size}px Inter, "Segoe UI", sans-serif`;
    let line = value; while (line.length && ctx.measureText(line).width > width) line = line.slice(0, -1);
    ctx.fillText(line === value ? line : line.slice(0, -1) + "…", x, y);
  };
  ctx.fillStyle = colors.bg; ctx.fillRect(0, 0, 1200, 630);
  ctx.fillStyle = colors.surface; ctx.fillRect(32, 32, 1136, 566); ctx.strokeStyle = colors.edge; ctx.strokeRect(32, 32, 1136, 566);
  // The approved Front bolt, drawn in its original 64-unit geometry.
  ctx.save(); ctx.translate(48, 48); ctx.strokeStyle = colors.edge; ctx.lineWidth = 2; ctx.beginPath();
  ctx.moveTo(16, 4); ctx.lineTo(48, 4); ctx.quadraticCurveTo(60, 4, 60, 16); ctx.lineTo(60, 48); ctx.quadraticCurveTo(60, 60, 48, 60);
  ctx.lineTo(16, 60); ctx.quadraticCurveTo(4, 60, 4, 48); ctx.lineTo(4, 16); ctx.quadraticCurveTo(4, 4, 16, 4); ctx.closePath(); ctx.stroke();
  ctx.fillStyle = colors.red; ctx.beginPath(); ctx.moveTo(4, 16); ctx.quadraticCurveTo(4, 4, 16, 4);
  ctx.lineTo(34, 4); ctx.lineTo(26, 28); ctx.lineTo(36, 28); ctx.lineTo(22, 60); ctx.lineTo(16, 60); ctx.quadraticCurveTo(4, 60, 4, 48); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = colors.fg; ctx.lineWidth = 4; ctx.lineJoin = "round"; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(34, 4); ctx.lineTo(26, 28); ctx.lineTo(36, 28); ctx.lineTo(22, 60); ctx.stroke(); ctx.restore();
  text("FLASH", 120, 88, 28, true); const wordWidth = ctx.measureText("FLASH").width; text("FRONT", 120 + wordWidth, 88, 28, true, colors.red);
  if (showName && m.me.name) text(m.me.name, 640, 84, 20, false, colors.muted, 512);
  text(m.map.toUpperCase(), 48, 174, 40, true);
  const result = m.outcome === "won" || m.outcome === "win" ? "Won" : m.outcome === "eliminated" || m.outcome === "loss" ? "Eliminated" : m.outcome === "left" ? "Left match" : "Outcome unknown";
  const land = recordedLandPct(m);
  text(`${result} · ${m.mode} · ${formatDuration(m.durationSec)}`, 48, 214, 22);
  text(`${m.summary.finalRank ? `Rank #${m.summary.finalRank}` : "Rank unavailable"} · ${land === undefined ? "Land % unavailable" : `Peak land ${Math.floor(land * 10) / 10}%`}`, 48, 250, 20, false, colors.muted);
  text("Troops % of max", 48, 294, 18, false, colors.muted);
  const samples = m.samples.filter(s => Number.isFinite(s.t) && Number.isFinite(s.troops) && s.maxTroops > 0);
  const end = Math.max(1, m.durationSec, ...samples.map(s => s.t)); const max = Math.max(1, ...samples.map(s => s.troops / s.maxTroops));
  ctx.strokeStyle = colors.edge; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(48, 448); ctx.lineTo(1152, 448); ctx.stroke();
  ctx.strokeStyle = colors.fg; ctx.lineWidth = 2; ctx.beginPath(); let previous: number | undefined;
  for (const s of samples) { const x = 48 + s.t / end * 1104; const y = 436 - s.troops / s.maxTroops / max * 124;
    if (previous === undefined || s.t - previous > 10) ctx.moveTo(x, y); else ctx.lineTo(x, y); previous = s.t; }
  ctx.stroke(); if (!samples.length) text("No troop samples recorded", 48, 372, 20, false, colors.muted);
  text("0:00", 48, 474, 16, false, colors.muted); text(formatDuration(end), 1072, 474, 16, false, colors.muted, 80);
  const notes = coachMatch(m); const lesson = notes.find(n => n.severity === "warning") ?? notes.find(n => n.severity === "tip") ?? notes[0];
  if (lesson) {
    ctx.font = '400 20px Inter, "Segoe UI", sans-serif'; const words = lesson.text.split(/\s+/); const lines = [""];
    for (const word of words) { const last = lines.length - 1; const line = `${lines[last]} ${word}`.trim(); if (ctx.measureText(line).width > 1104 && lines[last]) lines.push(word); else lines[last] = line; }
    lines.slice(0, 2).forEach((line, i) => text(line + (i === 1 && lines.length > 2 ? "…" : ""), 48, 520 + i * 28, 20));
  }
  text("Your observed numbers · nothing uploaded unless you send feedback", 48, 578, 16, false, colors.muted);
  return canvas;
}

export function ShareCard({ match, api, settings }: { match: RecordedMatch; api: LauncherApi; settings?: Settings }) {
  const [showName, setShowName] = useState(settings?.shareShowName ?? true);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false); const preview = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    let active = true;
    void (async () => { await document.fonts?.ready; if (!active) return;
      const canvas = renderShareCard(match, showName); canvas.style.width = "100%"; canvas.style.height = "auto";
      canvas.setAttribute("role", "img"); canvas.setAttribute("aria-label", `Share card preview for ${match.map}${showName && match.me.name ? `, ${match.me.name}` : ""}`);
      preview.current?.replaceChildren(canvas);
    })().catch(e => { if (active) setMessage(String(e)); });
    return () => { active = false; };
  }, [match, showName, open]);
  return <details style={{ marginTop: 16 }} onToggle={e => setOpen(e.currentTarget.open)}><summary><Icon name="chevron" className="disclosure-chevron" />Share card</summary><p className="muted">1200 × 630 PNG saved on this PC. You choose where to post it.</p>
    <label><input type="checkbox" checked={showName} onChange={e => { const next = e.target.checked; setShowName(next);
      void api.getState().then(state => api.saveSettings({ ...state.settings, shareShowName: next })).catch(e => setMessage(String(e))); }} /> Show my name</label>
    <div ref={preview} style={{ maxWidth: 720, margin: "16px 0" }} />
    <button className="setup-primary" style={{ minHeight: 44 }} disabled={busy} onClick={() => { setBusy(true); setMessage(""); void (async () => {
      await document.fonts?.ready; const saved = await api.saveShare(renderShareCard(match, showName).toDataURL("image/png"));
      setMessage(saved ? "PNG saved." : "Save canceled.");
    })().catch(e => setMessage(String(e))).finally(() => setBusy(false)); }}>{busy ? "Saving…" : "Save PNG"}</button>
    {message && <p role="status">{message}</p>}
  </details>;
}

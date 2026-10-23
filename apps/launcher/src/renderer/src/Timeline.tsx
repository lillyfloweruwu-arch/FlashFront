import { useState } from "react";
import { formatDuration, formatGold, formatTroops, renderNumber, type CoachNote, type MatchEvent, type RecordedMatch } from "@flashfront/core";
import { Icon } from "@flashfront/ui";

type TimedEvent = MatchEvent | { kind: "decision"; t: number; text: string };
function BookmarkNote({ t, note, onSave }: { t: number; note?: string; onSave: (t: number, note: string) => Promise<void> }) {
  const [draft, setDraft] = useState(note ?? ""); const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  return <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
    <label>Note at {formatDuration(t)}<textarea aria-label={`Bookmark note at ${formatDuration(t)}`} maxLength={500} value={draft} rows={2}
      style={{ width: "100%", resize: "vertical", font: "inherit", color: "var(--ff-fg)", background: "var(--ff-surface-2)", border: "1px solid var(--ff-edge)", borderRadius: 4, padding: 8 }} onChange={e => setDraft(e.target.value)} /></label>
    <div><button disabled={busy} onClick={() => { setBusy(true); setMessage(""); void onSave(t, draft).then(() => setMessage("Note saved.")).catch(e => setMessage(String(e))).finally(() => setBusy(false)); }}>{busy ? "Saving…" : "Save note"}</button></div>
    {message && <small role="status">{message}</small>}
  </div>;
}

export function Timeline({ match: m, notes = [], onAnnotate }: { match: RecordedMatch; notes?: CoachNote[]; onAnnotate?: (t: number, note: string) => Promise<void> }) {
  const [cursor, setCursor] = useState(0);
  const samples = m.samples.filter(s => Number.isFinite(s.t) && s.t >= 0).sort((a, b) => a.t - b.t);
  const events = (m.events as TimedEvent[]).filter(e => Number.isFinite(e.t) && e.t >= 0);
  const moments = [...events.filter(e => ["push", "bookmark", "decision"].includes(e.kind)).map(e => ({ t: e.t, kind: e.kind, label: e.kind === "push" ? "Push" : e.kind === "bookmark" ? "Bookmark" : "Decision" })),
    ...notes.flatMap(note => note.t !== undefined && Number.isFinite(note.t) && note.t >= 0 ? [{ t: note.t, kind: "coach", label: "Coach note" }] : [])];
  const end = Math.max(1, m.durationSec, ...samples.map(s => s.t), ...events.map(e => e.t), ...notes.map(n => n.t ?? 0));
  const selected = samples.reduce<typeof samples[number] | undefined>((best, s) => !best || Math.abs(s.t - cursor) < Math.abs(best.t - cursor) ? s : best, undefined);
  const x = (t: number) => 16 + t / end * 768;
  const hasLandPct = samples.some(s => Number.isFinite(s.tilesOwnedPct));
  const tracks = [
    { key: "troops", label: "Troops % of max", aria: "Troops percent of max over time", value: (s: typeof samples[number]) => s.maxTroops > 0 ? s.troops / s.maxTroops * 100 : undefined, format: (n: number) => `${Math.floor(n)}%`, min: 100 },
    { key: "land", label: hasLandPct ? "Land %" : "Land", aria: hasLandPct ? "Land percent over time" : "Land in tiles over time", value: (s: typeof samples[number]) => hasLandPct ? s.tilesOwnedPct : s.tiles, format: (n: number) => hasLandPct ? `${Math.floor(n * 10) / 10}%` : `${renderNumber(n)} tiles`, min: hasLandPct ? 100 : 1 },
    { key: "gold", label: "Gold", aria: "Gold over time", value: (s: typeof samples[number]) => s.gold, format: formatGold, min: 1 },
    { key: "incoming", label: "Incoming", aria: "Incoming troops over time", value: (s: typeof samples[number]) => s.incoming, format: formatTroops, min: 1 },
  ];
  return <section aria-label="Match timeline">
    <h3>Match timeline</h3><p className="muted">One cursor across your observations. Gaps stay blank; incoming is shown in troops.</p>
    <label style={{ display: "flex", gap: 16, alignItems: "center" }}>Review time <output>{formatDuration(cursor)}</output>
      <input style={{ flex: 1, minWidth: 80 }} aria-label="Review time" type="range" min={0} max={end} step={0.1} value={cursor} onChange={e => setCursor(Number(e.target.value))} /></label>
    <svg viewBox="0 0 800 440" style={{ width: "100%", display: "block", background: "var(--ff-surface)", border: "1px solid var(--ff-edge)", borderRadius: 6, fontFamily: "var(--font-body)", fontSize: 12 }}
      aria-label="Synchronized match charts" onClick={e => { const bounds = e.currentTarget.getBoundingClientRect(); if (bounds.width) setCursor(Math.max(0, Math.min(end, (e.clientX - bounds.left - bounds.width * 0.02) / (bounds.width * 0.96) * end))); }}>
      {tracks.map((track, index) => {
        const top = index * 100 + 28; const bottom = top + 64;
        const max = Math.max(track.min, ...samples.map(s => track.value(s) ?? 0).filter(Number.isFinite));
        const y = (n: number) => bottom - n / max * 64;
        const value = selected && track.value(selected);
        let previous: number | undefined;
        const path = samples.map(s => { const n = track.value(s); if (n === undefined || !Number.isFinite(n)) { previous = undefined; return ""; }
          const command = previous === undefined || s.t - previous > 10 ? "M" : "L"; previous = s.t;
          return `${command}${x(s.t)},${y(n)}`;
        }).join(" ");
        return <g key={track.key} data-track={track.key} aria-label={track.aria}>
          <text x={16} y={top - 10} fill="var(--ff-muted)">{track.label}</text>
          <text x={784} y={top - 10} textAnchor="end" fill="var(--ff-fg)">{value === undefined ? "No observation" : track.format(value)}</text>
          {index === 0 && <><rect x={16} y={y(25)} width={768} height={bottom - y(25)} fill="var(--danger)" opacity={0.08} />
            <rect x={16} y={y(100)} width={768} height={y(70) - y(100)} fill="var(--warning)" opacity={0.08} /></>}
          <line x1={16} x2={784} y1={bottom} y2={bottom} stroke="var(--ff-edge)" />
          <path d={path} fill="none" stroke={track.key === "incoming" ? "var(--danger)" : "var(--ff-fg)"} strokeWidth={1.5} />
          {samples.length === 1 && <circle cx={x(samples[0]!.t)} cy={y(track.value(samples[0]!) ?? 0)} r={2} fill="var(--ff-fg)" />}
          {selected && value !== undefined && <circle cx={x(selected.t)} cy={y(value)} r={3} fill="var(--ff-fg)" stroke="var(--ff-bg)" />}
        </g>;
      })}
      <line data-cursor data-time={cursor} x1={x(cursor)} x2={x(cursor)} y1={24} y2={396} stroke="var(--ff-muted)" strokeDasharray="3 3" />
      {moments.map((moment, i) => <g key={i} data-moment={moment.kind} role="button" tabIndex={0} aria-label={`${moment.label} marker at ${formatDuration(moment.t)}`}
        transform={`translate(${x(moment.t)}, ${moment.kind === "bookmark" ? 408 : 400})`} style={{ cursor: "pointer" }}
        onClick={e => { e.stopPropagation(); setCursor(moment.t); }} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setCursor(moment.t); } }}>
        <title>{moment.label} · {formatDuration(moment.t)}</title><circle r={6} fill="var(--ff-surface)" stroke="var(--ff-muted)" />
        {moment.kind === "bookmark" ? <path d="M-2 -3 H2 V3 L0 1 L-2 3 Z" fill="var(--ff-fg)" /> : <circle r={2} fill="var(--ff-fg)" />}
      </g>)}
      {[0, 0.25, 0.5, 0.75, 1].map(f => <text key={f} x={x(end * f)} y={424} textAnchor={f === 0 ? "start" : f === 1 ? "end" : "middle"} fill="var(--ff-muted)">{formatDuration(end * f)}</text>)}
    </svg>
    <p className="muted">{selected ? `Nearest observation: ${formatDuration(selected.t)}. Troop bands: under 25% exposed; over 70% growth slowing.` : "No samples in this recording."}</p>
    <h3>Moments</h3><div style={{ maxHeight: 320, overflowY: "auto", display: "grid", gap: 8 }}>
      {events.filter(e => ["push", "bookmark", "decision"].includes(e.kind)).map((event, i) => <div key={`${event.kind}-${event.t}-${i}`}>
        <button onClick={() => setCursor(event.t)}>{event.kind === "push" ? "Push" : event.kind === "bookmark" ? "Bookmark" : "Decision"} at {formatDuration(event.t)}{event.kind === "decision" ? ` · ${event.text}` : ""}</button>
        {event.kind === "bookmark" && (onAnnotate ? <BookmarkNote t={event.t} note={event.note} onSave={onAnnotate} /> : event.note && <p>{event.note}</p>)}
      </div>)}
      {!events.some(e => ["push", "bookmark", "decision"].includes(e.kind)) && <p className="muted">No saved moments in this recording.</p>}
    </div>
    <h3>Coach notes</h3><p className="muted">Based on your observed numbers. Push totals are estimates between polls; incomplete recordings cover only part of a match.</p>
    <ol className="coach-notes">{notes.map((note, i) => <li key={i} className={`coach-${note.severity}`}><span className="tiny-label"><Icon name={note.severity === "good" ? "check" : note.severity === "warning" ? "warning" : "info"} />{note.severity}</span>
      <p>{note.t !== undefined ? <button onClick={() => setCursor(note.t!)}>{formatDuration(note.t)} · {note.text}</button> : note.text}</p></li>)}</ol>
  </section>;
}

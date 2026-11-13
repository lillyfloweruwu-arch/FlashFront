import { useMemo, useState, useCallback, useEffect, type CSSProperties } from "react";
import { closestPreparedDrill, DRILL_CATALOG, momentTags, coachMatch, formatDuration, formatTroops, recordingCoverage, type KeyMoment, type PushLabel, type RecordedMatch } from "@flashfront/core";
import { ReviewBoard, type ReviewBoardApi } from "./ReviewBoard";
import { Timeline } from "./Timeline";
import { LABEL_NAMES, retryRequest, reviewCoachLine, reviewHeadline, worstMoment } from "../../review-presentation";
import type { LauncherApi, ReviewResult, TrainingRequest } from "../../shared";

const LABEL_ORDER: PushLabel[] = ["great", "good", "costly", "blunder"];
export const QUALITY_GLYPHS: Record<PushLabel, string> = { great: "!", good: "✓", neutral: "·", costly: "?", blunder: "??" };
export function QualityBadge({ label, glyphOnly = false }: { label: PushLabel; glyphOnly?: boolean }) {
  return <span className={`quality-badge quality-${label}`} aria-label={LABEL_NAMES[label]}><span aria-hidden="true">{QUALITY_GLYPHS[label]}</span>{!glyphOnly && ` ${LABEL_NAMES[label]}`}</span>;
}
const ROLE: Record<KeyMoment["kind"], string> = { push: "Attack coach", wave: "Defense coach", ally: "Head coach", opening: "Economy coach" };
const UNAVAILABLE: Record<Extract<ReviewResult, { status: "unavailable" }>["reason"], string> = {
  noGameId: "This recording has no game ID, so it can't be matched to a public record.",
  notArchived: "OpenFront has not archived a public record for this game.",
  invalid: "The public record for this game could not be read.",
  tooLarge: "The public record for this game is too large to review.",
  notInRecord: "You were not found in this game's public record.",
};

export function accuracyText(result?: ReviewResult) {
  const value = result?.status === "ready" ? result.review.accuracy.value : undefined;
  return value === undefined ? "Accuracy unavailable" : `${value}%`;
}

export function GameReviewView({ file, match, result, onRetry, onAnnotate, reviewApi, inMatch = false }: { reviewApi?: ReviewBoardApi & Pick<LauncherApi, "onReviewBoardStep">; inMatch?: boolean; file: string; match: RecordedMatch; result: ReviewResult; onRetry: (request: TrainingRequest) => void; onAnnotate?: (t: number, note: string) => Promise<void> }) {
  const [cursor, setCursor] = useState(0);
  const notes = useMemo(() => coachMatch(match), [match]);
  const review = result.status === "ready" ? result.review : undefined;
  const reminders = match.events.flatMap(e => e.kind === "nudge" && e.outcome === "ignored" ? [e] : []);
  const unrated = review?.pushes.filter(p => !p.label).length ?? 0;
  const coverage = recordingCoverage(match);
  const a = review?.accuracy;
  const coach = useMemo(() => review ? reviewCoachLine(review) : undefined, [review]);
  const currentPush = review?.pushes.filter(p => p.t <= cursor).sort((a, b) => b.t - a.t)[0];
  const worst = review && worstMoment(review, true);
  const selectedMoment = review?.keyMoments.filter(m => m.t <= cursor).sort((a, b) => b.t - a.t)[0] ?? worst;
  const exactMoment = review?.keyMoments.find(m => m.t === cursor);
  const exactPush = review?.pushes.find(p => p.t === cursor);
  const sample = match.samples.reduce<typeof match.samples[number] | undefined>((best, s) => !best || Math.abs(s.t - cursor) < Math.abs(best.t - cursor) ? s : best, undefined);
  const tick = exactMoment?.tick ?? exactPush?.startTick ?? sample?.tick;
  const share = sample?.tilesOwnedPct;
  const retry = selectedMoment && retryRequest(file, selectedMoment);
  const example = selectedMoment?.mistake && closestPreparedDrill(selectedMoment.mistake, momentTags(selectedMoment, match.samples), DRILL_CATALOG);
  const step = useCallback((direction: -1 | 1) => {
    const times = review?.pushes.map(p => p.t) ?? [];
    setCursor(current => { const next = times.filter(t => direction === 1 ? t > current : t < current); return next.length ? (direction === 1 ? Math.min(...next) : Math.max(...next)) : current; });
  }, [review]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && (event.target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName))) return;
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); step(event.key === "ArrowLeft" ? -1 : 1); }
    };
    document.addEventListener("keydown", key);
    const off = reviewApi?.onReviewBoardStep(step);
    return () => { document.removeEventListener("keydown", key); off?.(); };
  }, [step, reviewApi]);
  const replay = !!reviewApi && !!review;
  const timeline = <Timeline match={match} notes={notes} onAnnotate={onAnnotate} cursorSec={cursor} onCursorChange={setCursor} reviewPushes={review?.pushes} framed
    coachCard={!replay && coach && <aside className="review-coach-card ff-glass">{worst?.label && <QualityBadge label={worst.label} />}<p className="review-coach-line">{coach.text}</p></aside>} />;
  return <article className={`game-review${replay ? " has-replay" : ""}`} aria-label="Game Review">
    <div className="game-review-frame">
      <div className="game-review-observations">
        {replay ? <section className="review-map-shell ff-glass" aria-label="Replay board">
          <div className="review-map-row">
            <div className="review-strength-bar" aria-label={share === undefined ? "Land share unavailable" : `Land share ${share.toFixed(1)}%`}><i style={{ height: `${share === undefined ? 0 : Math.max(0, Math.min(100, share))}%` }} /><span>{share === undefined ? "—" : `${share.toFixed(1)}%`}</span></div>
            <ReviewBoard api={reviewApi!} file={file} tick={tick} inMatch={inMatch} />
          </div>
          {selectedMoment && <aside className="review-moment-card ff-glass">
            {selectedMoment.label && <QualityBadge label={selectedMoment.label} />}<span className="tiny-label">{ROLE[selectedMoment.kind]}</span><p>{selectedMoment.text}</p>
            <div className="detail-actions">{retry && <button className="ff-btn-primary" disabled={inMatch} onClick={() => onRetry(retry)}>Retry {formatDuration(selectedMoment.t)} in Training</button>}
            {example && <button className="ff-btn-secondary" disabled={inMatch} onClick={() => onRetry({ kind: "prepared", drillId: example.id })}>Watch coach's move</button>}</div>
          </aside>}
        </section> : <><p className="muted">{result.status === "waiting" ? "The public record is not available yet." : result.status === "unavailable" ? UNAVAILABLE[result.reason] : "Replay board unavailable."}</p>{timeline}</>}      </div>
      <div className="game-review-sidebar">
        <section className="game-review-summary ff-glass" aria-label="Review summary">
          <header className="game-review-head">
            <div className="review-accuracy-ring" style={{ "--accuracy": `${a?.value ?? 0}%` } as CSSProperties} aria-label={accuracyText(result)}><span>{a?.value ?? "—"}</span></div>
            <h2>{match.summary.finalRank ? `#${match.summary.finalRank} on ` : ""}{match.map}</h2>
            <div className="game-review-accuracy"><span className="label">Accuracy</span><strong>{accuracyText(result)}</strong></div>
            <p className="game-review-headline">{result.status === "ready" ? reviewHeadline(result.review) : result.status === "waiting" ? "Review pending: the public record is not available yet. It is fetched only after the match." : UNAVAILABLE[result.reason]}</p>
          </header>
          {review && <>
            <ul className="game-review-counts" aria-label="Push labels">
              {LABEL_ORDER.map(label => <li key={label} className={`push-${label}`}><QualityBadge label={label} /><strong>{review.counts[label]}</strong></li>)}
              {unrated > 0 && <li><span className="label">Not enough observations</span><strong>{unrated}</strong></li>}
            </ul>
            <p className="muted">{a?.value === undefined ? `Too few rated pushes for a score (${a?.rated ?? 0} rated).` : `Based on ${a.rated} rated pushes, ${a.goodOrGreat} Good or Great and ${a.neutral} Neutral. Opening ${signed(a.opening)}, defense timing ${signed(a.defense)}.`}
              {` ${review.coverage.ratedPushes} of ${review.coverage.totalPushes} pushes had enough observations to rate.`}</p>
          </>}
        </section>
        {replay && timeline}
        <section className="game-review-moves ff-glass" aria-label="Move list">
          <h3>Moves</h3>
          {review?.pushes.length ? <ol className="review-pushes">{review.pushes.map(p => <li key={p.id} data-push={p.label ?? "unrated"} className={p.id === currentPush?.id ? "is-selected" : undefined}>
            <button aria-current={p.id === currentPush?.id ? "step" : undefined} onClick={() => setCursor(p.t)}><time>{formatDuration(p.t)}</time>{p.label ? <QualityBadge label={p.label} /> : <span className="muted">Not enough observations</span>}<span>Sent {formatTroops(p.sent)}{p.landChangePct !== undefined ? ` · land ${signed(Math.round(p.landChangePct * 10) / 10)}%` : ""}</span></button>
          </li>)}</ol> : <p className="muted">No reviewed moves available.</p>}
        </section>
      </div>
    </div>
    {review && <section aria-label="Key moments"><h3>Key moments</h3>
      {review.keyMoments.length ? <ol className="key-moments">{review.keyMoments.map((moment, i) => {
        const retry = retryRequest(file, moment);
        return <li key={`${moment.tick}-${i}`}><span className="tiny-label">{ROLE[moment.kind]}</span>
          <button onClick={() => setCursor(moment.t)}>{moment.text}</button>
          {retry && <button className="ff-btn-secondary" onClick={() => onRetry(retry)}>Retry {formatDuration(moment.t)} in Training</button>}
        </li>;
      })}</ol> : <p className="muted">No clear costly moment in these observations.</p>}
    </section>}
    {reminders.length > 0 && <section aria-label="Reminders"><h3>Reminders</h3><ul>{reminders.map((r, i) => <li key={i}><button onClick={() => setCursor(r.t)}>{formatDuration(r.t)} · Reminder not acted on</button></li>)}</ul></section>}
    <p className="muted">Recorded for {formatDuration(match.durationSec)}{coverage === undefined ? "" : `, with numbers for ${Math.floor(coverage * 100)}% of that time`}. Land and troops are read about once a second; gaps stay blank.</p>
  </article>;
}
const signed = (n: number) => n > 0 ? `+${n}` : `${n}`;


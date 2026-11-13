import { memo, useMemo, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { coachMatch, debrief, matchTrend, personalBests, nextMatchNotes, recordingCoverage, spotsFor, MAP_ATTRIBUTION, zoneLabel, formatDuration, formatTroops, PRACTICE_GOALS, reviewMode, suggestedGoals, type CoachNote, type PracticeGoal, type RecordedMatch, type ReviewMatch, type PlayerProfile, type Debrief } from "@flashfront/core";
import { PersonalBestsTable, TrendStrip, heroTrend } from "./TrendStrip";
import { statsOverview } from "../../stats-overview";
import { Timeline } from "./Timeline";
import { ShareCard } from "./ShareCard";
import { Sparkline, Icon, Button, Segmented, formatMatchDate } from "@flashfront/ui";
import "./pages.css";
import type { LauncherApi, ReviewResult, Settings } from "../../shared";
import type { MatchListItem } from "../../main/recorder";
import { profileFromApi, profileStats, recentGames, type ProfileGame, type TypeStats } from "../../stats";
import { joinArchive, type ArchiveRow } from "../../match-archive";
import { reviewHeadline } from "../../review-presentation";
import { QualityBadge, GameReviewView, QUALITY_GLYPHS } from "./GameReview";

export const PUBLIC_ID_HINT = "The id in your profile URL openfront.io/player/<id>";
const MODE_OPTIONS = [{ value: "", label: "All modes" }, { value: "FFA", label: "FFA" }, { value: "Teams", label: "Teams" }, { value: "Ranked", label: "Ranked" }];
/** A small custom menu: the map list is too long for a segmented control and native selects are not used. */
export function MapFilter({ maps, value, onChange }: { maps: string[]; value: string; onChange: (map: string) => void }) {
  const [open, setOpen] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => { if (!host.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", close); return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  const pick = (map: string) => { onChange(map); setOpen(false); };
  return <div className="map-filter" ref={host} onKeyDown={e => { if (e.key === "Escape") setOpen(false); }}>
    <span className="field-label" id="map-filter-label">Map</span>
    <Button aria-haspopup="true" aria-expanded={open} aria-labelledby="map-filter-label map-filter-value" onClick={() => setOpen(o => !o)}><span id="map-filter-value">{value || "All maps"}</span><Icon name="chevron" /></Button>
    {open && <div className="map-filter-menu" role="radiogroup" aria-label="Map">{["", ...maps].map(map => <Button key={map || "all"} role="radio" aria-checked={map === value} onClick={() => pick(map)}>{map || "All maps"}</Button>)}</div>}
  </div>;
}
const REVIEW_RETRY_MS = 15_000;
/** True while OpenFront reports a live match: reviews and record downloads wait until it ends. */
export function useInMatch(api: LauncherApi) {
  const [inMatch, setInMatch] = useState(false);
  useEffect(() => {
    let active = true;
    void api.getState?.().then(state => { if (active) setInMatch(!!state.raw?.inGame); }).catch(() => {});
    const off = api.subscribe?.(state => setInMatch(!!state.raw?.inGame));
    return () => { active = false; off?.(); };
  }, [api]);
  return inMatch;
}
/** Local recordings plus the paginated public games, joined by `joinArchive` where they are shown. */
export function useArchive(api: LauncherApi, publicId?: string) {
  const [list, setList] = useState<MatchListItem[]>([]);
  const [message, setMessage] = useState("Loading recordings…");
  const [games, setGames] = useState<{ games: ProfileGame[]; cursor?: string; pages: number }>({ games: [], pages: 0 });
  const [gamesMessage, setGamesMessage] = useState("");
  const [gamesBusy, setGamesBusy] = useState(false);
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++generation.current;
    try { const next = await api.listMatches(); if (request !== generation.current) return; setList(next); setMessage(""); }
    catch (e) { if (request === generation.current) setMessage(String(e)); }
  }, [api]);
  useEffect(() => { void refresh(); const off = api.onMatchesChanged?.(() => void refresh()); return () => { generation.current++; off?.(); }; }, [api, refresh]);
  const page = useCallback(async (cursor: string | undefined, pages: number) => {
    const path = `/api/player/${publicId}/games${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`;
    const r = await api.stats(path); if (r.status !== 200) throw new Error(`Recent games returned ${r.status}. Try again later.`);
    const next = recentGames(r.body);
    // Source keys keep games without an ID apart across pages; they never join on map or date.
    return { cursor: next.cursor, games: next.games.map((g, i) => ({ ...g, sourceKey: `page${pages}:${i}` })) };
  }, [api, publicId]);
  useEffect(() => {
    setGames({ games: [], pages: 0 }); setGamesMessage("");
    if (!publicId || !api.stats) return;
    let active = true; setGamesBusy(true);
    void page(undefined, 0).then(next => { if (active) setGames({ ...next, pages: 1 }); })
      .catch(() => { if (active) setGamesMessage("Public games are unavailable. Local recordings are still shown."); })
      .finally(() => { if (active) setGamesBusy(false); });
    return () => { active = false; };
  }, [api, publicId, page]);
  const more = useCallback(async () => {
    if (!games.cursor) return; setGamesBusy(true);
    try { const next = await page(games.cursor, games.pages); setGames(g => ({ cursor: next.cursor, games: [...g.games, ...next.games], pages: g.pages + 1 })); }
    catch (e) { setGamesMessage(String(e)); } finally { setGamesBusy(false); }
  }, [games, page]);
  return { list, games, refresh, more, message, setMessage, gamesMessage, gamesBusy };
}
const MAX_ENRICHED = 30;
/** Reviews for visible rows, fetched one at a time, cached by file, revision and reserve floor, and paused during a match. */
export function useReviews(api: LauncherApi, files: readonly MatchListItem[], reserveFloor: number | undefined, inMatch: boolean) {
  const [cache, setCache] = useState<ReadonlyMap<string, ReviewResult>>(new Map());
  const keyOf = useCallback((m: MatchListItem) => `${m.file}|${m.durationSec}|${m.endedAtSec}|${reserveFloor}`, [reserveFloor]);
  const wanted = files.slice(0, MAX_ENRICHED);
  const missing = wanted.filter(m => !cache.has(keyOf(m)));
  const missingKey = missing.map(keyOf).join("\n");
  // One request per run: storing its answer changes `missingKey`, which starts the next. Never two at once.
  useEffect(() => {
    const next = missing[0];
    if (inMatch || !next || !api.getReview) return;
    let active = true;
    void api.getReview(next.file).catch((): ReviewResult => ({ status: "unavailable", reason: "invalid" }))
      .then(result => { if (active) setCache(current => new Map(current).set(keyOf(next), result)); });
    return () => { active = false; };
  // `missingKey` names exactly the work this effect does.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, missingKey, inMatch]);
  const waiting = wanted.some(m => cache.get(keyOf(m))?.status === "waiting");
  useEffect(() => {
    if (!waiting || inMatch) return;
    const timer = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      setCache(current => new Map([...current].filter(([, r]) => r.status !== "waiting")));
    }, REVIEW_RETRY_MS);
    return () => clearInterval(timer);
  }, [waiting, inMatch]);
  return useMemo(() => new Map(files.flatMap(m => { const r = cache.get(keyOf(m)); return r ? [[m.file, r] as const] : []; })), [files, cache, keyOf]);
}
const OUTCOME_CLASS: Record<ArchiveRow["outcome"], string> = { Win: "gain", Eliminated: "loss", Incomplete: "muted" };
function rowMode(row: ArchiveRow) {
  if (row.recordings[0]) return reviewMode(row.recordings[0]);
  return /ranked/i.test(row.mode) ? "Ranked" : /team/i.test(row.mode) ? "Teams" : /ffa|free/i.test(row.mode) ? "FFA" : undefined;
}
const rowSummary = (row: ArchiveRow) => !row.recordings.length ? "Local recording unavailable"
  : row.review?.status === "ready" ? reviewHeadline(row.review.review) : row.review?.status === "waiting" ? "Review pending" : row.review ? "Review unavailable" : "—";
type Selection = { key: string; file?: string; match?: RecordedMatch; result?: ReviewResult };
export const MatchesTab = memo(function MatchesTab({ api, settings, initialFile }: { api: LauncherApi; settings?: Settings; initialFile?: string }) {
  const { list, games, refresh, more, message, setMessage, gamesMessage, gamesBusy } = useArchive(api, settings?.publicId);
  const inMatch = useInMatch(api);
  const [selected, setSelected] = useState<Selection>();
  const selection = useRef(0);
  const inMatchRef = useRef(inMatch); inMatchRef.current = inMatch;
  const [mode, setMode] = useState(""); const [map, setMap] = useState("");
  const [filter, setFilter] = useState("");
  const [lastSelected, setLastSelected] = useState<string>();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const recordingsShown = useMemo(() => list.filter(m => (!mode || reviewMode(m) === mode) && (!map || m.map === map)), [list, mode, map]);
  const reviews = useReviews(api, recordingsShown, settings?.reserveFloor, inMatch);
  const rows = useMemo(() => joinArchive(games.games, list, reviews), [games.games, list, reviews]);
  const shown = useMemo(() => rows.filter(r => (!mode || rowMode(r) === mode) && (!map || r.map === map) && (filter !== "Wins" || r.outcome === "Win") && (filter !== "Has review" || r.review?.status === "ready")), [rows, mode, map, filter]);
  async function action(fn: () => Promise<void>) { try { await fn(); setMessage(""); } catch (e) { setMessage(String(e)); } }
  /** The newest request wins: a slow answer for an earlier choice never replaces the current one. */
  const open = useCallback((key: string, file?: string) => {
    const request = ++selection.current; setConfirmingDelete(false); setSelected({ key, file }); setLastSelected(key);
    if (!file) return;
    void (async () => {
      const match = await api.getMatch(file); if (request !== selection.current) return;
      setSelected({ key, file, match });
      const result: ReviewResult = inMatchRef.current || !api.getReview ? { status: "waiting" } : await api.getReview(file);
      if (request === selection.current) setSelected({ key, file, match, result });
    })().catch(e => { if (request === selection.current) setMessage(String(e)); });
  }, [api, setMessage]);
  useEffect(() => { if (initialFile) open(`file:${initialFile}`, initialFile); }, [initialFile, open]);
  const maps = useMemo(() => [...new Set(rows.flatMap(r => r.map && r.map !== "Unknown" ? [r.map] : []))].sort(), [rows]);
  const hasRanks = shown.some(r => r.rank !== undefined);
  const hasGoals = shown.some(r => r.recordings[0]?.practiceGoal !== undefined);
  const close = () => { selection.current++; setSelected(undefined); };
  if (selected) {
    const row = rows.find(r => r.key === selected.key) ?? rows.find(r => r.recordings.some(m => m.file === selected.file));
    const file = selected.file;
    return <section className="stats-tab matches-detail" aria-label="Local matches">
      <div className="detail-actions"><Button icon="back" onClick={close}>All matches</Button>
        {file && <><Button onClick={() => void action(() => api.showMatch(file))}>Export JSON</Button>{!confirmingDelete && <Button onClick={() => setConfirmingDelete(true)}>Delete</Button>}</>}</div>
      {file && confirmingDelete && <div className="detail-actions" role="group" aria-label="Confirm delete"><span>Delete this match? This can't be undone.</span>
        <Button variant="primary" onClick={() => void action(async () => { await api.deleteMatch(file); setConfirmingDelete(false); close(); await refresh(); })}>Delete match</Button>
        <Button onClick={() => setConfirmingDelete(false)}>Cancel</Button></div>}
      {message && <p role="status" className="page-status">{message}</p>}
      {row && row.recordings.length > 1 && <div className="detail-actions" role="group" aria-label="Recordings of this game">{row.recordings.map((m, i) =>
        <Button key={m.file} aria-pressed={m.file === file} onClick={() => open(row.key, m.file)}>Recording {i + 1} · {formatMatchDate(m.startedAt)}</Button>)}</div>}
      {!file ? row && <article className="recording-detail"><h2><span className={`outcome-badge ${OUTCOME_CLASS[row.outcome]}`}>{row.outcome}</span> {row.map} · {row.mode}</h2>
        <p className="muted">{row.startedAt ? formatMatchDate(row.startedAt) : "Date unavailable"} · {row.durationSec === undefined ? "Length unavailable" : formatDuration(row.durationSec)}{row.rank ? ` · Rank #${row.rank}` : ""}</p>
        <p>Local recording unavailable. Accuracy unavailable: a review needs your own recording of this game.</p></article>
        : selected.match && <>
          <ShareCard key={`share-${file}`} match={selected.match} api={api} settings={settings} />
          <MatchRecordingDetail key={file} match={selected.match} selectedGoal={settings?.practiceGoal}
            review={<GameReviewView reviewApi={typeof api.openReviewBoard === "function" ? api : undefined} inMatch={inMatch} file={file} match={selected.match} result={selected.result ?? { status: "waiting" }} onRetry={request => void action(() => api.showTraining(request))}
              onAnnotate={async (t, note) => { const match = await api.annotateMatch(file, t, note); setSelected(current => current?.file === file ? { ...current, match } : current); }} />}
            onSelectGoal={async practiceGoal => { const current = (await api.getState()).settings; await api.saveSettings({ ...current, practiceGoal }); }} />
        </>}
    </section>;
  }
  return <section className="stats-tab matches-page" aria-label="Local matches">
    <header className="page-head"><div><h1 className="ff-page-title">Matches</h1><p className="muted">{list.length} {list.length === 1 ? "match" : "matches"} recorded on this PC.</p></div><div className="page-head-actions"><Button onClick={() => void refresh()}>Refresh</Button><Button variant="ghost" onClick={() => void action(() => api.showMatch())}>Open folder</Button></div></header>
    <div className="matches-grid"><div className="matches-archive ff-glass">
    <div className="matches-filters"><div className="match-chips" role="radiogroup" aria-label="Mode">
      {MODE_OPTIONS.map(option => <button key={option.value} role="radio" aria-checked={mode === option.value && !filter} onClick={() => { setMode(option.value); setFilter(""); }}>{option.value || "All"}</button>)}
      {["Wins", "Has review"].map(label => <button key={label} role="radio" aria-checked={filter === label} onClick={() => { setMode(""); setFilter(label); }}>{label}</button>)}
    </div>{maps.length > 1 && <MapFilter maps={maps} value={map} onChange={setMap} />}</div>
    {message && <p role="status" className="page-status">{message}</p>}{gamesMessage && <p role="status" className="page-status">{gamesMessage}</p>}
    {inMatch && <p className="muted">Reviews wait until your match ends.</p>}
    {shown.length ? <div className="table-scroll"><table className="match-table recordings-table"><thead><tr><th aria-label="Map thumbnail" /><th>Outcome</th><th>Match</th>{hasRanks && <th>Rank</th>}<th>Accuracy</th><th>Worst move</th>{hasGoals && <th>Goal</th>}<th>Troops %</th></tr></thead><tbody>{shown.map(r => {
      const m = r.recordings[0];
      const accuracy = r.review?.status === "ready" ? r.review.review.accuracy.value : undefined;
      const worst = r.review?.status === "ready" ? (["blunder", "costly", "neutral", "good", "great"] as const).find(label => r.review?.status === "ready" && r.review.review.counts[label] > 0) : undefined;
      const folder = spotsFor(r.map)?.folder;
      return <tr key={r.key} className={lastSelected === r.key ? "is-selected" : undefined} onClick={() => open(r.key, m?.file)}>
        <td><div className="match-thumbnail" role="img" aria-label={`${r.map} terrain`} style={{ backgroundImage: folder ? `url("minimaps/${folder}.png")` : undefined }} /></td>
        <td><span className={`outcome-badge ${r.outcome === "Win" || (r.rank !== undefined && r.rank <= 3) ? "gain" : "muted"}`}>{r.outcome}</span></td>
        <td><button className="recording-row" onClick={e => { e.stopPropagation(); open(r.key, m?.file); }}>{r.map} · {r.mode}</button><div className="summary-cell">{rowSummary(r)}</div><div className="match-meta">{r.startedAt ? formatMatchDate(r.startedAt) : "Date unavailable"} · {r.durationSec === undefined ? "—" : formatDuration(r.durationSec)}</div></td>
        {hasRanks && <td>{r.rank ? `#${r.rank}` : "—"}</td>}
        <td className="match-accuracy">{accuracy === undefined ? <span aria-label="Accuracy unavailable">—</span> : <><span className="accuracy-track"><i style={{ width: `${accuracy}%` }} /></span><span>{accuracy}%</span></>}</td>
        <td>{worst ? <QualityBadge label={worst} glyphOnly /> : "—"}</td>
        {hasGoals && <td className={`goal-cell ${m?.practiceGoal?.status === "hit" ? "gain" : "muted"}`} title={m?.practiceGoal ? PRACTICE_GOALS[m.practiceGoal.id] : undefined}>{goalCell(m?.practiceGoal?.status)}</td>}
        <td className="sparkline-cell">{m ? <Sparkline values={m.sparkline} label={`Troops % of max on ${r.map}`} /> : <span className="muted">—</span>}</td>
      </tr>;
    })}</tbody></table></div>
      : !message && <p>{rows.length ? "No matches fit these filters." : "No recordings yet. A recording starts when a match is observed."}</p>}
    {games.cursor && <Button disabled={gamesBusy} onClick={() => void more()}>Load more games</Button>}
    </div><aside className="matches-trend ff-glass"><TrendStrip archiveRows={shown} matches={list} recordings={list} goal={settings?.practiceGoal} mode={mode} map={map} /></aside></div>
    <p className="page-foot">Recordings are saved only on this PC; the newest 200 are kept. Public games come from your OpenFront profile.</p>
    <div className="matches-briefing"><NextMatchPlate api={api} settings={settings} recordings={list} /></div>
  </section>;
}, (a, b) => a.api === b.api && a.initialFile === b.initialFile && JSON.stringify(a.settings) === JSON.stringify(b.settings));
const coverageLabel = (m?: import("@flashfront/core").TrendMatch) => { const coverage = m && recordingCoverage(m); return coverage === undefined ? "Unavailable" : `${Math.floor(coverage * 100)}%`; };
/** Matches list: the practice goal outcome as one short word in its own column. */
const goalCell = (status?: import("@flashfront/core").GoalProgress["status"]) => status === "hit" ? "hit" : status === "miss" ? "missed" : "n/a";
export function MatchRecordingDetail({ match: m, selectedGoal, onSelectGoal, onAnnotate, review: gameReview }: { match: RecordedMatch; review?: ReactNode; selectedGoal?: PracticeGoal; onSelectGoal?: (goal: PracticeGoal) => Promise<void>; onAnnotate?: (t: number, note: string) => Promise<void> }) {
  const [goalMessage, setGoalMessage] = useState("");
  const [savingGoal, setSavingGoal] = useState(false);
  const notes = useMemo(() => coachMatch(m), [m]);
  const review = useMemo(() => debrief(m), [m]);
  return <article className="recording-detail">
    <h2>{m.map} · {m.mode}</h2><p className="muted">{formatMatchDate(m.startedAt)} · {formatDuration(m.durationSec)} · Final observed rank {m.summary.finalRank ? `#${m.summary.finalRank}` : "unknown"}</p>
    {gameReview ?? <p className="muted">Observed coverage: {coverageLabel(m)}. Sample gaps longer than 10 seconds are excluded.</p>}
    {review && <DebriefView review={review} />}
    {m.spawn && <OwnSpawn match={m} />}
    {!gameReview && <Timeline match={m} notes={notes} onAnnotate={onAnnotate} />}
    {m.practiceGoal && <p>Practice goal: {PRACTICE_GOALS[m.practiceGoal.id]} · {m.practiceGoal.status === "unknown" ? "not enough observations" : m.practiceGoal.status}</p>}
    {onSelectGoal && <section aria-label="Next match practice goal"><h3>One goal for next match</h3><p className="muted">Optional practice based on this recording. Choose one; it takes effect when the next recording starts.</p>
      {suggestedGoals(m).map(goal => <button key={goal} disabled={savingGoal} aria-pressed={selectedGoal === goal} onClick={() => {
        setSavingGoal(true); void onSelectGoal(goal).then(() => setGoalMessage(`Saved for next match: ${PRACTICE_GOALS[goal]}`)).catch(e => setGoalMessage(String(e))).finally(() => setSavingGoal(false));
      }}>{PRACTICE_GOALS[goal]}</button>)}
      {!suggestedGoals(m).length && <p className="muted">No new practice suggestion from these observations.</p>}
      {selectedGoal && <p>Selected: {PRACTICE_GOALS[selectedGoal]}</p>}{goalMessage && <p role="status">{goalMessage}</p>}
    </section>}
    <details><summary><Icon name="chevron" className="disclosure-chevron" />Observed events ({m.events.length})</summary><ul>{m.events.map((e, i) => <li key={i}>{formatDuration(e.t)} · {e.kind}{e.kind === "build" ? ` · ${e.unit} +${e.levels}` : e.kind === "zone" ? ` · ${zoneLabel(e.zone)}` : ""}</li>)}</ul></details>
  </article>;
}

export function DebriefView({ review }: { review: Debrief }) {
  return <section aria-label="Death debrief"><h3>Last {formatDuration(review.windowSec)}</h3>
    <p>{review.reserveBeforeLastPush !== undefined && `Reserve before push: ${Math.floor(review.reserveBeforeLastPush * 100)}%. `}
      {review.reserveAfterLastPush !== undefined && `After: ${Math.floor(review.reserveAfterLastPush * 100)}%. `}
      Peak incoming: {formatTroops(review.peakIncoming)}. Land lost: {Math.floor(review.landLostPct * 10) / 10}%.</p>
    <ul>{review.lines.map((line, i) => <li key={i}>{line}</li>)}</ul><p className="muted">Observed sequence; causes are not recorded.</p>
  </section>;
}
export function OwnSpawn({ match }: { match: ReviewMatch }) {
  const [size, setSize] = useState<"Normal" | "Compact">(match.mapSize ?? "Normal");
  const map = spotsFor(match.map, size); const spawn = match.spawn;
  if (!spawn) return null;
  const valid = map && Number.isFinite(spawn.x) && Number.isFinite(spawn.y) && spawn.x >= 0 && spawn.y >= 0 && spawn.x < map.width && spawn.y < map.height;
  return <details aria-label="Your spawn"><summary><Icon name="chevron" className="disclosure-chevron" />Your spawn</summary><p>{match.outcome ?? "Outcome unknown"} · ({spawn.x}, {spawn.y})</p>
    {!match.mapSize && <div><span className="field-label">Map size</span><Segmented label="Map size" options={[{ value: "Normal", label: "Normal" }, { value: "Compact", label: "Compact" }]} value={size} onChange={setSize} /><small className="muted"> Map size was not saved with this recording.</small></div>}
    {map && valid ? <div className="spawn-minimap" style={{ width: Math.min(360, 240 * map.width / map.height), aspectRatio: `${map.width} / ${map.height}`, margin: "12px 0" }}>
      <img src={`./minimaps/${map.folder}.png`} alt={`${map.displayName} terrain minimap`} width={map.width} height={map.height} />
      <span className="spawn-marker" aria-label="Your recorded spawn" style={{ left: `${spawn.x / map.width * 100}%`, top: `${spawn.y / map.height * 100}%` }}>You</span>
    </div> : <p className="muted">Minimap unavailable for this map or coordinate.</p>}
    <p className="muted" style={{ fontSize: 11 }}>{MAP_ATTRIBUTION}</p>
  </details>;
}

export function ProfileTab({ api, settings }: { api: LauncherApi; settings: Settings }) {
  const id = settings.publicId;
  const { list, games } = useArchive(api, id);
  const inMatch = useInMatch(api);
  const recent = useMemo(() => [...list].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt)).slice(0, MAX_ENRICHED), [list]);
  const reviews = useReviews(api, recent, settings.reserveFloor, inMatch);
  const archive = useMemo(() => joinArchive(games.games, list, new Map()), [games.games, list]);
  const overview = useMemo(() => statsOverview(archive), [archive]);
  const accuracy = [...recent].reverse().flatMap((m, t) => {
    const result = reviews.get(m.file);
    const value = result?.status === "ready" ? result.review.accuracy.value : undefined;
    return value !== undefined && Number.isFinite(value) ? [{ t, value }] : [];
  });
  const land = list.flatMap(m => m.summary?.peakLandPct !== undefined && Number.isFinite(m.summary.peakLandPct) ? [m.summary.peakLandPct] : []);
  const finished = overview.wins + overview.eliminated > 0;
  const trend = useMemo(() => heroTrend(matchTrend(list, settings.practiceGoal), settings.practiceGoal), [list, settings.practiceGoal]);
  const plates = [
    ["Average accuracy", accuracy.length ? `${Math.round(accuracy.reduce((sum, p) => sum + p.value, 0) / accuracy.length)}%` : "Unavailable"],
    ["Wins", finished ? overview.wins : "Unavailable"],
    ["Best streak", finished ? overview.bestWinStreak : "Unavailable"],
    ["Best map", overview.bestMap ?? "Unavailable"],
    ["Hardest map", overview.worstMap ?? "Unavailable"],
    ["Most land held", land.length ? `${Math.max(...land).toFixed(1)}%` : "Unavailable"],
  ];
  const [draft, setDraft] = useState(id ?? "");
  const [profile, setProfile] = useState<PlayerProfile>();
  const [rows, setRows] = useState<TypeStats[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setDraft(id ?? ""); setProfile(undefined); setRows([]); setMessage(""); setBusy(false);
    if (!id) return;
    let active = true; setBusy(true);
    const get = async (path: string) => { const r = await api.stats(path); if (r.status !== 200) throw new Error(`Public stats returned ${r.status}. Try again later.`); return r.body; };
    void (async () => {
      const player = await get(`/api/player/${id}`);
      if (!active) return;
      setProfile(profileFromApi(id, player)); setRows(profileStats(player));
      const results = await Promise.allSettled([get("/api/leaderboard/ranked?page=1"), get("/api/leaderboard/ranked?page=2")]);
      if (!active) return;
      setProfile(profileFromApi(id, player, results.flatMap(r => r.status === "fulfilled" ? [r.value] : [])));
    })().catch(e => { if (active) setMessage(String(e)); }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [api, id]);
  return <section className="profile-page" aria-label="Public profile"><h1 className="ff-page-title">Profile</h1>
    <div className="profile-plates">{plates.map(([label, value]) => <section key={label} className="profile-plate ff-glass" aria-label={String(label)}><h2>{label}</h2><strong data-unavailable={value === "Unavailable" ? "true" : undefined}>{value}</strong>{label === "Average accuracy" && accuracy.length > 1 && <Sparkline values={accuracy} label="Recorded accuracy over recent matches" />}</section>)}</div>
    <p className="muted">Wins and streaks use listed games. Maps need three finished games. Accuracy uses available reviews from your latest 30 recordings. Land uses recorded percentages.</p>
    <section className="profile-details ff-glass" aria-label="Recorded progress">
      {list.length ? <div className="trend-hero"><span className="trend-hero-value">{trend.value}</span><div className="trend-hero-text"><strong>{trend.label}</strong><span>{trend.comparison}</span></div></div> : <p className="muted">Your trend appears after your first recorded match.</p>}
      <p>{archive.length ? `${overview.wins} won · ${overview.eliminated} eliminated · ${overview.incomplete} incomplete` : "Record: Unavailable"}</p>
      <p>Current win streak: {finished ? overview.currentWinStreak : "Unavailable"}. Incomplete games end a streak.</p>
      <h2>Personal bests by mode</h2><PersonalBestsTable bests={personalBests(list)} /></section>
    <section className="profile-details ff-glass"><h2>Public profile</h2>
    <details className="profile-id-editor" open={!profile}><summary><Icon name="chevron" className="disclosure-chevron" />{profile ? "Edit public ID" : "Connect public profile"}</summary><form onSubmit={e => { e.preventDefault(); void api.saveSettings({ ...settings, publicId: draft }).then(() => setMessage("Public ID saved.")).catch(e => setMessage(String(e))); }}>
      <label>Public ID<input value={draft} maxLength={8} pattern="[A-Za-z0-9]{8}" onChange={e => setDraft(e.target.value)} aria-describedby="profile-id-hint" /></label><p id="profile-id-hint" className="muted">{PUBLIC_ID_HINT}</p><button>Save public ID</button>
    </form></details>
    {busy && !profile && <p role="status">Loading public stats…</p>}{message && <p role="status" className="notice">{message}</p>}
    {!id && <p>Enter your public ID, or finish a match to try automatic profile resolution. No login is needed.</p>}
    {profile && <><div className="profile-identity"><h3>{profile.clanTag && `[${profile.clanTag}] `}{profile.name}</h3><button aria-label="Copy public ID" onClick={() => void navigator.clipboard.writeText(id!).then(() => setMessage("Public ID copied.")).catch(e => setMessage(String(e)))}><Icon name="copy" /> {id}</button></div><div className="profile-metric-strip"><div><span className="label">Games</span><strong>{rows.length ? profile.gamesPlayed : "Unavailable"}</strong></div><div><span className="label">Wins</span><strong>{rows.length ? profile.wins : "Unavailable"}</strong></div></div><p>{profile.rankedElo !== undefined ? `${profile.rankedElo} ELO · ${profile.rankedTier}` : "Ranked ELO is not available on leaderboard pages 1–2."}</p>
      <table className="profile-table"><thead><tr><th>Type</th><th>Games</th><th>Wins</th></tr></thead><tbody>{rows.map(r => <tr key={r.type}><td>{r.type}</td><td>{r.games}</td><td>{r.wins}</td></tr>)}</tbody></table>
      <p className="muted">Your public games are listed in Matches, next to your recordings.</p></>}
  </section></section>;
}

/** Reads the same local recording and coach used by match detail. */
export function NextMatchPlate({ api, settings, recordings, onOpenReview, live = false }: { api: LauncherApi; settings?: Settings; recordings?: MatchListItem[]; onOpenReview?: () => void; live?: boolean }) {
  const [latestMatch, setLatestMatch] = useState<MatchListItem>();
  const [gameReview, setGameReview] = useState<ReviewResult>();
  const [notes, setNotes] = useState<CoachNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [review, setReview] = useState<Debrief>();
  useEffect(() => recordings ? undefined : api.onMatchesChanged?.(() => setRevision(n => n + 1)), [api, recordings]);
  useEffect(() => {
    let active = true;
    setLoading(true); setError(""); setNotes([]); setReview(undefined); setLatestMatch(undefined); setGameReview(undefined);
    void (async () => {
      const list = recordings ?? await api.listMatches();
      const latest = [...list].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))[0];
      if (active) setLatestMatch(latest);
      if (onOpenReview) {
        if (latest && api.getReview && !live) {
          const result = await api.getReview(latest.file);
          if (active) setGameReview(result);
        }
        return;
      }
      if (latest?.notes) {
        const notes = latest.notes.map((note, i) => i === 2 && settings?.practiceGoal ? { ...note, text: `Next match goal: ${PRACTICE_GOALS[settings.practiceGoal]}.` } : note);
        if (active) { setNotes(notes); setReview(latest.review); }
        return;
      }
      const match = latest ? await api.getMatch(latest.file) : undefined;
      if (active) { setNotes(match ? nextMatchNotes(match, settings?.practiceGoal) : []); setReview(match ? debrief(match) : undefined); }
    })().catch(e => { if (active) setError(String(e)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [api, recordings, settings?.practiceGoal, revision, !!onOpenReview, live]);
  if (onOpenReview) {
    const result = gameReview?.status === "ready" ? gameReview.review : undefined;
    const accuracy = result?.accuracy.value;
    return <section className="last-match play-card ff-glass" aria-label="Last match">
      <header className="play-card-heading"><h2>Last match</h2>{latestMatch && <span>{latestMatch.finalRank ? `Place ${latestMatch.finalRank}` : "Place unavailable"} · {latestMatch.map}</span>}</header>
      {loading ? <p role="status">Reading your latest match…</p> : !latestMatch ? <p>{error ? "Latest match unavailable. Try again in Matches." : "Play a match and your review shows up here."}</p> : <>
        <div className="last-match-summary">
          <div className="play-accuracy" aria-label={accuracy === undefined ? "Accuracy unavailable" : `Accuracy ${accuracy}%`} style={{ background: accuracy === undefined ? undefined : `conic-gradient(var(--ff-good) ${accuracy}%, var(--glass-edge) 0)` }}><span>{accuracy === undefined ? "—" : accuracy}<small>{accuracy === undefined ? "Unavailable" : "% accuracy"}</small></span></div>
          <div><p>{result ? reviewHeadline(result) : live ? "Reviews wait until your match ends." : gameReview?.status === "waiting" ? "Your review is still being prepared." : "Head coach unavailable."}</p>
            <ul className="play-move-counts" aria-label="Move labels">{([['great', 'Great'], ['good', 'Good'], ['costly', 'Costly'], ['blunder', 'Blunder']] as const).map(([key, label]) => <li key={key} className={`move-${key}`}><span className="move-glyph" aria-hidden="true">{QUALITY_GLYPHS[key]}</span><span>{label}</span><strong>{result?.counts[key] ?? "Unavailable"}</strong></li>)}</ul>
          </div>
        </div>
        <div className="play-card-actions"><Button className="ff-btn-secondary" onClick={onOpenReview}>Open Game Review</Button></div>
      </>}
    </section>;
  }
  return <section className="next-match" aria-label="Next match">
    <h2>Next match</h2>
    {loading || error || !notes.length ? <p>{loading ? "Reading your latest match…" : error ? "Latest coaching is unavailable. Refresh Matches to try again." : "Play a match with the HUD connected to record your growth and reserves. Your first coaching note will appear here."}</p>
      : <ol className="coach-notes">{notes.slice(0, 3).map((note, i) => <li key={i} className={`coach-${note.severity}`}><span className="label">{["Success", "Lesson", "Goal"][i]}</span><p>{note.text}</p></li>)}</ol>}
    <p className="practice-goal muted">{settings?.practiceGoal ? `Practice goal: ${PRACTICE_GOALS[settings.practiceGoal]}` : "Choose one practice goal after reviewing a recorded match."}</p>
    {review && <DebriefView review={review} />}
  </section>;
}

/** Stats overview over joined, deduplicated games. Public totals stay on the profile, labelled separately. */
export function StatsOverview({ api, settings }: { api: LauncherApi; settings?: Settings }) {
  const { list, games } = useArchive(api, settings?.publicId);
  const rows = useMemo(() => joinArchive(games.games, list, new Map()), [games.games, list]);
  const o = useMemo(() => statsOverview(rows), [rows]);
  const bests = useMemo(() => personalBests(list), [list]);
  const goal = settings?.practiceGoal;
  const trend = useMemo(() => heroTrend(matchTrend(list, goal), goal), [list, goal]);
  const total = o.wins + o.eliminated + o.incomplete;
  const unavailable = "Unavailable";
  return <section className="stats-overview" aria-label="Stats overview"><h2>Overview</h2>
    {list.length ? <div className="trend-hero" data-trend-hero><span className="trend-hero-value">{trend.value}</span><div className="trend-hero-text"><strong>{trend.label}</strong><span>{trend.comparison}</span></div></div>
      : <p className="muted">Your trend appears after your first recorded match.</p>}
    <div className="profile-metric-strip">
      <div><span className="label">Record · {games.cursor ? "Loaded games" : "Listed games"}</span><strong>{total ? `${o.wins} won · ${o.eliminated} eliminated · ${o.incomplete} incomplete` : unavailable}</strong></div>
      <div><span className="label">Win streak</span><strong>{total ? `${o.currentWinStreak} now · best ${o.bestWinStreak}` : unavailable}</strong></div>
      <div><span className="label">Best map</span><strong>{o.bestMap ?? unavailable}</strong></div>
      <div><span className="label">Worst map</span><strong>{o.worstMap ?? unavailable}</strong></div>
    </div>
    <p className="muted">Maps are ranked once they have three finished games. An incomplete game ends a streak.</p>
    <h3>Personal bests by mode</h3><PersonalBestsTable bests={bests} />
  </section>;
}



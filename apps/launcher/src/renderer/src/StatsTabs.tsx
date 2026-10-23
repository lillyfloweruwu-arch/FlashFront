import { memo, useMemo, useCallback, useEffect, useRef, useState } from "react";
import { coachMatch, debrief, nextMatchNotes, recordingCoverage, spotsFor, MAP_ATTRIBUTION, zoneLabel, formatDuration, formatTroops, PRACTICE_GOALS, reviewMode, suggestedGoals, type CoachNote, type PracticeGoal, type RecordedMatch, type ReviewMatch, type PlayerProfile, type Debrief } from "@flashfront/core";
import { TrendStrip } from "./TrendStrip";
import { Timeline } from "./Timeline";
import { ShareCard } from "./ShareCard";
import { Sparkline, Icon, Button, Segmented, formatMatchDate } from "@flashfront/ui";
import "./pages.css";
import type { LauncherApi, Settings } from "../../shared";
import type { MatchListItem } from "../../main/recorder";
import { profileFromApi, profileStats, recentGames, type TypeStats } from "../../stats";

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
export const MatchesTab = memo(function MatchesTab({ api, settings }: { api: LauncherApi; settings?: Settings }) {
  const [list, setList] = useState<MatchListItem[]>([]);
  const [selected, setSelected] = useState<{ file: string; match: RecordedMatch }>();
  const [mode, setMode] = useState(""); const [map, setMap] = useState("");
  const generation = useRef(0);
  const [message, setMessage] = useState("Loading recordings…");
  const refresh = useCallback(async () => {
    const request = ++generation.current;
    try {
      const next = await api.listMatches(); if (request !== generation.current) return;
      setList(next); setMessage("");
      setSelected(current => current && next.some(item => item.file === current.file) ? current : undefined);
    } catch (e) { if (request === generation.current) setMessage(String(e)); }
  }, [api]);
  useEffect(() => { void refresh(); const off = api.onMatchesChanged?.(() => void refresh()); return () => { generation.current++; off?.(); }; }, [api, refresh]);
  async function action(fn: () => Promise<void>) { try { await fn(); setMessage(""); } catch (e) { setMessage(String(e)); } }
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const open = (file: string) => void action(async () => { setConfirmingDelete(false); setSelected({ file, match: await api.getMatch(file) }); });
  const maps = useMemo(() => [...new Set(list.flatMap(m => m.map ? [m.map] : []))].sort(), [list]);
  const shown = useMemo(() => list.filter(m => (!mode || reviewMode(m) === mode) && (!map || m.map === map)), [list, mode, map]);
  const hasRanks = shown.some(m => m.finalRank !== undefined);
  const hasGoals = shown.some(m => m.practiceGoal !== undefined);
  if (selected) return <section className="stats-tab" aria-label="Local matches">
    <div className="detail-actions"><Button icon="back" onClick={() => setSelected(undefined)}>All matches</Button><Button onClick={() => void action(() => api.showMatch(selected.file))}>Export JSON</Button>{!confirmingDelete && <Button onClick={() => setConfirmingDelete(true)}>Delete</Button>}</div>
    {confirmingDelete && <div className="detail-actions" role="group" aria-label="Confirm delete"><span>Delete this match? This can't be undone.</span>
      <Button variant="primary" onClick={() => void action(async () => { await api.deleteMatch(selected.file); setConfirmingDelete(false); setSelected(undefined); await refresh(); })}>Delete match</Button>
      <Button onClick={() => setConfirmingDelete(false)}>Cancel</Button></div>}
    {message && <p role="status" className="page-status">{message}</p>}
    <ShareCard key={`share-${selected.file}`} match={selected.match} api={api} settings={settings} />
    <MatchRecordingDetail key={selected.file} match={selected.match} selectedGoal={settings?.practiceGoal} onAnnotate={async (t, note) => {
      const match = await api.annotateMatch(selected.file, t, note);
      setSelected(current => current?.file === selected.file ? { ...current, match } : current);
    }} onSelectGoal={async practiceGoal => {
      const current = (await api.getState()).settings;
      await api.saveSettings({ ...current, practiceGoal });
    }} />
  </section>;
  return <section className="stats-tab matches-page" aria-label="Local matches">
    <header className="page-head"><h1>Matches</h1><div className="page-head-actions"><Button onClick={() => void refresh()}>Refresh</Button><Button variant="ghost" onClick={() => void action(() => api.showMatch())}>Open folder</Button></div></header>
    <div className="matches-filters"><div><span className="field-label">Mode</span><Segmented label="Mode" options={MODE_OPTIONS} value={mode} onChange={setMode} /></div>
      {maps.length > 1 && <MapFilter maps={maps} value={map} onChange={setMap} />}</div>
    {message && <p role="status" className="page-status">{message}</p>}
    {list.length > 0 && <TrendStrip matches={list} recordings={list} goal={settings?.practiceGoal} mode={mode} map={map} />}
    {shown.length ? <div className="table-scroll"><table className="match-table recordings-table"><thead><tr><th>Map</th><th>Date</th><th>Mode</th><th>Duration</th><th>Coverage</th>{hasRanks && <th>Final rank</th>}{hasGoals && <th>Goal</th>}<th>Troops %</th></tr></thead><tbody>{shown.map(m => <tr key={m.file} onClick={() => open(m.file)}>
      <td><button className="recording-row" onClick={e => { e.stopPropagation(); open(m.file); }}>{m.map}</button></td>
      <td className="date-cell">{formatMatchDate(m.startedAt)}</td>
      <td>{m.mode}</td><td>{formatDuration(m.durationSec)}</td><td>{coverageLabel(m)}</td>{hasRanks && <td>{m.finalRank ? `#${m.finalRank}` : "—"}</td>}
      {hasGoals && <td className={`goal-cell ${m.practiceGoal?.status === "hit" ? "gain" : "muted"}`} title={m.practiceGoal ? PRACTICE_GOALS[m.practiceGoal.id] : undefined}>{goalCell(m.practiceGoal?.status)}</td>}
      <td className="sparkline-cell"><Sparkline values={m.sparkline} label={`Troops % of max on ${m.map}`} /></td>
    </tr>)}</tbody></table></div>
      : !message && <p>{list.length ? "No recordings match these filters." : "No recordings yet. A recording starts when a match is observed."}</p>}
    <p className="page-foot">Your numbers, saved only on this PC. The newest 200 recordings are kept.</p>
    <div className="matches-briefing"><NextMatchPlate api={api} settings={settings} recordings={list} /></div>
  </section>;
}, (a, b) => a.api === b.api && JSON.stringify(a.settings) === JSON.stringify(b.settings));
const coverageLabel = (m?: import("@flashfront/core").TrendMatch) => { const coverage = m && recordingCoverage(m); return coverage === undefined ? "Unavailable" : `${Math.floor(coverage * 100)}%`; };
/** Matches list: the practice goal outcome as one short word in its own column. */
const goalCell = (status?: import("@flashfront/core").GoalProgress["status"]) => status === "hit" ? "hit" : status === "miss" ? "missed" : "n/a";
export function MatchRecordingDetail({ match: m, selectedGoal, onSelectGoal, onAnnotate }: { match: RecordedMatch; selectedGoal?: PracticeGoal; onSelectGoal?: (goal: PracticeGoal) => Promise<void>; onAnnotate?: (t: number, note: string) => Promise<void> }) {
  const [goalMessage, setGoalMessage] = useState("");
  const [savingGoal, setSavingGoal] = useState(false);
  const notes = useMemo(() => coachMatch(m), [m]);
  const review = useMemo(() => debrief(m), [m]);
  return <article className="recording-detail">
    <h2>{m.map} · {m.mode}</h2><p className="muted">{formatMatchDate(m.startedAt)} · {formatDuration(m.durationSec)} · Final observed rank {m.summary.finalRank ? `#${m.summary.finalRank}` : "unknown"}</p>
    <p className="muted">Observed coverage: {coverageLabel(m)}. Sample gaps longer than 10 seconds are excluded.</p>
    {review && <DebriefView review={review} />}
    {m.spawn && <OwnSpawn match={m} />}
    <Timeline match={m} notes={notes} onAnnotate={onAnnotate} />
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
  const [draft, setDraft] = useState(id ?? "");
  const [profile, setProfile] = useState<PlayerProfile>();
  const [rows, setRows] = useState<TypeStats[]>([]);
  const [history, setHistory] = useState<ReturnType<typeof recentGames>>({ games: [], cursor: undefined });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setDraft(id ?? ""); setProfile(undefined); setRows([]); setHistory({ games: [], cursor: undefined }); setMessage(""); setBusy(false);
    if (!id) return;
    let active = true; setBusy(true);
    const get = async (path: string) => { const r = await api.stats(path); if (r.status !== 200) throw new Error(`Public stats returned ${r.status}. Try again later.`); return r.body; };
    void (async () => {
      const player = await get(`/api/player/${id}`);
      if (!active) return;
      setProfile(profileFromApi(id, player)); setRows(profileStats(player));
      const results = await Promise.allSettled([get(`/api/player/${id}/games`), get("/api/leaderboard/ranked?page=1"), get("/api/leaderboard/ranked?page=2")]);
      if (!active) return;
      if (results[0]!.status === "fulfilled") setHistory(recentGames(results[0]!.value));
      else setMessage("Recent games are unavailable. Profile loaded; try again later.");
      setProfile(profileFromApi(id, player, results.slice(1).flatMap(r => r.status === "fulfilled" ? [r.value] : [])));
    })().catch(e => { if (active) setMessage(String(e)); }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [api, id]);
  async function more() {
    if (!history.cursor || !id) return; setBusy(true);
    try {
      const r = await api.stats(`/api/player/${id}/games?cursor=${encodeURIComponent(history.cursor)}`);
      if (r.status !== 200) throw new Error(`Recent games returned ${r.status}`);
      const next = recentGames(r.body); setHistory(h => ({ cursor: next.cursor, games: [...h.games, ...next.games] }));
    } catch (e) { setMessage(String(e)); } finally { setBusy(false); }
  }
  return <section className="stats-tab" aria-label="Public profile"><h2>Profile</h2>
    <details className="profile-id-editor" open={!profile}><summary><Icon name="chevron" className="disclosure-chevron" />{profile ? "Edit public ID" : "Connect public profile"}</summary><form onSubmit={e => { e.preventDefault(); void api.saveSettings({ ...settings, publicId: draft }).then(() => setMessage("Public ID saved.")).catch(e => setMessage(String(e))); }}>
      <label>Public ID<input value={draft} maxLength={8} pattern="[A-Za-z0-9]{8}" onChange={e => setDraft(e.target.value)} aria-describedby="profile-id-hint" /></label><p id="profile-id-hint" className="muted">{PUBLIC_ID_HINT}</p><button>Save public ID</button>
    </form></details>
    {busy && !profile && <p role="status">Loading public stats…</p>}{message && <p role="status" className="notice">{message}</p>}
    {!id && <p>Enter your public ID, or finish a match to try automatic profile resolution. No login is needed.</p>}
    {profile && <><div className="profile-identity"><h3>{profile.clanTag && `[${profile.clanTag}] `}{profile.name}</h3><button aria-label="Copy public ID" onClick={() => void navigator.clipboard.writeText(id!).then(() => setMessage("Public ID copied.")).catch(e => setMessage(String(e)))}><Icon name="copy" /> {id}</button></div><div className="profile-metric-strip"><div><span className="label">Games</span><strong>{profile.gamesPlayed}</strong></div><div><span className="label">Wins</span><strong>{profile.wins}</strong></div></div><p>{profile.rankedElo !== undefined ? `${profile.rankedElo} ELO · ${profile.rankedTier}` : "Ranked ELO is not available on leaderboard pages 1–2."}</p>
      <table className="profile-table"><thead><tr><th>Type</th><th>Games</th><th>Wins</th></tr></thead><tbody>{rows.map(r => <tr key={r.type}><td>{r.type}</td><td>{r.games}</td><td>{r.wins}</td></tr>)}</tbody></table>
      <h3>Recent games</h3>{history.games.length ? <div className="table-scroll"><table className="match-table recent-games"><thead><tr><th>Map / result</th><th>Date</th><th>Mode</th><th>Duration</th></tr></thead><tbody>{history.games.map((g, i) => <tr key={`${g.id}-${i}`}><td>{g.map} · {g.result}</td><td className="muted">{g.start ? formatMatchDate(g.start) : "Date unavailable"}</td><td>{g.mode}</td><td>{formatDuration(g.duration)}</td></tr>)}</tbody></table></div> : <p>No recent games available.</p>}
      {history.cursor && <button disabled={busy} onClick={() => void more()}>Load more games</button>}</>}
  </section>;
}

/** Reads the same local recording and coach used by match detail. */
export function NextMatchPlate({ api, settings, recordings }: { api: LauncherApi; settings?: Settings; recordings?: MatchListItem[] }) {
  const [notes, setNotes] = useState<CoachNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [review, setReview] = useState<Debrief>();
  useEffect(() => recordings ? undefined : api.onMatchesChanged?.(() => setRevision(n => n + 1)), [api, recordings]);
  useEffect(() => {
    let active = true;
    setLoading(true); setError(""); setNotes([]); setReview(undefined);
    void (async () => {
      const list = recordings ?? await api.listMatches();
      const latest = [...list].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))[0];
      if (latest?.notes) {
        const notes = latest.notes.map((note, i) => i === 2 && settings?.practiceGoal ? { ...note, text: `Next match goal: ${PRACTICE_GOALS[settings.practiceGoal]}.` } : note);
        if (active) { setNotes(notes); setReview(latest.review); }
        return;
      }
      const match = latest ? await api.getMatch(latest.file) : undefined;
      if (active) { setNotes(match ? nextMatchNotes(match, settings?.practiceGoal) : []); setReview(match ? debrief(match) : undefined); }
    })().catch(e => { if (active) setError(String(e)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [api, recordings, settings?.practiceGoal, revision]);
  return <section className="next-match" aria-label="Next match">
    <h2>Next match</h2>
    {loading || error || !notes.length ? <p>{loading ? "Reading your latest match…" : error ? "Latest coaching is unavailable. Refresh Matches to try again." : "Play a match with the HUD connected to record your growth and reserves. Your first coaching note will appear here."}</p>
      : <ol className="coach-notes">{notes.slice(0, 3).map((note, i) => <li key={i} className={`coach-${note.severity}`}><span className="label">{["Success", "Lesson", "Goal"][i]}</span><p>{note.text}</p></li>)}</ol>}
    <p className="practice-goal muted">{settings?.practiceGoal ? `Practice goal: ${PRACTICE_GOALS[settings.practiceGoal]}` : "Choose one practice goal after reviewing a recorded match."}</p>
    {review && <DebriefView review={review} />}
  </section>;
}

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import type { Decision, GameSnapshot } from "@flashfront/core";
import { DEFAULT_HOTKEYS, incomingAlarm, matchesHotkey, openingItems, openingVisible, TradeMonitor, PushTracker } from "@flashfront/core";
import { OpeningPanel } from "./OpeningPanel";
import { TradePanel } from "./TradePanel";
import { GoalPanel, goalComplete } from "./GoalPanel";
import { AlliancePanel } from "./AlliancePanel";
import { BuildIdleTracker } from "./build-idle";
import { BuildPlanner } from "./BuildPlanner";
import { EventFeed, fieldReports, type ReportFilter } from "./EventFeed";
import { GrowthGauge } from "./GrowthGauge";
import { AttackPreview } from "./AttackPreview";
import { MatchClock } from "./MatchClock";
import { SelfStatsBar } from "./SelfStatsBar";
import type { CameraSubscription } from "./heat-camera";
import { SpawnHeatHint, SpawnHeatmap } from "./SpawnHeatmap";
import { TeamSwatch, type OwnTeam } from "./TeamSwatch";
import { arrangePanels, columnOverflow, presetLayout, LocalStorageLayoutStore, panelIds, snapPosition, stackColumns, type HudLayout, type HudPreset, type LayoutStore, type PanelId, type PanelLayout } from "./layout";

import { Icon, type IconName } from "../icons";
import { ModuleHeader } from "./Module";
import { DecisionTracker, SNOOZE_HOTKEY } from "@flashfront/core";
import { DecisionCard } from "./DecisionCard";
const moduleIcons: Record<PanelId, IconName> = { decision: "info", clock: "clock", self: "profile", spawn: "spawn", gauge: "growth", attack: "attack", build: "build", alliances: "alliance", events: "events", opening: "opening", trade: "trade", goal: "goal" };
const titles: Record<PanelId, string> = { decision: "Your next decision", clock: "Match overview", self: "Your position", spawn: "Spawn spots", gauge: "Troop growth", attack: "Attack preview", build: "Build planner", alliances: "Alliances", events: "Field reports", opening: "Opening checklist", trade: "Trade monitor", goal: "Practice goal" };
type Feature = "growth" | "attack" | "build" | "trade" | "alliances" | "spawnHeat";
type HealthStatus = "verified" | "paused" | "unavailable";
const dependencies: Partial<Record<PanelId, Feature[]>> = {
  gauge: ["growth"], attack: ["attack"], build: ["build"], trade: ["trade"], alliances: ["alliances"], spawn: ["spawnHeat"],
  decision: ["growth", "attack", "alliances"], self: ["growth", "attack", "build"],
  opening: ["growth", "build", "alliances"], events: ["attack", "build"], goal: ["growth", "attack", "build", "trade", "alliances"],
};
const healthLabel = (status: HealthStatus) => status === "paused" ? "estimate paused" : "unavailable";
/**
 * Optional detail dropped, in this order, while a live column runs past its bound (0.2.1 item 3):
 * old reports, a completed goal, the trade breakdown, building alternatives, the opening evidence
 * note, the last-push line. Panels never move off-screen or inward to make room.
 */
const TRIM = { oldReports: 1, completedGoal: 2, tradeBreakdown: 3, buildAlternatives: 4, openingEvidence: 5, lastPush: 6 } as const;
const MAX_TRIM = 6;
interface HudRootProps {
  subscribeCamera?: CameraSubscription; active?: boolean; snapshot: GameSnapshot; reserveFloor?: number; layoutStore?: LayoutStore; hotkey?: string; editHotkey?: string; keyboardEnabled?: boolean;
  editMode?: boolean; onEditModeChange?: (value: boolean) => void; snoozeHotkey?: string; snoozeSignal?: number; heatHeld?: boolean;
  hudPreset?: HudPreset; textSize?: "compact" | "comfortable"; ownTeam?: OwnTeam;
  viewport?: { width: number; height: number }; onLayoutChange?: (layout: HudLayout) => void;
  featureHealth?: Partial<Record<Feature, HealthStatus>>;
  onDecision?: (gameId: string | undefined, tick: number, decision: Decision | undefined) => void;
}
export function HudRoot(props: HudRootProps) {
  const host = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(props.viewport ?? { width: typeof window === "undefined" ? 1920 : window.innerWidth, height: typeof window === "undefined" ? 1080 : window.innerHeight });
  useLayoutEffect(() => {
    const element = host.current;
    if (!element || props.viewport) return;
    const measure = () => { if (element.clientWidth && element.clientHeight) setSize(old => old.width === element.clientWidth && old.height === element.clientHeight ? old : { width: element.clientWidth, height: element.clientHeight }); };
    measure(); const observer = new ResizeObserver(measure); observer.observe(element);
    return () => observer.disconnect();
  }, [props.viewport]);
  const { width, height } = props.viewport ?? size;
  const store = useMemo(() => props.layoutStore ?? new LocalStorageLayoutStore(width, height), [props.layoutStore, width, height]);
  return <div ref={host} className="hud-host">{props.snapshot.mode !== "Ranked" && props.snapshot.observer !== "replay" && <HudPanels key={`${width}x${height}.${props.hudPreset ?? "custom"}`} {...props} layoutStore={store} viewport={{ width, height }} />}</div>;
}
function HudPanels({ subscribeCamera, active = true, snapshot, reserveFloor, layoutStore, viewport, hudPreset = "custom", textSize = "compact", ownTeam, onLayoutChange, featureHealth, onDecision, hotkey = DEFAULT_HOTKEYS.toggle, editHotkey = DEFAULT_HOTKEYS.edit, keyboardEnabled = true, editMode, onEditModeChange, snoozeHotkey = SNOOZE_HOTKEY, snoozeSignal = 0, heatHeld = true }: HudRootProps & { layoutStore: LayoutStore; viewport: { width: number; height: number } }) {
  const health = (id: PanelId): HealthStatus => {
    const states = (dependencies[id] ?? []).map(feature => featureHealth?.[feature] ?? "verified");
    return states.includes("unavailable") ? "unavailable" : states.includes("paused") ? "paused" : "verified";
  };
  const decisions = useRef(new DecisionTracker());
  const [, redraw] = useState(0);
  const signal = useRef(snoozeSignal);
  const now = Date.now() / 1000;
  if (signal.current !== snoozeSignal) { decisions.current.snooze(now); signal.current = snoozeSignal; }
  if (health("decision") !== "verified") decisions.current = new DecisionTracker();
  const snooze = () => { decisions.current.snooze(Date.now() / 1000); redraw(n => n + 1); };
  const trade = useRef(new TradeMonitor());
  if (health("trade") !== "verified") trade.current = new TradeMonitor();
  const tradeStatus = health("trade") === "verified" ? trade.current.observe(snapshot) : trade.current.status();
  const opening = useRef({ game: snapshot.gameId, tick: snapshot.tick, done: false });
  if (opening.current.game !== snapshot.gameId || snapshot.tick < opening.current.tick) opening.current.done = false;
  opening.current.game = snapshot.gameId; opening.current.tick = snapshot.tick;
  if (health("opening") !== "verified") opening.current.done = false;
  const items = health("opening") === "verified" ? openingItems(snapshot) : [];
  if (snapshot.phase === "playing" && items.length && items.every(item => item.done)) opening.current.done = true;
  const root = useRef<HTMLDivElement>(null);
  const [saved] = useState(() => layoutStore.load());
  const customized = useRef(saved !== null && JSON.stringify(saved) !== JSON.stringify(presetLayout(hudPreset, viewport.width, viewport.height)));
  const [layout, setLayout] = useState<HudLayout>(() => saved ?? presetLayout(hudPreset, viewport.width, viewport.height));
  const [visible, setVisible] = useState(true);
  const [internalEdit, setInternalEdit] = useState(false);
  const [trim, setTrim] = useState(0);
  const editing = editMode ?? internalEdit;
  const spawning = snapshot.phase === "spawn";
  // One owner per message: while Troop growth shows, the decision card does not repeat growth state.
  const gaugeShown = !layout.gauge.hidden && !layout.gauge.collapsed && !spawning && health("gauge") === "verified";
  // Only the idle-gold card uses build costs; paused build estimates hide that card, not the others.
  const observed = health("decision") === "verified" ? decisions.current.observe(snapshot, now, reserveFloor, gaugeShown ? ["growth"] : []) : undefined;
  const decision = observed?.kind === "idleGold" && (featureHealth?.build ?? "verified") !== "verified" ? undefined : observed;
  // Field reports log zone changes only while the decision card is hidden or snoozed.
  const reportFilter: ReportFilter = { hideZone: !layout.decision.hidden && !layout.decision.collapsed && health("decision") === "verified" && !decisions.current.isSnoozed(now) };
  const reports = fieldReports(snapshot, reportFilter);
  const live = (level: number) => editing || trim < level;
  const shownDecision = visible && !layout.decision.hidden && !layout.decision.collapsed ? decision : undefined;
  const reported = useRef<{ game?: string; tick: number; kind?: Decision["kind"] }>(undefined);
  useEffect(() => {
    const previous = reported.current;
    if (!previous || previous.game !== snapshot.gameId || snapshot.tick < previous.tick || previous.kind !== shownDecision?.kind) onDecision?.(snapshot.gameId, snapshot.tick, shownDecision);
    reported.current = { game: snapshot.gameId, tick: snapshot.tick, kind: shownDecision?.kind };
  }, [onDecision, snapshot.gameId, snapshot.tick, shownDecision?.kind]);
  const drag = useRef<{ id: PanelId; pointer: number; x: number; y: number; startX: number; startY: number; width: number; height: number } | null>(null);
  // Only a layout the player arranged is saved; the default stays live so auto-stacking keeps working.
  useEffect(() => { if (customized.current) layoutStore.save(layout); }, [layout, layoutStore]);
  useEffect(() => { onLayoutChange?.(layout); }, [layout, onLayoutChange]);
  useEffect(() => {
    const reload = (event: StorageEvent) => {
      if (!(layoutStore instanceof LocalStorageLayoutStore) || (event.key !== null && event.key !== layoutStore.key)) return;
      const next = layoutStore.load(); customized.current = next !== null && JSON.stringify(next) !== JSON.stringify(presetLayout(hudPreset, viewport.width, viewport.height));
      setLayout(next ?? presetLayout(hudPreset, viewport.width, viewport.height));
    };
    window.addEventListener("storage", reload); return () => window.removeEventListener("storage", reload);
  }, [layoutStore, hudPreset, viewport.width, viewport.height]);
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const clamp = () => setLayout(previous => {
      if (!element.clientWidth || !element.clientHeight) return previous;
      if (!customized.current) return presetLayout(hudPreset, element.clientWidth, element.clientHeight);
      const next = { ...previous };
      for (const id of panelIds) {
        const panel = element.querySelector<HTMLElement>(`[data-panel="${id}"]`);
        if (panel) next[id] = { ...previous[id], x: Math.max(0, Math.min(previous[id].x, element.clientWidth - panel.offsetWidth)), y: Math.max(0, Math.min(previous[id].y, element.clientHeight - panel.offsetHeight)) };
      }
      return next;
    });
    clamp(); const observer = new ResizeObserver(clamp); observer.observe(element);
    return () => observer.disconnect();
  }, [visible]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (keyboardEnabled && !event.repeat && matchesHotkey(event, snoozeHotkey)) { event.preventDefault(); snooze(); return; }
      if (!keyboardEnabled || event.repeat || (!(matchesHotkey(event, hotkey)) && !matchesHotkey(event, editHotkey))) return;
      event.preventDefault();
      if (matchesHotkey(event, editHotkey)) { const next = !editing; setInternalEdit(next); onEditModeChange?.(next); setVisible(true); }
      else setVisible(v => !v);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [hotkey, editHotkey, snoozeHotkey, keyboardEnabled, editing, onEditModeChange]);
  const update = (id: PanelId, patch: Partial<PanelLayout>) => { customized.current = true; setLayout(l => ({ ...l, [id]: { ...l[id], ...patch } })); };
  const start = (event: PointerEvent<HTMLButtonElement>, id: PanelId) => {
    if (event.button !== 0) return;
    const panel = event.currentTarget.closest<HTMLElement>("[data-panel]")!;
    drag.current = { id, pointer: event.pointerId, x: event.clientX, y: event.clientY, startX: layout[id].x, startY: layout[id].y, width: panel.offsetWidth, height: panel.offsetHeight };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const move = (event: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current; const box = root.current;
    if (!d || !box || event.pointerId !== d.pointer) return;
    const bounds = box.getBoundingClientRect();
    update(d.id, snapPosition(d.startX + (event.clientX - d.x) * box.clientWidth / bounds.width, d.startY + (event.clientY - d.y) * box.clientHeight / bounds.height, box.clientWidth, box.clientHeight, d.width, d.height));
  };
  const pushTracker = useRef(new PushTracker());
  const buildTracker = useRef(new BuildIdleTracker());
  if (health("attack") !== "verified") pushTracker.current = new PushTracker();
  if (health("build") !== "verified") buildTracker.current = new BuildIdleTracker();
  const lastPush = { result: health("attack") === "verified" ? pushTracker.current.observe(snapshot) : undefined };
  const observedIdle = health("build") === "verified" ? buildTracker.current.observe(snapshot.self, snapshot.gameId, snapshot.elapsedSec) : 0;
  const contents: Record<PanelId, ReactNode> = { decision: <DecisionCard decision={decision} editing={editing} onSnooze={snooze} snoozeHotkey={snoozeHotkey} />, clock: <MatchClock snapshot={snapshot} />, self: <SelfStatsBar self={snapshot.self} />, spawn: null, gauge: <GrowthGauge self={snapshot.self} phase={snapshot.phase} />,
    attack: <AttackPreview self={snapshot.self} phase={snapshot.phase} reserveFloor={reserveFloor} snapshot={snapshot} lastPush={lastPush} showLastPush={live(TRIM.lastPush)} />,
    build: <BuildPlanner compact alternatives={live(TRIM.buildAlternatives)} observedIdle={observedIdle} editing={editing} self={snapshot.self} elapsedSec={snapshot.elapsedSec} gameId={snapshot.gameId} map={snapshot.map} phase={snapshot.phase} />,
    alliances: <AlliancePanel snapshot={snapshot} />, events: <EventFeed snapshot={snapshot} filter={{ ...reportFilter, hideOld: !live(TRIM.oldReports) }} />,
    opening: <OpeningPanel snapshot={snapshot} evidence={live(TRIM.openingEvidence)} />,
    trade: <TradePanel status={tradeStatus} breakdown={editing || (hudPreset === "learning" && trim < TRIM.tradeBreakdown)} />, goal: <GoalPanel goal={snapshot.practiceGoal} snapshot={snapshot} /> };
  const hasTradeIncome = (snapshot.self?.portLevels ?? 0) > 0 || (snapshot.self?.factoryLevels ?? 0) > 0;
  const baseHidden = (id: PanelId) => (layout[id].hidden && !editing) || (spawning && (id === "gauge" || id === "attack"))
    || (id === "decision" && (spawning || (!decision && !editing && health(id) === "verified")))
    || (!editing && id === "opening" && health(id) === "verified" && (opening.current.done || !openingVisible(snapshot))) || (!editing && id === "goal" && !snapshot.practiceGoal)
    // Quiet spawn: nothing to build or trade yet. Trade appears once a port exists.
    || (!editing && id === "build" && spawning) || (!editing && id === "trade" && (spawning || (!hasTradeIncome && health(id) === "verified")))
    // Empty modules stay out of the quiet spawn phase.
    || (!editing && spawning && (id === "alliances" || id === "goal"))
    // Field Reports only when there is something to report.
    || (!editing && id === "events" && health(id) === "verified" && reports.length === 0 && incomingAlarm(snapshot.self) === undefined);
  const isHidden = (id: PanelId) => baseHidden(id) || (id === "goal" && !live(TRIM.completedGoal) && goalComplete(snapshot.practiceGoal));
  // Measure only on panel resize or visibility/layout changes, coalesced to one frame.
  // Trim-driven hides stay out of the key: a reset there would undo the trim that caused it.
  const visibilityKey = panelIds.map(id => `${baseHidden(id)}:${layout[id].collapsed}`).join();
  useLayoutEffect(() => { setTrim(0); }, [visibilityKey, snapshot.gameId, editing, hudPreset]);
  useLayoutEffect(() => {
    const box = root.current;
    if (!active || !visible || !box || customized.current) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      if (!box.clientWidth) return;
      const heights: Partial<Record<PanelId, number>> = {};
      box.querySelectorAll<HTMLElement>("[data-panel]:not([hidden])").forEach(el => { heights[el.dataset.panel as PanelId] = el.offsetHeight; });
      // Learning shows every module and can outgrow two columns, so it keeps the measured arrangement.
      const stacked = !editing && hudPreset !== "learning";
      const next = stacked ? stackColumns(heights, box.clientWidth, box.clientHeight) : arrangePanels(heights, box.clientWidth, box.clientHeight);
      if (!editing && columnOverflow(heights, box.clientWidth, box.clientHeight) > 0.5) setTrim(level => Math.min(MAX_TRIM, level + 1));
      setLayout(previous => {
        const moved = (Object.keys(next) as PanelId[]).filter(id => previous[id].x !== next[id]![0] || previous[id].y !== next[id]![1]);
        if (!moved.length) return previous;
        const copy = { ...previous }; for (const id of moved) copy[id] = { ...copy[id], x: next[id]![0], y: next[id]![1] }; return copy;
      });
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
    const observer = new ResizeObserver(schedule);
    observer.observe(box); box.querySelectorAll("[data-panel]:not([hidden])").forEach(el => observer.observe(el));
    schedule();
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [active, visible, visibilityKey, editing, hudPreset, trim]);
  return <div ref={root} className={`hud-layer ${editing ? "editing" : ""}`} aria-label="Game HUD" style={{ visibility: visible ? "visible" : "hidden", "--font-scale": textSize === "comfortable" ? 1.15 : 1 } as CSSProperties}>
    {health("spawn") === "verified" ? <SpawnHeatmap subscribeCamera={subscribeCamera} snapshot={snapshot} held={active && visible && heatHeld} /> : spawning && <SpawnHeatHint released={!heatHeld} status={healthLabel(health("spawn"))} />}
    <TeamSwatch snapshot={snapshot} team={ownTeam} />
    {panelIds.filter(id => id !== "spawn").map(id => <section key={id} data-panel={id} hidden={isHidden(id)} className={`panel hud-panel hud-${id}`} style={{ left: layout[id].x, top: layout[id].y }}>
      {editing ? <div className="edit-controls"><button className="drag-handle" aria-label={`Move ${titles[id]}`} onPointerDown={e => start(e, id)} onPointerMove={move} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onKeyDown={e => {
        const deltas: Record<string, [number, number]> = { ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, -10], ArrowDown: [0, 10] };
        const delta = deltas[e.key]; const box = root.current; const panel = e.currentTarget.closest<HTMLElement>("[data-panel]");
        if (delta && box && panel) { e.preventDefault(); update(id, snapPosition(layout[id].x + delta[0], layout[id].y + delta[1], box.clientWidth, box.clientHeight, panel.offsetWidth, panel.offsetHeight)); }
      }}><Icon name="drag" /> {titles[id]}</button><button aria-label={`${layout[id].collapsed ? "Expand" : "Collapse"} ${titles[id]}`} onClick={() => update(id, { collapsed: !layout[id].collapsed })}><Icon name={layout[id].collapsed ? "plus" : "minus"} /></button><button aria-label={`${layout[id].hidden ? "Show" : "Hide"} ${titles[id]}`} onClick={() => update(id, { hidden: !layout[id].hidden })}>{layout[id].hidden ? "Show" : "Hide"}</button></div> : <ModuleHeader title={titles[id]} icon={moduleIcons[id]} value={health(id) !== "verified" ? undefined : id === "alliances" ? snapshot.self?.alliances.length ?? 0 : id === "events" ? reports.length : id === "gauge" ? snapshot.phase : undefined} />}
      {layout[id].hidden && editing && <p className="muted">Hidden outside edit mode.</p>}
      {active && visible && !isHidden(id) && !layout[id].collapsed && !layout[id].hidden && <div className="hud-panel-content">{health(id) === "verified" ? contents[id] : <p className="muted">{healthLabel(health(id))}</p>}</div>}
    </section>)}
  </div>;
}

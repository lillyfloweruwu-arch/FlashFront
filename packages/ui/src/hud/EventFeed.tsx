import { useRef } from "react";
import { formatDuration, formatTroops, incomingAlarm, isZoneReport, type GameEvent, type GameEventKind, type GameSnapshot } from "@flashfront/core";
import { Icon, type IconName } from "../icons";
const icons: Record<GameEventKind, IconName> = { incomingAttack: "attack", incomingNuke: "warning", allianceRequest: "alliance", allianceExpired: "clock", betrayal: "warning", playerEliminated: "events", buildingDestroyed: "build", info: "info" };
const isOld = (snapshot: GameSnapshot, event: GameEvent) => snapshot.tick - event.tick > snapshot.ticksPerSecond * 60;
export interface ReportFilter {
  /** Zone changes belong to the decision card while it shows; Field reports log them only otherwise. */
  hideZone?: boolean;
  /** Drop reports older than 60 s when a column runs out of room (the newest one always stays). */
  hideOld?: boolean;
}
export function fieldReports(snapshot: GameSnapshot, { hideZone = false, hideOld = false }: ReportFilter = {}): GameEvent[] {
  const events = hideZone ? snapshot.events.filter(event => !isZoneReport(event)) : snapshot.events;
  if (!hideOld) return events;
  const recent = events.filter(event => !isOld(snapshot, event));
  return recent.length || !events.length ? recent : events.slice(-1);
}
export function EventFeed({ snapshot, filter }: { snapshot: GameSnapshot; filter?: ReportFilter }) {
  const pinned = useRef({ game: snapshot.gameId, tick: snapshot.tick, active: false });
  const total = snapshot.self?.incomingAttacks.reduce((sum, attack) => sum + Math.max(0, attack.troops), 0) ?? 0;
  if (pinned.current.game !== snapshot.gameId || snapshot.tick < pinned.current.tick || total === 0) pinned.current.active = false;
  pinned.current.game = snapshot.gameId; pinned.current.tick = snapshot.tick;
  if (incomingAlarm(snapshot.self) !== undefined) pinned.current.active = true;
  const alarm = pinned.current.active ? total : undefined;
  return <ol className="event-list">{alarm !== undefined && <li className="event danger incoming-alarm" role="alert">Big attack incoming: {formatTroops(alarm)} vs your {formatTroops(snapshot.self!.troops)}</li>}{fieldReports(snapshot, filter).slice(-6).reverse().map(event => <li key={event.id} className={`event ${event.kind === "incomingNuke" ? "nuke-event" : event.kind === "incomingAttack" ? "attack-event" : ""} ${isOld(snapshot, event) ? "old-event" : ""}`}><Icon name={icons[event.kind]} label={event.kind} className="event-icon" /><span>{event.text}<small className="event-time">{formatDuration(event.tick / snapshot.ticksPerSecond)}</small></span></li>)}</ol>;
}

import { sweetSpotFraction } from "./mechanics";
import { stableZone, type TroopZone } from "./attack";
import { formatTroops } from "./format";
import type { GameEvent, GameSnapshot, SelfState } from "./types";

const BUILDINGS: [keyof SelfState, string][] = [
  ["cityLevels", "City"], ["portLevels", "Port"], ["factoryLevels", "Factory"], ["defensePosts", "Defense post"], ["samLaunchers", "SAM launcher"],
];
const MAX_EVENTS = 20;
const ZONE_TAG = "-zone-";
/** Zone-change reports; the HUD shows them only while the decision card is hidden or snoozed. */
export const isZoneReport = (event: Pick<GameEvent, "id">) => event.id.includes(ZONE_TAG);

/**
 * Field Reports content: things FlashFront can tell the player from their OWN numbers that the
 * game's own feed does not (zone changes, a push that leaves them exposed, incoming size vs own
 * troops, alliance count changes). Quiet during spawn, cleared when a spawn phase is seen, resets per game.
 */
export class InsightFeed {
  private game?: string;
  private prev?: { troops: number; max: number; zone: TroopZone; incoming: number; alliances: number; built: Record<string, number> };
  private events: GameEvent[] = [];
  private serial = 0;

  observe(snapshot: GameSnapshot): GameEvent[] {
    if (snapshot.gameId !== this.game) { this.game = snapshot.gameId; this.prev = undefined; this.events = []; }
    // Nothing observed up to the end of a spawn phase outlives it.
    if (snapshot.phase === "spawn") { this.events = []; this.prev = undefined; }
    const me = snapshot.self;
    if (!me || snapshot.phase !== "playing" || !(me.maxTroops > 0)) return [...this.events];
    const fraction = me.troops / me.maxTroops;
    const zone = stableZone(this.prev?.zone, fraction, sweetSpotFraction(me.maxTroops));
    const incoming = me.incomingAttacks.reduce((sum, a) => sum + Math.max(0, a.troops), 0);
    const built = Object.fromEntries(BUILDINGS.map(([key]) => [key, Number(me[key]) || 0]));
    const p = this.prev;
    if (p) {
      const pct = Math.round(fraction * 100);
      if (zone !== p.zone && zone === "wasting") this.add(snapshot, "info", "Growth slowing · 70% of max or more.", true);
      if (zone !== p.zone && zone === "exposed") {
        const pushed = p.troops - me.troops >= 0.1 * me.maxTroops;
        this.add(snapshot, "info", pushed ? `Push left you exposed at ${pct}% of max.` : `Exposed: ${pct}% of max.`, true);
      }
      if (incoming > 0 && p.incoming === 0) this.add(snapshot, "incomingAttack", `Incoming attack: ${formatTroops(incoming)} vs your ${formatTroops(me.troops)}.`);
      // Builds are not reported: the game announces them itself, and live they flooded the feed.
      const allies = me.alliances.length;
      if (allies > p.alliances) this.add(snapshot, "allianceRequest", `Alliance formed (${allies} active).`);
      if (allies < p.alliances) this.add(snapshot, "allianceExpired", `Alliance ended (${allies} active).`);
    }
    this.prev = { troops: me.troops, max: me.maxTroops, zone, incoming, alliances: me.alliances.length, built };
    return [...this.events];
  }

  private add(snapshot: GameSnapshot, kind: GameEvent["kind"], text: string, zone = false) {
    this.events.push({ id: `${snapshot.gameId}-${snapshot.tick}${zone ? ZONE_TAG : "-"}${++this.serial}`, tick: snapshot.tick, kind, text });
    if (this.events.length > MAX_EVENTS) this.events = this.events.slice(-MAX_EVENTS);
  }
}

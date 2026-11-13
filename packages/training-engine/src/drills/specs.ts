// The 21 prepared drills (sub-plan F Task 2 table). Spawns are game-map coordinates on the Compact maps.
// Each board differs in map, geography, economy and opponent timing, not only in its text.
import type { PreparedDrill } from "@flashfront/core";
import { preAttack, preBuild, type DrillSpec } from "./author";

type Meta = Pick<PreparedDrill, "id" | "mistake" | "role" | "title" | "rationaleId" | "coachLineId" | "tags">;
export interface FullSpec { meta: Meta; spec: DrillSpec }

const accept = (target: "Neighbour A" | "Neighbour B") => ({ kind: "allianceAccept" as const, target });
const decline = (target: "Neighbour A" | "Neighbour B") => ({ kind: "allianceDecline" as const, target });
const request = (target: "Neighbour A" | "Neighbour B") => ({ kind: "allianceRequest" as const, target });
const send = (fraction: number) => ({ kind: "attack" as const, target: null, fraction });
const post = (tile: "front" | "farFront" | "other" | "shore") => ({ kind: "build" as const, unit: "Defense Post" as const, tile });
const hit = (fraction: number) => ({ kind: "attack" as const, target: "You" as const, fraction });

const ally = (id: string, title: string, role: Meta["role"], rationaleId: string, coachLineId: string, tags: string[], spec: Omit<DrillSpec, "id">): FullSpec =>
  ({ meta: { id, mistake: "allyDecision", role, title, rationaleId, coachLineId, tags }, spec: { id, ...spec } });
const posts = (id: string, title: string, rationaleId: string, coachLineId: string, tags: string[], spec: Omit<DrillSpec, "id">): FullSpec =>
  ({ meta: { id, mistake: "postsBeforePush", role: "Defense", title, rationaleId, coachLineId, tags }, spec: { id, ...spec } });
const sends = (id: string, title: string, role: Meta["role"], rationaleId: string, coachLineId: string, tags: string[], spec: Omit<DrillSpec, "id">): FullSpec =>
  ({ meta: { id, mistake: "sendSize", role, title, rationaleId, coachLineId, tags }, spec: { id, ...spec } });

export const DRILL_SPECS: readonly FullSpec[] = [
  ally("ally-01", "A quiet neighbour asks to ally", "Head", "ally-quiet-border", "head-ally-1", ["sharedBorder", "opening"], {
    map: "world", players: 3, spawns: [[520, 110], [545, 115], [600, 140]], startTick: 820,
    opponents: [{ at: 5, by: "Neighbour A", action: request("You" as never) }],
    coach: [{ at: 20, by: "You", action: accept("Neighbour A") }], wrong: [{ at: 20, by: "You", action: decline("Neighbour A") }],
    check: (c) => ({ kind: "ally", decision: "accept", target: "Neighbour A", deadlineTick: c.start + 100 }) }),
  ally("ally-02", "Two open borders, one offer", "Head", "ally-quiet-border", "head-ally-2", ["twoFronts", "sharedBorder"], {
    map: "europe", players: 3, spawns: [[650, 420], [620, 390], [690, 450]], startTick: 840,
    opponents: [{ at: 5, by: "Neighbour A", action: request("You" as never) }],
    coach: [{ at: 30, by: "You", action: accept("Neighbour A") }], wrong: [{ at: 30, by: "You", action: decline("Neighbour A") }],
    check: (c) => ({ kind: "ally", decision: "accept", target: "Neighbour A", deadlineTick: c.start + 100 }) }),
  ally("ally-03", "Losing a fight, a truce on offer", "Defense", "ally-losing-fight", "defense-ally-3", ["underAttack", "sharedBorder"], {
    map: "blacksea", players: 2, spawns: [[370, 180], [400, 170]], startTick: 900,
    pre: [{ tick: 860, by: "Neighbour A", intent: preAttack("Neighbour A", "You", 0.5) }, { tick: 880, by: "Neighbour A", intent: preAttack("Neighbour A", "You", 0.4) }],
    opponents: [{ at: 5, by: "Neighbour A", action: request("You" as never) }],
    coach: [{ at: 10, by: "You", action: accept("Neighbour A") }], wrong: [{ at: 10, by: "You", action: decline("Neighbour A") }],
    check: (c) => ({ kind: "ally", decision: "accept", target: "Neighbour A", deadlineTick: c.start + 50 }) }),
  ally("ally-04", "Safe opening, nobody allied yet", "Economy", "ally-request-early", "economy-ally-2", ["opening"], {
    map: "world", players: 3, spawns: [[300, 330], [320, 350], [280, 300]], startTick: 700,
    opponents: [],
    coach: [{ at: 40, by: "You", action: request("Neighbour A") }], wrong: [{ at: 0, by: "You", action: { kind: "wait" } }],
    check: (c) => ({ kind: "ally", decision: "request", target: "Neighbour A", deadlineTick: c.start + 150 }) }),
  ally("ally-05", "New land opens a second front", "Defense", "ally-request-early", "defense-ally-2", ["newLand", "twoFronts"], {
    map: "europe", players: 4, spawns: [[450, 500], [800, 380], [470, 470], [300, 650]], startTick: 860,
    opponents: [],
    coach: [{ at: 30, by: "You", action: request("Neighbour B") }], wrong: [{ at: 30, by: "You", action: request("Neighbour A") }],
    check: (c) => ({ kind: "ally", decision: "request", target: "Neighbour B", deadlineTick: c.start + 100 }) }),
  ally("ally-06", "Your expansion target asks to ally", "Attack", "ally-target", "attack-ally-1", ["sharedBorder"], {
    map: "blacksea", players: 3, spawns: [[100, 250], [130, 260], [90, 200]], startTick: 860,
    pre: [{ tick: 820, by: "Neighbour B", intent: (r, ids) => ({ type: "allianceRequest", recipient: ids.You }) }, { tick: 825, by: "You", intent: (r, ids) => ({ type: "allianceRequest", recipient: ids["Neighbour B"] }) }],
    opponents: [{ at: 5, by: "Neighbour A", action: request("You" as never) }],
    coach: [{ at: 20, by: "You", action: decline("Neighbour A") }], wrong: [{ at: 20, by: "You", action: accept("Neighbour A") }],
    check: (c) => ({ kind: "ally", decision: "decline", target: "Neighbour A", deadlineTick: c.start + 100 }) }),
  ally("ally-07", "A distant player would block your route", "Head", "ally-target", "head-ally-2", ["twoFronts"], {
    map: "world", players: 3, spawns: [[700, 150], [760, 120], [720, 175]], startTick: 880,
    opponents: [{ at: 5, by: "Neighbour A", action: request("You" as never) }],
    coach: [{ at: 20, by: "You", action: decline("Neighbour A") }], wrong: [{ at: 20, by: "You", action: accept("Neighbour A") }],
    check: (c) => ({ kind: "ally", decision: "decline", target: "Neighbour A", deadlineTick: c.start + 100 }) }),

  posts("posts-01", "One narrow approach", "posts-choke", "defense-posts-2", ["underAttack", "sharedBorder"], {
    map: "europe", players: 2, spawns: [[300, 650], [330, 630]], startTick: 830,
    opponents: [{ at: 200, by: "Neighbour A", action: hit(0.5) }],
    coach: [{ at: 20, by: "You", action: post("front") }], wrong: [{ at: 210, by: "You", action: post("front") }],
    check: (c) => ({ kind: "post", allowedTiles: c.front, beforeTick: c.start + 200 }) }),
  posts("posts-02", "A long exposed border", "posts-before-contact", "defense-posts-1", ["underAttack"], {
    map: "world", players: 2, spawns: [[220, 150], [250, 140]], startTick: 860,
    opponents: [{ at: 250, by: "Neighbour A", action: hit(0.5) }],
    coach: [{ at: 30, by: "You", action: post("front") }], wrong: [{ at: 30, by: "You", action: post("farFront") }],
    check: (c) => ({ kind: "post", allowedTiles: c.front, beforeTick: c.start + 250 }) }),
  posts("posts-03", "The landing coast", "posts-before-contact", "defense-posts-3", ["coast", "underAttack"], {
    map: "blacksea", players: 2, spawns: [[400, 480], [430, 470]], startTick: 850,
    opponents: [{ at: 200, by: "Neighbour A", action: hit(0.5) }],
    coach: [{ at: 20, by: "You", action: post("shore") }], wrong: [{ at: 210, by: "You", action: post("shore") }],
    check: (c) => ({ kind: "post", allowedTiles: c.shore, beforeTick: c.start + 200 }) }),
  posts("posts-04", "New land leaves a gap", "posts-before-contact", "head-posts-1", ["newLand", "underAttack"], {
    map: "world", players: 2, spawns: [[540, 280], [570, 290]], startTick: 900, expandUntil: 700,
    pre: [{ tick: 880, by: "You", intent: preAttack("You", null, 0.3) }],
    opponents: [{ at: 150, by: "Neighbour A", action: hit(0.5) }],
    coach: [{ at: 20, by: "You", action: post("front") }], wrong: [{ at: 160, by: "You", action: post("front") }],
    check: (c) => ({ kind: "post", allowedTiles: c.front, beforeTick: c.start + 150 }) }),
  posts("posts-05", "Your post guards the wrong flank", "posts-before-contact", "defense-posts-1", ["twoFronts", "underAttack"], {
    map: "europe", players: 3, spawns: [[800, 380], [830, 360], [780, 410]], startTick: 1830,
    pre: [{ tick: 820, by: "You", intent: preBuild("You", "Defense Post", "Neighbour B") }],
    opponents: [{ at: 250, by: "Neighbour A", action: hit(0.5) }],
    coach: [{ at: 20, by: "You", action: post("front") }], wrong: [{ at: 20, by: "You", action: post("other") }],
    check: (c) => ({ kind: "post", allowedTiles: c.front, beforeTick: c.start + 250 }) }),
  posts("posts-06", "Gold for a post, not a project", "posts-gold-priority", "economy-posts-1", ["underAttack", "highReserve"], {
    map: "blacksea", players: 2, spawns: [[680, 280], [650, 290]], startTick: 1700,
    opponents: [{ at: 300, by: "Neighbour A", action: hit(0.5) }],
    coach: [{ at: 20, by: "You", action: post("front") }], wrong: [{ at: 310, by: "You", action: post("front") }],
    check: (c) => ({ kind: "post", allowedTiles: c.front, beforeTick: c.start + 300 }) }),
  posts("posts-07", "Two approaches, cover the first", "posts-before-contact", "attack-posts-1", ["twoFronts", "underAttack"], {
    map: "world", players: 3, spawns: [[850, 380], [865, 368], [850, 396]], startTick: 880,
    opponents: [{ at: 150, by: "Neighbour A", action: hit(0.5) }, { at: 300, by: "Neighbour B", action: hit(0.5) }],
    coach: [{ at: 20, by: "You", action: post("front") }], wrong: [{ at: 20, by: "You", action: post("other") }],
    check: (c) => ({ kind: "post", allowedTiles: c.front, beforeTick: c.start + 150 }) }),

  sends("sends-01", "A small opening on the border", "Attack", "send-reserve", "attack-send-1", ["sharedBorder", "highReserve"], {
    map: "world", players: 2, spawns: [[520, 120], [600, 150]], startTick: 900, expandUntil: 650,
    opponents: [], coach: [{ at: 0, by: "You", action: send(0.2) }], wrong: [{ at: 0, by: "You", action: send(0.6) }],
    check: () => ({ kind: "send", minSendPct: 15, maxSendPct: 25, minReservePct: 40 }) }),
  sends("sends-02", "Just took damage, reserve is thin", "Defense", "send-wait", "defense-send-2", ["underAttack", "lowReserve"], {
    map: "europe", players: 2, spawns: [[900, 450], [925, 440]], startTick: 900, expandUntil: 830,
    pre: [{ tick: 860, by: "Neighbour A", intent: preAttack("Neighbour A", "You", 0.6) }, { tick: 880, by: "Neighbour A", intent: preAttack("Neighbour A", "You", 0.5) }],
    opponents: [], coach: [{ at: 0, by: "You", action: { kind: "wait" } }], wrong: [{ at: 0, by: "You", action: send(0.3) }],
    check: () => ({ kind: "send", minSendPct: 0, maxSendPct: 0, minReservePct: 25 }) }),
  sends("sends-03", "Growing reserve, a second border open", "Head", "send-reserve", "head-send-1", ["twoFronts"], {
    map: "blacksea", players: 3, spawns: [[350, 80], [380, 90], [320, 110]], startTick: 900, expandUntil: 700,
    opponents: [], coach: [{ at: 0, by: "You", action: send(0.15) }], wrong: [{ at: 0, by: "You", action: send(0.4) }],
    check: () => ({ kind: "send", minSendPct: 10, maxSendPct: 20, minReservePct: 40 }) }),
  sends("sends-04", "Near the cap behind a safe border", "Economy", "send-growth", "economy-send-1", ["highReserve"], {
    map: "world", players: 2, spawns: [[700, 300], [730, 280]], startTick: 1000, expandUntil: 600,
    opponents: [], coach: [{ at: 0, by: "You", action: send(0.3) }], wrong: [{ at: 0, by: "You", action: send(0.1) }],
    check: () => ({ kind: "send", minSendPct: 25, maxSendPct: 35, minReservePct: 40 }) }),
  sends("sends-05", "A new city makes the reserve look low", "Economy", "send-wait", "economy-send-2", ["newCity", "lowReserve"], {
    map: "europe", players: 2, spawns: [[1100, 350], [1130, 330]], startTick: 1650, expandUntil: 1530,
    pre: [{ tick: 1630, by: "You", intent: preBuild("You", "City") }],
    opponents: [], coach: [{ at: 0, by: "You", action: { kind: "wait" } }], wrong: [{ at: 0, by: "You", action: send(0.3) }],
    check: () => ({ kind: "send", minSendPct: 0, maxSendPct: 0, minReservePct: 25 }) }),
  sends("sends-06", "Pressure coming from the other side", "Defense", "send-reserve", "defense-send-1", ["twoFronts", "underAttack"], {
    map: "blacksea", players: 3, spawns: [[560, 420], [590, 400], [530, 450]], startTick: 900, expandUntil: 650,
    opponents: [{ at: 50, by: "Neighbour A", action: hit(0.3) }], coach: [{ at: 0, by: "You", action: send(0.1) }], wrong: [{ at: 0, by: "You", action: send(0.35) }],
    check: () => ({ kind: "send", minSendPct: 5, maxSendPct: 15, minReservePct: 40 }) }),
  sends("sends-07", "Recovered, a cheap opportunity", "Attack", "send-reserve", "attack-send-2", ["sharedBorder"], {
    map: "world", players: 2, spawns: [[230, 200], [260, 210]], startTick: 950, expandUntil: 650,
    pre: [{ tick: 880, by: "Neighbour A", intent: preAttack("Neighbour A", "You", 0.4) }],
    opponents: [], coach: [{ at: 0, by: "You", action: send(0.25) }], wrong: [{ at: 0, by: "You", action: send(0.5) }],
    check: () => ({ kind: "send", minSendPct: 20, maxSendPct: 30, minReservePct: 40 }) }),
];

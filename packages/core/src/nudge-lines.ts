export type NudgeKind = "danger" | "allianceEnding" | "renewAsked" | "recovery" | "losingGround" | "exposed" | "idleGold" | "openingPort" | "portIdle" | "growth" | "noAlly" | "allyRequest" | "noPosts";
export type CoachRole = "Head" | "Attack" | "Defense" | "Economy";
export interface LineValues { incoming?: string; troops?: string; percent?: number; floor?: number; pick?: number }
export const NUDGE_LINES: Record<NudgeKind, { role: CoachRole; lines: readonly string[] }> = {
  danger: { role: "Defense", lines: ["Big attack: {incoming} coming at your {troops}. Keep your troops home.", "{incoming} incoming against your {troops}. Stop sending and hold."] },
  allianceEnding: { role: "Head", lines: ["An alliance ends in under 30 s. Renew it if they still cover a border.", "Alliance running out. Renew now if you still want them next to you."] },
  renewAsked: { role: "Head", lines: ["Your ally asked to renew. Accept if they still cover a border.", "Renewal request in. Keep the ally if you aren't planning to hit them."] },
  recovery: { role: "Attack", lines: ["Too big a send. No more pushes until you're back to {floor}%.", "You overspent. Sit at home until {floor}%."] },
  losingGround: { role: "Defense", lines: ["You're losing land with under 35% home. Stop attacking and hold."] },
  exposed: { role: "Attack", lines: ["{percent}% left at home. That's exposed. Stop sending.", "Only {percent}% home. One more push and you're open."] },
  idleGold: { role: "Economy", lines: ["You've had the gold for a city for 30 s. Build it, it adds 25K max troops.", "That gold has waited 30 s. A city now grows your army for the rest of the game."] },
  openingPort: { role: "Economy", lines: ["You can afford a port. An early port has the longest time to pay off."] },
  portIdle: { role: "Economy", lines: ["Port now, you've had the gold for 30 s."] },
  growth: { role: "Attack", lines: ["You're at {percent}% of max and growth is slowing. Spend some troops.", "{percent}% of max. Troops past here grow slowly. Use them."] },
  noAlly: { role: "Head", lines: ["No ally yet. Ask a neighbour you aren't fighting.", "Still no ally. Send a request to a neighbour that isn't attacking you."] },
  allyRequest: { role: "Head", lines: [
    "Ally request from someone you're fighting. Accepting stops that fight. Take it if you're losing.",
    "Ally request from a bigger player. A big ally covers a whole border. Usually worth taking.",
    "Ally request from a smaller player. Safe to accept, but don't count on them for help.",
    "Ally request from someone your size. Accept if they're next to you and not your target.",
    "Ally request. Accept if they're a neighbour you aren't planning to attack.",
  ] },
  noPosts: { role: "Defense", lines: ["A push is landing and you have no posts. Build one where it hits.", "An attack is coming in and you have no defense posts. One on that border now."] },
};

/** The reviewed rationale behind each nudge (see training/coach-lines RATIONALES). */
export const NUDGE_RATIONALE: Record<NudgeKind, string> = {
  danger: "send-reserve", allianceEnding: "ally-quiet-border", renewAsked: "ally-quiet-border", recovery: "send-wait",
  losingGround: "send-reserve", exposed: "send-reserve", idleGold: "econ-city", openingPort: "econ-port", portIdle: "econ-port",
  growth: "send-growth", noAlly: "ally-request-early", allyRequest: "ally-quiet-border", noPosts: "posts-before-contact",
};

export const NUDGE_KINDS = Object.keys(NUDGE_LINES) as readonly NudgeKind[];

function seedHash(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (Math.imul(hash, 31) + seed.charCodeAt(i)) >>> 0;
  return hash;
}

/** One coach line: the role prefix plus a variant, with own-number placeholders filled. */
export function nudgeLine(kind: NudgeKind, seed: string, values: LineValues): string {
  const { role, lines } = NUDGE_LINES[kind];
  const raw = values.pick ?? seedHash(seed);
  const template = lines[((raw % lines.length) + lines.length) % lines.length]!;
  const text = template.replace(/\{(incoming|troops|percent|floor)\}/g, (_, key: "incoming" | "troops" | "percent" | "floor") => String(values[key] ?? ""));
  return `${role} coach: ${text}`;
}

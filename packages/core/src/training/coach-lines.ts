// Role coach lines for drills and reviews (sub-plan F). Four roles, never people: Attack is blunt and
// specific, Economy patient, Defense anticipatory, Head weighs the tradeoff. Every line points at a
// rationale; the private evidence report maps rationales to the studied patterns behind them.
import type { CoachRole } from "../nudge-lines";
import type { MistakeType } from "../review/moments";

export interface CoachContext { time?: string; sentPct?: number; reservePct?: number; landLostPct?: number }
export interface CoachLine { id: string; role: CoachRole; mistake: MistakeType; text: string; rationaleId: string }

/** Public, anonymized rationale summaries. Scenario teaching points, not rules for every match. */
export const RATIONALES: Record<string, string> = {
  "ally-quiet-border": "An alliance with a neighbour you aren't fighting frees the troops that watched that border.",
  "ally-losing-fight": "Taking a truce from someone who is beating you stops the land loss on that front.",
  "ally-target": "Allying with the player you plan to expand into blocks that expansion until the alliance ends.",
  "ally-request-early": "Asking a quiet neighbour early secures one border before the fights start.",
  "posts-before-contact": "Defense posts only help where an attack lands, and only if they stand before it arrives.",
  "posts-choke": "One post on a narrow approach covers more of a front than posts spread along a wide border.",
  "posts-gold-priority": "Under threat, a post at the contact point is worth more than an optional expansion build.",
  "send-reserve": "Troops at home are what stop a counter-attack; a big send leaves the border open.",
  "send-growth": "Troop growth slows near the cap, so a very full reserve wastes growth that a modest send would use.",
  "send-wait": "After damage, waiting rebuilds the reserve faster than another send gains land.",
  "econ-city": "A city raises maximum troops for the rest of the game.",
  "econ-port": "A port earns gold over time, so an earlier port has longer to pay off.",
};

type Template = { id: string; role: CoachRole; mistake: MistakeType; rationaleId: string; text: string };
// `[...]` is an optional clause: it is dropped when any {value} inside it is missing.
const T = (id: string, role: CoachRole, mistake: MistakeType, rationaleId: string, text: string): Template => ({ id, role, mistake, rationaleId, text });
const TEMPLATES: readonly Template[] = [
  T("head-ally-1", "Head", "allyDecision", "ally-quiet-border", "An ally on a quiet border is one less front to watch.[ At {time} that border was still open.] Weigh that against who you plan to hit next."),
  T("head-ally-2", "Head", "allyDecision", "ally-target", "Every alliance is a trade: safety on one border, no expansion into that player.[ The call came at {time}.] Pick the border you need least."),
  T("head-ally-3", "Head", "allyDecision", "ally-losing-fight", "When a fight is going against you, a truce buys time; when you're winning it costs land.[ Check {time}.] Decide which one this was."),
  T("head-posts-1", "Head", "postsBeforePush", "posts-before-contact", "A post costs gold now and saves land when the hit lands.[ The hit came at {time}.] Spend where the attack will arrive."),
  T("head-posts-2", "Head", "postsBeforePush", "posts-gold-priority", "Expansion builds can wait a minute; a border about to be hit can't.[ You lost {landLostPct}% of your land.] Put defense first there."),
  T("head-posts-3", "Head", "postsBeforePush", "posts-choke", "Cover the narrow approach and you cover the whole front behind it.[ That moment was {time}.] One good post beats three spread out."),
  T("head-send-1", "Head", "sendSize", "send-reserve", "Every send trades home safety for land.[ You sent {sentPct}% and kept {reservePct}%.] Keep enough back for the counter."),
  T("head-send-2", "Head", "sendSize", "send-growth", "A full reserve grows slowly and an empty one can't defend.[ You kept {reservePct}% at home.] Aim for the middle."),
  T("head-send-3", "Head", "sendSize", "send-wait", "Sometimes the best send is none.[ After losing {landLostPct}% of your land,] rebuild before the next push."),
  T("attack-ally-1", "Attack", "allyDecision", "ally-target", "Don't ally the player you're about to hit. That closes your best route."),
  T("attack-ally-2", "Attack", "allyDecision", "ally-quiet-border", "Ally the quiet side so every troop you have can face the fight.[ That was the moment, {time}.]"),
  T("attack-ally-3", "Attack", "allyDecision", "ally-losing-fight", "Losing that fight? Take the truce and push somewhere else."),
  T("attack-posts-1", "Attack", "postsBeforePush", "posts-before-contact", "Their push was coming. A post first, then you counter from strength."),
  T("attack-posts-2", "Attack", "postsBeforePush", "posts-choke", "Hold the choke with one post and keep the rest of your troops attacking."),
  T("attack-posts-3", "Attack", "postsBeforePush", "posts-gold-priority", "Post now, expand later.[ That hit cost {landLostPct}% of your land.]"),
  T("attack-send-1", "Attack", "sendSize", "send-reserve", "Too big.[ You sent {sentPct}%, kept {reservePct}% home and lost {landLostPct}% of your land.] Smaller sends, more often."),
  T("attack-send-2", "Attack", "sendSize", "send-reserve", "That send opened your border.[ {sentPct}% out, {reservePct}% home, {landLostPct}% of your land gone.] Keep a real reserve."),
  T("attack-send-3", "Attack", "sendSize", "send-wait", "Wrong time to send.[ After {sentPct}% out you had {reservePct}% home and gave up {landLostPct}% of your land.] Wait, then hit."),
  T("defense-ally-1", "Defense", "allyDecision", "ally-quiet-border", "With that neighbour allied, one border needs no troops at all."),
  T("defense-ally-2", "Defense", "allyDecision", "ally-request-early", "Ask early, before anyone starts testing your borders.[ By {time} it was late.]"),
  T("defense-ally-3", "Defense", "allyDecision", "ally-losing-fight", "That front was breaking. A truce would have stopped the bleeding."),
  T("defense-posts-1", "Defense", "postsBeforePush", "posts-before-contact", "Read where they're massing and post there before they arrive.[ They landed at {time}.]"),
  T("defense-posts-2", "Defense", "postsBeforePush", "posts-choke", "The narrow approach is where one post holds the most."),
  T("defense-posts-3", "Defense", "postsBeforePush", "posts-before-contact", "A post built after the hit is a post built too late.[ You lost {landLostPct}% of your land first.]"),
  T("defense-send-1", "Defense", "sendSize", "send-reserve", "Look at your other border before you send.[ You had {reservePct}% left to hold it.]"),
  T("defense-send-2", "Defense", "sendSize", "send-wait", "Pressure was coming. Keep the troops home until it passes."),
  T("defense-send-3", "Defense", "sendSize", "send-reserve", "Someone always watches for an empty border.[ After sending {sentPct}%,] yours was one."),
  T("economy-ally-1", "Economy", "allyDecision", "ally-quiet-border", "A safe border lets your gold go into cities instead of defense."),
  T("economy-ally-2", "Economy", "allyDecision", "ally-request-early", "An early ally means a calmer build-up. Ask before you need it."),
  T("economy-ally-3", "Economy", "allyDecision", "ally-target", "Allying the player you need to grow into stalls your growth for a while. Pick your partner patiently."),
  T("economy-posts-1", "Economy", "postsBeforePush", "posts-gold-priority", "Save the gold for the post. The optional build can come after the danger."),
  T("economy-posts-2", "Economy", "postsBeforePush", "posts-before-contact", "Land lost to one hit takes minutes to win back. A post is cheaper.[ That was {landLostPct}% of your land.]"),
  T("economy-posts-3", "Economy", "postsBeforePush", "posts-choke", "One well-placed post is the cheapest defense you can buy."),
  T("economy-send-1", "Economy", "sendSize", "send-growth", "Growth is fastest with a healthy reserve. Let it build, then spend a slice."),
  T("economy-send-2", "Economy", "sendSize", "send-wait", "Patience pays. Rebuild first; the land will still be there.[ You kept {reservePct}% home.]"),
  T("economy-send-3", "Economy", "sendSize", "send-reserve", "A modest send keeps your growth going.[ {sentPct}% was more than it needed to be.]"),
];

function fill(template: string, c: CoachContext): string {
  const value = (key: string) => {
    const v = (c as Record<string, unknown>)[key];
    if (typeof v === "number") return Number.isFinite(v) ? String(Math.round(v)) : undefined;
    return typeof v === "string" && v.length > 0 ? v : undefined;
  };
  const withClauses = template.replace(/\[([^\]]*)\]/g, (_, clause: string) => {
    const keys = [...clause.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!);
    return keys.every((k) => value(k) !== undefined) ? clause : "";
  });
  return withClauses.replace(/\{(\w+)\}/g, (_, k: string) => value(k) ?? "").replace(/\s{2,}/g, " ").trim();
}

export const COACH_LINES: readonly CoachLine[] = TEMPLATES.map((t) => ({ id: t.id, role: t.role, mistake: t.mistake, rationaleId: t.rationaleId, text: t.text }));

export const roleLabel = (role: CoachRole) => `${role} coach`;

/** One line for a role and mistake, filled with observed numbers; never the same variant twice running. */
export function coachLine(role: CoachRole, mistake: MistakeType, context: CoachContext, previousId?: string): CoachLine {
  const options = TEMPLATES.filter((t) => t.role === role && t.mistake === mistake);
  const at = Math.max(0, options.findIndex((t) => t.id === previousId));
  const pick = previousId === undefined ? options[0]! : options[(at + 1) % options.length]!;
  return { id: pick.id, role, mistake, rationaleId: pick.rationaleId, text: fill(pick.text, context) };
}

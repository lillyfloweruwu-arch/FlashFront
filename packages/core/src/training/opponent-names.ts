/** Invented nation-style names for synthetic drills only. */
export const OPPONENT_NAMES: readonly string[] = Object.freeze([
  "Varenth", "Kossmark", "Ildrava", "Selvoria", "Drenmark", "Valdren",
  "Orvessa", "Talven", "Merovia", "Zerath", "Aldoria", "Neravin",
  "Caldria", "Vessara", "Bravorn", "Eldovar", "Fenarith", "Galdren",
  "Hessavia", "Jorveth", "Keldara", "Lorvann", "Mavreth", "Novrath",
  "Pelvoria", "Ravessa", "Sorveth", "Tarnovia", "Ulvarin", "Westrava",
]);

export function opponentNames(drillId: string, count: number): string[] {
  if (!Number.isInteger(count) || count < 0 || count > OPPONENT_NAMES.length) throw new RangeError("opponent names: invalid count");
  let seed = 2166136261;
  for (let i = 0; i < drillId.length; i++) seed = Math.imul(seed ^ drillId.charCodeAt(i), 16777619) >>> 0;
  const names = [...OPPONENT_NAMES];
  for (let i = names.length - 1; i > 0; i--) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const j = seed % (i + 1);
    [names[i], names[j]] = [names[j]!, names[i]!];
  }
  return names.slice(0, count);
}

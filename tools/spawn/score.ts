import type { Manifest } from "./fetch-maps.ts";

export interface Pick { x: number; y: number; score: number; percentile: number; reasons: string[]; warning?: string }
export const SCALE = 4;
export const MIN_COMPONENT = 20_000;
export const MIN_SPACING = 250;
export const spacingFor = (manifest: Manifest) => Math.min(MIN_SPACING, 0.25 * Math.min(manifest.map.width, manifest.map.height));
export const isPassable = (b: number) => (b & 128) !== 0 && (b & 31) !== 31;
export const isOcean = (b: number) => (b & 128) === 0 && (b & 32) !== 0;

/** Exact discrete disk, zero outside the map. Each disk row is a box sum over
 * a row-prefix integral image, preserving the numpy prototype's circular kernel. */
export function diskSum(values: ArrayLike<number>, width: number, height: number, radius: number) {
  const prefix = new Float64Array((width + 1) * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * (width + 1) + x; prefix[i + 1] = prefix[i]! + values[y * width + x]!;
  }
  const sum = new Float64Array(width * height); let area = 0;
  for (let dy = -radius; dy <= radius; dy++) {
    const dx = Math.floor(Math.sqrt(radius * radius - dy * dy)); area += dx * 2 + 1;
    for (let y = Math.max(0, -dy); y < Math.min(height, height - dy); y++) {
      const row = (y + dy) * (width + 1); const out = y * width;
      for (let x = 0; x < width; x++) sum[out + x] = sum[out + x]! + prefix[row + Math.min(width, x + dx + 1)]! - prefix[row + Math.max(0, x - dx)]!;
    }
  }
  return { sum, area };
}
export function componentAreas(passable: Uint8Array, width: number, height: number) {
  const areas = new Uint32Array(passable.length); const seen = new Uint8Array(passable.length);
  const queue = new Uint32Array(passable.length);
  for (let start = 0; start < passable.length; start++) {
    if (!passable[start] || seen[start]) continue;
    let head = 0; let tail = 1; queue[0] = start; seen[start] = 1;
    const add = (i: number) => { if (passable[i] && !seen[i]) { seen[i] = 1; queue[tail++] = i; } };
    while (head < tail) {
      const i = queue[head++]!; const x = i % width;
      if (x > 0) add(i - 1); if (x + 1 < width) add(i + 1);
      if (i >= width) add(i - width); if (i + width < width * height) add(i + width);
    }
    for (let j = 0; j < tail; j++) areas[queue[j]!] = tail * SCALE * SCALE;
  }
  return areas;
}
/** Strict-lower ranks match propose.py:reasons. Quantization removes convolution
 * roundoff from mathematically equal values. Invalid cells never enter the ranks. */
export function percentileRanks(values: Float64Array, valid: Uint8Array, midpoint = false) {
  const key = (v: number) => Math.round(v * 1e9) / 1e9;
  const sorted = Array.from(values).filter((_, i) => valid[i]).map(key).sort((a, b) => a - b);
  const ranks = new Map<number, number>();
  for (let start = 0; start < sorted.length;) {
    let end = start + 1;
    while (end < sorted.length && sorted[end] === sorted[start]) end++;
    ranks.set(sorted[start]!, (start + (midpoint ? (end - start) / 2 : 0)) / sorted.length);
    start = end;
  }
  return Float64Array.from(values, (v, i) => valid[i] ? ranks.get(key(v))! : 0);
}
export interface ReasonTerms {
  reach120: number; largestLandmass: boolean; componentShare: number;
  closure: number; exits: number; defense: number; coast: number;
  nationDistance: number; edge: number;
}
export function reasonsFor(t: ReasonTerms): { reasons: string[]; warning?: string } {
  const reasons: { strength: number; text: string }[] = [];
  const warnings: { strength: number; text: string }[] = [];
  const add = (strength: number, text: string) => reasons.push({ strength, text });
  const warn = (strength: number, text: string) => warnings.push({ strength, text });
  if (t.reach120 >= 0.9) add(t.reach120, `Biggest cheap-land pocket nearby (top ${Math.max(1, Math.round(100 * (1 - t.reach120)))}% of map)`);
  else if (t.reach120 >= 0.7) add(t.reach120 - 0.1, "Plenty of cheap land within 120 tiles");
  if (t.largestLandmass) add(0.6, "On the main landmass");
  else if (t.componentShare < 0.1) warn(0.95, "Island start: port-dependent, slow early growth");
  if (t.closure < 0.05) add(0.4, "Open on all sides: watch every front");
  else if (t.exits === 1) add(0.55, `One land front, ${Math.round(100 * t.closure)}% of horizon closed`);
  else if (t.exits === 2) add(0.5, "Two land exits");
  else if (t.exits >= 3) add(0.35, `${t.exits} land exits: hard to wall off`);
  if (t.defense >= 0.5) add(0.5 + t.defense / 4, "Mountain core: defends well");
  else if (t.defense >= 0.25) add(0.45, "Hilly core");
  if (t.coast > 0) add(0.3, "Shore within 24 tiles: early port possible");
  if (t.nationDistance < 80) warn(0.7, `AI nation anchor ${Math.round(t.nationDistance)} tiles away: expect early pressure`);
  if (t.edge < 0.1) warn(0.65, "Hugs the map edge: one side is dead space");
  const warning = warnings.sort((a, b) => b.strength - a.strength)[0]?.text;
  return { reasons: reasons.sort((a, b) => b.strength - a.strength).slice(0, 3).map(t => t.text), ...(warning ? { warning } : {}) };
}
/** Circular runs, including the last-to-first seam; outside the map is closed. */
export function landExits(passable: Uint8Array, width: number, height: number, index: number) {
  const x = index % width; const y = Math.floor(index / width);
  const samples = Array.from({ length: 96 }, (_, k) => {
    const angle = k * 2 * Math.PI / 96;
    const sx = x + Math.round(15 * Math.cos(angle)); const sy = y + Math.round(15 * Math.sin(angle));
    return sx >= 0 && sx < width && sy >= 0 && sy < height && passable[sy * width + sx] === 1;
  });
  return samples.every(Boolean) ? 1 : samples.filter((v, k) => v && !samples[(k + 95) % 96]).length;
}
export function selectPicks(scores: Float64Array, width: number, spacing: number) {
  const selected: number[] = [];
  for (let k = 0; k < 3; k++) {
    let best = -1;
    for (let i = 0; i < scores.length; i++) {
      if (!Number.isFinite(scores[i]) || selected.some(j => ((i % width - j % width) * SCALE) ** 2 + ((Math.floor(i / width) - Math.floor(j / width)) * SCALE) ** 2 < spacing ** 2)) continue;
      if (best < 0 || scores[i]! > scores[best]! + 1e-12) best = i;
    }
    if (best < 0) break;
    selected.push(best);
  }
  return selected;
}
export function scoreMap(terrain: Uint8Array, manifest: Manifest) {
  const { width, height } = manifest.map16x; const n = width * height;
  if (terrain.length !== n) throw Error("Invalid terrain length");
  const passable = Uint8Array.from(terrain, b => Number(isPassable(b)));
  const cheap = new Float64Array(n); const defense = new Float64Array(n); const shore = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (!passable[i]) continue;
    const mag = terrain[i]! & 31; const x = i % width;
    cheap[i] = 16.5 / (mag < 10 ? 16.5 : mag < 20 ? 20 : 25);
    defense[i] = mag < 10 ? 1 : mag < 20 ? 1.25 : 1.5;
    shore[i] = Number((x > 0 && isOcean(terrain[i - 1]!)) || (x + 1 < width && isOcean(terrain[i + 1]!)) || (i >= width && isOcean(terrain[i - width]!)) || (i + width < n && isOcean(terrain[i + width]!)));
  }
  const reach = diskSum(cheap, width, height, 15).sum;
  const bigReach = diskSum(cheap, width, height, 30).sum;
  let maxReach = 0; for (const value of reach) maxReach = Math.max(maxReach, value);
  let maxBigReach = 0; for (const value of bigReach) maxBigReach = Math.max(maxBigReach, value);
  const coast = diskSum(shore, width, height, 6).sum;
  const outer = diskSum(passable, width, height, 15); const inner = diskSum(passable, width, height, 13);
  const core = diskSum(defense, width, height, 4).sum; const coreCount = diskSum(passable, width, height, 4).sum;
  const spawnDisk = diskSum(passable, width, height, 1).sum;
  const areas = componentAreas(passable, width, height);
  let maxArea = 0; for (const value of areas) maxArea = Math.max(maxArea, value);
  const anchors = manifest.nations.flatMap(nation => nation.coordinates ? [nation.coordinates] : []);
  const nationDistance = new Float64Array(n); nationDistance.fill(Infinity);
  const scores = new Float64Array(n); scores.fill(-Infinity);
  const valid = new Uint8Array(n); const closure = new Float64Array(n);
  const raw = { reach120: new Float64Array(n), reach60: new Float64Array(n), defense: new Float64Array(n), coast: new Float64Array(n), nationNear: new Float64Array(n), smallIsland: new Float64Array(n) };
  let eligibleComponents = false;
  for (let i = 0; i < n; i++) {
    if (areas[i]! >= MIN_COMPONENT) eligibleComponents = true;
    if (!passable[i] || areas[i]! < MIN_COMPONENT || spawnDisk[i] !== 5) continue;
    valid[i] = 1;
    const x = i % width * SCALE; const y = Math.floor(i / width) * SCALE;
    for (const [ax, ay] of anchors) nationDistance[i] = Math.min(nationDistance[i]!, Math.abs(ax - x) + Math.abs(ay - y));
    closure[i] = 1 - (outer.sum[i]! - inner.sum[i]!) / (outer.area - inner.area);
    raw.reach120[i] = bigReach[i]! / Math.max(maxBigReach, 1);
    raw.reach60[i] = reach[i]! / Math.max(maxReach, 1);
    raw.defense[i] = (core[i]! / Math.max(coreCount[i]!, 1e-9) - 1) / 0.5;
    raw.coast[i] = Number(coast[i]! > 0);
    raw.nationNear[i] = Math.max(0, (80 - nationDistance[i]!) / 80);
    raw.smallIsland[i] = Math.max(0, (0.1 - areas[i]! / Math.max(maxArea, 1)) / 0.1);
  }
  const terms = { ...raw };
  for (const key of Object.keys(raw) as (keyof typeof raw)[]) terms[key] = percentileRanks(raw[key], valid);
  for (let i = 0; i < n; i++) if (valid[i]) scores[i] = 0.60 * terms.reach120[i]! + 0.05 * terms.reach60[i]! + 0.10 * terms.defense[i]! + 0.05 * terms.coast[i]! - 0.10 * terms.nationNear[i]! - 0.10 * terms.smallIsland[i]!;
  const percentiles = percentileRanks(scores, valid, true);
  const picks: Pick[] = selectPicks(scores, width, spacingFor(manifest)).map(best => {
    const x = best % width * SCALE; const y = Math.floor(best / width) * SCALE;
    const explanation = reasonsFor({ reach120: terms.reach120[best]!, largestLandmass: areas[best] === maxArea, componentShare: areas[best]! / maxArea,
      closure: closure[best]!, exits: landExits(passable, width, height, best), defense: raw.defense[best]!, coast: raw.coast[best]!,
      nationDistance: nationDistance[best]!, edge: Math.min(x, y, (width - 1) * SCALE - x, (height - 1) * SCALE - y) / (Math.min(width, height) * SCALE / 2) });
    return { x, y, score: Math.round(scores[best]! * 1000) / 1000, percentile: Math.round(percentiles[best]! * 1e6) / 1e6, ...explanation };
  });
  // Heat covers all passable land, including small islands and the coast excluded by pick spacing.
  const room = percentileRanks(bigReach, passable, true);
  const heat = Uint8Array.from(passable, (land, i) => land ? 1 + Math.round(31 * (0.65 * room[i]! + 0.35 * Number(coast[i]! > 0))) : 0);
  return { picks, eligibleComponents, passable, coast, nationDistance, areas, raw, terms, valid, scores, heat };
}

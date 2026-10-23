import { expect, it } from "vitest";
import { spotsFor } from "./index";
import { mapToSnapshot } from "../mapToSnapshot";
import data from "./spots.json";

it("includes a terrain-derived ocean flag on every bundled map", () => {
  for (const map of Object.values(data.maps)) expect(typeof map.hasOcean).toBe("boolean");
  for (const map of Object.values(data.maps)) expect(JSON.stringify("community" in map ? map.community : {})).not.toMatch(/always|must|betray|winners/i);
  expect(spotsFor("World")?.hasOcean).toBe(true);
  expect(spotsFor("Alps")?.hasOcean).toBe(false);
  expect(spotsFor("The Box")?.hasOcean).toBe(false);
});

it("resolves exact wire names, safely rejects unknown names, and returns independent data", () => {
  expect(spotsFor("World")?.picks).toHaveLength(3);
  expect(spotsFor("Amazon River")?.folder).toBe("amazonriver");
  expect(spotsFor("ArchipelagoSea")?.displayName).toBe("Archipelago Sea");
  for (const name of ["unknown", "world", "toString", "__proto__"]) expect(spotsFor(name)).toBeNull();
  spotsFor("World")!.picks[0]!.reasons.push("mutation");
  expect(spotsFor("World")!.picks[0]!.reasons).not.toContain("mutation");
});
it("halves Compact coordinates and dimensions, leaving Normal data unchanged", () => {
  const normal = spotsFor("World", "Normal")!; const compact = spotsFor("World", "Compact")!;
  expect(compact.note).toBe("Compact map: picks are approximate");
  expect(compact.width).toBe(normal.width / 2); expect(compact.height).toBe(normal.height / 2);
  compact.picks.forEach((p, i) => { expect(p.x).toBe(normal.picks[i]!.x / 2); expect(p.y).toBe(normal.picks[i]!.y / 2); });
  expect(spotsFor("World")).toEqual(normal);
});
it("passes only recognized map sizes from extraction to the snapshot", () => {
  for (const size of ["Normal", "Compact", "future-size"]) {
    expect(mapToSnapshot({ inGame: true, visible: true, game: { mapSize: size } })?.mapSize).toBe(size === "future-size" ? undefined : size);
  }
});

import { readFileSync } from "node:fs";
import { DRILL_CATALOG } from "@flashfront/core";
import { expect, it } from "vitest";
import { clientDrillCheck, drillWindow, validateDrillClient } from "./drill-client";

it("resolves authored ally display labels to session player ids", () => {
  const script = JSON.parse(readFileSync(new URL("../../../apps/launcher/resources/training/drills/scripts/ally-02.json", import.meta.url), "utf8"));
  const check = DRILL_CATALOG.find(d => d.id === "ally-02")!.check;
  expect(clientDrillCheck(check, script.cast)).toEqual({ ...check, target: "p2" });
  expect(() => clientDrillCheck({ ...check, kind: "ally", decision: "accept", deadlineTick: 940, target: "Missing" }, script.cast)).toThrow(/target/);
});

it("opens ally-02 at the first opponent tick", () => {
  const script = JSON.parse(readFileSync(new URL("../../../apps/launcher/resources/training/drills/scripts/ally-02.json", import.meta.url), "utf8"));
  const check = DRILL_CATALOG.find((d) => d.id === "ally-02")!.check;
  expect(check.kind).toBe("ally");
  expect(drillWindow(check, 840, script.opponents)).toEqual({ openTick: 845, deadlineTick: check.kind === "ally" && check.deadlineTick });
});
it("gives send attempts 600 ticks", () => {
  expect(drillWindow({ kind: "send", minSendPct: 15, maxSendPct: 25, minReservePct: 40 }, 840, [])).toEqual({ openTick: 840, deadlineTick: 1440 });
});
it("opens post attempts at startTick", () => {
  expect(drillWindow({ kind: "post", allowedTiles: [1], beforeTick: 900 }, 840, [])).toEqual({ openTick: 840, deadlineTick: 900 });
});
it("opens ally request drills without opponent actions at startTick", () => {
  expect(drillWindow({ kind: "ally", decision: "request", target: "p2", deadlineTick: 900 }, 840, [])).toEqual({ openTick: 840, deadlineTick: 900 });
});
const valid = () => ({ drillId: "sends-01", engineCommit: "abc", snapshotFormat: "1", startTick: 840, ownClientId: "YouDrill", gameStartInfo: {}, opponents: [], coach: [{ turn: 5, intent: { type: "attack", clientID: "YouDrill" } }], check: { kind: "send", minSendPct: 15, maxSendPct: 25, minReservePct: 40 }, window: { openTick: 840, deadlineTick: 1440 } });
it("requires snapshotFormat with a useful error", () => {
  const { snapshotFormat: _, ...value } = valid();
  expect(() => validateDrillClient(value)).toThrow("drill client: missing snapshotFormat");
});
it("accepts a client and rejects malformed nested data", () => {
  expect(validateDrillClient(valid())).toEqual(valid());
  for (const patch of [{ startTick: -1 }, { opponents: [{}] }, { coach: [{ turn: -1, intent: {} }] }, { check: null }, { check: { kind: "send", minSendPct: 90, maxSendPct: 10, minReservePct: 40 } }, { window: { openTick: 900, deadlineTick: 800 } }, { gameStartInfo: null }]) {
    expect(() => validateDrillClient({ ...valid(), ...patch })).toThrow(/drill client:/);
  }
});

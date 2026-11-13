import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { derivePlayerIds, ownPlayer, parseGameRecord, targetKind, trimGameRecord } from "./record";

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));
const withTurns = (turns: unknown[]) => ({ ...fixture("team-record.json"), turns });

it("parses the captured record into ticked, typed intents", () => {
  const r = parseGameRecord(fixture("team-record.json"))!;
  const recording = fixture("team-recording.json");
  expect(r.gameId).toMatch(/^[A-Za-z0-9]{6,16}$/);
  expect(r.intents.every((i, k) => k === 0 || i.tick >= r.intents[k - 1]!.tick)).toBe(true);
  expect(r.intents.some(i => i.kind === "attack" && i.target === null)).toBe(true);
  expect(r.idsVerified).toBe(true);
  expect(ownPlayer(r, recording.me.clientId)?.playerId).toMatch(/^[0-9a-z]{8}$/);
  expect(r.durationTicks).toBe(fixture("team-record.json").info.num_turns);
  expect(targetKind(r, null)).toBe("wilderness");
  expect(targetKind(r, r.players[0]!.playerId!)).toBe("human");
  expect(targetKind(r, "synthetic-ai")).toBe("ai");
});

it("derives OpenFront PlayerIDs deterministically", () => {
  // Pinned independently using the installed OpenFront worker's generator.
  expect(derivePlayerIds("abCD1234", 1)).toEqual(["l8nuuuk4"]);
  expect(derivePlayerIds("abCD1234", 3)).toEqual(derivePlayerIds("abCD1234", 3));
  expect(new Set(derivePlayerIds("abCD1234", 50)).size).toBe(50);
});

it("drops unknown or malformed intents and rejects non-records", () => {
  expect(parseGameRecord({ version: "v0.0.2", info: {}, turns: "x" })).toBeUndefined();
  expect(parseGameRecord(null)).toBeUndefined();
  const invalid = [
    { type: "attack", clientID: "AAAAAAAA", targetID: null, troops: -1 },
    { type: "future_thing", clientID: "AAAAAAAA" },
    { type: "boat", clientID: "AAAAAAAA", troops: Infinity },
    { type: "attack", clientID: "AAAAAAAA", troops: 1 },
    { type: "spawn", clientID: 1 },
  ];
  expect(parseGameRecord(withTurns([{ turnNumber: 5, intents: invalid }]))!.intents).toEqual([]);
});

it("keeps nullable attack troops and stable order at equal ticks", () => {
  const intents = [
    { type: "attack", clientID: "AAAAAAAA", targetID: null, troops: null },
    { type: "boat", clientID: "AAAAAAAA", troops: 0 },
    { type: "allianceRequest", clientID: "AAAAAAAA", recipient: "bbbbbbbb" },
    { type: "allianceReject", clientID: "AAAAAAAA", requestor: "bbbbbbbb" },
    { type: "breakAlliance", clientID: "AAAAAAAA", recipient: "bbbbbbbb" },
    { type: "build_unit", clientID: "AAAAAAAA", unit: "Port" },
  ];
  const r = parseGameRecord(withTurns([
    { turnNumber: 10, intents }, { turnNumber: 1, intents: [{ type: "spawn", clientID: "AAAAAAAA" }] },
    { turnNumber: -1, intents },
  ]))!;
  expect(r.intents.map(i => i.kind)).toEqual(["spawn", "attack", "boat", "allianceRequest", "allianceReject", "breakAlliance", "build"]);
  expect(r.intents[1]).toMatchObject({ tick: 10, troops: null, target: null });
});

it("marks ids unverified when derived ids never appear", () => {
  const json = fixture("team-record.json"); json.info.gameID = "zzzzzzzz";
  const r = parseGameRecord(json)!;
  expect(r.idsVerified).toBe(false);
  expect(r.players.every(p => p.playerId === undefined)).toBe(true);
  expect(targetKind(r, "abcd1234")).toBe("unknown");
});

it("trims identity fields without mutating input or losing replay turns", () => {
  const json = fixture("team-record.json");
  Object.assign(json.info.players[0], { publicID: "PRIVATE1", persistentID: "PRIVATE2", cosmetics: {} });
  json.info.reports = ["private"];
  const t = trimGameRecord(json) as typeof json;
  expect(JSON.stringify(t)).not.toMatch(/publicID|persistentID|cosmetics|reports/);
  expect(t.turns).toEqual(json.turns);
  expect(json.info.players[0].publicID).toBe("PRIVATE1");
});

it("honors disabled alliances and zero alliance duration", () => {
  for (const config of [{ disableAlliances: true }, { customAllianceDuration: 0 }]) {
    const json = fixture("team-record.json"); Object.assign(json.info.config, config);
    expect(parseGameRecord(json)!.alliancesEnabled).toBe(false);
  }
});

it("commits only synthetic human and tribe display names in the fixture", () => {
  const json = fixture("team-record.json");
  expect(json.info.players.every((p: { username: string }) => /^Player \d+$/.test(p.username))).toBe(true);
  expect(json.info.tribes.every((p: { name: string }) => /^Tribe \d+$/.test(p.name))).toBe(true);
  expect(json.info.start).toBe(Date.UTC(2026, 0, 1));
});

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { beforeAll, expect, it } from "vitest";
import { buildClients } from "./drill-client.ts";
import { opponentNames } from "../../packages/core/src/training/opponent-names.ts";

const dir = new URL("../../apps/launcher/resources/training/drills/client/", import.meta.url);
const ids = ["ally", "posts", "sends"].flatMap((kind) => Array.from({ length: 7 }, (_, i) => `${kind}-0${i + 1}`));
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
let results: Awaited<ReturnType<typeof buildClients>>;
beforeAll(async () => { results = await buildClients(); }, 600_000);

it("every drill has a client file and a snapshot", () => {
  for (const id of ids) for (const suffix of ["json", "snapshot.bin"]) expect(existsSync(new URL(`${id}.${suffix}`, dir)), `${id}.${suffix}`).toBe(true);
});
it("client files are current", () => {
  expect(results.map((r) => r.data.drillId)).toEqual(ids);
  for (const result of results) {
    const id = result.data.drillId;
    expect(readFileSync(new URL(`${id}.json`, dir), "utf8"), id).toBe(result.json);
    expect(sha(readFileSync(new URL(`${id}.snapshot.bin`, dir))), id).toBe(sha(result.snapshot));
  }
});
it("no drill starts with plan-driven units", () => {
  for (const result of results) {
    const id = result.data.drillId;
    expect(result.startTick, id).toBe(result.data.startTick);
    expect(result.unitTypes.filter((t) => ["Transport", "Warship", "Trade Ship", "Train"].includes(t)), id).toEqual([]);
  }
});
it("player renamed", () => {
  for (const result of results) {
    const id = result.data.drillId;
    expect(result.ownName, id).toBe("You");
    expect(result.opponentNames, id).toEqual(opponentNames(id, result.opponentNames.length));
    const info = result.data.gameStartInfo as { players: { clientID: string; username: string }[] };
    expect(info.players.find((p) => p.clientID === result.data.ownClientId)?.username, id).toBe("You");
    expect(info.players.filter((p) => p.clientID !== result.data.ownClientId).map((p) => p.username), id).toEqual(result.opponentNames);
  }
});
it("scripts use relative turns and the acting player's client id", () => {
  for (const result of results) {
    const script = JSON.parse(readFileSync(new URL(`../scripts/${result.data.drillId}.json`, dir), "utf8"));
    const data = JSON.parse(result.json);
    for (const key of ["opponents", "coach"]) {
      const actions = script[key].filter((s: { action: { kind: string } }) => s.action.kind !== "wait");
      expect(data[key]).toHaveLength(actions.length);
      actions.forEach((s: { tick: number; actor: string }, i: number) => {
        const label = Object.keys(script.cast.labels).find((label) => script.cast.labels[label] === s.actor)!;
        expect(data[key][i].turn).toBe(s.tick - data.startTick);
        expect(data[key][i].intent.clientID).toBe(script.cast.clients[label]);
        expect(data[key][i].intent.type).toBeTypeOf("string");
      });
    }
    expect(data).not.toHaveProperty("wrong");
  }
});

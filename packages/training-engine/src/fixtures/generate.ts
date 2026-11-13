// Generates synthetic-record.json: a short two-human game on Onion, played on the pinned engine.
// Its hashes are the engine's own at generation time, so later rebuilds are checked against an
// independent earlier run. No real player data. Run: pnpm exec vitest run --config vitest.generate.config.ts
import { writeFileSync } from "node:fs";
import { it } from "vitest";
import { ENGINE_COMMIT } from "../protocol";
import { newRunner, parseStart } from "../upstream";
import type { StampedIntent, Turn } from "../upstream";
import { onionMap } from "./maps";

const TURNS = 900;
import { SYNTH } from "./ids";

it("generates the synthetic record", async () => {
  for (const mapSize of ["Normal", "Compact"] as const) {
    const info = {
      gameID: mapSize === "Normal" ? "synthN01" : "synthC01", lobbyCreatedAt: 1_792_800_000_000,
      config: { gameMap: "Onion", difficulty: "Medium", donateGold: false, donateTroops: false, gameType: "Public", gameMode: "Free For All",
        gameMapSize: mapSize, publicGameModifiers: {}, nations: "default", bots: 20, infiniteGold: false, infiniteTroops: false, instantBuild: false,
        randomSpawn: false, maxPlayers: 4, spawnImmunityDuration: 50, disabledUnits: [], trusted: true, overtime: { enabled: true }, disableClanTags: true },
      players: [{ clientID: SYNTH.me, username: "Synthetic Me", clanTag: null }, { clientID: SYNTH.rival, username: "Synthetic Rival", clanTag: null }],
      num_turns: TURNS,
    };
    const start = parseStart(info)!;
    const hashes = new Map<number, number>();
    const runner = await newRunner(start, onionMap(mapSize), (t, h) => hashes.set(t, h), (m) => { throw new Error(m); });
    const map = runner.game.map();
    const land: number[] = [];
    map.forEachTile((t) => { if (map.isLand(t)) land.push(t); });
    const id = (client: string) => runner.game.playerByClientID(client)?.id() ?? null;
    const turns: Turn[] = [];
    for (let n = 0; n < TURNS; n++) {
      const intents: StampedIntent[] = [];
      const say = (clientID: string, intent: object) => intents.push({ ...intent, clientID } as StampedIntent);
      if (n === 5) { say(SYNTH.me, { type: "spawn", tile: land[Math.floor(land.length * 0.25)] }); say(SYNTH.rival, { type: "spawn", tile: land[Math.floor(land.length * 0.75)] }); }
      if (n > 0 && n % 40 === 0) { say(SYNTH.me, { type: "attack", targetID: null, troops: 300 + n }); say(SYNTH.rival, { type: "attack", targetID: null, troops: 250 + n }); }
      if (n === 301) say(SYNTH.rival, { type: "attack", targetID: null, troops: 999 });
      if (n === 320 && id(SYNTH.me)) say(SYNTH.rival, { type: "allianceRequest", recipient: id(SYNTH.me) });
      if (n === 330 && id(SYNTH.rival)) say(SYNTH.me, { type: "allianceRequest", recipient: id(SYNTH.rival) });
      const turn: Turn = { turnNumber: n, intents };
      runner.addTurn(turn);
      if (!runner.executeNextTick()) throw new Error(`tick ${n} failed`);
      turns.push(turn);
    }
    for (const t of turns) if (hashes.has(t.turnNumber)) t.hash = hashes.get(t.turnNumber)!;
    const record = { version: "v0.0.2", gitCommit: ENGINE_COMMIT, info, turns: turns.filter((t) => t.intents.length > 0 || t.hash != null) };
    writeFileSync(new URL(`./synthetic-record${mapSize === "Normal" ? "" : "-compact"}.json`, import.meta.url), JSON.stringify(record) + "\n");
  }
});

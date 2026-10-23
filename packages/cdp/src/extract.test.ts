import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";
import { EXTRACT_EXPRESSION, CAMERA_EXPRESSION } from "./extract";
import type { RawExtract } from "@flashfront/core";

let dom: JSDOM;
let host: Element & { game?: unknown; attackRatio?: number };
const read = (): RawExtract => JSON.parse(JSON.stringify(dom.window.eval(EXTRACT_EXPRESSION))) as RawExtract;
beforeEach(() => {
  dom = new JSDOM("<body><control-panel></control-panel><leader-board><table><tbody></tbody></table></leader-board></body>", { runScripts: "outside-only", pretendToBeVisual: true });
  host = dom.window.document.querySelector("control-panel")!;
  vi.spyOn(dom.window.document, "hasFocus").mockReturnValue(true);
  // Real menu text: a news item announcing the next version sits above the real footer.
  Object.defineProperty(dom.window.document.body, "innerText", { value: ["NEWS", "v0.35.0 beta is here!", "PLAY", "v0.34.25 (Steam v0.2.1)", "Terms of Service"].join("\n") });
});
afterEach(() => { dom.window.close(); vi.restoreAllMocks(); });
it("reads only camera geometry in the fast expression, never playerViews or own-player stats", () => {
  const forbidden = vi.fn(() => { throw Error("Player data in camera lane"); });
  host.game = { inSpawnPhase: () => true, playerViews: forbidden, myPlayer: forbidden, width: () => 2000, height: () => 1000 };
  const timer = dom.window.document.createElement("spawn-timer");
  Object.assign(timer, { transformHandler: { scale: 2, offsetX: 10, offsetY: 20, boundingRect: () => ({ left: 0, top: 5, width: 1024, height: 768 }) } });
  dom.window.document.body.append(timer);
  const camera = dom.window.eval(CAMERA_EXPRESSION);
  expect(camera).toEqual({ scale: 2, offsetX: 10, offsetY: 20, mapWidth: 2000, mapHeight: 1000, left: 0, top: 5, width: 1024, height: 768, viewportWidth: 1024, viewportHeight: 768 });
  expect(forbidden).not.toHaveBeenCalled(); expect(CAMERA_EXPRESSION).not.toMatch(/playerViews|myPlayer|troops|gold/);
  host.game = { inSpawnPhase: () => false, playerViews: forbidden };
  expect(dom.window.eval(CAMERA_EXPRESSION)).toBeNull();
});
it("reads the own team and its theme color without querying any other player's team", () => {
  const forbidden = vi.fn(() => { throw Error("Other team"); });
  const teamColor = vi.fn(() => ({ toHex: () => "#009e73" }));
  const me = { team: () => "Teal", territoryColor: teamColor, isAlive: () => true, nameLocation: () => ({ x: 10, y: 20 }) };
  const other = { team: forbidden, teamColor: forbidden, territoryColor: forbidden, isAlive: () => true, nameLocation: () => ({ x: 30, y: 40 }) };
  host.game = { myPlayer: () => me, inSpawnPhase: () => true, playerViews: () => [me, other], config: () => ({ gameConfig: () => ({ gameMode: "Team" }) }) };
  expect(read().me).toMatchObject({ team: "Teal", teamColor: "#009e73" });
  expect(teamColor).toHaveBeenCalledWith(); expect(forbidden).not.toHaveBeenCalled();
});
it("reads the own cached territory color after v0.35 moved themes out of config", () => {
  const forbidden = vi.fn(() => { throw Error("Other player color"); });
  const me = { team: () => "Teal", territoryColor: () => ({ toHex: () => "#009e73" }) };
  host.game = { myPlayer: () => me, config: () => ({}), playerViews: forbidden };
  expect(read().me).toMatchObject({ team: "Teal", teamColor: "#009e73" });
  expect(forbidden).not.toHaveBeenCalled();
});
it("extracts own getters, serializes BigInt and never enumerates other players outside spawn", () => {
  const forbidden = vi.fn(() => { throw new Error("Forbidden getter"); });
  const me = {
    clientID: () => "own-client", profile: () => ({ publicID: "AbCd1234" }),
    name: () => "Tidewalker", displayName: () => "Tide", clanTag: () => "FF",
    troops: () => 146020, gold: () => 42800n, numTilesOwned: () => 1000, isAlive: () => true,
    goldEarned: () => 9007199254740993n, tradeGold: () => 40000n, trainGold: () => 20000n, piracyGold: () => 1000n, readyMissileCount: () => 2,
    incomingAttacks: () => [{ attacker: forbidden, troops: 13000 }],
    outgoingAttacks: () => [{}], alliances: () => [{ expiresAt: () => 600, other: forbidden, with: forbidden }],
    totalUnitLevels: vi.fn((type: string) => type === "City" ? 2 : 0),
  };
  const config = { maxTroops: vi.fn(() => 364227.77), troopIncreaseRate: vi.fn(() => 887.97),
    gameConfig: () => ({ gameMap: "World", gameMapSize: "Compact", gameMode: "Free For All", gameType: "Singleplayer", difficulty: "Easy", bots: 400 }) };
  host.game = { gameID: () => "game123", ticks: () => 461, inSpawnPhase: () => false, gameOver: () => false, myPlayer: () => me, config: () => config, players: forbidden, playerViews: forbidden, ownerID: forbidden, hasOwner: forbidden, terrainByte: forbidden, nationPositions: forbidden };
  host.attackRatio = 0.2;
  const inGame = read();
  expect(inGame.gameId).toBe("game123");
  expect(inGame.me).toMatchObject({ clientId: "own-client", profilePublicId: "AbCd1234" });
  expect(inGame.gameVersion).toBeUndefined(); // only read in the menu: no per-tick innerText layout cost
  expect(inGame.game).toEqual({ map: "World", mapSize: "Compact", mode: "Free For All", type: "Singleplayer", difficulty: "Easy" });
  expect(inGame).toMatchObject({ inGame: true, visible: true, tick: 461, me: {
    name: "Tidewalker", displayName: "Tide", gold: "42800", troops: 146020,
    goldEarned: "9007199254740993", tradeGold: "40000", trainGold: "20000", piracyGold: "1000", readyMissiles: 2,
    maxTroops: 364227.77, troopRatePerTick: 887.97, attackRatio: 0.2, cityLevels: 2,
    incoming: [{ from: "Incoming attack", troops: 13000 }], outgoingCount: 1,
    alliances: [{ with: "Alliance 1", expiresInTicks: 139 }],
  } });
  expect(config.maxTroops).toHaveBeenCalledWith(me);
  expect(me.totalUnitLevels.mock.calls.map(c => c[0])).toEqual(["City", "Port", "Factory", "Defense Post", "SAM Launcher", "Missile Silo"]);
  expect(forbidden).not.toHaveBeenCalled();
});
it("reads only landed spawn coordinates, excludes self, and stops enumeration after spawn", () => {
  const forbidden = vi.fn(() => { throw Error("Not a spawn position"); });
  const position = vi.fn(() => ({ x: 120, y: 80, name: "must not leave page" }));
  const other = { isAlive: () => true, nameLocation: position, troops: forbidden, gold: forbidden, name: forbidden, alliances: forbidden, clientID: forbidden };
  const me = { isAlive: () => true, nameLocation: () => ({ x: 500, y: 300 }) };
  const playerViews = vi.fn(() => [me, other, { isAlive: () => false, nameLocation: forbidden }, { isAlive: () => true, nameLocation: () => ({ x: Infinity, y: 4 }) }]);
  let spawning = true; let rankedType: string | undefined; let replay = false; let gameType = "Public";
  const config = { gameConfig: () => ({ gameType, rankedType }), isReplay: () => replay, numSpawnPhaseTurns: () => 200 };
  host.game = { inSpawnPhase: () => spawning, ticks: () => 175, myPlayer: () => me, playerViews, players: forbidden, config: () => config, width: () => 2000, height: () => 1000 };
  const timer = dom.window.document.createElement("spawn-timer");
  Object.assign(timer, { transformHandler: { scale: 1.8, offsetX: -350, offsetY: -200, boundingRect: () => ({ left: 16, top: 24, width: 1920, height: 1080 }) } });
  dom.window.document.body.append(timer);
  expect(read().spawnHeat).toEqual({ others: [{ x: 120, y: 80 }], own: { x: 500, y: 300 }, remainingSec: 2.5,
    camera: { scale: 1.8, offsetX: -350, offsetY: -200, mapWidth: 2000, mapHeight: 1000, left: 16, top: 24, width: 1920, height: 1080, viewportWidth: 1024, viewportHeight: 768 } });
  expect(forbidden).not.toHaveBeenCalled();
  position.mockReturnValue({ x: 240, y: 160, name: "must not leave page" });
  gameType = "Singleplayer";
  expect(read().spawnHeat).toMatchObject({ others: [{ x: 240, y: 160 }] });
  expect(read().spawnHeat?.remainingSec).toBeUndefined();
  const calls = playerViews.mock.calls.length;
  spawning = false; expect(read().spawnHeat).toBeUndefined();
  spawning = true; rankedType = "ffa"; expect(read().spawnHeat).toBeUndefined();
  rankedType = undefined; replay = true; expect(read().spawnHeat).toBeUndefined();
  expect(playerViews).toHaveBeenCalledTimes(calls); expect(forbidden).not.toHaveBeenCalled();
});
it("reads v0.35 ranked, replay, land tiles and alliance fields", () => {
  const config = { gameConfig: () => ({ gameMap: "Europe", gameMode: "Free For All", gameType: "Public", rankedType: "ffa", playerTeams: undefined, infiniteGold: false }), isReplay: () => true };
  const me = { alliances: () => [{ id: 1, other: "x", createdAt: 0, expiresAt: 900, hasExtensionRequest: true }] };
  host.game = { ticks: () => 300, myPlayer: () => me, config: () => config, numLandTiles: () => 123_456 };
  dom.window.location.hash = "";
  const raw = read();
  expect(raw.game).toMatchObject({ rankedType: "ffa", type: "Public" });
  expect(raw.game?.cheats).toBeUndefined();
  expect(raw).toMatchObject({ replay: true, landTiles: 123_456 });
  expect(raw.me?.alliances).toEqual([{ with: "Alliance 1", renewRequested: true, expiresInTicks: 600 }]);
});
it("parses the v0.35 player-stats grid (configurable columns, rank first)", () => {
  const doc = dom.window.document;
  const stats = doc.createElement("player-stats");
  const header = '<div role="row"><div role="columnheader">#</div><div role="columnheader">P</div></div>';
  const row = (cells: string[], cls = "") => `<div role="row" class="stats-table-row ${cls}">${cells.map(c => `<div role="cell"><span>${c}</span></div>`).join("")}</div>`;
  stats.innerHTML = header + row(["1", "QX", "Lantern", "12.5%"]) + row(["17", "", "Tidewalker", "1.2%"], "stats-table-pinned-row");
  doc.body.appendChild(stats);
  const rect = { x: 10, y: 10, top: 10, left: 10, bottom: 30, right: 200, width: 190, height: 20, toJSON() {} };
  for (const element of stats.querySelectorAll("[role=row], [role=cell]")) {
    element.getClientRects = () => [rect] as unknown as DOMRectList;
    element.getBoundingClientRect = () => rect;
  }
  host.game = { myPlayer: () => ({ name: () => "Tidewalker" }) };
  expect(read().leaderboard).toEqual([
    { rank: 1, name: "Lantern", landPct: 12.5, gold: "", troops: "", isMe: false },
    { rank: 17, name: "Tidewalker", landPct: 1.2, gold: "", troops: "", isMe: true },
  ]);
});
it("reads the version from the footer, not from news text", () => {
  expect(read()).toMatchObject({ inGame: false, gameVersion: "0.34.25" });
});
it("tolerates missing and throwing getters and unset menu game", () => {
  expect(read()).toMatchObject({ inGame: false });
  host.game = { myPlayer: () => ({ get gold() { throw new Error("missing"); }, totalUnitLevels: () => { throw new Error("unknown type"); } }) };
  expect(() => read()).not.toThrow();
  expect(read().me?.gold).toBeUndefined();
  expect(read().me?.cityLevels).toBeUndefined();
  expect(read().me?.goldEarned).toBeUndefined();
  expect(read().me?.tradeGold).toBeUndefined();
  expect(read().me?.trainGold).toBeUndefined();
  expect(read().me?.piracyGold).toBeUndefined();
  expect(read().me?.readyMissiles).toBeUndefined();
  Object.defineProperty(host, "game", { get: () => { throw new Error("removed"); } });
  expect(read().inGame).toBe(false);
});
it("parses only rendered leaderboard rows, excluding hidden/offscreen rows and cells", () => {
  const body = dom.window.document.querySelector("tbody")!;
  body.innerHTML = [1, 2, 3, 4].map(n => `<tr><td>${n}</td><td>Player ${n}</td><td>4.2%</td><td>42.8K</td><td>14.6K</td></tr>`).join("");
  const rect = { x: 10, y: 10, top: 10, left: 10, bottom: 30, right: 200, width: 190, height: 20, toJSON() {} };
  for (const element of body.querySelectorAll("tr, td")) {
    element.getClientRects = () => [rect] as unknown as DOMRectList;
    element.getBoundingClientRect = () => rect;
  }
  body.children[1]!.setAttribute("hidden", "");
  body.children[2]!.getBoundingClientRect = () => ({ ...rect, top: 5000, bottom: 5020 });
  body.children[3]!.children[4]!.setAttribute("style", "visibility:hidden");
  host.game = { myPlayer: () => ({ name: () => "Player 1" }) };
  expect(read().leaderboard).toEqual([{ rank: 1, name: "Player 1", landPct: 4.2, gold: "42.8K", troops: "14.6K", isMe: true }]);
  body.children[0]!.children[0]!.textContent = "20";
  body.children[0]!.children[1]!.textContent = "QX\n Tidewalker";
  host.game = { myPlayer: () => ({ name: () => "Tidewalker", displayName: () => "[QX] Tidewalker", clanTag: () => "QX" }) };
  expect(read().leaderboard?.[0]).toMatchObject({ rank: 20, isMe: true });
});

import { ownNameMatches } from "@flashfront/core";
/** The ONLY expression accepted by CdpClient. No mutation; spawn positions only during spawn. */
export const BEFORE_EXPRESSION = String.raw`(() => {
  const safe = f => { try { return f(); } catch { return undefined; } };
  const call = (o, key, ...args) => safe(() => typeof o?.[key] === "function" ? o[key](...args) : undefined);
  const numeric = v => typeof v === "number" && Number.isFinite(v) ? v : undefined;
  const string = v => v == null ? undefined : safe(() => String(v));
  const host = safe(() => document.querySelector("control-panel"));
  const g = safe(() => host?.game);
  const tick = numeric(call(g, "ticks"));
  const me = call(g, "myPlayer");
  const config = call(g, "config");
  const gameConfig = call(config, "gameConfig");
  const inSpawnPhase = call(g, "inSpawnPhase") === true;
  const replay = safe(() => call(config, "isReplay") === true || /replay-viewer=/.test(location.hash)) === true;
  const displayName = p => string(call(p, "displayName")) ?? string(call(p, "name"));
  const ownNameMatches = ${ownNameMatches.toString()};
  const array = v => Array.isArray(v) ? v : [];
  const spawnHeat = inSpawnPhase && !replay && !gameConfig?.rankedType && gameConfig?.gameType !== "Ranked" ? safe(() => {
    const position = p => {
      if (call(p, "isAlive") !== true) return undefined;
      const loc = call(p, "nameLocation");
      const x = numeric(loc?.x); const y = numeric(loc?.y);
      return x !== undefined && y !== undefined && x >= 0 && y >= 0 ? { x, y } : undefined;
    };
    const camera = safe(() => {
      const transform = ["spawn-timer", "emoji-table", "build-menu"].map(tag => document.querySelector(tag)?.transformHandler).find(Boolean);
      const rect = call(transform, "boundingRect");
      const c = { scale: numeric(transform?.scale), offsetX: numeric(transform?.offsetX), offsetY: numeric(transform?.offsetY),
        mapWidth: numeric(call(g, "width")), mapHeight: numeric(call(g, "height")),
        left: numeric(rect?.left), top: numeric(rect?.top), width: numeric(rect?.width), height: numeric(rect?.height),
        viewportWidth: numeric(innerWidth), viewportHeight: numeric(innerHeight) };
      return Object.values(c).every(v => v !== undefined) && c.scale > 0 && c.mapWidth > 0 && c.mapHeight > 0 && c.width > 0 && c.height > 0 && c.viewportWidth > 0 && c.viewportHeight > 0 ? c : undefined;
    });
    const turns = numeric(call(config, "numSpawnPhaseTurns"));
    return { others: array(call(g, "playerViews")).flatMap(p => { if (p === me) return []; const loc = position(p); return loc ? [loc] : []; }),
      own: position(me), camera,
      remainingSec: gameConfig?.gameType !== "Singleplayer" && turns !== undefined && tick !== undefined ? Math.max(0, (turns - tick) / 10) : undefined };
  }) : undefined;
  const isRendered = element => safe(() => {
    if (!element.isConnected || !element.getClientRects().length) return false;
    for (let node = element; node; node = node.parentElement ?? node.getRootNode()?.host) {
      const style = getComputedStyle(node);
      if (node.hidden || node.getAttribute("aria-hidden") === "true" || style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse" || style.opacity === "0") return false;
    }
    const r = element.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0 || r.bottom <= 0 || r.right <= 0 || r.top >= innerHeight || r.left >= innerWidth) return false;
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      if (/(auto|scroll|hidden|clip)/.test(style.overflow + style.overflowY)) {
        const b = parent.getBoundingClientRect();
        if (r.top < b.top || r.bottom > b.bottom || r.left < b.left || r.right > b.right) return false;
      }
    }
    return true;
  }) === true;
  // v0.35: <player-stats> (light DOM) renders role=row grids with configurable columns; rank is always
  // first. Older builds used <leader-board> with a fixed rank/name/land/gold/troops table.
  const board = safe(() => document.querySelector("player-stats") ?? document.querySelector("leader-board"));
  const root = safe(() => board?.shadowRoot) ?? board;
  const rows = array(safe(() => Array.from(root?.querySelectorAll("tbody tr, [role=row]") ?? [])));
  const own = { displayName: displayName(me), name: string(call(me, "name")), clanTag: string(call(me, "clanTag")) };
  const ownTeam = call(me, "team");
  const ownTeamColor = ownTeam == null ? undefined : call(call(me, "territoryColor"), "toHex");
  const leaderboard = rows.flatMap(row => safe(() => {
    if (!isRendered(row) || row.querySelector("[role=columnheader], th")) return [];
    const cells = Array.from(row.querySelectorAll("td, [role=cell]"));
    if (cells.length < 2 || cells.some(cell => !isRendered(cell))) return [];
    const texts = cells.map(cell => cell.innerText?.trim() ?? cell.textContent?.trim() ?? "");
    const rank = Number(texts[0].replace(/[^0-9]/g, ""));
    const fixed = cells.length >= 5 && texts[2].includes("%");
    const mine = texts.slice(1).find(text => ownNameMatches(text, own));
    // Default order is rank, clan, player: skip a leading clan tag (up to 5 chars) when a name follows it.
    const words = texts.slice(1, 4).filter(text => /[A-Za-z]/.test(text) && !/%$/.test(text));
    const name = fixed ? texts[1] : mine ?? (words.length > 1 && texts[1] === words[0] && words[0].length <= 5 ? words[1] : words[0]) ?? "";
    const pctText = fixed ? texts[2] : texts.find(text => /^[0-9.]+%$/.test(text)) ?? "";
    const landPct = Number(pctText.replace(/[^0-9.]/g, ""));
    if (!rank || !name || (fixed && !Number.isFinite(landPct))) return [];
    return [{ rank, name, landPct: Number.isFinite(landPct) ? landPct : 0, gold: fixed ? texts[3] : "", troops: fixed ? texts[4] : "", isMe: (fixed ? ownNameMatches(name, own) : mine !== undefined) || row.classList.contains("stats-table-pinned-row") }];
  }) ?? []);
  return {
    inGame: !!g, gameId: string(call(g, "gameID")), tick, landTiles: numeric(call(g, "numLandTiles")), inSpawnPhase, spawnHeat, gameOver: safe(() => { const value = call(g, "gameOver"); return value === undefined ? undefined : !!value; }),
    visible: safe(() => document.visibilityState === "visible" && document.hasFocus()) === true,
    window: safe(() => ({ x: screenX, y: screenY, width: outerWidth, height: outerHeight, hidden: document.visibilityState === "hidden" })),
    // Menu only: the footer line "v0.34.25 (Steam v0.2.1)" or a bare "v0.34.25" line. News items can mention
    // other versions, and reading innerText in-game would force a layout every poll.
    gameVersion: g ? undefined : safe(() => (document.body?.innerText?.match(/^\s*v(\d+\.\d+\.\d+)\s*(?:\(Steam[^)]*\))?\s*$/m) ?? [])[1]),
    game: safe(() => { const c = gameConfig; return c ? { map: string(c.gameMap), mapSize: string(c.gameMapSize), mode: string(c.gameMode), type: string(c.gameType), difficulty: string(c.difficulty),
      rankedType: string(c.rankedType), teams: string(c.playerTeams),
      cheats: !!(c.infiniteGold || c.infiniteTroops || c.instantBuild || c.hostCheats?.infiniteGold || c.hostCheats?.infiniteTroops) || undefined } : undefined; }),
    // Replays reuse the live HUD and .game (v0.35 seekable replay viewer); they get no live advice.
    replay: replay || undefined,
    me: me ? {
      clientId: string(call(me, "clientID")), profilePublicId: safe(() => { const p = call(me, "profile"); return string(p?.publicId ?? p?.publicID); }),
      name: string(call(me, "name")), displayName: displayName(me), clanTag: string(call(me, "clanTag")),
      team: string(ownTeam), teamColor: typeof ownTeamColor === "string" && /^#[0-9a-f]{6}$/i.test(ownTeamColor) ? ownTeamColor : undefined,
      troops: numeric(call(me, "troops")), gold: string(call(me, "gold")), tiles: numeric(call(me, "numTilesOwned")),
      goldEarned: string(call(me, "goldEarned")), tradeGold: string(call(me, "tradeGold")),
      trainGold: string(call(me, "trainGold")), piracyGold: string(call(me, "piracyGold")), readyMissiles: numeric(call(me, "readyMissileCount")),
      alive: call(me, "isAlive"), maxTroops: numeric(call(config, "maxTroops", me)),
      troopRatePerTick: numeric(call(config, "troopIncreaseRate", me)), attackRatio: numeric(safe(() => host.attackRatio)),
      incoming: array(call(me, "incomingAttacks")).map(a => ({ from: "Incoming attack", troops: numeric(call(a, "troops")) ?? numeric(safe(() => a.troops)) ?? 0 })),
      outgoingCount: safe(() => call(me, "outgoingAttacks")?.length),
      alliances: array(call(me, "alliances")).map((a, i) => ({ with: "Alliance " + (i + 1), renewRequested: safe(() => a.hasExtensionRequest === true) || undefined, expiresInTicks: safe(() => { const end = numeric(call(a, "expiresAt")) ?? numeric(a?.expiresAt); return end !== undefined && tick !== undefined ? Math.max(0, end - tick) : undefined; }) })),
      cityLevels: numeric(call(me, "totalUnitLevels", "City")), portLevels: numeric(call(me, "totalUnitLevels", "Port")),
      factoryLevels: numeric(call(me, "totalUnitLevels", "Factory")), defensePosts: numeric(call(me, "totalUnitLevels", "Defense Post")),
      samLaunchers: numeric(call(me, "totalUnitLevels", "SAM Launcher")), silos: numeric(call(me, "totalUnitLevels", "Missile Silo"))
    } : undefined, leaderboard
  };
})()`;

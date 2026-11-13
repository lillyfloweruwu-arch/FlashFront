import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MatchRecorder, mapToSnapshot } from "@flashfront/core";
import { ResultCard } from "./ResultCard";
import { StreamRoot } from "./StreamRoot";
import { PlayerCard } from "./PlayerCard";
it("shows own recorded rank, duration and tile peak without inventing ELO or player count", () => {
  const r = new MatchRecorder();
  r.consume({ inGame: true, visible: true }, null); const m = r.finish()!;
  m.durationSec = 454; m.summary.finalRank = 4; m.summary.peakTiles = 12345;
  const html = renderToStaticMarkup(<ResultCard match={m} />);
  expect(html).toContain("7:34"); expect(html).toContain("12,345 tiles"); expect(html).not.toContain("ELO"); expect(html).not.toContain(" / ");
});
it("keeps the expired result hidden while real profile/session data render, and says when no profile exists", () => {
  const snapshot = mapToSnapshot({ inGame: true, visible: true })!;
  const html = renderToStaticMarkup(<StreamRoot snapshot={snapshot} profile={{ publicId: "OWN12345", name: "Own player", clanTag: "FF", rankedElo: 1337, rankedTier: "ffa · #51", gamesPlayed: 5, wins: 2, eloHistory: [] }} session={{ wins: 2, losses: 1 }} preview search="?widgets=card,lobby,result" />);
  expect(html).toContain("Own player"); expect(html).toContain("1,337"); expect(html).toContain("ffa · #51");
  expect(html).not.toContain("Lobby"); expect(html).not.toContain("result-card"); expect(html).not.toContain("Results are not available");
});
it("leaves no empty cells for absent widgets and wears the HUD module header", () => {
  const menu = { gameId: "waiting", map: "World", mode: "FFA" as const, elapsedSec: 0, phase: "lobby" as const, self: null, players: [] };
  const profile = { publicId: "self", name: "Own player", gamesPlayed: 0, wins: 0, eloHistory: [] };
  const html = renderToStaticMarkup(<StreamRoot snapshot={menu} profile={profile} preview search="?widgets=card,stats,top,lobby,result" />);
  expect(html.match(/data-widget=/g)).toHaveLength(1);
  expect(html).toContain('data-widget="card"'); expect(html).toContain("module-header");
  expect(html).not.toContain("Spectating");
  const live = mapToSnapshot({ inGame: true, visible: true, me: { troops: 1000, maxTroops: 2000, tiles: 10 } })!;
  const playing = renderToStaticMarkup(<StreamRoot snapshot={live} preview search="?widgets=card,lobby" />);
  expect(playing).toContain("Profile unavailable"); expect(playing.match(/data-widget=/g)).toHaveLength(1);
});
it("collapses unavailable ELO to one line", () => {
  const html = renderToStaticMarkup(<PlayerCard profile={{ publicId: "self", name: "Own player", gamesPlayed: 0, wins: 0, eloHistory: [] }} wins={2} losses={1} />);
  expect(html).toContain("data-elo-unavailable"); expect(html).toContain("ELO unavailable");
  expect(html).not.toContain('class="elo"'); expect(html).not.toContain("Rank unavailable");
});

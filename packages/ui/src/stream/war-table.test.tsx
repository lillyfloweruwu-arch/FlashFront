import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MockDataSource } from "@flashfront/core";
import { TopLeaderboard } from "./TopLeaderboard";
import { LiveStatsStrip } from "./LiveStatsStrip";
it("keeps the top three and own row with its real position", () => {
  const snapshot = new MockDataSource().getSnapshot();
  snapshot.players = Array.from({ length: 8 }, (_, i) => ({ ...snapshot.players[0]!, id: `p${i}`, name: `Player ${i}`, isAlive: true, tilesOwnedPct: 30 - i }));
  snapshot.self = { ...snapshot.self!, id: "p6", rank: 7 };
  const html = renderToStaticMarkup(<TopLeaderboard snapshot={snapshot} />);
  expect(html.match(/<li /g)).toHaveLength(4);
  expect(html).toContain("Player 6"); expect(html).not.toContain("Player 3");
  expect(html).toContain('value="7"');
});
it("uses the branded live strip and never invents live accuracy or private values", () => {
  const snapshot = new MockDataSource().getSnapshot();
  const html = renderToStaticMarkup(<LiveStatsStrip snapshot={{ ...snapshot, self: { ...snapshot.self!, troops: null, gold: null } }} />);
  expect(html).toContain("ff-mark"); expect(html).toContain("wordmark"); expect(html).toContain("Place");
  expect(html.match(/Hidden/g)).toHaveLength(2); expect(html).not.toContain("Accuracy");
});

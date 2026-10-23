import { expect, it } from "vitest";
import { parseRoute } from "./router";
it("handles landing, detail, OBS query parameters and malformed IDs", () => {
  expect(parseRoute("")).toEqual({ path: "/", search: "", matchId: null });
  expect(parseRoute("#/hud").path).toBe("/hud");
  expect(parseRoute("#/stream/obs?widgets=card&scale=2").search).toBe("widgets=card&scale=2");
  expect(parseRoute("#/stats/match/a%20b").matchId).toBe("a b");
  expect(parseRoute("#/stats/match/%ZZ").matchId).toBe("");
});

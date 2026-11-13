import { expect, it } from "vitest";
import { parseRoute } from "./router";
it("handles landing and OBS query parameters", () => {
  expect(parseRoute("")).toEqual({ path: "/", search: "" });
  expect(parseRoute("#/hud").path).toBe("/hud");
  expect(parseRoute("#/stream/obs?widgets=card&scale=2").search).toBe("widgets=card&scale=2");
});

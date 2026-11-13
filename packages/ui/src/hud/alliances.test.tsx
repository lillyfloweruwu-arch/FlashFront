// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { MockDataSource } from "@flashfront/core";
import { AlliancePanel } from "./AlliancePanel";
it("alliances list who, not how long; renewal requests stay visible", () => {
  const snapshot = new MockDataSource().getSnapshot(); snapshot.tick = 1000; snapshot.ticksPerSecond = 10;
  snapshot.self!.alliances = [{ with: "ally:p7", name: "Ember", expiresAtTick: 1250 }, { with: "ally:p9", expiresAtTick: 3000, renewRequested: true }];
  snapshot.players = [{ id: "visible:Ember", name: "Ember", color: "#123456", isAlive: true, troops: 0, gold: 0, tilesOwnedPct: 12 }];
  const host = document.createElement("div"); host.innerHTML = renderToStaticMarkup(<AlliancePanel snapshot={snapshot} />);
  expect(host.textContent).toContain("Ember"); expect(host.textContent).toContain("Ally");
  expect(host.textContent).not.toMatch(/ally:p9|Alliance 1|0:25|3:20|Both sides must accept/);
  expect(host.querySelector('[role="meter"]')).toBeNull();
  expect(host.textContent?.match(/renewal asked/g)).toHaveLength(1);
  expect(host.querySelector<HTMLElement>(".swatch")?.style.background).toBe("rgb(18, 52, 86)");
  snapshot.self!.alliances = []; snapshot.elapsedSec = 130;
  host.innerHTML = renderToStaticMarkup(<AlliancePanel snapshot={snapshot} />);
  expect(host.textContent).toBe("No active alliance.");
  snapshot.elapsedSec = 100; host.innerHTML = renderToStaticMarkup(<AlliancePanel snapshot={snapshot} />);
  expect(host.textContent).toBe("Your next pact will appear here.");
});

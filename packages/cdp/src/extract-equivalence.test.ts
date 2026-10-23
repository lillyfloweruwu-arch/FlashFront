import { expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";
import { EXTRACT_EXPRESSION } from "./extract";
import { BEFORE_EXPRESSION } from "./fixtures/extract-before";

it.each(["visible", "hidden", "opacity", "offscreen", "clipped", "cell", "shadow", "menu"])("preserves extraction on the %s fixture with fewer DOM reads", kind => {
  const dom = new JSDOM("<body><control-panel></control-panel><leader-board></leader-board></body>", { runScripts: "outside-only", pretendToBeVisual: true });
  try {
    const doc = dom.window.document; const board = doc.querySelector("leader-board")!;
    const root = kind === "shadow" ? board.attachShadow({ mode: "open" }) : board;
    root.innerHTML = `<section><table><tbody>${Array.from({ length: 12 }, (_, i) => `<tr><td>${i + 1}</td><td>Player ${i}</td><td>4.2%</td><td>42.8K</td><td>14.6K</td></tr>`).join("")}</tbody></table></section>`;
    const rect = { x: 10, y: 10, top: 10, left: 10, bottom: 30, right: 200, width: 190, height: 20, toJSON() {} };
    const bounds = vi.fn(() => rect);
    const clientRects = vi.fn(() => [rect] as unknown as DOMRectList);
    for (const el of [board, ...root.querySelectorAll("*")]) { el.getBoundingClientRect = bounds; el.getClientRects = clientRects; }
    if (kind === "hidden") board.setAttribute("hidden", "");
    if (kind === "opacity") board.setAttribute("style", "opacity:0");
    if (kind === "offscreen") root.querySelector("tr")!.getBoundingClientRect = () => ({ ...rect, top: 5000, bottom: 5020 });
    if (kind === "clipped") { root.querySelector("section")!.setAttribute("style", "overflow:hidden"); root.querySelector("section")!.getBoundingClientRect = () => ({ ...rect, right: 100, width: 90 }); }
    if (kind === "cell") root.querySelector("td")!.setAttribute("aria-hidden", "true");
    if (kind !== "menu") Object.assign(doc.querySelector("control-panel")!, { game: { myPlayer: () => ({ name: () => "Player 0" }) } });
    const text = vi.fn(() => "v0.35.2"); Object.defineProperty(doc.body, "innerText", { get: text });
    const styles = vi.spyOn(dom.window, "getComputedStyle");
    const before = JSON.stringify(dom.window.eval(BEFORE_EXPRESSION));
    const oldStyles = styles.mock.calls.length, oldBounds = bounds.mock.calls.length, oldRects = clientRects.mock.calls.length;
    styles.mockClear(); bounds.mockClear(); clientRects.mockClear(); text.mockClear();
    expect(JSON.stringify(dom.window.eval(EXTRACT_EXPRESSION))).toBe(before);
    if (process.env.FLASHFRONT_BENCH) console.info(`${kind}: styles ${oldStyles} -> ${styles.mock.calls.length}, bounds ${oldBounds} -> ${bounds.mock.calls.length}, clientRects ${oldRects} -> ${clientRects.mock.calls.length}`);
    expect(styles.mock.calls.length).toBeLessThan(oldStyles);
    if (kind !== "menu") expect(text).not.toHaveBeenCalled();
    if (kind === "hidden" || kind === "opacity") expect(bounds).not.toHaveBeenCalled();
  } finally { dom.window.close(); vi.restoreAllMocks(); }
});

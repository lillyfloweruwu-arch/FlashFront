import type { ShapeRect } from "../../shared";

/** Observe geometry, not gameplay commits. Camera-only canvas transforms never schedule a scan. */
export function observePanelShape(host: HTMLElement, report: (rects: ShapeRect[]) => void): () => void {
  let frame = 0; let last = "";
  const measure = () => {
    frame = 0;
    const origin = host.getBoundingClientRect();
    const rects = [...host.querySelectorAll<HTMLElement>("[data-panel]:not([hidden]), [data-heat-legend]")].map(el => {
      const r = el.getBoundingClientRect(); return { x: r.x - origin.x, y: r.y - origin.y, width: r.width, height: r.height };
    });
    const key = JSON.stringify(rects); if (key !== last) { last = key; report(rects); }
  };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
  const resize = new ResizeObserver(schedule);
  const watch = () => {
    resize.disconnect(); resize.observe(host);
    host.querySelectorAll("[data-panel], [data-heat-legend]").forEach(el => resize.observe(el));
    schedule();
  };
  const mutations = new MutationObserver(changes => {
    if (changes.some(change => change.type === "childList"
      ? [...change.addedNodes, ...change.removedNodes].some(node => node instanceof Element && (node.matches("[data-panel], [data-heat-legend]") || node.querySelector("[data-panel], [data-heat-legend]")))
      : (change.target as Element).matches("[data-panel], .hud-viewport"))) watch();
  });
  mutations.observe(host, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden", "style"] });
  watch();
  return () => { resize.disconnect(); mutations.disconnect(); cancelAnimationFrame(frame); };
}

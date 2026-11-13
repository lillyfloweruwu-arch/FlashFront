/** Upstream's anonymous resize listener retains every old renderer after a restart. */
const cleanups = new Set<() => void>();
const frames = new Set<number>();
const timers = new Set<ReturnType<typeof setTimeout>>();
export function requestRendererTimeout(callback: () => void, delay: number): ReturnType<typeof setTimeout> {
  const id = setTimeout(() => { timers.delete(id); callback(); }, delay);
  timers.add(id);
  return id;
}
export function registerRendererCleanup(cleanup: () => void): void { cleanups.add(cleanup); }
export function requestRendererFrame(callback: FrameRequestCallback): number {
  const id = requestAnimationFrame(time => { frames.delete(id); callback(time); });
  frames.add(id);
  return id;
}
export function installRendererResize(transform: { updateCanvasBoundingRect(): void }): void {
  const listener = () => transform.updateCanvasBoundingRect();
  window.addEventListener("resize", listener);
  cleanups.add(() => window.removeEventListener("resize", listener));
}
export function disposeRendererListeners(): void {
  for (const id of timers) clearTimeout(id);
  timers.clear();
  for (const id of frames) cancelAnimationFrame(id);
  frames.clear();
  for (const cleanup of cleanups) cleanup();
  cleanups.clear();
}

import React, { useEffect, useState } from "react";
import type { RewindFrame } from "../RewindBuffer";

export function ScrubBar({ durationMs = 1500 }: { durationMs?: number }) {
  const [remaining, setRemaining] = useState(100);
  useEffect(() => {
    const start = performance.now();
    let frame = 0;
    setRemaining(100);
    const update = (now: number) => {
      const value = Math.max(0, 100 * (1 - (now - start) / Math.max(1, durationMs)));
      setRemaining(value);
      if (value > 0) frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [durationMs]);
  return <div className="ff-glass" style={{ padding: "14px 20px", borderRadius: "var(--radius-lg)", minWidth: 260 }}>
    <div style={{ marginBottom: 8 }}>Rewinding to the decision</div>
    <div role="progressbar" aria-label="Rewinding" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(remaining)}
      style={{ height: 4, background: "var(--glass-edge)", borderRadius: "var(--radius-sm)", overflow: "hidden" }}>
      <div style={{ width: `${remaining}%`, height: "100%", background: "var(--text-muted, currentColor)" }} />
    </div>
  </div>;
}

/** Presents borrowed bitmaps; the buffer owns and closes them after playback finishes. */
export function playRewind(canvas: HTMLCanvasElement, frames: readonly RewindFrame[], ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.resolve();
  return new Promise(resolve => {
    const context = frames.length ? canvas.getContext("2d") : null;
    const start = performance.now();
    let animation = 0;
    let done = false;
    let previousIndex = -1;
    canvas.hidden = !frames.length;
    const finish = () => {
      if (done) return;
      done = true;
      cancelAnimationFrame(animation);
      signal?.removeEventListener("abort", finish);
      context?.clearRect(0, 0, canvas.width, canvas.height);
      canvas.hidden = true;
      resolve();
    };
    const draw = (now: number) => {
      if (done) return;
      const progress = Math.min(1, Math.max(0, (now - start) / Math.max(1, ms)));
      const index = Math.max(0, frames.length - 1 - Math.floor(progress * frames.length));
      if (context && frames[index] && index !== previousIndex) {
        context.drawImage(frames[index].bitmap, 0, 0, canvas.width, canvas.height);
        previousIndex = index;
      }
      if (progress >= 1) finish();
      else animation = requestAnimationFrame(draw);
    };
    signal?.addEventListener("abort", finish, { once: true });
    draw(start);
  });
}

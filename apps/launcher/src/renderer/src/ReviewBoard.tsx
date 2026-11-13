import { useEffect, useRef, useState } from "react";
import type { LauncherApi } from "../../shared";
import type { ReviewBoardStatus } from "../../review-types";
import { FAILURE_TEXT } from "./training/TrainingHost";
export type ReviewBoardApi = Pick<LauncherApi, "openReviewBoard" | "seekReviewBoard" | "resizeReviewBoard" | "closeReviewBoard" | "onReviewBoardStatus">;
/** A measured hole in the React layout; Electron owns the isolated map above this rectangle. */
export function ReviewBoard({ api, file, tick, inMatch }: { api: ReviewBoardApi; file: string; tick?: number; inMatch: boolean }) {
  const element = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<ReviewBoardStatus>({ status: "loading" });
  const desiredTick = useRef(tick); desiredTick.current = tick;
  const opened = useRef(false);
  useEffect(() => {
    if (inMatch) { setStatus({ status: "unavailable", reason: "inMatch" }); return; }
    let active = true;
    const bounds = () => {
      const r = element.current!.getBoundingClientRect();
      return { x: r.x, y: r.y, width: document.hidden ? 0 : r.width, height: r.height };
    };
    const resize = () => { if (opened.current) void api.resizeReviewBoard(bounds()).catch(() => {}); };
    const off = api.onReviewBoardStatus(value => { if (active) setStatus(value); });
    setStatus({ status: "loading" });
    void api.openReviewBoard(file, bounds()).then(async () => {
      if (!active) return;
      opened.current = true;
      resize();
      if (desiredTick.current !== undefined) await api.seekReviewBoard(desiredTick.current);
    }).catch(() => { if (active) setStatus({ status: "unavailable", reason: "bootFailed" }); });
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(resize);
    observer?.observe(element.current!);
    window.addEventListener("resize", resize);
    window.addEventListener("scroll", resize, true);
    document.addEventListener("visibilitychange", resize);
    return () => {
      active = false; opened.current = false; off(); observer?.disconnect();
      window.removeEventListener("resize", resize); window.removeEventListener("scroll", resize, true); document.removeEventListener("visibilitychange", resize);
      void api.closeReviewBoard().catch(() => {});
    };
  }, [api, file, inMatch]);
  useEffect(() => { if (!inMatch && opened.current && tick !== undefined) void api.seekReviewBoard(tick).catch(() => setStatus({ status: "unavailable", reason: "bootFailed" })); }, [api, tick, inMatch]);
  return <div ref={element} className="review-native-map" aria-label="Recorded OpenFront board" aria-busy={status.status === "loading"}>
    {status.status === "loading" && <p role="status">Rebuilding the recorded board…</p>}
    {status.status === "unavailable" && <p role="status">{FAILURE_TEXT[status.reason]}</p>}
  </div>;
}

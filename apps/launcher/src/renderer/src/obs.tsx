import { useEffect, useLayoutEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { GameSnapshot } from "@flashfront/core";
import { applyTheme, resolveTheme, StreamRoot } from "@flashfront/ui";
import type { ObsFrame } from "../../main/obs";
import "@flashfront/ui/theme.css";
import "./style.css";
import "@flashfront/ui/fonts.css";
document.body.classList.add("overlay");
const empty: GameSnapshot = { gameId: "waiting", map: "Unknown", mode: "FFA", tick: 0, ticksPerSecond: 10, elapsedSec: 0, winTargetPct: 80, self: null, players: [], events: [], phase: "lobby" };
function Obs() {
  const [frame, setFrame] = useState<ObsFrame>({ snapshot: null });
  const theme = resolveTheme(new URLSearchParams(location.search).get("theme"), frame.theme);
  useLayoutEffect(() => { applyTheme(document.documentElement, theme); }, [theme]);
  useEffect(() => {
    let stopped = false; let retry: ReturnType<typeof setTimeout>; let socket: WebSocket;
    const connect = () => {
      socket = new WebSocket(`ws://${location.host}/ws`);
      socket.onmessage = event => { try { setFrame(JSON.parse(String(event.data)) as ObsFrame); } catch { /* Keep last valid frame. */ } };
      socket.onerror = () => socket.close();
      socket.onclose = () => { setFrame(previous => ({ snapshot: null, theme: previous.theme })); if (!stopped) retry = setTimeout(connect, 1000); };
    };
    connect(); return () => { stopped = true; clearTimeout(retry); socket.close(); };
  }, []);
  return <StreamRoot snapshot={frame.snapshot ?? empty} profile={frame.profile ?? { publicId: "self", name: frame.me?.displayName ?? frame.me?.name ?? "Waiting for OpenFront", clanTag: frame.me?.clanTag, gamesPlayed: 0, wins: 0, eloHistory: [] }} result={frame.result} session={frame.session} search={location.search} lobbyPlaceholder />;
}
createRoot(document.getElementById("root")!).render(<Obs />);

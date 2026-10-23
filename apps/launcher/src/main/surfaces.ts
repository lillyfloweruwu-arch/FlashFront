import type { LauncherState } from "../shared";

/** Keep ephemeral crowding off the launcher and duplicate raw HUD numbers off both renderers. */
export function surfaceState(state: LauncherState, surface: "launcher" | "overlay"): LauncherState {
  const raw = state.raw;
  const snapshot = state.snapshot;
  const { spawnHeat: _heat, ...ordinary } = snapshot ?? {};
  return { ...state,
    raw: raw ? { inGame: raw.inGame, visible: raw.visible, replay: raw.replay, game: raw.game,
      me: raw.me ? { team: raw.me.team, teamColor: raw.me.teamColor } : undefined } : null,
    snapshot: snapshot ? surface === "overlay" ? snapshot : ordinary as typeof snapshot : null,
    ...(surface === "overlay" ? { errors: [], update: undefined, feedbackAvailable: false, launching: false, setupNeeded: false } : { overlayViewport: undefined, spawnHeatHeld: undefined, snoozeSignal: undefined }),
  };
}

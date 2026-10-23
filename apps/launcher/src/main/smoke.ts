import type { BrowserWindow } from "electron";
import type { LauncherState } from "../shared";
/** Opt-in test of our own windows. Game discovery and Steam launch are disabled in this mode. */
export async function smokeCheck(launcher: BrowserWindow, overlay: BrowserWindow, state: () => LauncherState) {
  const deadline = Date.now() + 10_000;
  while (state().status !== "port-closed" && Date.now() < deadline) await new Promise(r => setTimeout(r, 50));
  if (state().status !== "port-closed") throw new Error("Smoke: expected port-closed");
  const result = await launcher.webContents.executeJavaScript(`(() => {
    const guide = document.querySelector("details");
    if (guide) guide.open = true;
    return { title: document.title, bridge: typeof window.flashfront?.getState, guide: guide?.open, text: document.body.innerText };
  })()`) as { title: string; bridge: string; guide: boolean; text: string };
  if (result.bridge !== "function" || !result.guide || !result.text.includes("Launch Options")) throw new Error("Smoke: renderer/guide failed");
  const stats = await launcher.webContents.executeJavaScript(`(async () => {
    const click = name => [...document.querySelectorAll("nav button")].find(b => b.textContent === name)?.click();
    const waitFor = async text => { for (let n = 0; n < 100; n++) { if (document.body.innerText.includes(text)) return true; await new Promise(r => setTimeout(r, 20)); } return false; };
    const list = await window.flashfront.listMatches();
    click("Matches"); const matches = await waitFor("Your numbers, saved only on this PC");
    click("Profile"); const profile = await waitFor("openfront.io/player/<id>");
    const api = await window.flashfront.stats("/api/player/short");
    click("Play"); const play = await waitFor("Launch OpenFront");
    return { list: Array.isArray(list), matches, profile, play, api: api.status };
  })()`) as { list: boolean; matches: boolean; profile: boolean; play: boolean; api: number };
  if (!stats.list || !stats.matches || !stats.profile || !stats.play || stats.api !== 400) throw new Error(`Smoke: stats tabs/bridge failed: ${JSON.stringify(stats)}`);
  if (overlay.isVisible()) throw new Error("Smoke: menu overlay must be hidden");
  const obs = await fetch("http://127.0.0.1:47474/obs?widgets=stats,lobby,result");
  if (!obs.ok || !(await obs.text()).includes("FlashFront OBS")) throw new Error("Smoke: OBS endpoint failed");
  console.info("SMOKE PASS: Play/Matches/Profile loaded; match and stats preload bridges active; port-closed; setup guide reachable; overlay hidden; OBS HTTP 200; no game access.");
}

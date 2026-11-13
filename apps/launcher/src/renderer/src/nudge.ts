import { THEMES } from "@flashfront/ui/themes";
import type { LauncherApi } from "../../shared";
import { renderNudge } from "./nudge-view";
import "@flashfront/ui/fonts.css";
import "./nudge.css";

declare global { interface Window { flashfront: LauncherApi; } }
// Its own surface: never the overlay's ff-static class (cross-plan ruling with sub-plan G).
document.documentElement.classList.add("nudge-surface");
const root = document.getElementById("nudge")!;
window.flashfront.onNudge?.(view => {
  if (view) {
    for (const [key, value] of Object.entries(THEMES[view.theme].tokens)) document.documentElement.style.setProperty(key, value);
    document.documentElement.classList.toggle("ff-lite", view.lite === true);
  }
  renderNudge(root, view);
});

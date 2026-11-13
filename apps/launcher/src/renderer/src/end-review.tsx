import { createRoot } from "react-dom/client";
import { THEMES } from "@flashfront/ui/themes";
import type { LauncherApi } from "../../shared";
import { EndReviewCard } from "./EndReviewCard";
import "@flashfront/ui/fonts.css";
import "./end-review.css";

declare global { interface Window { flashfront: LauncherApi; } }
// Its own surface, like the nudge tag: the window is exactly the card, so clicks outside it reach the game.
document.documentElement.classList.add("end-review-surface");
const host = document.getElementById("end-review")!;
const root = createRoot(host);
const api = window.flashfront;
new ResizeObserver(() => api.reportEndReviewHeight?.(host.getBoundingClientRect().height)).observe(host);
api.onEndReview?.(view => {
  if (view) {
    for (const [key, value] of Object.entries(THEMES[view.theme].tokens)) document.documentElement.style.setProperty(key, value);
    document.documentElement.classList.toggle("ff-lite", view.lite);
  }
  root.render(view ? <EndReviewCard model={view} onFull={() => void api.endReviewAction?.("full")} onRetry={() => void api.endReviewAction?.("retry")} /> : null);
});

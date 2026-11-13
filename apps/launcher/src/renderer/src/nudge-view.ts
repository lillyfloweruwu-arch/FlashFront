import type { NudgeView } from "../../shared";

const previous = new WeakMap<HTMLElement, NudgeView>();

/** Draws the cursor tag. Each new view restarts the appear animation; `null` fades the last one out. */
export function renderNudge(root: HTMLElement, view: NudgeView | null): void {
  if (!view) {
    root.classList.add("leaving");
    previous.delete(root);
    return;
  }

  const prev = previous.get(root);
  const isNewAppearance = !prev || prev.id !== view.id || prev.text !== view.text || prev.urgent !== view.urgent;

  if (isNewAppearance) {
    root.className = "";
    void root.offsetWidth;
  }

  if (isNewAppearance) {
    const role = /^(Head|Attack|Defense|Economy) coach:/.exec(view.text)?.[0];
    root.replaceChildren();
    if (role) { const tag = document.createElement("span"); tag.className = "nudge-role"; tag.textContent = role; root.append(tag, " "); }
    const message = document.createElement("span"); message.className = "nudge-message"; message.textContent = role ? view.text.slice(role.length).trimStart() : view.text; root.append(message);
    const countdown = document.createElement("span"); countdown.className = "nudge-countdown"; countdown.setAttribute("aria-hidden", "true"); root.append(countdown);
  }
  root.className = ["nudge", view.urgent ? "urgent" : "", `anchor-${view.anchor}`].filter(Boolean).join(" ");
  previous.set(root, view);
}

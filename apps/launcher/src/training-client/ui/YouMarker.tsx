import { useEffect, useState } from "react";
import type { ClientBridge } from "../bridge";
export function YouMarker({ bridge }: { bridge: ClientBridge }) {
  const [hidden, setHidden] = useState(false);
  const [position, setPosition] = useState<{ x: number; y: number }>();
  useEffect(() => {
    const update = () => {
      const name = bridge.game()?.myPlayer()?.nameLocation();
      setPosition(name ? bridge.worldToScreen(name.x, name.y) : undefined);
    };
    update(); const timer = setInterval(update, 50);
    const fade = setTimeout(() => setHidden(true), 5000);
    const key = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "h" || event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
      if (event.target instanceof HTMLElement && (event.target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName))) return;
      setHidden(value => !value);
    };
    window.addEventListener("keydown", key);
    return () => { clearInterval(timer); clearTimeout(fade); window.removeEventListener("keydown", key); };
  }, [bridge]);
  return position ? <div className="ff-you-marker" style={{ left: position.x, top: position.y }} data-hidden={hidden ? "" : undefined} aria-hidden={hidden}>YOU</div> : null;
}

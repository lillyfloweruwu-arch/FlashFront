import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Button, Icon } from "@flashfront/ui";
import type { WhatsNewEntry } from "./whats-new";

/**
 * Layer 2 of the release notes: up to three highlights after an update, then Full notes (the GitHub
 * release) and Got it. A modal in the launcher, never over the game.
 */
export function WhatsNew({ version, entry, onFullNotes, onDismiss, busy = false }:
  { version: string; entry: WhatsNewEntry; onFullNotes: () => void; onDismiss: () => void; busy?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    const modal = dialog.current!;
    modal.showModal();
    (modal.querySelector<HTMLButtonElement>(".ff-button-primary:not(:disabled)") ?? modal.querySelector<HTMLButtonElement>("button:not(:disabled)"))?.focus();
    return () => {
      modal.close();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);
  return createPortal(<dialog ref={dialog} className="whats-new ff-glass" aria-labelledby="whats-new-title" aria-describedby="whats-new-version" onCancel={event => {
    event.preventDefault();
    if (!busy) onDismiss();
  }}>
    <div className="whats-new-head">
      <p id="whats-new-version">What's new in {version}</p>
      <h2 id="whats-new-title" className="ff-page-title">{entry.headline}</h2>
    </div>
    <ul className="whats-new-list">{entry.highlights.slice(0, 3).map(h => <li key={h.title}>
      <Icon name="check" /><div><strong>{h.title}</strong><span>{h.text}</span></div>
    </li>)}</ul>
    <div className="whats-new-actions">
      <Button icon="external" onClick={onFullNotes}>Release notes</Button>
      <Button variant="primary" disabled={busy} onClick={onDismiss}>Got it</Button>
    </div>
  </dialog>, document.body);
}

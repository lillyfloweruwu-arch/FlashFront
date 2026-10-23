import { Button, Icon } from "@flashfront/ui";
import type { WhatsNewEntry } from "./whats-new";

/**
 * Layer 2 of the release notes: up to three highlights after an update, then Full notes (the GitHub
 * release) and Got it. A plate in the launcher's content column, never a modal and never over the game.
 */
export function WhatsNew({ version, entry, onFullNotes, onDismiss, busy = false }:
  { version: string; entry: WhatsNewEntry; onFullNotes: () => void; onDismiss: () => void; busy?: boolean }) {
  return <section className="whats-new" aria-labelledby="whats-new-title">
    <div className="whats-new-head">
      <h2 id="whats-new-title">What's new in {version}</h2>
      <p className="whats-new-headline">{entry.headline}</p>
    </div>
    <ul className="whats-new-list">{entry.highlights.slice(0, 3).map(h => <li key={h.title}>
      <Icon name="check" /><div><strong>{h.title}</strong><span>{h.text}</span></div>
    </li>)}</ul>
    <div className="whats-new-actions">
      <Button variant="primary" disabled={busy} onClick={onDismiss}>Got it</Button>
      <Button icon="external" onClick={onFullNotes}>Full notes</Button>
    </div>
  </section>;
}

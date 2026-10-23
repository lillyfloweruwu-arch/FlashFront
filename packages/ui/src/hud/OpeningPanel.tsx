import { Icon } from "../icons";
import { formatDuration, formatGold, openingItems, openingVisible, survivalMode, type GameSnapshot } from "@flashfront/core";

export function OpeningPanel({ snapshot, evidence = true }: { snapshot: GameSnapshot; evidence?: boolean }) {
  if (!openingVisible(snapshot)) return null;
  const items = openingItems(snapshot);
  const shown = survivalMode(snapshot) ? items.filter(item => !item.done).slice(0, 1) : items;
  return <div className="stack opening-checklist">
    <ul>{shown.map(item => <li key={item.label}>
      <span className={item.done ? "gain" : ""}><span aria-label={item.done ? "Done" : "Not yet"}><Icon name={item.done ? "check" : "pending"} /></span> {item.label}</span>
      {!item.done && <small className="muted">{item.cost === undefined ? "Cost unavailable" : `${formatGold(item.cost)} gold`} · {item.seconds === undefined ? "ETA unavailable" : item.seconds === 0 ? "Affordable now" : `~${formatDuration(Math.ceil(item.seconds))} to afford`}{item.label === "Ally a neighbour" ? " · agreement needed" : ""}</small>}
    </li>)}</ul>
    {evidence && !survivalMode(snapshot) && <p className="muted opening-evidence" title="45 public FFA games, Oct 2026">Ports and allies were common among players who survived past 5:00. Correlation, not a guarantee. <span aria-label="Evidence: 45 public FFA games, Oct 2026"><Icon name="info" /></span></p>}
  </div>;
}

import { useMemo } from "react";
import { Icon } from "@flashfront/ui";
import { formatDuration, formatGold, matchTrend, personalBests, PRACTICE_GOALS, type PracticeGoal, type TrendMatch } from "@flashfront/core";
import "./pages.css";

type Trend = ReturnType<typeof matchTrend>;
/** The one trend that leads Matches: the practice goal once it has evaluated matches, otherwise survival. */
export function heroTrend({ current, previous }: Trend, goal?: PracticeGoal) {
  if (goal && current.goal.count) return {
    value: `${current.goal.hits}/${current.goal.count}`, label: `Practice goal hit · ${PRACTICE_GOALS[goal]}`,
    comparison: previous.goal.count ? `previously ${previous.goal.hits}/${previous.goal.count}` : "No earlier evaluated goals",
  };
  return {
    value: `${current.survived}/${current.count}`, label: "Survived past 5:00",
    comparison: previous.count ? `previously ${previous.survived}/${previous.count}` : "No earlier matches to compare",
  };
}

export function TrendStrip({ matches, goal, recordings = [], mode = "", map = "" }: { matches: TrendMatch[]; goal?: PracticeGoal; recordings?: Parameters<typeof personalBests>[0]; mode?: string; map?: string }) {
  const trend = useMemo(() => matchTrend(matches, goal, { mode, map }), [matches, goal, mode, map]);
  const bests = useMemo(() => personalBests(recordings), [recordings]);
  const { current, previous } = trend;
  const hero = heroTrend(trend, goal);
  const heroIsGoal = !!goal && current.goal.count > 0;
  const perMinute = (n: number) => `${Math.floor(n * 10) / 10} s/min`;
  const median = (label: string, key: "idleGold" | "over70" | "attackTempo" | "coverage", format: (n: number) => string) => {
    const now = current[key], before = previous[key];
    return <div key={key}><span className="field-label">{label}</span><strong>{now.value === undefined ? "No observations" : format(now.value)}</strong>
      <small>{before.value === undefined ? `${now.count} samples` : `previously ${format(before.value)} · ${now.count} samples`}</small></div>;
  };
  return <section className="trend-strip-v2" aria-label="Your trend">
    <div className="trend-hero" data-trend-hero>
      <span className="trend-hero-value">{hero.value}</span>
      <div className="trend-hero-text"><strong>{hero.label}</strong><span>{hero.comparison} · last {current.count} public or ranked recordings</span></div>
    </div>
    <details className="disclosure trend-details"><summary><Icon name="chevron" className="disclosure-chevron" />More trends and personal bests</summary>
      <div className="trend-compact">
        {heroIsGoal
          ? <div><span className="field-label">Survived past 5:00</span><strong>{current.survived}/{current.count}</strong><small>{previous.count ? `previously ${previous.survived}/${previous.count}` : "No earlier matches"}</small></div>
          : <div><span className="field-label">Practice goal</span><strong>{goal ? "No evaluated matches" : "None selected"}</strong><small>{goal ? PRACTICE_GOALS[goal] : "Chosen in match review"}</small></div>}
        {median("Median idle gold", "idleGold", perMinute)}{median("Median time over 70%", "over70", perMinute)}
        {median("Median attack tempo", "attackTempo", n => `${n.toFixed(1)}x`)}{median("Median coverage", "coverage", n => `${Math.floor(n * 100)}%`)}
      </div>
      <h3>Personal bests by mode</h3>
      <div className="table-scroll"><table className="match-table"><thead><tr><th>Mode</th><th>Best rank</th><th>Peak land</th><th>Longest survival</th><th>Most trade gold</th></tr></thead>
        <tbody>{Object.entries(bests).map(([name, best]) => <tr key={name}><td>{name}</td><td>{best.bestRank ? `#${best.bestRank}` : "—"}</td><td>{best.maxLandPct === undefined ? "—" : `${Math.floor(best.maxLandPct * 10) / 10}%`}</td><td>{best.longestSec === undefined ? "—" : formatDuration(best.longestSec)}</td><td>{best.maxTradeGold === undefined ? "—" : formatGold(best.maxTradeGold)}</td></tr>)}</tbody></table></div>
      <p className="page-foot">Time metrics are seconds per minute recorded. Missing land percentages or trade totals stay unavailable.</p>
    </details>
  </section>;
}

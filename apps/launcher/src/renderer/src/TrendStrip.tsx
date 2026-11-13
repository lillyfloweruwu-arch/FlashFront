import { useMemo } from "react";
import { Icon, Sparkline } from "@flashfront/ui";
import { formatDuration, formatGold, matchTrend, personalBests, PRACTICE_GOALS, type PracticeGoal, type TrendMatch } from "@flashfront/core";
import "./pages.css";

import type { ArchiveRow } from "../../match-archive";

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

export function TrendStrip({ matches, goal, recordings = [], mode = "", map = "", archiveRows }: { archiveRows?: ArchiveRow[]; matches: TrendMatch[]; goal?: PracticeGoal; recordings?: Parameters<typeof personalBests>[0]; mode?: string; map?: string }) {
  const trend = useMemo(() => matchTrend(matches, goal, { mode, map }), [matches, goal, mode, map]);
  const bests = useMemo(() => personalBests(recordings), [recordings]);
  const { current, previous } = trend;
  const hero = heroTrend(trend, goal);
  const heroIsGoal = !!goal && current.goal.count > 0;
  const perMinute = (n: number) => `${Math.floor(n * 10) / 10} sec per min`;
  const median = (label: string, key: "idleGold" | "over70" | "attackTempo", format: (n: number) => string) => {
    const now = current[key], before = previous[key];
    return <div key={key}><span className="field-label">{label}</span><strong>{now.value === undefined ? "No observations" : format(now.value)}</strong>
      <small>{before.value === undefined ? "No earlier matches" : `previously ${format(before.value)}`}</small></div>;
  };
  if (archiveRows) {
    const recent = archiveRows.slice(0, 10);
    const scored = recent.flatMap((row, i) => row.review?.status === "ready" && row.review.review.accuracy.value !== undefined ? [{ t: recent.length - i, value: row.review.review.accuracy.value }] : []).reverse();
    const delta = scored.length >= 2 ? scored[scored.length - 1]!.value - scored[0]!.value : undefined;
    const wins = recent.filter(row => row.outcome === "Win").length;
    const losses = recent.filter(row => row.outcome === "Eliminated").length;
    const ranked = recent.filter(row => row.rank !== undefined).sort((a, b) => a.rank! - b.rank!);
    const costly = recent.flatMap(row => row.review?.status === "ready" ? row.review.review.keyMoments.filter(m => m.mistake) : []).sort((a, b) => b.landLostPct - a.landLostPct)[0];
    const mistakeNames = { sendSize: "Send size", postsBeforePush: "Posts before a push", allyDecision: "Ally decisions" };
    return <section aria-label="Your trend"><span className="field-label">Last 10 games</span>
      {recent.length < 2 ? <p>Play a few matches to see your trend.</p> : <>
        <h3 className="archive-trend-headline">{delta === undefined ? "Accuracy unavailable" : delta === 0 ? "Accuracy holding steady" : `Accuracy ${delta > 0 ? "up" : "down"} ${Math.abs(delta)} points`}</h3>
        {scored.length >= 2 && <div className="archive-trend-spark"><Sparkline values={scored} label="Recent accuracy, oldest to newest" /></div>}
        <dl className="archive-trend-facts"><dt>Record</dt><dd>{wins} wins · {losses} losses{recent.length > wins + losses ? ` · ${recent.length - wins - losses} incomplete` : ""}</dd>
          <dt>Best map</dt><dd title="Best recorded placement">{ranked[0]?.map ?? "Unavailable"}</dd>
          <dt>Costliest mistake</dt><dd>{costly?.mistake ? mistakeNames[costly.mistake] : "Unavailable"}</dd></dl>
      </>}
      <details className="disclosure archive-more-trends"><summary>More trends and personal bests</summary><TrendStrip matches={matches} goal={goal} recordings={recordings} mode={mode} map={map} /></details>
    </section>;
  }
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
        {median("Median attack tempo", "attackTempo", n => `${n.toFixed(1)}x`)}
      </div>
      <h3>Personal bests by mode</h3>
      <PersonalBestsTable bests={bests} />
      <p className="page-foot">Time metrics are seconds per minute recorded. Missing land percentages or trade totals stay unavailable.</p>
    </details>
  </section>;
}

/** Own recordings only: never derived from public results. */
export function PersonalBestsTable({ bests }: { bests: ReturnType<typeof personalBests> }) {
  return <div className="table-scroll"><table className="match-table"><thead><tr><th>Mode</th><th>Best rank</th><th>Peak land</th><th>Longest survival</th><th>Most trade gold</th></tr></thead>
        <tbody>{Object.entries(bests).map(([name, best]) => <tr key={name}><td>{name}</td><td>{best.bestRank ? `#${best.bestRank}` : "—"}</td><td>{best.maxLandPct === undefined ? "—" : `${Math.floor(best.maxLandPct * 10) / 10}%`}</td><td>{best.longestSec === undefined ? "—" : formatDuration(best.longestSec)}</td><td>{best.maxTradeGold === undefined ? "—" : formatGold(best.maxTradeGold)}</td></tr>)}</tbody></table></div>;
}

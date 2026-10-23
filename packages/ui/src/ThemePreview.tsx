import { Module } from "./hud/Module";
import { useState, type CSSProperties } from "react";
import { mapToSnapshot, type ThemeId } from "@flashfront/core";
import { THEMES } from "./themes";
import { GrowthGauge } from "./hud/GrowthGauge";
import { AttackPreview } from "./hud/AttackPreview";

const sample = mapToSnapshot({ inGame: true, visible: true, tick: 1000, me: { troops: 500_000, maxTroops: 1_000_000, attackRatio: 0.3 } })!.self!;
export function ThemePreview({ theme }: { theme: ThemeId }) {
  const [ratio, setRatio] = useState(30);
  const self = { ...sample, attackRatio: ratio / 100 };
  return <div className="theme-preview" data-ff-theme={theme} style={THEMES[theme].tokens as CSSProperties}>
    <Module title="Troop growth" icon="growth"><GrowthGauge self={self} phase="playing" /></Module>
    <Module title="Attack preview" icon="attack"><AttackPreview self={self} phase="playing" /></Module>
    <label className="theme-preview-slider">Sample send: {ratio}%<input aria-label={`${THEMES[theme].name} sample send`} type="range" min="10" max="90" step="10" value={ratio} onChange={e => setRatio(Number(e.target.value))} /></label>
  </div>;
}

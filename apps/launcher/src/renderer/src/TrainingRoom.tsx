import { useEffect, useRef, useState } from "react";
import { buildCost, formatGold, formatTroops, GOLD_PER_TICK, maxTroops, MockDataSource, TICKS_PER_SECOND, troopGrowthPerSec, troopGrowthPerTick, type GameSnapshot } from "@flashfront/core";
import { AttackPreview, BuildPlanner, Button, GrowthGauge, Module, Segmented } from "@flashfront/ui";
import "./pages.css";

type LessonId = "sends" | "recover" | "gold";
export const LESSONS = [
  { id: "sends", title: "Compare sends", description: "The same reserve, two send sizes, and what each leaves behind.", choices: [{ id: "small", label: "20% send" }, { id: "large", label: "60% send" }], question: "Which send leaves more troops at home?", answers: [{ id: "small", label: "20% send" }, { id: "large", label: "60% send" }], correct: "small", feedback: "A 20% send leaves 80% of the current troops; a 60% send leaves 40%. Land gained is not predicted here." },
  { id: "recover", title: "Recover to the sweet spot", description: "Reserves start below the sweet spot after a push. Compare holding with another send.", choices: [{ id: "hold", label: "Reserves held" }, { id: "send", label: "Another 30% send" }], question: "Which choice reaches the sweet spot sooner in this example?", answers: [{ id: "hold", label: "Holding reserves" }, { id: "send", label: "Another send" }], correct: "hold", feedback: "Holding starts recovery from a larger reserve. Another send reduces that reserve and adds recovery time. Incoming attacks could change the situation." },
  { id: "gold", title: "Hold or spend gold", description: "A city is affordable. Compare keeping the gold with raising troop capacity.", choices: [{ id: "spend", label: "City bought" }, { id: "hold", label: "Gold held" }], question: "What changed immediately after the city purchase?", answers: [{ id: "capacity", label: "More capacity, less gold" }, { id: "troops", label: "More troops immediately" }], correct: "capacity", feedback: "The city raises troop capacity by 25.0K. It spends gold; new troops still take time to grow. Holding keeps that gold available for another choice." },
] as const;
interface TrainingState { snapshot: GameSnapshot; elapsedSec: number; done: boolean; choice?: string; }
/** An isolated mock scenario using the same tick formulas as MockDataSource; never linked to CDP. */
export class TrainingSession {
  readonly state: TrainingState;
  private ticks = 0;
  private pending = 0;
  constructor(readonly lesson: LessonId) {
    const snapshot = new MockDataSource({ seed: 42 }).getSnapshot();
    snapshot.gameId = `training-${lesson}`; snapshot.phase = "playing"; snapshot.events = []; snapshot.practiceGoal = undefined;
    const self = snapshot.self!;
    self.tilesOwned = 200; self.maxTroops = maxTroops(self.tilesOwned, 0);
    self.troops = self.maxTroops * (lesson === "recover" ? 0.3 : 0.65);
    self.gold = 160_000; self.attackRatio = 0.2;
    self.troopGrowthPerSec = troopGrowthPerSec(self.troops, self.maxTroops);
    this.state = { snapshot, elapsedSec: 0, done: false };
  }
  choose(choice: string): void {
    const lesson = LESSONS.find(l => l.id === this.lesson)!;
    if (this.state.done || this.state.choice || !lesson.choices.some(c => c.id === choice)) return;
    this.state.choice = choice;
    const self = this.state.snapshot.self!;
    if (this.lesson === "sends" || (this.lesson === "recover" && choice === "send")) {
      self.attackRatio = this.lesson === "recover" ? 0.3 : choice === "small" ? 0.2 : 0.6;
      self.troops -= Math.floor(self.troops * self.attackRatio);
    }
    if (this.lesson === "gold" && choice === "spend") {
      const city = self.buildings.find(b => b.type === "City")!;
      self.gold -= city.nextCost; city.count++; self.cityLevels++;
      city.nextCost = buildCost("City", self.cityLevels); self.maxTroops = maxTroops(self.tilesOwned, self.cityLevels);
    }
    self.troopGrowthPerSec = troopGrowthPerSec(self.troops, self.maxTroops);
  }
  advance(seconds: number): void {
    if (!Number.isFinite(seconds) || seconds <= 0 || this.state.done) return;
    this.pending += seconds * TICKS_PER_SECOND;
    const count = Math.min(400 - this.ticks, Math.floor(this.pending + 1e-8));
    this.pending -= count;
    const self = this.state.snapshot.self!;
    for (let n = 0; n < count; n++) {
      self.troops = Math.min(self.maxTroops, self.troops + troopGrowthPerTick(self.troops, self.maxTroops));
      self.gold += GOLD_PER_TICK;
    }
    this.ticks += count;
    self.troopGrowthPerSec = troopGrowthPerSec(self.troops, self.maxTroops);
    this.state.elapsedSec = this.state.snapshot.elapsedSec = this.ticks / TICKS_PER_SECOND;
    this.state.snapshot.tick = this.ticks; this.state.done = this.ticks === 400;
  }
  answer(value: string): { correct: boolean; text: string } {
    const lesson = LESSONS.find(l => l.id === this.lesson)!;
    return { correct: this.state.done && value === lesson.correct, text: this.state.done ? lesson.feedback : "The example is still running." };
  }
}
export function TrainingRoom() {
  const [index, setIndex] = useState(0);
  const lesson = LESSONS[index]!;
  const session = useRef(new TrainingSession(lesson.id));
  const [state, setState] = useState(() => structuredClone(session.current.state));
  const [variant, setVariant] = useState<string>(lesson.choices[0].id);
  const [running, setRunning] = useState(false);
  const [feedback, setFeedback] = useState<{ correct: boolean; text: string }>();
  const [completed, setCompleted] = useState<LessonId[]>([]);
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      session.current.advance(0.1); setState(structuredClone(session.current.state));
      if (session.current.state.done) setRunning(false);
    }, 100);
    return () => clearInterval(timer);
  }, [running]);
  function load(next: number) {
    setRunning(false); setIndex(next); session.current = new TrainingSession(LESSONS[next]!.id);
    setState(structuredClone(session.current.state)); setFeedback(undefined); setVariant(LESSONS[next]!.choices[0].id);
  }
  function run() {
    if (running) { setRunning(false); return; }
    if (!session.current.state.choice) { session.current.choose(variant); setState(structuredClone(session.current.state)); }
    setRunning(true);
  }
  function answer(value: string) {
    setFeedback(session.current.answer(value));
    setCompleted(old => old.includes(lesson.id) ? old : [...old, lesson.id]);
  }
  const started = state.elapsedSec > 0 || !!state.choice;
  const self = state.snapshot.self!;
  return <section className="customize-page training-room" aria-label="Training room">
    <header className="page-head"><h1>Training room</h1></header>
    <div className="training-sequence">
      <div><span className="field-label">Scenario · {completed.length} of {LESSONS.length} reviewed</span>
        <Segmented<string> label="Scenario" options={LESSONS.map((item, n) => ({ value: String(n), label: item.title, detail: completed.includes(item.id) ? "Reviewed" : undefined }))} value={String(index)} onChange={v => load(Number(v))} /></div>
      <p>{lesson.description} 40-second example with mock numbers; no live match connection.</p>
      <fieldset disabled={started}><span className="field-label">Example</span>
        <Segmented<string> label="Example choice" options={lesson.choices.map(choice => ({ value: choice.id, label: choice.label }))} value={state.choice ?? variant} onChange={setVariant} /></fieldset>
      <div className="training-run">
        {!state.done && <Button variant="primary" icon={running ? undefined : "play"} data-training-start onClick={run}>{running ? "Pause" : "Run example"}</Button>}
        <Button onClick={() => load(index)} disabled={!started}>Restart</Button>
      </div>
      <div className="training-progress"><progress aria-label="Example progress" value={state.elapsedSec} max={40} /><span className="training-clock">{state.elapsedSec.toFixed(0)} / 40 s</span></div>
      <p className="training-facts"><span>Troops<strong>{formatTroops(self.troops)}</strong></span><span>Gold<strong>{formatGold(self.gold)}</strong></span></p>
      <div className="training-instruments"><Module title="Troop growth" icon="growth"><GrowthGauge self={self} phase="playing" /></Module>{lesson.id === "gold" ? <Module title="Build planner" icon="build"><BuildPlanner self={self} elapsedSec={state.elapsedSec} gameId={state.snapshot.gameId} map={state.snapshot.map} phase="playing" /></Module> : <Module title="Attack preview" icon="attack"><AttackPreview self={self} phase="playing" /></Module>}</div>
      {state.done && <section className="training-question" aria-label="Lesson question"><h2>{lesson.question}</h2><div className="training-answers">{lesson.answers.map(option => <Button key={option.id} onClick={() => answer(option.id)}>{option.label}</Button>)}</div>
        {feedback && <p role="status"><strong>{feedback.correct ? "That matches the example. " : "The example shows a different change. "}</strong>{feedback.text}</p>}
        {feedback && index < LESSONS.length - 1 && <div><Button onClick={() => load(index + 1)}>Next scenario</Button></div>}
        {completed.length === LESSONS.length && <p className="muted">All three examples reviewed.</p>}
      </section>}
    </div>
  </section>;
}

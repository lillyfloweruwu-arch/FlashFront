import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TrainingServer, type StampedIntent } from "./TrainingServer";

const opponent = { type: "attack", clientID: "opponent", targetID: null, troops: 10 } as StampedIntent;
const coach = { ...opponent, clientID: "own" };
let server: TrainingServer;
let messages: any[];
beforeEach(() => {
  vi.useFakeTimers();
  messages = [];
  server = new TrainingServer({ gameStartInfo: { lobbyCreatedAt: 1 }, training: {
    data: { ownClientId: "own", startTick: 100, opponents: [{ turn: 5, intent: opponent }], coach: [{ turn: 2, intent: coach }] },
    mode: "play",
  } } as any, false, {} as any);
  server.updateCallback(() => {}, m => { messages.push(m); if (m.type === "turn") server.turnComplete(); });
});
afterEach(() => { server.endGame(); vi.useRealTimers(); });
const turns = () => messages.filter(m => m.type === "turn").map(m => m.turn);
it("turn 0 is the snapshot tick", () => {
  server.start(); vi.advanceTimersByTime(10);
  expect(turns()[0].turnNumber).toBe(0);
});
it("scripted opponent at its turn", () => {
  server.start(); vi.advanceTimersByTime(610);
  expect(turns().filter(t => t.intents.length)).toEqual([{ turnNumber: 5, intents: [opponent] }]);
});
it("player intent stamped", () => {
  server.start(); server.onMessage({ type: "intent", intent: { ...opponent, clientID: "spoof" } } as any);
  vi.advanceTimersByTime(10);
  expect(turns()[0].intents).toEqual([{ ...opponent, clientID: "own" }]);
});
it("hold then release", () => {
  let held!: StampedIntent;
  server.onPlayerIntent = (intent, turn) => { expect(turn).toBe(0); held = intent; return "hold"; };
  server.start(); server.onMessage({ type: "intent", intent: opponent } as any);
  vi.advanceTimersByTime(210);
  expect(turns().flatMap(t => t.intents)).toEqual([]);
  server.release(held); vi.advanceTimersByTime(100);
  expect(turns().at(-1).intents).toEqual([{ ...opponent, clientID: "own" }]);
});
it("paused emits no turns", () => {
  server.pause(); server.start(); vi.advanceTimersByTime(1100);
  expect(turns()).toEqual([]);
  server.resume(); vi.advanceTimersByTime(10); expect(turns()).toHaveLength(1);
});
it("demo mode drops player intents and plays coach", () => {
  server.mode = "demo"; server.start(); server.onMessage({ type: "intent", intent: opponent } as any);
  vi.advanceTimersByTime(310);
  expect(turns().filter(t => t.intents.length)).toEqual([{ turnNumber: 2, intents: [coach] }]);
});
it("rejoin answers start with every turn so far", () => {
  server.start(); vi.advanceTimersByTime(210); server.onMessage({ type: "rejoin" } as any);
  expect(messages.at(-1)).toMatchObject({ type: "start", turns: turns(), myClientID: "own" });
});
it("backpressure and repeated start use one clock; endGame stops it", () => {
  server.updateCallback(() => {}, m => messages.push(m));
  server.start(); server.start(); vi.advanceTimersByTime(1000);
  expect(turns()).toHaveLength(1);
  server.turnComplete(); vi.advanceTimersByTime(100); expect(turns()).toHaveLength(2);
  server.endGame(); vi.advanceTimersByTime(1000); expect(turns()).toHaveLength(2);
});

it("replay mode never advances the snapshot or accepts player intents", () => {
  server.mode = "replay"; server.start();
  server.onMessage({ type: "intent", intent: opponent } as any);
  server.resume(); vi.advanceTimersByTime(2000);
  expect(turns()).toEqual([]);
});

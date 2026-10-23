import { heatCameraMatches, mapToSnapshot, type SpawnCamera, type DataSource, type GameSnapshot, type RawExtract } from "@flashfront/core";
import { CdpClient } from "./client";
import { discover, validatePort, type CdpTarget } from "./discover";
import { EXTRACT_EXPRESSION, CAMERA_EXPRESSION } from "./extract";
export type CdpStatus = "searching" | "connected-menu" | "connected-game" | "disconnected" | "port-closed";
export interface WindowBounds { left: number; top: number; width: number; height: number; windowState?: string; }
export interface Observation { raw: RawExtract | null; snapshot: GameSnapshot | null; }
interface EvaluateResult { result?: { value?: RawExtract }; exceptionDetails?: { text?: string; exception?: { className?: string; description?: string } }; }
/** Minimum spacing of camera fast-lane reads while Space is held in spawn. */
export const CAMERA_MIN_MS = 8;
export class CdpDataSource implements DataSource {
  readonly name = "cdp";
  readonly client: CdpClient;
  status: CdpStatus = "searching";
  private cameraListeners = new Set<(camera: SpawnCamera) => void>();
  private cameraHeld = false;
  private cameraTimer?: ReturnType<typeof setTimeout>;
  private cameraPolling = false;
  private cameraEpoch = 0;
  private game = new Set<(s: GameSnapshot) => void>();
  private statuses = new Set<(s: CdpStatus) => void>();
  private raws = new Set<(s: RawExtract | null) => void>();
  private observations = new Set<(s: Observation) => void>();
  private snapshot: GameSnapshot | null = null;
  private raw: RawExtract | null = null;
  private pollTimer?: ReturnType<typeof setInterval>;
  private discoveryTimer?: ReturnType<typeof setInterval>;
  private polling = false;
  private discovering = false;
  private running = false;
  private generation = 0;
  private strict = true;
  private logged = new Set<boolean>();
  private session = 0;
  private gameSerial = 0;
  constructor(readonly port = 9222, private options: {
    client?: CdpClient; discover?: (port: number) => Promise<CdpTarget | null>; log?: (message: string) => void;
  } = {}) {
    validatePort(port);
    this.client = options.client ?? new CdpClient();
    this.client.onConnection(connected => {
      if (!connected && this.running) { this.clear(); this.setStatus("disconnected"); }
      if (connected) { this.strict = true; this.session++; }
    });
  }
  subscribeGame(cb: (s: GameSnapshot) => void): () => void { this.game.add(cb); if (this.snapshot) cb(this.snapshot); return () => { this.game.delete(cb); }; }
  subscribeStatus(cb: (s: CdpStatus) => void): () => void { this.statuses.add(cb); cb(this.status); return () => { this.statuses.delete(cb); }; }
  subscribeRaw(cb: (s: RawExtract | null) => void): () => void { this.raws.add(cb); cb(this.raw); return () => { this.raws.delete(cb); }; }
  subscribeObservation(cb: (s: Observation) => void): () => void { this.observations.add(cb); cb({ raw: this.raw, snapshot: this.snapshot }); return () => { this.observations.delete(cb); }; }
  subscribeCamera(cb: (camera: SpawnCamera) => void): () => void { this.cameraListeners.add(cb); return () => { this.cameraListeners.delete(cb); }; }
  setCameraHeld(held: boolean): void { this.cameraHeld = held; this.updateCameraLane(); }
  private updateCameraLane(): void {
    const active = this.running && this.cameraHeld && this.snapshot?.phase === "spawn" && this.snapshot.mode !== "Ranked" && !this.snapshot.observer;
    // Back-to-back reads, at most one per CAMERA_MIN_MS (~120 Hz): a 60 Hz timer jittered on Windows
    // and left visible steps while panning (live 2026-10-19).
    if (active && !this.cameraTimer) {
      const epoch = this.cameraEpoch;
      const loop = async () => {
        const started = Date.now();
        await this.pollCamera();
        if (this.cameraTimer && epoch === this.cameraEpoch) this.cameraTimer = setTimeout(() => void loop(), Math.max(0, CAMERA_MIN_MS - (Date.now() - started)));
      };
      this.cameraTimer = setTimeout(() => void loop(), 0);
    } else if (!active && this.cameraTimer) { clearTimeout(this.cameraTimer); this.cameraTimer = undefined; this.cameraEpoch++; }
  }
  private async pollCamera(): Promise<void> {
    if (this.cameraPolling || !this.cameraTimer || !this.client.connected) return;
    this.cameraPolling = true; const epoch = this.cameraEpoch; const session = this.session;
    try {
      const evaluate = async (): Promise<SpawnCamera | undefined> => {
        const result = await this.client.call<{ result?: { value?: SpawnCamera }; exceptionDetails?: { text?: string; exception?: { className?: string; description?: string } } }>("Runtime.evaluate", {
          expression: CAMERA_EXPRESSION, returnByValue: true, throwOnSideEffect: this.strict,
        });
        const exception = result.exceptionDetails;
        if (exception) {
          const description = exception.exception?.description ?? exception.text ?? "";
          if (this.strict && (exception.exception?.className === "EvalError" || /EvalError/.test(description)) && /side.?effect/i.test(description)) { this.strict = false; return evaluate(); }
          return undefined;
        }
        return result.result?.value;
      };
      const camera = await evaluate();
      if (epoch !== this.cameraEpoch || session !== this.session || !this.cameraTimer) return;
      if (camera && heatCameraMatches({ width: camera.mapWidth, height: camera.mapHeight }, camera)) for (const cb of this.cameraListeners) cb(camera);
    } catch { /* A failed camera sample never interrupts the ordinary observation lane. */ }
    finally { this.cameraPolling = false; }
  }
  private setStatus(s: CdpStatus): void { if (s === this.status) return; this.status = s; for (const cb of this.statuses) cb(s); }
  private clear(): void { const changed = this.raw !== null || this.snapshot !== null; this.raw = null; this.snapshot = null; this.updateCameraLane(); for (const cb of this.raws) cb(null); if (changed) for (const cb of this.observations) cb({ raw: null, snapshot: null }); }
  start(): void {
    if (this.running) return;
    this.running = true; this.generation++; this.setStatus("searching");
    void this.search();
    this.discoveryTimer = setInterval(() => void this.search(), 1000);
    // 8 Hz during the spawn phase so the on-map heat follows panning; 4 Hz otherwise.
    let ticks = 0;
    this.pollTimer = setInterval(() => { if (++ticks % 2 === 0 || this.snapshot?.phase === "spawn") void this.poll(); }, 125);
  }
  stop(): void {
    this.running = false; this.generation++;
    clearInterval(this.discoveryTimer); clearInterval(this.pollTimer);
    this.client.disconnect(); this.clear(); this.setStatus("disconnected");
  }
  private async search(): Promise<void> {
    if (this.discovering) return;
    this.discovering = true; const generation = this.generation;
    try {
      const target = await (this.options.discover ?? discover)(this.port);
      if (!this.running || generation !== this.generation) return;
      this.client.setTarget(target);
      if (!target) { this.clear(); this.setStatus("searching"); }
    } catch {
      if (this.running && generation === this.generation) { this.client.setTarget(null); this.clear(); this.setStatus("port-closed"); }
    } finally { this.discovering = false; }
  }
  private async evaluate(): Promise<RawExtract> {
    const result = await this.client.call<EvaluateResult>("Runtime.evaluate", {
      expression: EXTRACT_EXPRESSION, returnByValue: true, throwOnSideEffect: this.strict,
    });
    if (result.exceptionDetails) {
      const exception = result.exceptionDetails.exception;
      const description = exception?.description ?? result.exceptionDetails.text ?? "";
      if (this.strict && (exception?.className === "EvalError" || /EvalError/.test(description)) && /side.?effect/i.test(description)) {
        this.strict = false;
        return this.evaluate();
      }
      throw new Error(description || "Extraction failed");
    }
    if (!result.result?.value || typeof result.result.value.inGame !== "boolean") throw new Error("Invalid extraction result");
    if (!this.logged.has(this.strict)) {
      this.logged.add(this.strict);
      (this.options.log ?? console.info)(`FlashFront extraction: throwOnSideEffect=${this.strict}`);
    }
    return result.result.value;
  }
  private async poll(): Promise<void> {
    if (this.polling || !this.client.connected || !this.running) return;
    this.polling = true; const generation = this.generation; const session = this.session;
    try {
      const raw = await this.evaluate();
      if (!this.running || generation !== this.generation || session !== this.session) return;
      const previous = this.snapshot;
      this.raw = raw; this.snapshot = mapToSnapshot(raw, previous);
      if (this.snapshot) this.snapshot.gameId = raw.gameId ?? (previous && raw.tick !== undefined && raw.tick >= previous.tick ? previous.gameId : `cdp-game-${++this.gameSerial}`);
      this.updateCameraLane();
      this.setStatus(raw.inGame ? "connected-game" : "connected-menu");
      for (const cb of this.observations) cb({ raw, snapshot: this.snapshot });
      for (const cb of this.raws) cb(raw);
      if (this.snapshot) for (const cb of this.game) cb(this.snapshot);
    } catch {
      if (this.running && generation === this.generation) { this.clear(); this.setStatus("disconnected"); }
    } finally { this.polling = false; }
  }
  async getWindowBounds(): Promise<WindowBounds | null> {
    const w = this.raw?.window;
    if (!w || ![w.x, w.y, w.width, w.height].every(Number.isFinite)) return null;
    return { left: w.x, top: w.y, width: w.width, height: w.height, windowState: w.hidden ? "minimized" : "normal" };
  }
  async getLobbies() { return []; }
  async getProfile() { return null; }
  async getMatches() { return []; }
  async getMatch() { return null; }
}

import { validateSocketUrl, type CdpTarget } from "./discover";
import { EXTRACT_EXPRESSION, CAMERA_EXPRESSION } from "./extract";

// Only reads. Browser.getWindowForTarget was dropped: OpenFront's Electron does not implement it.
export const ALLOWED_CDP_METHODS = Object.freeze(["Runtime.evaluate"] as const);
type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };
export class CdpClient {
  private socket?: WebSocket;
  private target?: CdpTarget;
  private pending = new Map<number, Pending>();
  private id = 0;
  private retry?: ReturnType<typeof setTimeout>;
  private attempts = 0;
  private closed = false;
  private listeners = new Set<(connected: boolean) => void>();
  constructor(private options: { timeoutMs?: number; backoffMs?: number } = {}) {}
  get connected(): boolean { return this.socket?.readyState === WebSocket.OPEN; }
  get targetId(): string | undefined { return this.target?.id; }
  onConnection(cb: (connected: boolean) => void): () => void { this.listeners.add(cb); return () => { this.listeners.delete(cb); }; }
  setTarget(target: CdpTarget | null): void {
    if (target) validateSocketUrl(target.webSocketDebuggerUrl);
    if (target?.id === this.target?.id && target?.webSocketDebuggerUrl === this.target?.webSocketDebuggerUrl) return;
    this.disconnect();
    this.closed = false;
    this.target = target ?? undefined;
    this.attempts = 0;
    if (target) this.open();
  }
  private open(): void {
    if (this.closed || !this.target) return;
    const socket = new WebSocket(validateSocketUrl(this.target.webSocketDebuggerUrl));
    this.socket = socket;
    const handshake = setTimeout(() => socket.close(), this.options.timeoutMs ?? 2000);
    socket.addEventListener("open", () => {
      clearTimeout(handshake);
      if (socket !== this.socket) return;
      this.attempts = 0;
      for (const cb of this.listeners) cb(true);
    });
    socket.addEventListener("message", event => {
      if (socket !== this.socket) return;
      try {
        const message = JSON.parse(String(event.data)) as { id?: number; result?: unknown; error?: { message: string } };
        const request = this.pending.get(message.id ?? -1);
        if (!request) return;
        clearTimeout(request.timer); this.pending.delete(message.id!);
        if (message.error) request.reject(new Error(message.error.message));
        else request.resolve(message.result);
      } catch { /* Ignore events and malformed frames; requests still time out. */ }
    });
    socket.addEventListener("error", () => socket.close());
    socket.addEventListener("close", () => {
      clearTimeout(handshake);
      if (socket !== this.socket) return;
      this.socket = undefined;
      this.rejectPending();
      for (const cb of this.listeners) cb(false);
      if (!this.closed && this.target) {
        const delay = Math.min(5000, (this.options.backoffMs ?? 250) * 2 ** this.attempts++);
        this.retry = setTimeout(() => this.open(), delay);
      }
    });
  }
  /** Synchronous guards run before any socket send. Params cannot add another expression. */
  call<T = unknown>(method: string, params: Record<string, unknown>): Promise<T> {
    if (!(ALLOWED_CDP_METHODS as readonly string[]).includes(method)) throw new Error(`Disallowed CDP method: ${method}`);
    if (method === "Runtime.evaluate") {
      if ((params.expression !== EXTRACT_EXPRESSION && params.expression !== CAMERA_EXPRESSION) || params.returnByValue !== true || typeof params.throwOnSideEffect !== "boolean"
        || Object.keys(params).some(key => !["expression", "returnByValue", "throwOnSideEffect"].includes(key))) throw new Error("Only the fixed extraction expression is allowed");
    }
    if (!this.connected) return Promise.reject(new Error("CDP disconnected"));
    const id = ++this.id;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, this.options.timeoutMs ?? 2000);
      this.pending.set(id, { resolve: value => resolve(value as T), reject, timer });
      try { this.socket!.send(JSON.stringify({ id, method, params })); }
      catch (error) { clearTimeout(timer); this.pending.delete(id); reject(error); }
    });
  }
  private rejectPending(): void {
    for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(new Error("CDP disconnected")); }
    this.pending.clear();
  }
  disconnect(): void {
    this.closed = true; clearTimeout(this.retry); this.retry = undefined;
    const socket = this.socket; this.socket = undefined; this.target = undefined;
    socket?.close(); this.rejectPending();
    for (const cb of this.listeners) cb(false);
  }
}


export interface CdpTarget { id: string; type: "page"; url: string; webSocketDebuggerUrl: string; }
export function validatePort(port: number): void {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid debug port");
}
export function validateSocketUrl(value: string, port?: number): string {
  const url = new URL(value);
  if (url.protocol !== "ws:" || url.hostname !== "127.0.0.1" || url.username || url.password || (port !== undefined && Number(url.port) !== port)) throw new Error("Use 127.0.0.1 and the configured port for CDP");
  return url.href;
}
export async function discover(port = 9222): Promise<CdpTarget | null> {
  validatePort(port);
  const response = await fetch(`http://127.0.0.1:${port}/json/list`, { redirect: "error", signal: AbortSignal.timeout(2000) });
  if (!response.ok) throw new Error(`Discovery HTTP ${response.status}`);
  const targets: unknown = await response.json();
  if (!Array.isArray(targets)) throw new Error("Invalid target list");
  const target = targets.find(t => t?.type === "page" && typeof t.url === "string" && t.url.startsWith("app://openfront/") && typeof t.id === "string" && typeof t.webSocketDebuggerUrl === "string");
  if (!target) return null;
  validateSocketUrl(target.webSocketDebuggerUrl, port);
  return target as CdpTarget;
}

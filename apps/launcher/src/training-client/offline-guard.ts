/** Local schemes and the app itself; everything else would leave the machine. */
export function trainingAllowed(url: URL, origin: string): boolean {
  return ["fftraining:", "data:", "blob:"].includes(url.protocol) || url.origin === origin;
}

/** Install before dynamically importing any upstream module. CSP covers resource and media loads. */
export function installOfflineGuard(allowed: (url: URL) => boolean, log: (url: string) => void): void {
  const realFetch = globalThis.fetch.bind(globalThis);
  const check = (value: string | URL): URL => new URL(value, location.href);
  globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = check(typeof input === "string" || input instanceof URL ? input : input.url);
    if (!allowed(url)) { log(url.href); return Promise.reject(new TypeError("Training is offline")); }
    return realFetch(input, init);
  };
  const RealWebSocket = globalThis.WebSocket;
  globalThis.WebSocket = class extends RealWebSocket {
    constructor(value: string | URL, protocols?: string | string[]) {
      const url = check(value);
      const blocked = !allowed(url);
      if (blocked) log(url.href);
      super(blocked ? "ws://127.0.0.1:9/blocked" : value, protocols);
    }
  };
  // XHR and beacon are used by browser libraries even when fetch is guarded.
  if (globalThis.XMLHttpRequest) {
    const open = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method: string, value: string | URL, async = true, username?: string | null, password?: string | null) {
      const url = check(value);
      if (!allowed(url)) { log(url.href); throw new TypeError("Training is offline"); }
      open.call(this, method, value, async, username, password);
    };
  }
  if (typeof globalThis.navigator?.sendBeacon === "function") {
    const beacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = (value, data) => {
      const url = check(value);
      if (!allowed(url)) { log(url.href); return false; }
      return beacon(value, data);
    };
  }
}

import koffi from "koffi";

/**
 * Path of the executable that owns the foreground window, or undefined. Windows only (user32 +
 * kernel32 through koffi); other platforms return null so callers fall back to page focus.
 * Read-only: GetForegroundWindow, GetWindowThreadProcessId, QueryFullProcessImageNameW.
 */
export type ForegroundProbe = () => string | undefined | null;

export function createForegroundProbe(): ForegroundProbe {
  if (process.platform !== "win32") return () => null;
  try {
    const user32 = koffi.load("user32.dll");
    const kernel32 = koffi.load("kernel32.dll");
    const GetForegroundWindow = user32.func("void* __stdcall GetForegroundWindow()");
    const GetWindowThreadProcessId = user32.func("uint32 __stdcall GetWindowThreadProcessId(void* hWnd, _Out_ uint32* pid)");
    const OpenProcess = kernel32.func("void* __stdcall OpenProcess(uint32 access, bool inherit, uint32 pid)");
    const CloseHandle = kernel32.func("bool __stdcall CloseHandle(void* h)");
    const QueryFullProcessImageNameW = kernel32.func("bool __stdcall QueryFullProcessImageNameW(void* h, uint32 flags, _Out_ uint16* name, _Inout_ uint32* size)");
    const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
    const cache = new Map<number, string | undefined>();
    return () => {
      const hwnd = GetForegroundWindow();
      if (!hwnd) return undefined;
      const pid = [0];
      GetWindowThreadProcessId(hwnd, pid);
      if (!pid[0]) return undefined;
      if (cache.has(pid[0])) return cache.get(pid[0]);
      const handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid[0]);
      if (!handle) return undefined;
      try {
        const buffer = new Uint16Array(1024); const size = [buffer.length];
        const path = QueryFullProcessImageNameW(handle, 0, buffer, size) ? String.fromCharCode(...buffer.subarray(0, size[0])) : undefined;
        if (cache.size > 64) cache.clear();
        cache.set(pid[0], path);
        return path;
      } finally { CloseHandle(handle); }
    };
  } catch { return () => null; }
}

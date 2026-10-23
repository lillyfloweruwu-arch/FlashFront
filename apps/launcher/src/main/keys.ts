import koffi from "koffi";

export const VK_SPACE = 0x20;
export type KeyProbe = (vk: number) => boolean | null;
export function createKeyProbe(platform = process.platform): KeyProbe {
  if (platform !== "win32") return () => null;
  try {
    const getState = koffi.load("user32.dll").func("int16 __stdcall GetAsyncKeyState(int vk)");
    return vk => { try { return (getState(vk) & 0x8000) !== 0; } catch { return null; } };
  } catch { return () => null; }
}

/** Observe Space without registering or consuming it. The low bit records old taps, not a hold. */
export function watchSpawnKey(probe: KeyProbe, update: (held: boolean | undefined) => void) {
  let timer: ReturnType<typeof setInterval> | undefined;
  let held: boolean | undefined;
  const sample = (initial = false) => {
    let next: boolean | undefined;
    try { next = probe(VK_SPACE) ?? undefined; } catch { next = undefined; }
    if (initial || next !== held) { held = next; update(held); }
  };
  const stop = () => { clearInterval(timer); timer = undefined; if (held !== undefined) { held = undefined; update(held); } };
  return {
    setActive(active: boolean) { if (!active) stop(); else if (timer === undefined) { sample(true); timer = setInterval(sample, 50); } },
    stop,
  };
}

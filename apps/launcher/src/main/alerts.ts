import { Notification, type BrowserWindow } from "electron";
import koffi from "koffi";
import type { RawExtract } from "@flashfront/core";
import { restrictedMatch } from "../shared";

/** Original two-tone PCM chime, 320 ms; no sound asset or license dependency. */
export function spawnChime(): Buffer {
  const rate = 22050; const samples = Math.floor(rate * 0.32); const wav = Buffer.alloc(44 + samples * 2);
  wav.write("RIFF"); wav.writeUInt32LE(wav.length - 8, 4); wav.write("WAVEfmt ", 8); wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write("data", 36); wav.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) {
    const t = i / rate; const local = t % 0.16; const envelope = Math.min(1, local / 0.01, (0.16 - local) / 0.04);
    wav.writeInt16LE(Math.round(Math.sin(2 * Math.PI * (t < 0.16 ? 660 : 880) * local) * envelope * 5000), 44 + i * 2);
  }
  return wav;
}
const sound = spawnChime(); // Kept alive while PlaySound reads asynchronously.
let playSound: ((...args: any[]) => any) | undefined;
const flashing = new WeakSet<BrowserWindow>();
export function spawnAlert(win: BrowserWindow, { chime }: { chime: boolean }): void {
  if (process.platform !== "win32" || win.isDestroyed()) return;
  try {
    if (Notification.isSupported()) new Notification({ title: "Spawn phase started", body: "OpenFront is in the spawn phase.", silent: true }).show();
  } catch { /* Notifications can be disabled by the OS. */ }
  if (!win.isFocused() && !flashing.has(win)) {
    flashing.add(win); win.flashFrame(true);
    win.once("focus", () => { flashing.delete(win); if (!win.isDestroyed()) win.flashFrame(false); });
  }
  if (chime) {
    try {
      playSound ??= koffi.load("winmm.dll").func("bool __stdcall PlaySoundW(void* sound, void* module, uint32 flags)");
      playSound(sound, null, 0x0004 | 0x0001 | 0x0002); // SND_MEMORY | SND_ASYNC | SND_NODEFAULT
    } catch { /* Audio is optional, including on machines without a sound device. */ }
  }
}

export class SpawnAlerts {
  private seen = new Set<string>();
  constructor(private alert: () => void) {}
  observe(raw: RawExtract | null): void {
    if (!raw?.inGame || !raw.inSpawnPhase || raw.gameOver || restrictedMatch({ raw }) || !raw.gameId || this.seen.has(raw.gameId)) return;
    this.seen.add(raw.gameId); this.alert();
  }
}

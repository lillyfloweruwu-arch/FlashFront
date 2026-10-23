import { deflateSync } from "node:zlib";

const COLORS = { ocean: [12, 28, 41], plains: [59, 91, 58], highland: [107, 106, 69], mountain: [140, 140, 140], impassable: [90, 90, 90], lakes: [28, 58, 82] } as const;
const crcTable = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0;
});
function chunk(type: string, data: Uint8Array) {
  const name = Buffer.from(type); const content = Buffer.concat([name, data]); let crc = 0xffffffff;
  for (const b of content) crc = crcTable[(crc ^ b) & 255]! ^ (crc >>> 8);
  const out = Buffer.alloc(data.length + 12); out.writeUInt32BE(data.length, 0); content.copy(out, 4); out.writeUInt32BE((crc ^ 0xffffffff) >>> 0, out.length - 4); return out;
}
export function renderMinimap(terrain: Uint8Array, width: number, height: number) {
  if (width <= 0 || height <= 0 || terrain.length !== width * height) throw Error("Invalid minimap dimensions");
  const scale = Math.min(1, 320 / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale)); const h = Math.max(1, Math.round(height * scale));
  const pixels = Buffer.alloc(h * (w * 3 + 1));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const b = terrain[Math.min(height - 1, Math.floor((y + 0.5) * height / h)) * width + Math.min(width - 1, Math.floor((x + 0.5) * width / w))]!;
    const mag = b & 31;
    const color = b & 128 ? mag === 31 ? COLORS.impassable : mag < 10 ? COLORS.plains : mag < 20 ? COLORS.highland : COLORS.mountain : b & 32 ? COLORS.ocean : COLORS.lakes;
    pixels.set(color, y * (w * 3 + 1) + 1 + x * 3);
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(w, 0); header.writeUInt32BE(h, 4); header[8] = 8; header[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(pixels, { level: 9 })), chunk("IEND", new Uint8Array())]);
}

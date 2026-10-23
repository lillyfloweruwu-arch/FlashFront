import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { Resvg } from '@resvg/resvg-js';

const source = await readFile(new URL('../docs/brand/mark.svg', import.meta.url), 'utf8');
const smallSource = await readFile(new URL('../docs/brand/mark-16.svg', import.meta.url), 'utf8');
const output = new URL('../apps/launcher/build/', import.meta.url);
await mkdir(output, { recursive: true });
const render = size => new Resvg(size <= 32 ? smallSource : source,
  { fitTo: { mode: 'width', value: size } }).render().asPng();
await writeFile(new URL('icon.png', output), render(512));
// Windows ICO directory with lossless PNG images at each required resolution.
const sizes = [16, 24, 32, 48, 256];
const images = sizes.map(render);
const directory = Buffer.alloc(6 + 16 * sizes.length);
directory.writeUInt16LE(1, 2);
directory.writeUInt16LE(sizes.length, 4);
let offset = directory.length;
sizes.forEach((size, i) => {
  const entry = 6 + i * 16;
  directory[entry] = directory[entry + 1] = size === 256 ? 0 : size;
  directory.writeUInt16LE(1, entry + 4);
  directory.writeUInt16LE(32, entry + 6);
  directory.writeUInt32LE(images[i].length, entry + 8);
  directory.writeUInt32LE(offset, entry + 12);
  offset += images[i].length;
});
await writeFile(new URL('icon.ico', output), Buffer.concat([directory, ...images]));
console.log('FlashFront icons: PNG 512; ICO 16/24/32/48/256.');

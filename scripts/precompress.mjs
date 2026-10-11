// Writes a .gz next to every compressible file of the built site, so nginx can send those
// (gzip_static) instead of compressing on every request. Run after `vite build`.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { constants, gzipSync } from 'node:zlib';

const dir = process.argv[2] ?? 'dist';
const COMPRESSIBLE = /\.(js|css|svg|json|wasm|map|txt)$/;
// Rewritten when the container starts (base path, server address), so a stored copy would go stale.
const SKIP = new Set(['index.html', 'config.js']);
const MIN_BYTES = 1024;

let files = 0;
let before = 0;
let after = 0;
for (const entry of await readdir(dir, { recursive: true, withFileTypes: true })) {
  if (!entry.isFile() || !COMPRESSIBLE.test(entry.name) || SKIP.has(entry.name)) continue;
  const path = join(entry.parentPath, entry.name);
  const data = await readFile(path);
  if (data.length < MIN_BYTES) continue;
  const packed = gzipSync(data, { level: constants.Z_BEST_COMPRESSION });
  if (packed.length >= data.length) continue;
  await writeFile(`${path}.gz`, packed);
  files++;
  before += data.length;
  after += packed.length;
}
console.log(`precompressed ${files} files: ${(before / 1024).toFixed(0)} kB -> ${(after / 1024).toFixed(0)} kB`);

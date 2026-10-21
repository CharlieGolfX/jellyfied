// Checks the built site against a size budget, so a pull request that makes the app noticeably
// heavier fails CI instead of slipping through. Run after `vite build`.
//
// "First load" is what a browser fetches before anything shows: the entry script from index.html,
// the app module it imports right away (bootstrap), everything those import statically, and the
// stylesheet. The other chunks load on demand and only have a per-file limit. Sizes are gzipped,
// which is what goes over the wire.
import { appendFile, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { constants, gzipSync } from 'node:zlib';

const dir = process.argv[2] ?? 'dist';

// Kilobytes, gzipped. Leave some room above today's numbers; raise them on purpose, with a reason.
const BUDGET = {
  firstLoad: 230,
  // hls.js is the largest chunk by far and only loads when a stream needs it.
  chunk: 200,
  // The subtitle renderer's WebAssembly, fetched only for ASS/SSA subtitles.
  wasm: 1000,
};

const gz = async (file) => gzipSync(await readFile(join(dir, file)), { level: constants.Z_BEST_COMPRESSION }).length;
const kb = (bytes) => bytes / 1024;

const html = await readFile(join(dir, 'index.html'), 'utf8');
const entry = html.match(/<script type="module"[^>]*src="\.?\/?([^"]+)"/)?.[1];
const css = [...html.matchAll(/<link rel="stylesheet"[^>]*href="\.?\/?([^"]+)"/g)].map((m) => m[1]);
if (!entry) throw new Error('No module script in index.html');

// The entry's static imports, and the bootstrap chunk it imports straight away, with theirs.
const first = new Set();
async function walk(file) {
  if (first.has(file)) return;
  first.add(file);
  const code = await readFile(join(dir, file), 'utf8');
  for (const [, name] of code.matchAll(/(?:from|import)\s*"\.\/([^"]+\.js)"/g)) await walk(join('assets', name));
}
await walk(entry);
const bootstrap = (await readdir(join(dir, 'assets'))).find((f) => /^bootstrap-.*\.js$/.test(f));
if (bootstrap) await walk(join('assets', bootstrap));

const rows = [];
const failures = [];
let firstLoad = 0;
for (const file of [...first, ...css]) firstLoad += await gz(file);
rows.push(['First load (JS + CSS)', firstLoad, BUDGET.firstLoad]);
if (kb(firstLoad) > BUDGET.firstLoad) failures.push(`first load is ${kb(firstLoad).toFixed(1)} kB, over ${BUDGET.firstLoad} kB`);

for (const name of await readdir(join(dir, 'assets'))) {
  const limit = name.endsWith('.js') ? BUDGET.chunk : name.endsWith('.wasm') ? BUDGET.wasm : null;
  if (limit === null) continue;
  const size = await gz(join('assets', name));
  if (kb(size) > limit) failures.push(`${name} is ${kb(size).toFixed(1)} kB, over ${limit} kB`);
  if (kb(size) > 50) rows.push([name, size, limit]);
}

const table = [
  '### Bundle size (gzipped)',
  '',
  '| | Size | Budget |',
  '| --- | ---: | ---: |',
  ...rows.map(([name, size, limit]) => `| ${name} | ${kb(size).toFixed(1)} kB | ${limit} kB |`),
  '',
].join('\n');
console.log(table);
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, table + '\n');

if (failures.length) {
  console.error(`Over budget:\n  ${failures.join('\n  ')}`);
  process.exit(1);
}

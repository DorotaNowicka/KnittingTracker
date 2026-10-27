#!/usr/bin/env node
/**
 * Bundle budget (NFR-3, M6). Sums the gzip size of the JavaScript the browser must load before the
 * app can start: the entry chunk named in dist/index.html and every chunk it imports statically.
 * Lazy chunks (import wizard, pattern editor) and the import worker are not part of the budget.
 *
 *   node scripts/check-bundle.mjs [budgetKiB=260]
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const dist = new URL('../apps/web/dist/', import.meta.url).pathname;
const budget = Number(process.argv[2] ?? 260) * 1024;
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const entry = /<script type="module"[^>]*src="\/(assets\/[^"]+\.js)"/.exec(html)?.[1];
if (!entry) throw new Error('no entry script in dist/index.html');

const seen = new Set();
const queue = [entry];
while (queue.length > 0) {
  const file = queue.shift();
  if (!file || seen.has(file)) continue;
  seen.add(file);
  const code = readFileSync(join(dist, file), 'utf8');
  // Static imports only: `import … from "./x.js"` and bare `import "./x.js"`, not `import("./x.js")`.
  for (const m of code.matchAll(
    /(?:^|[;}\s])import\s*(?:[^'"()]*?from\s*)?["'](\.\/[^"']+\.js)["']/g,
  )) {
    if (m[1]) queue.push(`assets/${m[1].slice(2)}`);
  }
}

let total = 0;
for (const file of seen) {
  const size = gzipSync(readFileSync(join(dist, file))).length;
  total += size;
  console.log(`${(size / 1024).toFixed(1).padStart(8)} KiB  ${file}`);
}
console.log(
  `${(total / 1024).toFixed(1).padStart(8)} KiB  total (gzip) — budget ${budget / 1024} KiB`,
);
if (total > budget) {
  console.error('Startup JavaScript is over budget.');
  process.exit(1);
}

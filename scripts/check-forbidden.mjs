#!/usr/bin/env node
// Guard against committing protected third-party pattern material (R-5, "Copyright & privacy").
// Usage: node scripts/check-forbidden.mjs [--staged]
//   default  → checks every tracked file
//   --staged → checks only files staged for the next commit (pre-commit hook)
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

const staged = process.argv.includes('--staged');
const SELF = 'scripts/check-forbidden.mjs';

/** Paths that must never be tracked. */
const FORBIDDEN_PATHS = [/^inspirations\//, /^local\//];

/** Binary pattern sources are allowed only as synthetic fixtures. */
const PDF_ALLOWED_UNDER = /^packages\/test-fixtures\//;

/**
 * Text fingerprints of third-party pattern documents (wording that only appears when pattern text
 * or legend descriptions are copied). Keep the list conservative to avoid false positives.
 */
const FORBIDDEN_TEXT = [
  { re: /pattern-printdiagram\.php/i, why: 'link to a third-party chart print page' },
  { re: /garnstudio\.com\/pattern\.php/i, why: 'link to a third-party pattern page' },
  { re: /drut(?:u|a)? do warkoczy/i, why: 'copied legend wording (cable needle instructions)' },
  { re: /zakończyć przerabiając pierwsze oczko schematu/i, why: 'copied pattern instruction text' },
  { re: /wszystkie prawa zastrzeżone/i, why: 'copied copyright footer of a pattern' },
];

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' });
const files = (
  staged ? git('diff', '--cached', '--name-only', '--diff-filter=ACMR') : git('ls-files')
)
  .split('\n')
  .filter(Boolean);

const problems = [];
for (const file of files) {
  if (FORBIDDEN_PATHS.some((re) => re.test(file))) {
    problems.push(`${file}: protected path must not be committed`);
    continue;
  }
  if (/\.pdf$/i.test(file) && !PDF_ALLOWED_UNDER.test(file)) {
    problems.push(`${file}: PDFs are allowed only as synthetic fixtures in packages/test-fixtures`);
    continue;
  }
  if (file === SELF || !existsSync(file)) continue;
  let text;
  try {
    const buf = readFileSync(file);
    if (buf.includes(0)) continue; // binary
    text = buf.toString('utf8');
  } catch {
    continue;
  }
  for (const { re, why } of FORBIDDEN_TEXT) {
    if (re.test(text)) problems.push(`${file}: ${why} (${re})`);
  }
}

if (problems.length > 0) {
  console.error('Forbidden content found (see docs/00-analysis.md, "Copyright note"):');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`check-forbidden: ${files.length} file(s) clean.`);

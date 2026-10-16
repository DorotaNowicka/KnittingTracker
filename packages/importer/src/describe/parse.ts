/**
 * Description parser for Polish pattern texts (ADR-5, step 7). Heuristic on purpose: it proposes
 * sizes, the chart order of a round and stitch counts, each with the span of text it came from, and
 * the user confirms or edits everything. The structure (token rules per language) leaves room for
 * an English variant.
 */

export interface Span {
  readonly start: number;
  readonly end: number;
}

export interface Found<T> {
  readonly value: T;
  readonly span: Span;
}

export interface SequenceItem {
  /** Chart name as written, e.g. "A.1". */
  readonly chart: string;
  /** Stitches per size when the text says "over N stitches". */
  readonly stitches?: readonly number[];
  readonly span: Span;
}

export interface ParsedDescription {
  readonly sizes: Found<readonly string[]> | null;
  /** Every chart name mentioned, in order of first mention. */
  readonly chartNames: readonly string[];
  /** The longest chart sequence (the layout of a round or row). */
  readonly sequence: Found<readonly SequenceItem[]> | null;
  /** A stitch count per size stated just before the sequence, if any. */
  readonly stitchCount: Found<readonly number[]> | null;
  /** "Place a marker after N stitches" before the sequence: stitches before the marker, per size. */
  readonly marker: Found<readonly number[]> | null;
}

const SIZE_TOKEN = String.raw`(?:XXXS|XXS|XS|S|M|L|XL|XXL|XXXL|XXXXL|\d{1,3}(?:\/\d{1,3})?(?:\s?(?:cm|lat|m-cy|mies\.?))?)`;
const sizesRe = (min: number) =>
  new RegExp(String.raw`(?<![\w.])${SIZE_TOKEN}(?:\s*-\s*${SIZE_TOKEN}){${min},9}(?![\w-])`, 'g');
const CHART_RE = /\b([A-Z]{1,2}\.\d{1,2}[a-z]?)\b/g;

/** The size list: preferably the one right after a "ROZMIARY" heading. */
function findSizes(text: string): Found<string[]> | null {
  const headings = [
    ...text.matchAll(/ROZMIAR(?:Y)?\s*:?/g),
    ...text.matchAll(/rozmiar(?:y)?\s*:/gi),
  ];
  const scopes: { from: number; min: number }[] = headings.map((h) => ({ from: h.index, min: 1 }));
  scopes.push({ from: 0, min: 2 });
  for (const { from, min } of scopes) {
    const scope = from === 0 && min === 2 ? text : text.slice(from, from + 200);
    const m = sizesRe(min).exec(scope);
    if (!m) continue;
    const labels = m[0].split(/\s*-\s*/).map((s) => s.trim());
    // Pure numbers are more often stitch counts or catalogue numbers than sizes.
    if (labels.some((l) => /[A-Z/]/.test(l)) || (min === 1 && labels.length >= 3)) {
      const start = (scope === text ? 0 : from) + m.index;
      return { value: labels, span: { start, end: start + m[0].length } };
    }
  }
  return null;
}

/** Numbers like "19-22-28-34-40-49" with exactly `n` values (or one value for every size). */
function numberList(s: string, n: number): number[] | null {
  const parts = s.split('-').map((x) => Number(x));
  if (parts.some((x) => !Number.isFinite(x))) return null;
  if (parts.length === n) return parts;
  if (parts.length === 1 && parts[0] !== undefined)
    return Array.from({ length: n }, () => parts[0] ?? 0);
  return null;
}

/** Remove parenthesised asides (keeping offsets): "(zakończyć … A.1)" is not part of the order. */
function maskParens(s: string): string {
  let depth = 0;
  let out = '';
  for (const ch of s) {
    if (ch === '(') depth += 1;
    out += depth > 0 ? ' ' : ch;
    if (ch === ')') depth = Math.max(0, depth - 1);
  }
  return out;
}

export function parseDescription(text: string): ParsedDescription {
  const sizes = findSizes(text);
  const n = sizes?.value.length ?? 1;
  const chartNames: string[] = [];
  for (const m of text.matchAll(CHART_RE))
    if (m[1] && !chartNames.includes(m[1])) chartNames.push(m[1]);

  // Sentences (a line break inside a sentence is not an end).
  const masked = maskParens(text);
  const sentences: Span[] = [];
  let start = 0;
  for (let i = 0; i <= masked.length; i++) {
    const ch = masked[i];
    // A short line (a chart title) or a line without lower-case letters (a heading) ends the
    // sentence too; ordinary line breaks inside a sentence don't.
    let lineEnd = false;
    if (ch === '\n') {
      const line = masked.slice(masked.lastIndexOf('\n', i - 1) + 1, i).trim();
      lineEnd = line.length <= 16 || !/[a-ząćęłńóśźż]/.test(line);
    }
    if (
      i === masked.length ||
      lineEnd ||
      (ch === '.' &&
        /\s/.test(masked[i + 1] ?? ' ') &&
        !/[A-Z]$/.test(masked.slice(Math.max(0, i - 2), i)))
    ) {
      sentences.push({ start, end: i });
      start = i + 1;
    }
  }

  let best: Found<SequenceItem[]> | null = null;
  for (const s of sentences) {
    const part = masked.slice(s.start, s.end);
    const items: SequenceItem[] = [];
    const re = new RegExp(CHART_RE.source, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(part))) {
      const name = m[1] ?? '';
      const after = part.slice(m.index + m[0].length, m.index + m[0].length + 80);
      const over = /^\s*(?:ponad|na)\s+(\d+(?:-\d+)*)\s+(?:\S+\s+)?ocz/.exec(after);
      const stitches = over?.[1] ? numberList(over[1], n) : null;
      const at = s.start + m.index;
      items.push({
        chart: name,
        span: { start: at, end: at + m[0].length },
        ...(stitches ? { stitches } : {}),
      });
    }
    // A layout lists several charts and gives at least one stitch count.
    if (
      items.length >= 3 &&
      items.some((x) => x.stitches) &&
      (!best || items.length > best.value.length)
    ) {
      best = { value: items, span: { start: s.start, end: s.end } };
    }
  }

  // "= 250-262-286-310-334-370 oczek" closest before the sequence: a result ("=") wins over a
  // plain count, since "marker after 125-131 stitches" also counts stitches.
  let stitchCount: Found<number[]> | null = null;
  let marker: Found<number[]> | null = null;
  if (best) {
    const offset = Math.max(0, best.span.start - 800);
    const before = text.slice(offset, best.span.start);
    const list = String.raw`(\d+(?:-\d+){${Math.max(0, n - 1)}})`;
    for (const m of before.matchAll(new RegExp(String.raw`(=\s*)?${list}\s+ocz`, 'g'))) {
      const values = m[2] ? numberList(m[2], n) : null;
      if (!values || m.index === undefined) continue;
      const at = offset + m.index + (m[1]?.length ?? 0);
      const found = { value: values, span: { start: at, end: at + (m[2]?.length ?? 0) } };
      if (m[1] || !stitchCount) stitchCount = found;
    }
    const mk = new RegExp(String.raw`marker\w*[^.]{0,120}?\b(?:za|po)\s+${list}\s+ocz`, 'gi');
    for (const m of before.matchAll(mk)) {
      const values = m[1] ? numberList(m[1], n) : null;
      if (!values || m.index === undefined) continue;
      const at = offset + m.index + m[0].indexOf(m[1] ?? '');
      marker = { value: values, span: { start: at, end: at + (m[1]?.length ?? 0) } };
      if (stitchCount && stitchCount.value.join() === values.join()) stitchCount = null;
    }
  }
  return { sizes, chartNames, sequence: best, stitchCount, marker };
}

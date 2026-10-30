/**
 * What a pattern text says about working its charts one after another: the arrows of a yoke
 * ("Strzałka-1: równomiernie dodać 36-38-42 oczka = 156-162-174 oczka"), the width of a chart's
 * motif ("motywów wg schematu A.3 po 6 oczek") and, per part, the charts in the order they are
 * worked ("przerabiać schemat A.1 …, a gdy … przerabiać schemat A.2"), each with its stitches and
 * the length to work it to. Heuristic, like the rest of the description parser: Polish first, with
 * the usual English wording.
 */

const NAME = String.raw`[A-Z]{1,2}\.\d{1,2}[a-z]?`;
const NAME_LIST = String.raw`${NAME}(?:\s*(?:,|i|oraz|and|\+|\/)\s*${NAME})*`;
const LIST = String.raw`\d+(?:\s*-\s*\d+)*`;
const STITCHES = String.raw`(?:ocz\p{L}*|sts|stitches)`;

const numbers = (s: string): number[] =>
  s
    .split('-')
    .map((x) => Number(x.trim()))
    .filter((x) => Number.isFinite(x));

const namesIn = (s: string): string[] => [...s.matchAll(new RegExp(NAME, 'g'))].map((m) => m[0]);

/**
 * Values of a per-size list for the sizes `group` (indices into the project's sizes): one value
 * per size, or one for all; a shorter list belongs to the last sizes of the group ("only in sizes
 * M and L"). The result has one entry per project size, null where the text gives none.
 */
function perSize(
  values: readonly number[],
  group: readonly number[],
  n: number,
): (number | null)[] {
  const out: (number | null)[] = Array.from({ length: n }, () => null);
  if (values.length === 1 && group.length > 1) {
    for (const s of group) out[s] = values[0] ?? null;
    return out;
  }
  const shift = group.length - values.length;
  if (shift < 0) return out;
  values.forEach((v, i) => {
    const s = group[i + shift];
    if (s !== undefined) out[s] = v;
  });
  return out;
}

/** Size groups of the text: "ROZMIARY S, M i L:", "SIZES XL, XXL and XXXL:", "WSZYSTKIE ROZMIARY:". */
function sizeGroups(text: string, sizes: readonly string[]): { at: number; group: number[] }[] {
  const all = sizes.length > 0 ? sizes.map((_, i) => i) : [0];
  const out: { at: number; group: number[] }[] = [{ at: 0, group: all }];
  const re =
    /(?:^|\n)\s*(?:(wszystkie rozmiary|all sizes)|(?:rozmiar\p{L}*|sizes?)\s+([^\n:]{1,60}?))\s*:/giu;
  for (const m of text.matchAll(re)) {
    if (m[1]) {
      out.push({ at: m.index, group: all });
      continue;
    }
    const labels = (m[2] ?? '')
      .split(/\s*(?:,|\bi\b|\band\b|-|–)\s*/u)
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean);
    const group = sizes.flatMap((s, i) => (labels.includes(s.toLowerCase()) ? [i] : []));
    if (group.length > 0 && group.length === labels.length) out.push({ at: m.index, group });
  }
  return out;
}

/** One arrow of the text, with its numbers per project size (null where it is not worked). */
export interface TextArrow {
  /** Its number in the text ("Strzałka-3" → 3). */
  readonly n: number;
  /** Stitches after the arrow's round. */
  readonly total: readonly (number | null)[];
  /** Stitches added in it (negative: decreased). */
  readonly added: readonly (number | null)[];
  /** Width of the motif worked after it ("… motywów po 6 oczek"). */
  readonly width: readonly (number | null)[];
}

/** The arrows the text describes, by number; several size groups merge into one list. */
export function textArrows(text: string, sizes: readonly string[]): TextArrow[] {
  const n = Math.max(1, sizes.length);
  const groups = sizeGroups(text, sizes);
  const groupAt = (at: number) => [...groups].reverse().find((g) => g.at <= at)?.group ?? [];
  const byNumber = new Map<
    number,
    { total: (number | null)[]; added: (number | null)[]; width: (number | null)[] }
  >();
  const head = /(?:strza[łl]k\p{L}*|arrow)\s*[-–]?\s*(\d{1,2})\s*(?:\([^)]{0,200}\))?\s*:/giu;
  const heads = [...text.matchAll(head)];
  heads.forEach((m, i) => {
    const num = Number(m[1]);
    const end = Math.min(heads[i + 1]?.index ?? text.length, m.index + m[0].length + 400);
    const body = text.slice(m.index + m[0].length, end);
    const total = new RegExp(String.raw`=\s*(${LIST})\s*${STITCHES}`, 'iu').exec(body);
    if (!total?.[1]) return;
    const change = new RegExp(
      String.raw`(dod\p{L}*|zamkn\p{L}*|uj\p{L}*|increase|decrease)\s+(${LIST})\s*${STITCHES}`,
      'iu',
    ).exec(body);
    const width = new RegExp(
      String.raw`po\s+(\d+)\s*${STITCHES}|of\s+(\d+)\s*${STITCHES}`,
      'iu',
    ).exec(body.slice(total.index));
    const group = groupAt(m.index);
    const sign = change?.[1] && /zamkn|uj|decrease/iu.test(change[1]) ? -1 : 1;
    const t = perSize(numbers(total[1]), group, n);
    const a = change?.[2]
      ? perSize(
          numbers(change[2]).map((v) => v * sign),
          group,
          n,
        )
      : t.map(() => null);
    const w = width ? perSize([Number(width[1] ?? width[2])], group, n) : t.map(() => null);
    const entry = byNumber.get(num) ?? {
      total: Array.from({ length: n }, () => null),
      added: Array.from({ length: n }, () => null),
      width: Array.from({ length: n }, () => null),
    };
    for (let s = 0; s < n; s++) {
      if (t[s] === null) continue;
      entry.total[s] = t[s] ?? null;
      entry.added[s] = a[s] ?? null;
      entry.width[s] = w[s] ?? null;
    }
    byNumber.set(num, entry);
  });
  return [...byNumber.entries()].sort((a, b) => a[0] - b[0]).map(([num, e]) => ({ n: num, ...e }));
}

/** The charts the arrows are drawn in, in order ("oznaczonych strzałką w schematach A.1 i A.2"). */
export function arrowCharts(text: string): string[] {
  const out: string[] = [];
  const re = new RegExp(
    String.raw`(?:strza[łl]k\p{L}*|arrows?)\s+(?:w|in)\s+(?:schemat\p{L}*|charts?|diagrams?)\s+(${NAME_LIST})`,
    'giu',
  );
  for (const m of text.matchAll(re))
    for (const name of namesIn(m[1] ?? '')) if (!out.includes(name)) out.push(name);
  return out;
}

/** The width of a chart's motif, when the text gives it ("wg schematu A.3 po 6 oczek"). */
export function chartWidths(text: string): Map<string, number> {
  const out = new Map<string, number>();
  const res = [
    new RegExp(String.raw`schemat\p{L}*\s+(${NAME})\s+po\s+(\d+)\s*${STITCHES}`, 'giu'),
    new RegExp(
      String.raw`schemat\p{L}*\s+(${NAME})[^.\n]{0,60}?motyw\p{L}*\s+po\s+(\d+)\s*${STITCHES}`,
      'giu',
    ),
    new RegExp(String.raw`(${NAME})[^.\n]{0,60}?repeats?\s+of\s+(\d+)\s*${STITCHES}`, 'giu'),
  ];
  for (const re of res)
    for (const m of text.matchAll(re)) {
      const name = m[1];
      const w = Number(m[2]);
      if (name && w > 0 && !out.has(name)) out.set(name, w);
    }
  return out;
}

/** Charts worked together (side by side) for a while, then the next step. */
export interface TextStep {
  /** Chart names, side by side in working order. */
  readonly charts: readonly string[];
  /** Stitches of the round (or row) while it is worked, per size, if the text says. */
  readonly stitches?: readonly number[];
  /** Worked until the piece measures this (cm, per size); absent: worked once. */
  readonly cm?: readonly number[];
}

/** A per-size list of `n` values (or one value for every size). */
function sized(s: string, n: number): number[] | null {
  const v = numbers(s);
  if (v.length === n) return v;
  if (v.length === 1 && v[0] !== undefined) return Array.from({ length: n }, () => v[0] ?? 0);
  return null;
}

/**
 * The charts of a part's text in working order. "Przerabiać schemat A.1", "powtarzać schemat A.3
 * na wysokość", "work A.2" start or continue a step; charts named in one sentence are worked side
 * by side. "Kończyć schemat A.2" (finish a chart begun in an earlier part) is not a new step.
 */
export function textSteps(text: string, sizeCount: number): TextStep[] {
  const n = Math.max(1, sizeCount);
  const re = new RegExp(
    String.raw`\b(?:przerabia[ćc]|przerobi[ćc]|powtarza[ćc]|work|repeat)\s+(?:(?:w sumie|łącznie|in total)\s+${LIST}\s+(?:raz\p{L}*|times)\s+)?(?:(?:wg|according to)\s+)?(?:schemat\p{L}*|charts?|diagrams?)\s+(${NAME_LIST})`,
    'giu',
  );
  // "Kończyć schemat A.2 – … dalej przerabiać schematy A.2": finishing a chart begun before.
  const sentenceStart = (at: number) => {
    const before = text.slice(0, at);
    const end = Math.max(...['. ', '.\n', '! ', '!\n'].map((p) => before.lastIndexOf(p)));
    return end < 0 ? 0 : end + 1;
  };
  const found = [...text.matchAll(re)]
    .filter(
      (m) =>
        !/(?:^|\s)(?:kończy[ćc]|konczy[ćc]|dokończy[ćc]|finish|complete)(?=[\s,–-]|$)/iu.test(
          text.slice(sentenceStart(m.index), m.index),
        ),
    )
    .map((m) => ({ at: m.index, names: namesIn(m[1] ?? '') }));
  // Mentions in one sentence are one step (side by side).
  const steps: { at: number; names: string[] }[] = [];
  for (const f of found) {
    const prev = steps[steps.length - 1];
    const between = prev ? text.slice(prev.at, f.at) : '';
    if (prev && !/[.!?](?:\s|$)/u.test(between)) {
      for (const name of f.names) if (!prev.names.includes(name)) prev.names.push(name);
    } else steps.push({ at: f.at, names: [...f.names] });
  }
  // The same charts again ("powtarzać schemat A.3 na wysokość") continue the step.
  const key = (names: readonly string[]) => [...names].sort().join();
  const merged = steps.filter((s, i) => i === 0 || key(s.names) !== key(steps[i - 1]?.names ?? []));
  const count = new RegExp(String.raw`=\s*(${LIST})\s*${STITCHES}`, 'giu');
  const until = new RegExp(
    String.raw`(?:aż|until)[^.]{0,120}?(?:wynosi|measures)\s+(?:ok\.\s*|approx\.\s*|about\s+)?(${LIST})\s*cm`,
    'iu',
  );
  return merged.map((s, i) => {
    const end = merged[i + 1]?.at ?? text.length;
    const span = text.slice(s.at, end);
    let stitches: number[] | null = null;
    // "= 213-233 oczek. Dalej przerabiać schematy A.3 i A.4": the count just before the step.
    const lastIn = (from: number, to: number) => {
      let v: number[] | null = null;
      for (const m of text.slice(from, to).matchAll(count)) v = (m[1] ? sized(m[1], n) : null) ?? v;
      return v;
    };
    // The step's own sentence first ("przerabiać schemat A.3 – w pierwszym okrążeniu dodać 2
    // oczka = 192-210 oczek"), then the sentence before it.
    const own = /[.!?](?:\s|$)/u.exec(span);
    for (const m of span.slice(0, own ? own.index + 1 : span.length).matchAll(count)) {
      stitches = m[1] ? sized(m[1], n) : null;
      if (stitches) break;
    }
    stitches ??= lastIn(sentenceStart(Math.max(0, sentenceStart(s.at) - 2)), s.at);
    // A count in the step's text is the one it is worked over — unless it comes after an arrow
    // (the stitches grow while the step is worked; it starts with the count before).
    const arrow = /strza[łl]k|arrow/iu.exec(span)?.index ?? Infinity;
    for (const m of stitches ? [] : span.matchAll(count)) {
      if (m.index > arrow) break;
      stitches = m[1] ? sized(m[1], n) : null;
      if (stitches) break;
    }
    // Not said while the step is worked: the count the part had before it.
    stitches ??= lastIn(0, s.at);
    const cmMatch = until.exec(span);
    const cm = cmMatch?.[1] ? sized(cmMatch[1], n) : null;
    return {
      charts: s.names,
      ...(stitches ? { stitches } : {}),
      ...(cm ? { cm } : {}),
    };
  });
}

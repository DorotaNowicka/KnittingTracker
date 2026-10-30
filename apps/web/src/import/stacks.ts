import type { Locale, ProjectKind } from '@kt/core';
import {
  bandRows,
  chainStack,
  chartForSize,
  type ChartPlan,
  type DraftChart,
  type StackBand,
  type TextStep,
} from '@kt/importer';
import { trackedPartsOf, kindItems, type Elements, type StackEntry } from './elements';

/**
 * Parts the pattern text works as a stack of charts — a yoke's bands between increase arrows, a
 * body's motif to a length and then a border — turned into the entries of `BuildInput.stacks`, at
 * one size. Pure, so the session and the tests share it.
 */

/** A recognised chart as the check holds it. */
export interface StackChart {
  readonly name: string;
  readonly rows: readonly (readonly string[])[];
  readonly colors?: readonly (readonly (string | null)[])[];
}

/** "1 oczko", "2 oczka", "5 oczek". */
function stitchWord(n: number, lang: Locale): string {
  const a = Math.abs(n);
  if (lang === 'en') return a === 1 ? 'stitch' : 'stitches';
  if (a === 1) return 'oczko';
  const last = a % 10;
  const tens = a % 100;
  return last >= 2 && last <= 4 && (tens < 12 || tens > 14) ? 'oczka' : 'oczek';
}

/** The message of an arrow's round: how many stitches to add evenly, and how many there will be. */
export function arrowMessage(arrow: StackBand['arrow'], lang: Locale): string {
  if (!arrow) return '';
  const { n, added, total } = arrow;
  const head = lang === 'en' ? `Arrow ${n}` : `Strzałka ${n}`;
  if (added === null || added === 0) {
    const after =
      total === null
        ? ''
        : lang === 'en'
          ? ` — ${total} ${stitchWord(total, lang)}`
          : ` – ${total} ${stitchWord(total, lang)}`;
    return lang === 'en'
      ? `${head}: change the stitch count evenly as the pattern says${after}.`
      : `${head}: równomiernie zmień liczbę oczek, jak podaje opis${after}.`;
  }
  const verb =
    lang === 'en'
      ? added > 0
        ? 'increase'
        : 'decrease'
      : added > 0
        ? 'równomiernie dodaj'
        : 'równomiernie zamknij';
  const count = `${Math.abs(added)} ${stitchWord(added, lang)}`;
  if (lang === 'en')
    return `${head}: ${verb} ${count} evenly${total === null ? '' : ` — ${total} ${stitchWord(total, lang)} after it`}.`;
  return `${head}: ${verb} ${count}${total === null ? '' : ` – będzie ${total} ${stitchWord(total, lang)}`}.`;
}

/** The note of an arrow the text gives no numbers for. */
const PLAIN_ARROW: Readonly<Record<Locale, string>> = {
  pl: 'Strzałka w schemacie: równomiernie dodaj (lub zamknij) oczka – ile, podaje opis wzoru.',
  en: 'Arrow in the chart: increase (or decrease) evenly — the pattern text says how many.',
};

const ROWS: Readonly<Record<Locale, string>> = { pl: 'rz.', en: 'rows' };

/** The text steps of a part: its own heading's, or (a body knitted in one piece) its pieces'. */
function stepsOf(steps: Readonly<Record<string, readonly TextStep[]>>, partId: string) {
  const first = (...ids: string[]) => ids.map((id) => steps[id]).find((s) => s && s.length > 0);
  if (partId === 'body') return first('body', 'back', 'front') ?? [];
  // "TYŁ & PRZÓD": one heading for both pieces.
  if (partId === 'front') return first('front', 'back') ?? [];
  return steps[partId] ?? [];
}

const height = (c: StackChart) => c.rows.length;
const width = (c: StackChart) => c.rows[0]?.length ?? 0;

export interface StacksInput {
  readonly plan: ChartPlan;
  readonly charts: readonly StackChart[];
  /** Arrows (rows) per chart, as found beside it. */
  readonly arrows: readonly (readonly number[] | undefined)[];
  /** The text's steps per part id (`partSteps`). */
  readonly steps: Readonly<Record<string, readonly TextStep[]>>;
  readonly kind: ProjectKind;
  readonly elements: Elements;
  /** Index of the size being knitted. */
  readonly size: number;
  readonly lang: Locale;
  /** Parts whose stack the knitter replaced with her own layout ("Popraw" of the whole part). */
  readonly skip?: readonly string[];
}

/**
 * Stacks of the tracked parts at the size, and the charts they take. A part is a stack when its
 * text works charts one after another (two or more entries) or works a chart with arrows; the
 * other parts keep their usual layout.
 */
export function importStacks(input: StacksInput): {
  stacks: Record<string, StackEntry[]>;
  taken: number[];
} {
  const { plan, charts, size, lang } = input;
  const chain = plan.chains[size] ?? [];
  const usedChain = new Set<number>();
  const stacks: Record<string, StackEntry[]> = {};
  const taken = new Set<number>();
  // Charts drawn only for other sizes.
  plan.sizes.forEach((s, i) => {
    if (s && !s.includes(size)) taken.add(i);
  });

  for (const item of kindItems(input.kind)) {
    const state = input.elements[item.id];
    if (!state?.include) continue;
    for (const part of trackedPartsOf(item, state)) {
      if (input.skip?.includes(part.id)) continue;
      const steps = stepsOf(input.steps, part.id);
      const entries: StackEntry[] = [];
      const mineTaken = new Set<number>();
      let fromChain = false;
      const nextId = () => `${part.id}-${entries.length + 1}`;
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        if (!step) continue;
        const idx = step.charts.flatMap((name) => {
          const c = chartForSize(plan, name, size);
          return c === null ? [] : [c];
        });
        const only = idx.length === 1 ? idx[0] : undefined;
        if (only !== undefined && chain.includes(only)) {
          // Charts of the arrows' chain worked one after another: their bands.
          const run = [only];
          while (i + 1 < steps.length) {
            const next = steps[i + 1]?.charts ?? [];
            const c = next.length === 1 && next[0] ? chartForSize(plan, next[0], size) : null;
            if (c === null || !chain.includes(c)) break;
            run.push(c);
            i += 1;
          }
          // A chain begun in an earlier part goes on there ("kończyć schemat A.2").
          const fresh = chain.filter((c) => run.includes(c) && !usedChain.has(c));
          if (fresh.length === 0) continue;
          for (const c of fresh) usedChain.add(c);
          fromChain = true;
          // Sizes drawn with the same charts have the same bands, over their own stitches.
          const n = plan.chains.length;
          const sameChain = plan.chains.map((ch) => ch.join() === chain.join());
          const bySize = plan.chains.map((_, t) =>
            sameChain[t] ? chainStack(plan, fresh, t) : null,
          );
          chainStack(plan, fresh, size).forEach((band, b) => {
            const entry = bandEntry(nextId(), band, plan, charts, lang);
            const perSize = bySize.map((bands) => bands?.[b]?.stitches ?? band.stitches);
            entries.push(
              perSize.every((v): v is number => v !== null) && perSize.length === n
                ? { ...entry, perSize }
                : entry,
            );
            for (const p of band.pieces) mineTaken.add(p.chart);
          });
          continue;
        }
        const own = idx.filter((c) => !usedChain.has(c) && charts[c]);
        if (own.length === 0) continue;
        entries.push(stepEntry(nextId(), own, step, input));
        for (const c of own) mineTaken.add(c);
      }
      // One chart with arrows and no text about it: its bands, one repeat each.
      if (entries.length === 0) {
        const mine = state.charts.filter(
          (c) => !taken.has(c) && (input.arrows[c]?.length ?? 0) > 0,
        );
        const lone = mine.length === 1 ? mine[0] : undefined;
        if (lone !== undefined && state.charts.length === 1) {
          for (const band of chainStack(plan, [lone], size))
            entries.push(bandEntry(nextId(), band, plan, charts, lang));
          fromChain = entries.length > 0;
          mineTaken.add(lone);
        }
      }
      if (entries.length >= 2 || (fromChain && entries.length > 0)) {
        stacks[part.id] = entries;
        for (const c of mineTaken) taken.add(c);
      }
    }
  }
  return { stacks, taken: [...taken].sort((a, b) => a - b) };
}

/** A band of the chain: its rows cut out of the chart(s), over the stitches the text gives. */
function bandEntry(
  id: string,
  band: StackBand,
  plan: ChartPlan,
  charts: readonly StackChart[],
  lang: Locale,
): StackEntry {
  const names = [
    ...new Set(band.pieces.map((p) => plan.base[p.chart] ?? charts[p.chart]?.name ?? '?')),
  ];
  const label = band.pieces
    .map((p) => {
      const base = plan.base[p.chart] ?? charts[p.chart]?.name ?? '?';
      const rows = p.band.from === p.band.to ? `${p.band.from}` : `${p.band.from}–${p.band.to}`;
      return `${base} ${ROWS[lang]} ${rows}`;
    })
    .join(' + ');
  const rows = band.pieces.flatMap((p) => bandRows(charts[p.chart]?.rows ?? [], p.band));
  const colored = band.pieces.some((p) => charts[p.chart]?.colors);
  const colors = colored
    ? band.pieces.flatMap((p) => {
        const c = charts[p.chart];
        return c?.colors
          ? bandRows(c.colors, p.band)
          : bandRows(c?.rows ?? [], p.band).map((r) => r.map(() => null));
      })
    : undefined;
  const chart: DraftChart = { name: label.slice(0, 40), rows, ...(colors ? { colors } : {}) };
  const stitches = band.stitches ?? band.width;
  const message = arrowMessage(band.arrow, lang);
  return {
    id,
    title: names.join(' · '),
    charts: [...new Set(band.pieces.map((p) => p.chart))],
    sequence: [{ chart, stitches }],
    stitches,
    rows: band.rows,
    ...(band.arrow ? { notes: [{ rows: [band.rows], message }] } : {}),
  };
}

/** Charts of a text step, side by side: over the stitches the text gives, once or to a length. */
function stepEntry(
  id: string,
  idx: readonly number[],
  step: TextStep,
  input: StacksInput,
): StackEntry {
  const { charts, size, lang } = input;
  const own = idx.flatMap((c) => (charts[c] ? [{ index: c, chart: charts[c] }] : []));
  const sum = own.reduce((n, c) => n + width(c.chart), 0);
  const stitches = step.stitches?.[size] ?? sum;
  const cm = step.cm?.[size];
  const tallest = Math.max(1, ...own.map((c) => height(c.chart)));
  // Arrows of a chart the text gives no numbers for: a plain note, repeated with the chart.
  const notes = own.flatMap((c) =>
    (input.arrows[c.index] ?? []).map((row) =>
      cm
        ? { every: height(c.chart), from: row, message: PLAIN_ARROW[lang] }
        : { rows: [row], message: PLAIN_ARROW[lang] },
    ),
  );
  return {
    id,
    ...(step.stitches && own.length === 1 ? { perSize: step.stitches } : {}),
    ...(step.cm ? { cmPerSize: step.cm } : {}),
    title: own.map((c) => input.plan.base[c.index] ?? c.chart.name).join(' · '),
    charts: own.map((c) => c.index),
    sequence: own.map((c) => ({ chart: c.chart as DraftChart, stitches: width(c.chart) })),
    stitches,
    ...(cm ? { cm } : { rows: tallest }),
    ...(notes.length > 0 ? { notes } : {}),
  };
}

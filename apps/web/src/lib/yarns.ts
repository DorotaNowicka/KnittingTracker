import { YARN_COLORS, type Project, type Yarn } from '@kt/core';

/**
 * Yarn colours by letter for the grid (colourwork). A pattern whose charts use a letter the project
 * has no yarn for still shows that letter in a colour of its own (the suggested one), so a piece
 * from the library is never drawn blank.
 */
export function yarnColors(yarns: readonly Yarn[] | undefined): Map<string, string> {
  const map = new Map<string, string>();
  [...'ABCDEFGHIJKL'].forEach((letter, i) => map.set(letter, YARN_COLORS[i] ?? '#808080'));
  for (const y of yarns ?? []) map.set(y.id, y.color);
  return map;
}

/** Suggested colours by letter, for previews that don't know the project's yarns. */
export const DEFAULT_YARN_COLORS: ReadonlyMap<string, string> = yarnColors(undefined);

/** The yarns a resolved pattern's charts use (colourwork), main yarn first; empty without colours. */
export function usedYarns(
  charts: readonly { readonly colors?: readonly string[] | undefined }[],
  yarns: readonly Yarn[] | undefined,
  name: (letter: string) => string,
): Yarn[] {
  const letters = new Set<string>();
  for (const c of charts) {
    if (!c.colors) continue;
    letters.add('A');
    for (const row of c.colors) for (const ch of row) if (/[A-L]/.test(ch)) letters.add(ch);
  }
  const colors = yarnColors(yarns);
  return [...letters].sort().map(
    (id) =>
      yarns?.find((y) => y.id === id) ?? {
        id,
        name: name(id),
        color: colors.get(id) ?? '#808080',
      },
  );
}

/** Does any pattern of the project colour a cell with this yarn (charts, pieces or the brush)? */
export function yarnInUse(project: Project, id: string): boolean {
  // A is the main colour: every chart with colours knits its plain cells with it.
  const inChart = (c: { colors?: readonly string[] | undefined }) =>
    id === 'A' ? (c.colors ?? []).length > 0 : (c.colors ?? []).some((row) => row.includes(id));
  return project.patterns.some(
    (p) =>
      p.charts.some(inChart) ||
      (p.design?.motifs ?? []).some(inChart) ||
      (p.design?.colorCells ?? []).some((c) => c.yarn === id),
  );
}

import type { Pattern, RowNote } from '../schema/pattern';
import { uniqueId } from './pattern';

/**
 * Highlighted rows of a row-counter pattern: "row 12: buttonhole", "every 6th row from row 4:
 * cable cross". Rows count from 1 within the pattern.
 */

/** Does the note mark this row? */
export function marksRow(note: RowNote, row: number): boolean {
  if (note.rows?.includes(row)) return true;
  if (note.every === undefined) return false;
  const from = note.from ?? note.every;
  return row >= from && (row - from) % note.every === 0;
}

/** The notes for one row, in the order the knitter added them. */
export function rowNotesAt(pattern: Pick<Pattern, 'rowNotes'>, row: number): RowNote[] {
  return (pattern.rowNotes ?? []).filter((n) => marksRow(n, row));
}

/** The first highlighted row after `row` (up to `last`, if given), or null. */
export function nextMarkedRow(
  pattern: Pick<Pattern, 'rowNotes'>,
  row: number,
  last?: number | null,
): number | null {
  let best: number | null = null;
  for (const n of pattern.rowNotes ?? []) {
    for (const r of n.rows ?? []) if (r > row && (best === null || r < best)) best = r;
    if (n.every !== undefined) {
      const from = n.from ?? n.every;
      const r = row < from ? from : from + (Math.floor((row - from) / n.every) + 1) * n.every;
      if (best === null || r < best) best = r;
    }
  }
  return best !== null && last != null && best > last ? null : best;
}

/**
 * Read a typed row list: "4, 10, 16" or ranges "20-24". Returns the sorted unique rows, or null
 * when something in it is not a row number.
 */
export function parseRowList(text: string): number[] | null {
  const rows = new Set<number>();
  for (const part of text.split(/[,;\s]+/).filter(Boolean)) {
    const m = /^(\d{1,6})(?:[-–](\d{1,6}))?$/.exec(part);
    if (!m) return null;
    const a = Number(m[1]);
    const b = m[2] === undefined ? a : Number(m[2]);
    if (a < 1 || b < a || b - a > 500) return null;
    for (let r = a; r <= b; r++) rows.add(r);
  }
  return [...rows].sort((x, y) => x - y).slice(0, 200);
}

/** A row list as the knitter would type it, with runs as ranges: "4, 10-12". */
export function formatRowList(rows: readonly number[]): string {
  const out: string[] = [];
  let i = 0;
  while (i < rows.length) {
    let j = i;
    while (j + 1 < rows.length && rows[j + 1] === (rows[j] ?? 0) + 1) j++;
    out.push(j - i >= 2 ? `${rows[i]}-${rows[j]}` : rows.slice(i, j + 1).join(', '));
    i = j + 1;
  }
  return out.join(', ');
}

/** Add an empty note (every 2nd row) and return the pattern and the new note's id. */
export function addRowNote(pattern: Pattern): { pattern: Pattern; id: string } {
  const notes = pattern.rowNotes ?? [];
  const id = uniqueId(
    'note',
    notes.map((n) => n.id),
    'note',
  );
  return { pattern: { ...pattern, rowNotes: [...notes, { id, every: 2, message: '' }] }, id };
}

export function updateRowNote(pattern: Pattern, note: RowNote): Pattern {
  return {
    ...pattern,
    rowNotes: (pattern.rowNotes ?? []).map((n) => (n.id === note.id ? note : n)),
  };
}

export function removeRowNote(pattern: Pattern, noteId: string): Pattern {
  const rest = (pattern.rowNotes ?? []).filter((n) => n.id !== noteId);
  if (rest.length > 0) return { ...pattern, rowNotes: rest };
  const { rowNotes: _drop, ...without } = pattern;
  return without;
}

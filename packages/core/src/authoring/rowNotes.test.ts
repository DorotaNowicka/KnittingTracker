import { describe, expect, it } from 'vitest';
import { patternSchema } from '../schema/pattern';
import { blankPattern } from './pattern';
import {
  addRowNote,
  formatRowList,
  marksRow,
  nextMarkedRow,
  parseRowList,
  removeRowNote,
  rowNotesAt,
  updateRowNote,
} from './rowNotes';

describe('row notes', () => {
  it('marks listed rows and every N rows from a start row', () => {
    expect(marksRow({ id: 'a', rows: [3, 7], message: '' }, 7)).toBe(true);
    expect(marksRow({ id: 'a', rows: [3, 7], message: '' }, 5)).toBe(false);
    const every = { id: 'b', every: 6, message: '' };
    expect([1, 6, 12, 13].map((r) => marksRow(every, r))).toEqual([false, true, true, false]);
    const from = { id: 'c', every: 4, from: 3, message: '' };
    expect([1, 3, 5, 7, 11].map((r) => marksRow(from, r))).toEqual([
      false,
      true,
      false,
      true,
      true,
    ]);
  });

  it('finds the notes for a row and the next marked row', () => {
    const p = {
      rowNotes: [
        { id: 'a', rows: [10], message: 'dziurka' },
        { id: 'b', every: 4, from: 2, message: 'warkocz' },
      ],
    };
    expect(rowNotesAt(p, 10).map((n) => n.message)).toEqual(['dziurka', 'warkocz']);
    expect(rowNotesAt(p, 3)).toEqual([]);
    expect(nextMarkedRow(p, 0)).toBe(2);
    expect(nextMarkedRow(p, 2)).toBe(6);
    expect(nextMarkedRow(p, 6)).toBe(10);
    expect(nextMarkedRow({ rowNotes: [{ id: 'a', rows: [10], message: '' }] }, 10)).toBeNull();
    expect(nextMarkedRow(p, 10, 12)).toBeNull();
    expect(nextMarkedRow({}, 1)).toBeNull();
  });

  it('reads and writes row lists', () => {
    expect(parseRowList('12, 4; 20-22 4')).toEqual([4, 12, 20, 21, 22]);
    expect(parseRowList('')).toEqual([]);
    expect(parseRowList('4, x')).toBeNull();
    expect(parseRowList('0')).toBeNull();
    expect(parseRowList('9-3')).toBeNull();
    expect(formatRowList([4, 12, 20, 21, 22, 30, 31])).toBe('4, 12, 20-22, 30, 31');
  });

  it('adds, edits and removes notes and stays a valid pattern', () => {
    const { pattern, id } = addRowNote(blankPattern('p', 'Ściągacz'));
    const edited = updateRowNote(pattern, { id, rows: [5], message: 'zmień kolor' });
    expect(patternSchema.parse(edited).rowNotes).toEqual([
      { id, rows: [5], message: 'zmień kolor' },
    ]);
    expect('rowNotes' in removeRowNote(edited, id)).toBe(false);
  });
});

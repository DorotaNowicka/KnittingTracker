import { describe, expect, it } from 'vitest';
import { CELL_PX_MAX, CELL_PX_MIN, clampCellPx } from './index';

describe('clampCellPx', () => {
  it('keeps values inside the range', () => {
    expect(clampCellPx(16)).toBe(16);
  });
  it('clamps to the bounds', () => {
    expect(clampCellPx(1)).toBe(CELL_PX_MIN);
    expect(clampCellPx(1000)).toBe(CELL_PX_MAX);
  });
  it('treats non-finite values as the minimum', () => {
    expect(clampCellPx(Number.NaN)).toBe(CELL_PX_MIN);
    expect(clampCellPx(Number.POSITIVE_INFINITY)).toBe(CELL_PX_MIN);
  });
});

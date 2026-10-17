/**
 * @kt/test-fixtures — synthetic, self-authored chart fixtures for tests and visual regression.
 *
 * Rule (R-5): nothing in this package may be copied or derived from third-party patterns. Fixtures
 * are invented for testing. Real-pattern golden data lives only in the git-ignored `local/` folder.
 *
 * Encoding preview (finalised in M1, ADR-2): rows bottom→top, columns left→right in RS view,
 * one character per cell, mapped through a palette.
 */

export interface RawChartFixture {
  readonly name: string;
  readonly palette: Readonly<Record<string, string>>;
  /** rows[0] is chart row 1 (bottom). */
  readonly rows: readonly string[];
}

/** A 4×4 seed/moss texture: the simplest chart with both knit and purl cells. */
export const seedStitch4x4: RawChartFixture = {
  name: 'Seed 4×4',
  palette: { k: 'std:k', p: 'std:p' },
  rows: ['kpkp', 'pkpk', 'kpkp', 'pkpk'],
};

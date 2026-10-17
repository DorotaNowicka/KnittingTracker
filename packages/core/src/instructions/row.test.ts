import { describe, expect, it } from 'vitest';
import { makePattern, zigzag } from '../__tests__/fixtures';
import { resolveStage } from '../layout/resolve';
import type { Pattern } from '../schema/pattern';
import { rowInstructions } from './row';

const compact = (p: Pattern, stageId: string, row: number) =>
  rowInstructions(resolveStage(p, stageId, 0), row).tokens.map(
    (t) => `${t.symbolId}${t.count > 1 ? `×${t.count}` : ''}${t.problem ? '!' : ''}`,
  );

describe('rowInstructions', () => {
  it('lists an RS round row in work order with runs merged and cables counted once', () => {
    const p = makePattern();
    const r = rowInstructions(resolveStage(p, 'body', 0), 1);
    expect(r.side).toBe('RS');
    expect(r.direction).toBe('right-to-left');
    // Seed (5) → rope (6) → zigzag (4) → rope with offset (6) → seed (5).
    // Runs merge across zone borders, as a knitter would read them.
    expect(compact(p, 'body', 1)).toEqual([
      'std:p',
      'std:k',
      'std:p',
      'std:k', // seed: chart columns 2,1,2,1 of row 1 ("kp")
      'std:p×2', // last seed stitch + first rope stitch
      'cable:2-2-lc', // rope row 1, one crossing over 4 stitches
      'std:p×4', // rope edge + zigzag row 1 "kppp" read right to left
      'std:k',
      'std:p',
      'std:k×4', // rope (offset 3) row 4
      'std:p×2',
      'std:k',
      'std:p',
      'std:k',
      'std:p', // rope edge + seed
    ]);
    const cable = r.tokens.find((t) => t.symbolId === 'cable:2-2-lc');
    expect(cable).toMatchObject({ fromStitch: 7, toStitch: 10, count: 1 });
  });

  it('translates WS rows: reversed order and knit ↔ purl', () => {
    const p = makePattern();
    const r = rowInstructions(resolveStage(p, 'back', 0), 1);
    expect(r.side).toBe('WS');
    expect(r.direction).toBe('left-to-right');
    // Work order on WS: stitches 7 → 1. Zigzag row 1 "kppp" from its left edge, then the seed
    // stitches 3, 2, 1 (chart columns 2, 1, 2 of "kp"). Chart k is worked as p and vice versa.
    expect(r.tokens.map((t) => [t.chartSymbolId, t.symbolId, t.count])).toEqual([
      ['std:k', 'std:p', 1],
      ['std:p', 'std:k', 4],
      ['std:k', 'std:p', 1],
      ['std:p', 'std:k', 1],
    ]);
  });

  it('flags cables on WS rows and keeps explicit WS texts', () => {
    const p = makePattern({
      charts: [
        zigzag,
        {
          id: 'inc',
          name: 'I',
          width: 2,
          height: 1,
          palette: { m: 'std:m1l', k: 'std:k' },
          rows: ['km'],
        },
      ],
      stages: [
        {
          id: 'flat',
          name: 'Flat',
          construction: 'flat',
          firstRowSide: 'WS',
          layout: [
            { kind: 'chart', placementId: 'i', chartId: 'inc' },
            { kind: 'chart', placementId: 'z', chartId: 'zigzag', rowOffset: 1 },
          ],
        },
      ],
    });
    const tokens = rowInstructions(resolveStage(p, 'flat', 0), 1).tokens;
    expect(tokens[0]).toMatchObject({ chartSymbolId: 'cable:1-1-rpc', problem: 'ws-unsupported' });
    const inc = tokens.find((t) => t.chartSymbolId === 'std:m1l');
    expect(inc?.wsText?.pl).toContain('Dodaj');
  });

  it('skips "no stitch" cells', () => {
    const p = makePattern({
      stages: [
        {
          id: 'd',
          name: 'D',
          construction: 'round',
          firstRowSide: 'RS',
          layout: [{ kind: 'chart', placementId: 'd', chartId: 'decrease' }],
        },
      ],
    });
    expect(compact(p, 'd', 1)).toEqual(['std:k×2', 'std:k2tog']);
  });
});

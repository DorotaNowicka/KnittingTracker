import type { ImportResult } from '@kt/importer';
import { parseDescription } from '@kt/importer';
import { beforeEach, describe, expect, it } from 'vitest';
import { createMemoryStorage } from '../lib/storage';
import { setStorageForTests, useLibrary } from '../state/library';
import { draftOf, useImport } from './session';

const cell = (symbolId: string, part = 0, width = 1, confidence = 0.9) => ({
  symbolId,
  part,
  width,
  confidence,
  candidates: [{ value: symbolId, score: 0.9 }],
});

/** A recognised 4×2 chart (row 1 first): a 2/2 cable on row 2. */
const recognized = {
  cols: 4,
  rows: 2,
  cells: [
    [cell('std:p'), cell('std:k', 0, 1, 0.2), cell('std:k'), cell('std:p')],
    [
      cell('cable:2-2-lc', 0, 4),
      cell('cable:2-2-lc', 1, 4),
      cell('cable:2-2-lc', 2, 4),
      cell('cable:2-2-lc', 3, 4),
    ],
  ],
};

const result = (): ImportResult => ({
  kind: 'pdf',
  sources: [],
  charts: [
    {
      source: 0,
      name: 'C.1',
      grid: {
        xs: [],
        ys: [],
        cols: 4,
        rows: 2,
        pitch: 10,
        box: { x: 0, y: 0, w: 40, h: 20 },
        regularity: 1,
      },
      recognized,
      view: { x: 0, y: 0, w: 40, h: 20 },
    },
  ],
  legend: [
    {
      page: 0,
      icon: { rgba: new Uint8ClampedArray(4), width: 1, height: 1 },
      gray: { width: 1, height: 1, data: new Uint8Array(1) },
      cells: 1,
      text: 'lewe oczko',
      meaning: null,
      matches: [],
      symbolId: 'std:p',
      confidence: 0.9,
    },
  ],
  symbols: ['std:k', 'std:p', 'cable:2-2-lc'],
  text: '',
  description: parseDescription(''),
  notes: [],
});

beforeEach(() => {
  setStorageForTests(createMemoryStorage());
  useLibrary.setState({ status: 'idle', patterns: [], projects: [], progress: {}, persist: null });
  useImport.getState().reset();
});

describe('import session', () => {
  it('turns recognised cells into editable rows with confidences', () => {
    const d = draftOf(recognized, 'C.1');
    expect(d.rows).toEqual([
      ['std:p', 'std:k', 'std:k', 'std:p'],
      ['cable:2-2-lc', '.', '.', '.'],
    ]);
    expect(d.confidence[0]?.[1]).toBe(0.2);
  });

  it('creates a pattern from the confirmed charts, legend and description', async () => {
    const r = result();
    useImport.setState({
      status: 'verify',
      result: r,
      charts: [draftOf(recognized, 'C.1')],
      legend: ['std:p'],
    });
    useImport
      .getState()
      .setDescription(
        'ROZMIARY: S - M\nRazem = 8-10 oczek. Dalej: C.1 ponad 4-6 oczkami, C.1, C.1 ponad 0-0 oczkami.',
      );
    expect(useImport.getState().description.parsed.sizes?.value).toEqual(['S', 'M']);
    useImport.getState().updateChart(0, { name: 'C.1' });
    useImport.getState().setLegend(0, 'std:p');
    const id = await useImport.getState().create({
      title: 'Test',
      sizes: ['S', 'M'],
      stageName: 'Korpus',
      sections: ['Przód', 'Tył'],
    });
    const stored = useLibrary.getState().patterns.find((p) => p.id === id);
    expect(stored?.pattern.charts[0]?.name).toBe('C.1');
    expect(stored?.pattern.legend).toEqual([{ symbolId: 'std:p', text: 'lewe oczko' }]);
    expect(stored?.pattern.stages[0]?.expectedStitches).toEqual([8, 10]);
    expect(stored?.pattern.stages[0]?.layout.filter((s) => s.kind === 'chart')).toHaveLength(3);
  });

  it('leaves out charts the user excluded', async () => {
    useImport.setState({
      status: 'verify',
      result: result(),
      charts: [{ ...draftOf(recognized, 'C.1'), include: false }],
      legend: [null],
    });
    const id = await useImport
      .getState()
      .create({ title: '', sizes: ['1'], stageName: 'Korpus', sections: ['A', 'B'] });
    const stored = useLibrary.getState().patterns.find((p) => p.id === id);
    expect(stored?.pattern.charts).toEqual([]);
    expect(stored?.pattern.legend).toEqual([]);
    expect(stored?.pattern.title).toBe('Wzór');
  });
});

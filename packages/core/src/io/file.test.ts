import { describe, expect, it } from 'vitest';
import { makeProject, roundPattern } from '../__tests__/fixtures';
import { FILE_FORMATS, SCHEMA_VERSION } from '../basics';
import { progressSchema, projectSchema, type CustomSymbol } from '../schema/pattern';
import { migrate, readProjectFile, serializeProject, type Migration } from './file';

describe('project files', () => {
  it('round-trips a project through serialize → read', () => {
    const symbols: CustomSymbol[] = [
      {
        id: 'user:bobble',
        numbers: { own: 'B' },
        family: 'other' as never,
        width: 1,
        consumes: 1,
        produces: 1,
        worked: true,
        ws: { mode: 'explicit', text: { pl: 'lewe', en: 'p' } },
        glyph: { primitives: [{ kind: 'circle', center: [0.5, 0.5], radius: 0.3, fill: 'ink' }] },
        label: { pl: 'bąbel', en: 'bobble' },
        description: { pl: 'Bąbel.', en: 'Bobble.' },
      },
    ];
    const project = makeProject({ designer: 'Me', patterns: [{ ...roundPattern, symbols }] });
    // 'other' is not a valid family: reading must reject it with a precise path.
    const rejected = readProjectFile(serializeProject(project));
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.errors[0]).toMatch(/^patterns\.0\.symbols\.0\.family/);

    const symbol = symbols[0];
    if (!symbol) throw new Error('missing symbol');
    const good = makeProject({
      designer: 'Me',
      patterns: [{ ...roundPattern, symbols: [{ ...symbol, family: 'basic' as const }] }],
    });
    const text = serializeProject(good, new Date('2026-10-15T20:00:00Z'));
    const json = JSON.parse(text) as Record<string, unknown>;
    expect(json).toMatchObject({
      format: FILE_FORMATS.project,
      schemaVersion: SCHEMA_VERSION,
      exportedAt: '2026-10-15T20:00:00.000Z',
    });
    const back = readProjectFile(text);
    expect(back).toEqual({ ok: true, value: good });
  });

  it('rejects garbage, foreign files, newer versions and oversized input', () => {
    expect(readProjectFile('{ nope')).toMatchObject({
      ok: false,
      errors: ['The file is not valid JSON.'],
    });
    expect(readProjectFile('[]')).toMatchObject({ ok: false });
    expect(readProjectFile(JSON.stringify({ format: 'other' }))).toMatchObject({ ok: false });
    expect(
      readProjectFile(
        JSON.stringify({
          format: FILE_FORMATS.project,
          schemaVersion: SCHEMA_VERSION + 1,
          project: {},
        }),
      ),
    ).toMatchObject({ ok: false, errors: [expect.stringMatching(/newer version/)] });
    expect(
      readProjectFile(JSON.stringify({ format: FILE_FORMATS.pattern, pattern: {} })),
    ).toMatchObject({ ok: false });
    // An old pattern file that is damaged is reported against the old pattern schema.
    const damaged = readProjectFile(
      JSON.stringify({ format: FILE_FORMATS.pattern, schemaVersion: 2, pattern: { id: 'x' } }),
    );
    expect(damaged.ok).toBe(false);
    if (!damaged.ok) expect(damaged.errors[0]).toMatch(/^revision:/);
    expect(
      readProjectFile(
        JSON.stringify({
          format: FILE_FORMATS.project,
          schemaVersion: SCHEMA_VERSION,
          project: {},
        }),
      ),
    ).toMatchObject({ ok: false, errors: expect.arrayContaining([expect.stringMatching(/^id:/)]) });
    expect(readProjectFile('x'.repeat(20 * 1024 * 1024 + 1))).toMatchObject({
      ok: false,
      errors: ['The file is too large.'],
    });
  });

  it('migrates step by step and refuses gaps', () => {
    const migrations: Record<number, Migration> = {
      1: (d) => ({ ...d, renamed: d['old'], old: undefined }),
      2: (d) => ({ ...d, extra: true }),
    };
    const result = migrate({ schemaVersion: 1, old: 'x' }, migrations, 3);
    expect(result).toEqual({
      ok: true,
      value: { schemaVersion: 3, renamed: 'x', old: undefined, extra: true },
    });
    expect(migrate({ schemaVersion: 0 }, migrations, 3)).toMatchObject({
      ok: false,
      errors: ['No migration from schema version 0.'],
    });
    expect(migrate('text', migrations, 3)).toMatchObject({ ok: false });
    expect(migrate({ schemaVersion: -1 }, migrations, 3)).toMatchObject({ ok: false });
    expect(migrate({ schemaVersion: SCHEMA_VERSION })).toEqual({
      ok: true,
      value: { schemaVersion: SCHEMA_VERSION },
    });
  });
});

describe('project schema', () => {
  it('accepts patterns with changed charts and rejects bad progress', () => {
    const project = makeProject({
      patterns: [
        {
          ...roundPattern,
          modifications: [
            {
              kind: 'replaceChart',
              chartId: 'seed',
              chart: {
                id: 'st',
                name: 'St',
                width: 1,
                height: 1,
                palette: { k: 'std:k' },
                rows: ['k'],
              },
              note: 'Filler worked as plain knit',
            },
          ],
        },
      ],
      finishedRows: { body: 12 },
    });
    expect(projectSchema.safeParse(project).success).toBe(true);
    expect(projectSchema.safeParse({ ...project, finishedRows: { body: -1 } }).success).toBe(false);
    expect(progressSchema.safeParse({ done: -1, undo: [], redo: [] }).success).toBe(false);
  });
});

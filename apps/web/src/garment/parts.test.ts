import { blankProject, PROJECT_KIND_INFO, projectSchema } from '@kt/core';
import { describe, expect, it } from 'vitest';
import { addItemPatterns, itemPatterns } from './parts';

const item = (kind: 'sweater' | 'socks', id: string) => {
  const found = PROJECT_KIND_INFO[kind].items.find((i) => i.id === id);
  if (!found) throw new Error(id);
  return found;
};

const project = () =>
  blankProject({
    id: 'p1',
    name: 'Sweter',
    kind: 'sweater',
    sizes: ['M'],
    now: '2026-10-24T10:00:00.000Z',
  });

describe('patterns of garment parts', () => {
  it('adds a blank pattern for a part, named in the UI language, and makes it active', () => {
    const r = addItemPatterns(project(), 'sweater', item('sweater', 'sleeve'), null, 'pl');
    expect(r.patternId).toBe('sleeve');
    expect(r.project.patterns.map((p) => [p.id, p.name])).toEqual([['sleeve', 'Rękaw']]);
    expect(r.project.activePatternId).toBe('sleeve');
    expect(projectSchema.safeParse(r.project).success).toBe(true);
    expect(itemPatterns(r.project, item('sweater', 'sleeve'))).toHaveLength(1);
    expect(itemPatterns(r.project, item('sweater', 'neck'))).toHaveLength(0);
  });

  it('keeps the knitting order whatever order the parts are created in', () => {
    let p = project();
    for (const id of ['neck', 'sleeve', 'bottom-rib']) {
      p = addItemPatterns(p, 'sweater', item('sweater', id), null, 'en').project;
    }
    const body = addItemPatterns(p, 'sweater', item('sweater', 'body'), 'pieces', 'en');
    expect(body.patternId).toBe('back');
    expect(body.project.patterns.map((x) => x.name)).toEqual([
      'Bottom ribbing',
      'Back',
      'Front',
      'Sleeve',
      'Neckline / collar',
    ]);
    // The first created part stays the one "knit next" opens.
    expect(body.project.activePatternId).toBe('neck');
    expect(itemPatterns(body.project, item('sweater', 'body')).map((x) => x.id)).toEqual([
      'back',
      'front',
    ]);
  });

  it('puts parts before patterns that are not garment parts', () => {
    const base = blankProject({
      id: 'p2',
      name: 'Skarpety',
      kind: 'socks',
      sizes: ['38'],
      patternName: 'Mój wzór',
      now: '2026-10-24T10:00:00.000Z',
    });
    const r = addItemPatterns(base, 'socks', item('socks', 'heel'), null, 'pl');
    expect(r.project.patterns.map((x) => x.name)).toEqual(['Pięta', 'Mój wzór']);
  });
});

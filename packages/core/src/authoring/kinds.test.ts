import { describe, expect, it } from 'vitest';
import { PROJECT_KINDS, projectSchema } from '../schema/pattern';
import { blankProject } from './pattern';
import { PROJECT_KIND_INFO, PROJECT_KIND_LIST, type KindItem } from './kinds';

const ids = (items: readonly KindItem[]) =>
  items.flatMap((i) =>
    i.type === 'part' ? [i.id] : i.options.flatMap((o) => o.parts.map((p) => `${i.id}:${p.id}`)),
  );

describe('project kinds', () => {
  it('lists the nine kinds in order, each with its parts', () => {
    expect(PROJECT_KIND_LIST.map((k) => k.id)).toEqual([...PROJECT_KINDS]);
    expect(PROJECT_KIND_INFO.sweater.items.map((i) => i.label.pl)).toEqual([
      'Ściągacz dołu',
      'Korpus',
      'Karczek',
      'Rękaw',
      'Ściągacz rękawa',
      'Dekolt / golf',
    ]);
    expect(PROJECT_KIND_INFO.custom.items).toEqual([]);
    expect(PROJECT_KIND_INFO.socks.pair).toBe(true);
  });

  it('names a main item that exists in every kind with parts', () => {
    for (const kind of PROJECT_KIND_LIST) {
      if (kind.items.length === 0) continue;
      expect(
        kind.items.some((i) => i.id === kind.main),
        kind.id,
      ).toBe(true);
    }
  });

  it('has unique part ids per kind and labels in both languages', () => {
    for (const kind of PROJECT_KIND_LIST) {
      const list = ids(kind.items);
      expect(new Set(list).size, kind.id).toBe(list.length);
      for (const item of kind.items) {
        expect(item.label.pl && item.label.en, `${kind.id}/${item.id}`).toBeTruthy();
      }
    }
  });

  it('is stored on a new project', () => {
    const p = blankProject({
      id: 'p',
      name: 'Sweter',
      kind: 'sweater',
      now: '2026-10-22T10:00:00Z',
    });
    expect(p.kind).toBe('sweater');
    expect(projectSchema.safeParse(p).success).toBe(true);
    expect(projectSchema.safeParse({ ...p, kind: 'blanket' }).success).toBe(false);
    expect(blankProject({ id: 'q', name: 'x', now: '2026-10-22T10:00:00Z' }).kind).toBeUndefined();
  });

  it('lists every item exactly once in the other knitting direction', () => {
    for (const info of PROJECT_KIND_LIST) {
      if (!info.otherWay) continue;
      expect([...info.otherWay.order].sort(), info.id).toEqual(info.items.map((i) => i.id).sort());
    }
  });
});

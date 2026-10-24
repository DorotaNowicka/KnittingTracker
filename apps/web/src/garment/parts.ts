import {
  blankPattern,
  insertPattern,
  PROJECT_KIND_INFO,
  type KindItem,
  type Locale,
  type Pattern,
  type Project,
  type ProjectKind,
} from '@kt/core';

/**
 * A project's garment parts and its patterns: a part's pattern has the part's id (e.g. "sleeve"),
 * whether it was built from a PDF or created here. Pure, shared by the screens and the tests.
 */

/** Ids of the parts an item stands for: itself, or the parts of every option of a choice. */
export const itemPartIds = (item: KindItem): readonly string[] =>
  item.type === 'part' ? [item.id] : item.options.flatMap((o) => o.parts.map((p) => p.id));

/** The project's patterns that make this item (none yet: the part has no pattern). */
export const itemPatterns = (project: Project, item: KindItem): readonly Pattern[] => {
  const ids = itemPartIds(item);
  return project.patterns.filter((p) => ids.includes(p.id));
};

/** Every part id of the kind, in its usual knitting order. */
const partOrder = (kind: ProjectKind): readonly string[] =>
  kind === 'custom' ? [] : PROJECT_KIND_INFO[kind].items.flatMap(itemPartIds);

/**
 * Add blank patterns for an item: the part itself, or the parts of the chosen option of a choice
 * (e.g. the body "in pieces": back and front). Each goes where the knitting order puts it among
 * the project's patterns; patterns that are not garment parts stay at the end.
 */
export function addItemPatterns(
  project: Project,
  kind: ProjectKind,
  item: KindItem,
  optionId: string | null,
  lang: Locale,
): { project: Project; patternId: string } {
  const parts =
    item.type === 'part'
      ? [item]
      : ((item.options.find((o) => o.id === optionId) ?? item.options[0])?.parts ?? []);
  const order = partOrder(kind);
  const rank = (id: string) => {
    const i = order.indexOf(id);
    return i < 0 ? Number.POSITIVE_INFINITY : i;
  };
  let next = project;
  let first = '';
  for (const part of parts) {
    const own = rank(part.id);
    let at = 0;
    next.patterns.forEach((p, i) => {
      if (rank(p.id) < own) at = i + 1;
    });
    const r = insertPattern(next, blankPattern(part.id, part.label[lang]), at);
    next = r.project;
    first ||= r.patternId;
  }
  return {
    project: next.activePatternId || !first ? next : { ...next, activePatternId: first },
    patternId: first,
  };
}

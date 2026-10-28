import { PROJECT_KIND_INFO, type Pattern, type ProjectKind } from '@kt/core';
import { descriptionBlocks } from '@kt/importer';
import type { PaperEntry } from './DescriptionPaper';

/** Pieces of a body made in parts. */
const PIECES = ['back', 'front', 'left-front', 'right-front'];

/**
 * The patterns of the project a piece of the description belongs to: the pattern of that part;
 * a back or front of a body knitted in one piece goes to the body, the body to its pieces.
 */
export function patternsForPart(partId: string, patterns: readonly Pattern[]): Pattern[] {
  const own = patterns.filter((p) => p.id === partId);
  if (own.length > 0) return own;
  if (PIECES.includes(partId)) return patterns.filter((p) => p.id === 'body');
  if (partId === 'body') return patterns.filter((p) => PIECES.includes(p.id));
  return [];
}

/** A part's name from the kind of garment, for a piece of text whose part is not in the project. */
function kindLabel(kind: ProjectKind, partId: string, lang: 'pl' | 'en'): string | null {
  for (const item of PROJECT_KIND_INFO[kind].items) {
    if (item.id === partId) return item.label[lang];
    if (item.type !== 'choice') continue;
    for (const o of item.options) {
      const part = o.parts.find((p) => p.id === partId);
      if (part) return part.label[lang];
    }
  }
  return null;
}

/** The project's text cut into pieces, each placed on the project's patterns. */
export function paperEntries(
  project: {
    readonly description?: string | undefined;
    readonly kind?: ProjectKind | undefined;
    readonly patterns: readonly Pattern[];
  },
  currentId: string,
  lang: 'pl' | 'en',
  notInProject: string,
): PaperEntry[] {
  const kind = project.kind ?? 'custom';
  return descriptionBlocks(project.description ?? '', kind).map((block) => {
    if (block.type === 'general' || block.type === 'intro') return { block, state: 'general' };
    if (!block.partId) return { block, state: 'loose' };
    const own = patternsForPart(block.partId, project.patterns);
    if (own.length === 0) {
      return {
        block,
        state: 'untracked',
        label: kindLabel(kind, block.partId, lang) ?? block.heading,
        note: notInProject,
      };
    }
    const first = own[0];
    return {
      block,
      state: 'part',
      number: first ? project.patterns.indexOf(first) + 1 : undefined,
      label: own.map((p) => p.name).join(', '),
      current: own.some((p) => p.id === currentId),
    };
  });
}

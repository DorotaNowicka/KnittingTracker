import type { KindItem } from '@kt/core';
import { descriptionBlocks, type DescriptionBlock } from '@kt/importer';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { DescriptionPaper } from '../ui/DescriptionPaper';
import type { Elements } from './elements';
import { trackedPartsOf } from './elements';
import { useImport } from './session';

/** Where a block of the description went: a part of the garment (numbered), or nowhere. */
interface Placed {
  readonly block: DescriptionBlock;
  /** The item the block belongs to, with its number in knitting order. */
  readonly item: KindItem | null;
  readonly number: number | undefined;
  /** The part's own name ("Tył" of the body in pieces), or the item's. */
  readonly label: string | null;
  /** The item (and piece) is among the parts the knitter tracks. */
  readonly tracked: boolean;
}

/** The item a part id belongs to: the item itself, or the choice item one of whose options has it. */
function placeOf(
  partId: string,
  items: readonly KindItem[],
  elements: Elements,
  lang: 'pl' | 'en',
): Pick<Placed, 'item' | 'label' | 'tracked'> | null {
  for (const item of items) {
    const state = elements[item.id];
    const on = state?.include ?? false;
    if (item.id === partId) return { item, label: item.label[lang], tracked: on };
    if (item.type !== 'choice') continue;
    for (const option of item.options) {
      const part = option.parts.find((p) => p.id === partId);
      if (!part) continue;
      // A piece of a body knitted in the round still belongs to the body.
      const pieceTracked =
        option.id !== state?.option || trackedPartsOf(item, state).some((p) => p.id === partId);
      return {
        item,
        label:
          option.parts.length > 1 ? `${item.label[lang]} · ${part.label[lang]}` : item.label[lang],
        tracked: on && pieceTracked,
      };
    }
  }
  return null;
}

/**
 * "Opis z pliku": the pattern text cut at its headings, each piece with the part it went to — so
 * the knitter sees what the import read for each part, and what went to no part at all.
 */
export function DescriptionMap({
  items,
  numbers,
}: {
  items: readonly KindItem[];
  numbers: Readonly<Record<string, number>>;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith('en') ? 'en' : 'pl';
  const kind = useImport((s) => s.projectKind);
  const elements = useImport((s) => s.elements);
  const text = useImport((s) => s.description.text || s.result?.text || '');

  const placed = useMemo<Placed[]>(
    () =>
      descriptionBlocks(text, kind).map((block) => {
        const place = block.partId ? placeOf(block.partId, items, elements, lang) : null;
        return {
          block,
          item: place?.item ?? null,
          number: place?.item ? numbers[place.item.id] : undefined,
          label: place?.label ?? null,
          tracked: place?.tracked ?? false,
        };
      }),
    [text, kind, items, elements, lang, numbers],
  );
  if (text.trim() === '') return null;

  const toParts = placed.filter((p) => p.item);
  const loose = placed.filter((p) => p.block.type === 'unknown' || (p.block.partId && !p.item));
  const untracked = toParts.filter((p) => !p.tracked);
  const described = new Set(toParts.filter((p) => p.tracked).map((p) => p.item?.id));
  const withoutText = items.filter((it) => elements[it.id]?.include && !described.has(it.id));

  // Folded until the knitter opens it: the summary already says what went to no part.
  return (
    <details className="fix description-map">
      <summary>
        <b>{t('describeMap.title')}</b>
        <span>
          {toParts.length === 0
            ? t('describeMap.noHeadings')
            : t('describeMap.summary', { count: toParts.length })}
          {loose.length > 0 && ` ${t('describeMap.looseCount', { count: loose.length })}`}
          {untracked.length > 0 &&
            ` ${t('describeMap.untrackedCount', { count: untracked.length })}`}
        </span>
      </summary>
      <p className="hint">{t('describeMap.hint')}</p>
      <DescriptionPaper
        label={t('describeMap.paper')}
        entries={placed.map((p) => ({
          block: p.block,
          state: p.item
            ? p.tracked
              ? 'part'
              : 'untracked'
            : p.block.type === 'general' || p.block.type === 'intro'
              ? 'general'
              : 'loose',
          number: p.number,
          label: p.label,
          note: p.item && !p.tracked ? t('describeMap.untracked') : undefined,
        }))}
      />
      {toParts.length > 0 && withoutText.length > 0 && (
        <p className="hint description-map__missing">
          {t('describeMap.withoutText', {
            parts: withoutText.map((it) => `${numbers[it.id] ?? ''}. ${it.label[lang]}`).join(', '),
          })}
        </p>
      )}
    </details>
  );
}

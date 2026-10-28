import type { KindItem } from '@kt/core';
import { descriptionBlocks, type DescriptionBlock } from '@kt/importer';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../ui/Icon';
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
  const attention = loose.length + untracked.length;

  return (
    <details className="fix description-map" open={attention > 0 || undefined}>
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
      {/* The whole text, as on paper: each part's piece marked with its own highlighter. A long
          text scrolls in its box, which therefore takes the keyboard focus (to scroll it). */}
      <div
        className="description-paper"
        role="region"
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scrolling region must be reachable by keyboard
        tabIndex={0}
        aria-label={t('describeMap.paper')}
      >
        {placed.map((p, i) => (
          <Block key={i} placed={p} />
        ))}
      </div>
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

/** Highlighter colours, one per part by its number in knitting order. */
const HIGHLIGHTERS = 7;

function Block({ placed }: { placed: Placed }) {
  const { t } = useTranslation();
  const { block, item, number, label, tracked } = placed;
  const state = item
    ? tracked
      ? 'part'
      : 'untracked'
    : block.type === 'general' || block.type === 'intro'
      ? 'general'
      : 'loose';
  const tag =
    state === 'part' || state === 'untracked'
      ? label
      : state === 'general'
        ? t(block.type === 'intro' ? 'describeMap.intro' : 'describeMap.general')
        : t('describeMap.loose');
  const colour = state === 'part' ? ((number ?? 1) - 1) % HIGHLIGHTERS : null;
  const body = (
    <>
      {block.heading && <b className="description-paper__heading">{block.heading}</b>}
      {block.heading && block.text && '\n'}
      {block.text}
    </>
  );
  return (
    <p
      className={`description-paper__block description-paper__block--${state}`}
      data-hl={colour ?? undefined}
    >
      <span className="description-paper__tag">
        {state === 'loose' && <Icon name="marker" size={12} />}
        {(state === 'part' || state === 'untracked') && number !== undefined && (
          <span className="description-paper__no">{number}</span>
        )}
        {tag}
        {state === 'untracked' && (
          <span className="description-paper__note"> · {t('describeMap.untracked')}</span>
        )}
      </span>
      {state === 'part' ? (
        <mark>{body}</mark>
      ) : (
        <span className="description-paper__text">{body}</span>
      )}
    </p>
  );
}

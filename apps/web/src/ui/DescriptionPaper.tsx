import type { DescriptionBlock } from '@kt/importer';
import type { Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from './Icon';

/**
 * The pattern text as on paper: each part's piece marked with its own highlighter and a tag of
 * its number and name; general sections plain; text that went to no part flagged. Shared by the
 * import check and the panels beside the grid.
 */
export interface PaperEntry {
  readonly block: DescriptionBlock;
  /** part: a part of the project; untracked: a part left out; general; loose: no part at all. */
  readonly state: 'part' | 'untracked' | 'general' | 'loose';
  /** The part's number in knitting order (also picks its highlighter). */
  readonly number?: number | undefined;
  readonly label?: string | null | undefined;
  /** Said after the tag of a part left out. */
  readonly note?: string | undefined;
  /** The piece belongs to the part on screen (the others are dimmed when `focus` is on). */
  readonly current?: boolean;
}

/** Highlighter colours, one per part by its number in knitting order. */
const HIGHLIGHTERS = 7;

export function DescriptionPaper({
  entries,
  label,
  focus = false,
  paperRef,
}: {
  entries: readonly PaperEntry[];
  /** The scrolling box's accessible name. */
  label: string;
  /** Pieces of the current part stand out; the rest are dimmed. */
  focus?: boolean;
  paperRef?: Ref<HTMLDivElement>;
}) {
  return (
    // A long text scrolls in its box, which therefore takes the keyboard focus (to scroll it).
    <div
      ref={paperRef}
      className={`description-paper${focus ? ' description-paper--focus' : ''}`}
      role="region"
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scrolling region must be reachable by keyboard
      tabIndex={0}
      aria-label={label}
    >
      {entries.map((e, i) => (
        <Block key={i} entry={e} />
      ))}
    </div>
  );
}

function Block({ entry }: { entry: PaperEntry }) {
  const { t } = useTranslation();
  const { block, state, number, label, note, current } = entry;
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
      className={`description-paper__block description-paper__block--${state}${current ? ' is-current' : ''}`}
      data-hl={colour ?? undefined}
    >
      <span className="description-paper__tag">
        {state === 'loose' && <Icon name="marker" size={12} />}
        {(state === 'part' || state === 'untracked') && number !== undefined && (
          <span className="description-paper__no">{number}</span>
        )}
        {tag}
        {note && <span className="description-paper__note"> · {note}</span>}
      </span>
      {state === 'part' ? (
        <mark>{body}</mark>
      ) : (
        <span className="description-paper__text">{body}</span>
      )}
    </p>
  );
}

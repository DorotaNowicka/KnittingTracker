import { placementArea, type Chart, type Design, type Placement } from '@kt/core';
import { useTranslation } from 'react-i18next';
import { CommitNumber } from '../ui/CommitNumber';
import { Icon } from '../ui/Icon';
import {
  conflictOf,
  maxRepeats,
  onBottom,
  removePlacement,
  updatePlacement,
  type Conflict,
} from './designOps';

/**
 * The bar above the grid: the piece about to be laid, or the selected tile, with its width as
 * "repeats × the piece's width = the tile's width". Either number can be typed; the other follows.
 * A held piece is laid by clicking a column on the grid, already as wide as set here.
 * Tiles never overlap, so a width that would cover another tile is refused with a message.
 */
export function TileBar({
  design,
  holding,
  selected,
  motifOf,
  message,
  onCancel,
  onHoldTimes,
  onDeselect,
  setDesign,
  onConflict,
}: {
  design: Design;
  /** The piece about to be laid and how many repeats wide its tile will be. */
  holding: { readonly motif: Chart; readonly times: number } | null;
  selected: Placement | null;
  motifOf(id: string): Chart | undefined;
  /** Why the last change was refused, shown until the next one. */
  message: string | null;
  onCancel(): void;
  onHoldTimes(times: number): void;
  onDeselect(): void;
  setDesign(design: Design): void;
  onConflict(conflict: Conflict | null): void;
}) {
  const { t } = useTranslation();
  if (holding) {
    const piece = holding.motif;
    // Before it lies anywhere, a tile can be as wide as the grid.
    const most = Math.max(1, Math.floor(design.width / piece.width));
    return (
      <div className="tile-bar" role="region" aria-label={t('designer.tile')}>
        <p className="tile-bar__lead">
          <b>{t('designer.holding', { name: piece.name })}</b>{' '}
          <span className="hint">{t('designer.repeatsUp', { count: piece.height })}</span>
        </p>
        <WidthEditor
          id={`hold-${piece.id}`}
          piece={piece}
          times={holding.times}
          max={most}
          onTimes={(n) => onHoldTimes(Math.min(most, Math.max(1, n)))}
        />
        <p className="hint tile-bar__hint">{t('designer.holdingHint')}</p>
        <div className="tile-bar__actions">
          <button type="button" className="btn btn--small" onClick={onCancel}>
            {t('common.cancel')}
          </button>
        </div>
        <Message text={message} />
      </div>
    );
  }
  const motif = selected ? motifOf(selected.motifId) : undefined;
  if (!selected || !motif) {
    return (
      <div className="tile-bar tile-bar--empty" role="region" aria-label={t('designer.tile')}>
        <p className="hint">{t('designer.noTile')}</p>
        <Message text={message} />
      </div>
    );
  }
  const area = placementArea(design, selected, motif);
  const times = area ? Math.floor(area.timesX) : 1;
  const most = maxRepeats(design, motif, selected.col, selected.id);
  const setTimes = (n: number) => {
    const next = onBottom(selected.col, Math.max(1, n));
    const conflict = conflictOf(design, motif, next, selected.id);
    onConflict(conflict);
    if (!conflict) setDesign(updatePlacement(design, selected.id, next));
  };
  return (
    <div className="tile-bar" role="region" aria-label={t('designer.tile')}>
      <p className="tile-bar__lead">
        <b>{motif.name}</b>{' '}
        <span className="hint">{t('designer.repeatsUp', { count: motif.height })}</span>
      </p>
      <WidthEditor
        id={selected.id}
        piece={motif}
        times={times}
        max={most}
        onTimes={setTimes}
        onToEnd={() => setTimes(most)}
      />
      <div className="tile-bar__actions">
        <button
          type="button"
          className="btn btn--small"
          onClick={() => {
            onDeselect();
            setDesign(removePlacement(design, selected.id));
          }}
        >
          <Icon name="trash" size={18} />
          {t('designer.removeTile')}
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label={t('designer.deselect')}
          onClick={onDeselect}
        >
          <Icon name="close" size={20} />
        </button>
      </div>
      <Message text={message} />
    </div>
  );
}

/**
 * Width of a tile: "repeats × the piece's width = stitches", with − / +, and "to the end" when the
 * tile lies on the grid (it grows up to the next tile or the edge).
 */
function WidthEditor({
  id,
  piece,
  times,
  max,
  onTimes,
  onToEnd,
}: {
  id: string;
  piece: Chart;
  times: number;
  max: number;
  onTimes(times: number): void;
  onToEnd?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <fieldset className="tile-width">
      <legend>{t('designer.tileWidth')}</legend>
      <button
        type="button"
        className="icon-btn"
        aria-label={t('designer.less')}
        disabled={times <= 1}
        onClick={() => onTimes(times - 1)}
      >
        <Icon name="minus" size={18} />
      </button>
      <CommitNumber
        key={`${id}-t-${times}`}
        label={t('designer.times')}
        value={times}
        onCommit={onTimes}
      />
      <span className="tile-width__op" aria-hidden="true">
        ×
      </span>
      <span className="tile-width__piece num">
        {t('designer.pieceWidth', { count: piece.width })}
      </span>
      <span className="tile-width__op" aria-hidden="true">
        =
      </span>
      <CommitNumber
        key={`${id}-s-${times}`}
        label={t('designer.tileStitches')}
        value={times * piece.width}
        unit={t('designer.stitchesUnit')}
        onCommit={(stitches) => onTimes(Math.floor(stitches / piece.width))}
      />
      <button
        type="button"
        className="icon-btn"
        aria-label={t('designer.more')}
        disabled={times >= max}
        onClick={() => onTimes(times + 1)}
      >
        <Icon name="plus" size={18} />
      </button>
      {onToEnd && (
        <button type="button" className="btn btn--small" disabled={times >= max} onClick={onToEnd}>
          {t('designer.toEnd')}
        </button>
      )}
    </fieldset>
  );
}

function Message({ text }: { text: string | null }) {
  return (
    <p className="tile-bar__message" role="status">
      {text}
    </p>
  );
}

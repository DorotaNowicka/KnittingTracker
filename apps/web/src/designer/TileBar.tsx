import { placementArea, type Chart, type Design, type Placement } from '@kt/core';
import { useId, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
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
 * The bar above the grid: the piece about to be laid, or the selected tile and its width as
 * "repeats × the piece's width = the tile's width". Either number can be typed; the other follows.
 * Tiles never overlap, so a width that would cover another tile is refused with a message.
 */
export function TileBar({
  design,
  holding,
  selected,
  motifOf,
  message,
  onCancel,
  onLay,
  onDeselect,
  setDesign,
  onConflict,
}: {
  design: Design;
  holding: Chart | null;
  selected: Placement | null;
  motifOf(id: string): Chart | undefined;
  /** Why the last change was refused, shown until the next one. */
  message: string | null;
  onCancel(): void;
  /** Lay the held piece in the first free place from the right. */
  onLay(): void;
  onDeselect(): void;
  setDesign(design: Design): void;
  onConflict(conflict: Conflict | null): void;
}) {
  const { t } = useTranslation();
  if (holding) {
    return (
      <div className="tile-bar" role="region" aria-label={t('designer.tile')}>
        <p className="tile-bar__lead">
          <b>{t('designer.holding', { name: holding.name })}</b>{' '}
          <span className="num">
            {t('editor.chartSize', { w: holding.width, h: holding.height })}
          </span>
        </p>
        <p className="hint tile-bar__hint">{t('designer.holdingHint')}</p>
        <div className="tile-bar__actions">
          <button type="button" className="btn btn--small btn--primary" onClick={onLay}>
            {t('designer.layFree')}
          </button>
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
      <fieldset className="tile-width">
        <legend>{t('designer.tileWidth')}</legend>
        <button
          type="button"
          className="icon-btn"
          aria-label={t('designer.less')}
          disabled={times <= 1}
          onClick={() => setTimes(times - 1)}
        >
          <Icon name="minus" size={18} />
        </button>
        <CommitNumber
          key={`${selected.id}-t-${times}`}
          label={t('designer.times')}
          value={times}
          onCommit={setTimes}
        />
        <span className="tile-width__op" aria-hidden="true">
          ×
        </span>
        <span className="tile-width__piece num">
          {t('designer.pieceWidth', { count: motif.width })}
        </span>
        <span className="tile-width__op" aria-hidden="true">
          =
        </span>
        <CommitNumber
          key={`${selected.id}-s-${times}`}
          label={t('designer.tileStitches')}
          value={times * motif.width}
          unit={t('designer.stitchesUnit')}
          onCommit={(stitches) => setTimes(Math.floor(stitches / motif.width))}
        />
        <button
          type="button"
          className="icon-btn"
          aria-label={t('designer.more')}
          disabled={times >= most}
          onClick={() => setTimes(times + 1)}
        >
          <Icon name="plus" size={18} />
        </button>
        <button
          type="button"
          className="btn btn--small"
          disabled={times >= most}
          onClick={() => setTimes(most)}
        >
          {t('designer.toEnd')}
        </button>
      </fieldset>
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

function Message({ text }: { text: string | null }) {
  return (
    <p className="tile-bar__message" role="status">
      {text}
    </p>
  );
}

/**
 * A whole number taken when typing ends (Enter or leaving the field): "6" on the way to "60"
 * must not resize the tile, and stitches are rounded to whole repeats only once typed.
 */
function CommitNumber({
  label,
  value,
  unit,
  onCommit,
}: {
  label: string;
  value: number;
  unit?: string;
  onCommit(value: number): void;
}) {
  const id = useId();
  const [text, setText] = useState(String(value));
  const commit = () => {
    const n = Number(text);
    if (Number.isInteger(n) && n > 0 && n !== value) onCommit(n);
    // An accepted number remounts the field with the new value; a refused or rounded one
    // shows the tile's actual width again.
    setText(String(value));
  };
  return (
    <div className="field field--compact">
      <label htmlFor={id}>{label}</label>
      <span className="tile-width__unit">
        <input
          id={id}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          className="input--number"
          value={text}
          onChange={(e) => setText(e.target.value.replace(/[^\d]/g, ''))}
          onBlur={commit}
          onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
            }
          }}
        />
        {unit}
      </span>
    </div>
  );
}

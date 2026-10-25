import { placementArea, type Chart, type Design, type Placement } from '@kt/core';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NumberField } from '../ui/fields';
import { Icon } from '../ui/Icon';
import {
  conflictOf,
  removePlacement,
  roomFor,
  updatePlacement,
  type Conflict,
  type PlaceInput,
} from './designOps';

/**
 * The bar above the grid: the piece about to be laid, or the selected tile with its width and
 * height (in whole repeats of the piece) and position. Tiles never overlap, so a change that would
 * cover another tile is refused with a message.
 */
export function TileBar({
  design,
  holding,
  selected,
  motifOf,
  message,
  onCancel,
  onPlace,
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
  /** Lay the held piece with its bottom right corner at this stitch and row. */
  onPlace(at: { col: number; row: number }): void;
  onDeselect(): void;
  setDesign(design: Design): void;
  onConflict(conflict: Conflict | null): void;
}) {
  const { t } = useTranslation();
  if (holding) {
    return (
      <div className="tile-bar" role="region" aria-label={t('designer.tile')}>
        <Holding piece={holding} design={design} onPlace={onPlace} onCancel={onCancel} />
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
  const input: PlaceInput = {
    col: selected.col,
    row: selected.row,
    repeatX: selected.repeatX,
    repeatY: selected.repeatY,
  };
  const apply = (change: Partial<PlaceInput>) => {
    const next = { ...input, ...change };
    const conflict = conflictOf(design, motif, next, selected.id);
    onConflict(conflict);
    if (!conflict) setDesign(updatePlacement(design, selected.id, next));
  };
  const area = placementArea(design, selected, motif);
  const room = roomFor(design, motif, input);
  return (
    <div className="tile-bar" role="region" aria-label={t('designer.tile')}>
      <p className="tile-bar__lead">
        <b>{motif.name}</b>{' '}
        <span className="num">{t('editor.chartSize', { w: motif.width, h: motif.height })}</span>
      </p>
      <Repeats
        label={t('designer.tileWidth')}
        value={input.repeatX}
        size={motif.width}
        times={area?.timesX ?? 0}
        total={area ? area.right - area.left + 1 : 0}
        max={room.across}
        unit="stitches"
        onChange={(repeatX) => apply({ repeatX })}
      />
      <Repeats
        label={t('designer.tileHeight')}
        value={input.repeatY}
        size={motif.height}
        times={area?.timesY ?? 0}
        total={area ? area.top - area.bottom + 1 : 0}
        max={room.up}
        unit="rows"
        onChange={(repeatY) => apply({ repeatY })}
      />
      <div className="tile-bar__where">
        <NumberField
          compact
          label={t('designer.tileCol')}
          value={input.col}
          min={1}
          max={design.width}
          onCommit={(col) => apply({ col })}
        />
        <NumberField
          compact
          label={t('designer.tileRow')}
          value={input.row}
          min={1}
          max={design.height}
          onCommit={(row) => apply({ row })}
        />
      </div>
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

/** The piece about to be laid: click the grid, or type where and lay it. */
function Holding({
  piece,
  design,
  onPlace,
  onCancel,
}: {
  piece: Chart;
  design: Design;
  onPlace(at: { col: number; row: number }): void;
  onCancel(): void;
}) {
  const { t } = useTranslation();
  const [at, setAt] = useState({ col: 1, row: 1 });
  return (
    <>
      <p className="tile-bar__lead">
        <b>{t('designer.holding', { name: piece.name })}</b>{' '}
        <span className="num">{t('editor.chartSize', { w: piece.width, h: piece.height })}</span>
      </p>
      <p className="hint tile-bar__hint">{t('designer.holdingHint')}</p>
      <div className="tile-bar__where">
        <NumberField
          compact
          label={t('designer.tileCol')}
          value={at.col}
          min={1}
          max={design.width}
          onCommit={(col) => setAt({ ...at, col })}
        />
        <NumberField
          compact
          label={t('designer.tileRow')}
          value={at.row}
          min={1}
          max={design.height}
          onCommit={(row) => setAt({ ...at, row })}
        />
      </div>
      <div className="tile-bar__actions">
        <button type="button" className="btn btn--small btn--primary" onClick={() => onPlace(at)}>
          {t('designer.lay')}
        </button>
        <button type="button" className="btn btn--small" onClick={onCancel}>
          {t('common.cancel')}
        </button>
      </div>
    </>
  );
}

function Message({ text }: { text: string | null }) {
  return (
    <p className="tile-bar__message" role="status">
      {text}
    </p>
  );
}

/** Width or height of a tile: whole repeats of the piece, or to the grid's edge. */
function Repeats({
  label,
  value,
  size,
  times,
  total,
  max,
  unit,
  onChange,
}: {
  label: string;
  value: number | 'fill';
  size: number;
  times: number;
  total: number;
  max: number;
  unit: 'stitches' | 'rows';
  onChange(value: number | 'fill'): void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const count = value === 'fill' ? Math.max(1, Math.floor(times)) : value;
  const shown = Number.isInteger(times)
    ? String(times)
    : times.toFixed(2).replace(/0+$/, '').replace('.', ',');
  return (
    <fieldset className="repeats">
      <legend>{label}</legend>
      <div className="repeats__row">
        <button
          type="button"
          className="icon-btn"
          aria-label={t('designer.less', { label })}
          disabled={count <= 1}
          onClick={() => onChange(Math.max(1, count - 1))}
        >
          <Icon name="minus" size={18} />
        </button>
        <NumberField
          compact
          id={id}
          label={t('designer.timesCount')}
          // "To the edge" shows the whole repeats that fit; typing a number replaces it.
          value={count}
          min={1}
          max={1000}
          onCommit={onChange}
        />
        <button
          type="button"
          className="icon-btn"
          aria-label={t('designer.more', { label })}
          disabled={count >= max}
          onClick={() => onChange(Math.min(max, count + 1))}
        >
          <Icon name="plus" size={18} />
        </button>
        <span className="repeats__sum num">
          {t(unit === 'stitches' ? 'designer.sumAcross' : 'designer.sumUp', {
            times: shown,
            w: size,
            h: size,
            count: total,
          })}
        </span>
        <label className="check repeats__fill">
          <input
            type="checkbox"
            checked={value === 'fill'}
            onChange={(e) => onChange(e.target.checked ? 'fill' : count)}
          />
          {t(unit === 'stitches' ? 'designer.toEdgeLeft' : 'designer.toEdgeTop')}
        </label>
      </div>
    </fieldset>
  );
}

import { placementArea, type Chart, type Design, type Pattern } from '@kt/core';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { ChartThumb } from '../editor/ChartThumb';
import { useMotifs } from '../state/motifs';
import { NumberField } from '../ui/fields';
import { Icon } from '../ui/Icon';
import {
  movePlacement,
  placeMotif,
  removePlacement,
  updatePlacement,
  type PlaceInput,
} from './designOps';

/** A piece being placed (or a placement being changed) and where it goes. */
export interface PlaceForm {
  readonly motifId: string;
  /** Id of the placement being changed; null for a new one. */
  readonly editing: string | null;
  readonly input: PlaceInput;
}

/** The library of pieces, the form that places one, and what is on the grid. */
export function PiecesPanel({
  design,
  library,
  own,
  form,
  setForm,
  setDesign,
  onNewPiece,
  pattern,
}: {
  design: Design;
  library: readonly Chart[];
  own: readonly Chart[];
  form: PlaceForm | null;
  setForm(form: PlaceForm | null): void;
  setDesign(design: Design): void;
  onNewPiece(): void;
  pattern: Pattern;
}) {
  const { t } = useTranslation();
  const ids = useId();
  const motifOf = (id: string) =>
    design.motifs.find((m) => m.id === id) ?? library.find((m) => m.id === id);
  const start = (motif: Chart) =>
    setForm({
      motifId: motif.id,
      editing: null,
      input: { col: 1, row: 1, repeatX: 'fill', repeatY: 'fill' },
    });

  return (
    <>
      {/* The piece being placed comes first, so it is in view as soon as it is picked. */}
      {form && (
        <PlaceSection
          key={`${form.motifId}-${form.editing ?? 'new'}`}
          design={design}
          form={form}
          motif={motifOf(form.motifId)}
          setForm={setForm}
          setDesign={setDesign}
        />
      )}

      <section aria-labelledby={`${ids}-lib`}>
        <h2 id={`${ids}-lib`} className="panel__title">
          {t('designer.library')}
        </h2>
        <p className="hint">{t('designer.libraryHint')}</p>
        <ul className="piece-list">
          {library.map((m) => (
            <li key={m.id} className="piece-list__item">
              <button
                type="button"
                className="piece"
                aria-pressed={form?.motifId === m.id && form.editing === null}
                onClick={() => start(m)}
              >
                <ChartThumb pattern={pattern} chart={m} maxWidth={72} maxHeight={48} />
                <span className="piece__name">{m.name}</span>
                <span className="piece__size num">
                  {t('editor.chartSize', { w: m.width, h: m.height })}
                </span>
              </button>
              {own.some((o) => o.id === m.id) && (
                <button
                  type="button"
                  className="icon-btn piece__remove"
                  aria-label={t('designer.removePiece', { name: m.name })}
                  onClick={() => void useMotifs.getState().remove(m.id)}
                >
                  <Icon name="trash" size={18} />
                </button>
              )}
            </li>
          ))}
        </ul>
        <button type="button" className="btn" onClick={onNewPiece}>
          <Icon name="plus" size={18} />
          {t('designer.newPiece')}
        </button>
      </section>

      <section aria-labelledby={`${ids}-on`}>
        <h2 id={`${ids}-on`} className="panel__title">
          {t('designer.onGrid')}
        </h2>
        {design.placements.length === 0 ? (
          <p className="hint">{t('designer.onGridEmpty')}</p>
        ) : (
          <ol className="placed-list">
            {design.placements.map((p, i) => {
              const motif = motifOf(p.motifId);
              return (
                <li key={p.id} className="placed">
                  <span className="placed__text">
                    <b>{motif?.name ?? p.motifId}</b>
                    <span className="hint">
                      {t('designer.placedAt', { col: p.col, row: p.row })} ·{' '}
                      {p.repeatX === 'fill'
                        ? t('designer.acrossFill')
                        : t('designer.acrossTimes', { count: p.repeatX })}{' '}
                      ·{' '}
                      {p.repeatY === 'fill'
                        ? t('designer.upFill')
                        : t('designer.upTimes', { count: p.repeatY })}
                    </span>
                  </span>
                  <span className="placed__actions">
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={t('designer.edit', { name: motif?.name ?? '' })}
                      onClick={() =>
                        setForm({
                          motifId: p.motifId,
                          editing: p.id,
                          input: { col: p.col, row: p.row, repeatX: p.repeatX, repeatY: p.repeatY },
                        })
                      }
                    >
                      <Icon name="edit" size={18} />
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={t('designer.lower')}
                      disabled={i === 0}
                      onClick={() => setDesign(movePlacement(design, p.id, -1))}
                    >
                      <Icon name="down" size={18} />
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={t('designer.raise')}
                      disabled={i === design.placements.length - 1}
                      onClick={() => setDesign(movePlacement(design, p.id, 1))}
                    >
                      <Icon name="up" size={18} />
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={t('designer.remove', { name: motif?.name ?? '' })}
                      onClick={() => {
                        if (form?.editing === p.id) setForm(null);
                        setDesign(removePlacement(design, p.id));
                      }}
                    >
                      <Icon name="trash" size={18} />
                    </button>
                  </span>
                </li>
              );
            })}
          </ol>
        )}
        {design.placements.length > 1 && <p className="hint">{t('designer.layers')}</p>}
      </section>
    </>
  );
}

/** Where a piece goes and how often it repeats, with what that adds up to. */
function PlaceSection({
  design,
  form,
  motif,
  setForm,
  setDesign,
}: {
  design: Design;
  form: PlaceForm;
  motif: Chart | undefined;
  setForm(form: PlaceForm | null): void;
  setDesign(design: Design): void;
}) {
  const { t } = useTranslation();
  const ids = useId();
  if (!motif) return null;
  const input = form.input;
  const set = (change: Partial<PlaceInput>) => setForm({ ...form, input: { ...input, ...change } });
  const area = placementArea(design, { ...input, id: 'x', motifId: motif.id }, motif);
  const wide = area ? area.right - area.left + 1 : 0;
  const tall = area ? area.top - area.bottom + 1 : 0;
  const cutX = area && !Number.isInteger(area.timesX);
  const cutY = area && !Number.isInteger(area.timesY);
  const shortX = input.repeatX !== 'fill' && area !== null && input.repeatX * motif.width > wide;
  const shortY = input.repeatY !== 'fill' && area !== null && input.repeatY * motif.height > tall;
  const left = area ? area.left - 1 : 0;

  const submit = () => {
    if (!area) return;
    if (form.editing) {
      setDesign(updatePlacement(design, form.editing, input));
    } else {
      setDesign(placeMotif(design, motif, input).design);
    }
    setForm(null);
  };

  return (
    <section className="place-form" aria-labelledby={`${ids}-t`}>
      <h2 id={`${ids}-t`} className="panel__title">
        {t(form.editing ? 'designer.change' : 'designer.place', { name: motif.name })}
      </h2>
      <p className="hint">
        {t('designer.pieceSize', { w: motif.width, h: motif.height })} {t('designer.clickToPlace')}
      </p>
      <div className="form-grid form-grid--2">
        <NumberField
          compact
          label={t('designer.startCol')}
          value={input.col}
          min={1}
          max={design.width}
          onCommit={(col) => set({ col })}
        />
        <NumberField
          compact
          label={t('designer.startRow')}
          value={input.row}
          min={1}
          max={design.height}
          onCommit={(row) => set({ row })}
        />
      </div>
      <Repeat
        legend={t('designer.across')}
        fillLabel={t('designer.toEdgeLeft')}
        value={input.repeatX}
        onChange={(repeatX) => set({ repeatX })}
        name={`${ids}-x`}
      />
      <Repeat
        legend={t('designer.up')}
        fillLabel={t('designer.toEdgeTop')}
        value={input.repeatY}
        onChange={(repeatY) => set({ repeatY })}
        name={`${ids}-y`}
      />
      {area ? (
        <div className="place-sum" role="status">
          <p>
            {t('designer.sumAcross', {
              times: formatTimes(area.timesX),
              w: motif.width,
              count: wide,
            })}
          </p>
          <p>
            {t('designer.sumUp', { times: formatTimes(area.timesY), h: motif.height, count: tall })}
          </p>
          {(shortX || shortY) && <p className="field__error">{t('designer.cutAtEdge')}</p>}
          {!shortX && cutX && (
            <p className="hint">
              {t('designer.partialAcross', { n: wide % motif.width, w: motif.width })}
            </p>
          )}
          {!shortY && cutY && (
            <p className="hint">
              {t('designer.partialUp', { n: tall % motif.height, h: motif.height })}
            </p>
          )}
          {left > 0 && <p className="hint">{t('designer.leftOver', { count: left })}</p>}
        </div>
      ) : (
        <p className="field__error">{t('designer.offGrid')}</p>
      )}
      <div className="form-actions">
        <button type="button" className="btn" onClick={() => setForm(null)}>
          {t('common.cancel')}
        </button>
        <button type="button" className="btn btn--primary" disabled={!area} onClick={submit}>
          {t(form.editing ? 'designer.saveChange' : 'designer.placeButton')}
        </button>
      </div>
    </section>
  );
}

const formatTimes = (v: number) =>
  Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0+$/, '').replace('.', ',');

/** "N times" or "to the edge". */
function Repeat({
  legend,
  fillLabel,
  value,
  onChange,
  name,
}: {
  legend: string;
  fillLabel: string;
  value: number | 'fill';
  onChange(value: number | 'fill'): void;
  name: string;
}) {
  const { t } = useTranslation();
  const ids = useId();
  return (
    <fieldset className="repeat">
      <legend>{legend}</legend>
      <label className="check">
        <input
          type="radio"
          name={name}
          checked={value === 'fill'}
          onChange={() => onChange('fill')}
        />
        {fillLabel}
      </label>
      <div className="repeat__times">
        <label className="check">
          <input
            type="radio"
            name={name}
            checked={value !== 'fill'}
            onChange={() => onChange(1)}
            aria-describedby={`${ids}-n`}
          />
          {t('designer.times')}
        </label>
        {value !== 'fill' && (
          <NumberField
            compact
            id={`${ids}-n`}
            label={t('designer.timesCount')}
            value={value}
            min={1}
            max={1000}
            onCommit={onChange}
          />
        )}
      </div>
    </fieldset>
  );
}

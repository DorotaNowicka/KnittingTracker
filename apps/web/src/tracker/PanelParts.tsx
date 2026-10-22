import { rowInstructions, type ResolvedPattern, type StitchLocation } from '@kt/core';
import { CELL_PX_MAX } from '@kt/grid-renderer';
import { useEffect, useId, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../ui/Icon';
import { SymbolGlyph } from '../ui/SymbolGlyph';

type Lang = 'pl' | 'en';
const lang = (l: string): Lang => (l.startsWith('en') ? 'en' : 'pl');

/** Current row as text (DR-12): the instructions in work order, with the next stitch highlighted. */
export function RowText({
  grid,
  row,
  next,
}: {
  grid: ResolvedPattern;
  row: number;
  next: StitchLocation | null;
}) {
  const { t, i18n } = useTranslation();
  const ids = useId();
  const info = useMemo(() => rowInstructions(grid, row), [grid, row]);
  const l = lang(i18n.language);
  const nextStitch = next?.row === row ? next.stitch : null;
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => {
    // Optional call: not every environment implements scrollIntoView (e.g. jsdom).
    list.current?.querySelector('.is-current')?.scrollIntoView?.({ block: 'nearest' });
  }, [nextStitch, row]);
  return (
    <section className="panel__section" aria-labelledby={`${ids}-rt`}>
      <h2 id={`${ids}-rt`} className="panel__title">
        {grid.pattern.construction === 'round'
          ? t('rowText.titleRound', { row })
          : t('rowText.titleRow', { row })}
      </h2>
      <p className="hint">
        {info.side === 'RS' ? t('rowText.rs') : t('rowText.ws')},{' '}
        {info.direction === 'right-to-left' ? t('rowText.rtl') : t('rowText.ltr')}
      </p>
      <ol className="row-text" ref={list}>
        {info.tokens.map((tok, i) => {
          const s = grid.registry.require(tok.symbolId);
          const lo = Math.min(tok.fromStitch, tok.toStitch);
          const hi = Math.max(tok.fromStitch, tok.toStitch);
          const current = nextStitch !== null && nextStitch >= lo && nextStitch <= hi;
          return (
            <li
              key={`${tok.fromStitch}-${i}`}
              className={current ? 'row-text__item is-current' : 'row-text__item'}
              aria-current={current ? 'step' : undefined}
            >
              <span className="num row-text__count">{tok.count}×</span>
              <span>{tok.wsText ? tok.wsText[l] : s.label[l]}</span>
              {tok.problem && <span className="row-text__problem">{t('rowText.wsProblem')}</span>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** Legend for the symbols used in this pattern, drawn with the grid's own glyphs. */
export function Legend({ grid }: { grid: ResolvedPattern }) {
  const { t, i18n } = useTranslation();
  const ids = useId();
  const l = lang(i18n.language);
  const used = useMemo(() => {
    const set = new Set<string>();
    for (const z of grid.zones)
      for (const row of z.chart.cells) for (const c of row) set.add(c.symbolId);
    return [...set].map((id) => grid.registry.require(id));
  }, [grid]);
  return (
    <section className="panel__section" aria-labelledby={`${ids}-lg`}>
      <h2 id={`${ids}-lg`} className="panel__title">
        {t('legend.title')}
      </h2>
      <ul className="legend">
        {used.map((s) => {
          const entry = grid.pattern.legend.find((e) => e.symbolId === s.id);
          const number = entry?.number ?? s.numbers?.['drops'];
          return (
            <li key={s.id} className="legend__item">
              <SymbolGlyph glyph={s.glyph} width={s.width} />
              <span className="legend__text">
                <span className="legend__label">
                  {s.label[l]}
                  {number && <span className="legend__number num">{number}</span>}
                </span>
                <span className="legend__desc">{entry?.text ?? s.description[l]}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export interface ViewSettings {
  readonly cell: number;
  readonly rows: number | 'end';
  readonly veil: boolean;
}

export function ViewControls({
  view,
  sections,
  onChange,
  onFit,
}: {
  view: ViewSettings;
  sections: readonly { label: string; first: number; last: number }[];
  onChange(v: ViewSettings): void;
  onFit(cols?: { first: number; last: number }): void;
}) {
  const { t } = useTranslation();
  const ids = useId();
  return (
    <section className="panel__section" aria-labelledby={`${ids}-v`}>
      <h2 id={`${ids}-v`} className="panel__title">
        {t('view.title')}
      </h2>
      <div className="field field--inline">
        <label htmlFor={`${ids}-zoom`}>{t('view.cell')}</label>
        <div className="zoom">
          <button
            type="button"
            className="icon-btn"
            aria-label={t('view.zoomOut')}
            onClick={() => onChange({ ...view, cell: Math.max(6, view.cell - 2) })}
          >
            <Icon name="minus" />
          </button>
          <input
            id={`${ids}-zoom`}
            type="range"
            min={6}
            max={CELL_PX_MAX}
            step={1}
            value={view.cell}
            onChange={(e) => onChange({ ...view, cell: Number(e.target.value) })}
          />
          <button
            type="button"
            className="icon-btn"
            aria-label={t('view.zoomIn')}
            onClick={() => onChange({ ...view, cell: Math.min(CELL_PX_MAX, view.cell + 2) })}
          >
            <Icon name="plus" />
          </button>
        </div>
      </div>
      <div className="field field--inline">
        <label htmlFor={`${ids}-rows`}>{t('view.rows')}</label>
        <select
          id={`${ids}-rows`}
          value={String(view.rows)}
          onChange={(e) =>
            onChange({
              ...view,
              rows: e.target.value === 'end' ? 'end' : Number(e.target.value),
            })
          }
        >
          <option value="end">{t('view.rowsEnd')}</option>
          {[10, 20, 40, 80, 160].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>
      <label className="check">
        <input
          type="checkbox"
          checked={view.veil}
          onChange={(e) => onChange({ ...view, veil: e.target.checked })}
        />
        {t('view.veil')}
      </label>
      <div className="fit">
        <span className="fit__label">{t('view.fit')}</span>
        <button type="button" className="btn btn--small" onClick={() => onFit()}>
          <Icon name="fit" size={18} />
          {t('view.fitAll')}
        </button>
        {sections.map((s) => (
          <button
            key={s.label}
            type="button"
            className="btn btn--small"
            onClick={() => onFit({ first: s.first, last: s.last })}
          >
            {s.label}
          </button>
        ))}
      </div>
    </section>
  );
}

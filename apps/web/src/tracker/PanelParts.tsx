import { legendLabel, rowInstructions, type ResolvedPattern, type StitchLocation } from '@kt/core';
import { CELL_PX_MAX } from '@kt/grid-renderer';
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { getSectionOpenPref, setSectionOpenPref } from '../lib/preferences';
import { Icon } from '../ui/Icon';
import { SymbolGlyph } from '../ui/SymbolGlyph';

type Lang = 'pl' | 'en';
const lang = (l: string): Lang => (l.startsWith('en') ? 'en' : 'pl');

/**
 * A panel section whose title folds it away. The choice is remembered on this device, per kind of
 * section, so a knitter who knows the symbols keeps the legend closed in every pattern.
 */
function Foldable({
  id,
  title,
  children,
}: {
  id: 'legend' | 'rowText';
  title: ReactNode;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const ids = useId();
  const [open, setOpen] = useState(() => getSectionOpenPref(id));
  const toggle = () => {
    setSectionOpenPref(id, !open);
    setOpen(!open);
  };
  return (
    <section
      className={`panel__section foldable${open ? '' : ' is-closed'}`}
      aria-labelledby={`${ids}-t`}
    >
      <h2 className="panel__title">
        <button
          type="button"
          id={`${ids}-t`}
          className="foldable__toggle"
          aria-expanded={open}
          aria-controls={`${ids}-c`}
          title={open ? t('panel.fold') : t('panel.unfold')}
          onClick={toggle}
        >
          <span>{title}</span>
          <Icon name="chevron" size={22} />
        </button>
      </h2>
      <div id={`${ids}-c`} hidden={!open}>
        {children}
      </div>
    </section>
  );
}

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
  const info = useMemo(() => rowInstructions(grid, row), [grid, row]);
  const l = lang(i18n.language);
  const nextStitch = next?.row === row ? next.stitch : null;
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => {
    // Optional call: not every environment implements scrollIntoView (e.g. jsdom).
    list.current?.querySelector('.is-current')?.scrollIntoView?.({ block: 'nearest' });
  }, [nextStitch, row]);
  return (
    <Foldable
      id="rowText"
      title={
        grid.pattern.construction === 'round'
          ? t('rowText.titleRound', { row })
          : t('rowText.titleRow', { row })
      }
    >
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
              <span>{tok.wsText ? tok.wsText[l] : legendLabel(grid.pattern, s, l)}</span>
              {tok.problem && <span className="row-text__problem">{t('rowText.wsProblem')}</span>}
            </li>
          );
        })}
      </ol>
    </Foldable>
  );
}

/**
 * Legend for the symbols used in this pattern, drawn with the grid's own glyphs. Each name is a
 * text field: the pattern's own wording (or the standard label) shows as its placeholder, and
 * whatever the knitter types replaces it everywhere in the tracker.
 */
export function Legend({
  grid,
  onRename,
}: {
  grid: ResolvedPattern;
  onRename?: (symbolId: string, name: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const l = lang(i18n.language);
  const used = useMemo(() => {
    const set = new Set<string>();
    for (const z of grid.zones)
      for (const row of z.chart.cells) for (const c of row) set.add(c.symbolId);
    return [...set].map((id) => grid.registry.require(id));
  }, [grid]);
  return (
    <Foldable id="legend" title={t('legend.title')}>
      <ul className="legend">
        {used.map((s) => {
          const entry = grid.pattern.legend.find((e) => e.symbolId === s.id);
          const number = entry?.number ?? s.numbers?.['drops'];
          const fallback = entry?.text || s.label[l];
          return (
            <li key={s.id} className="legend__item">
              <SymbolGlyph glyph={s.glyph} width={s.width} />
              <span className="legend__text">
                <span className="legend__label">
                  {onRename ? (
                    <LegendName
                      value={entry?.name ?? ''}
                      placeholder={fallback}
                      label={t('legend.rename', { name: fallback })}
                      onCommit={(name) => onRename(s.id, name)}
                    />
                  ) : (
                    legendLabel(grid.pattern, s, l)
                  )}
                  {number && <span className="legend__number num">{number}</span>}
                </span>
                {/* The pattern's wording, when it is not already the (placeholder) name. */}
                {entry?.text ? (
                  (entry.name || entry.text.length > 32) && (
                    <span className="legend__desc">{entry.text}</span>
                  )
                ) : (
                  <span className="legend__desc">{s.description[l]}</span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </Foldable>
  );
}

/** A name field that saves when the knitter leaves it (or presses Enter), not on every key. */
function LegendName({
  value,
  placeholder,
  label,
  onCommit,
}: {
  value: string;
  placeholder: string;
  label: string;
  onCommit: (name: string) => void;
}) {
  const [text, setText] = useState(value);
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    setText(value);
  }
  const cancelled = useRef(false);
  const commit = () => {
    if (cancelled.current) {
      cancelled.current = false;
      setText(value);
      return;
    }
    if (text.trim() !== value) onCommit(text);
  };
  return (
    <input
      type="text"
      className="legend__name"
      value={text}
      placeholder={placeholder}
      aria-label={label}
      maxLength={80}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          cancelled.current = true;
          e.currentTarget.blur();
        }
      }}
    />
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

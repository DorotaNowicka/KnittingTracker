import {
  ruleRows,
  startStitches,
  stitchesPerRow,
  STD,
  withShaping,
  type Design,
  type ShapingRule,
  type SymbolRegistry,
} from '@kt/core';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NumberField } from '../ui/fields';
import { Icon } from '../ui/Icon';
import { SymbolGlyph } from '../ui/SymbolGlyph';

/** The symbols a new rule of each kind starts with: leaning towards the middle, in pairs. */
const DEFAULT_SYMBOLS = {
  decrease: { right: STD.ssk, left: STD.k2tog },
  increase: { right: STD.m1l, left: STD.m1r },
} as const;

const nextId = (rules: readonly ShapingRule[]) => {
  let n = rules.length + 1;
  while (rules.some((r) => r.id === `s${n}`)) n += 1;
  return `s${n}`;
};

/**
 * "Kształt": rules that decrease or increase stitches at the same places every so many rows. The
 * grid grows by the increases by itself (the stitches cast on stay as typed), and each rule says
 * how many stitches from the edge its symbols stand and which symbols they are.
 */
export function ShapingPanel({
  design,
  registry,
  setDesign,
  onShowRows,
}: {
  design: Design;
  registry: SymbolRegistry;
  setDesign(next: Design): void;
  /** Rows a rule changes, to show on the grid (null: none). */
  onShowRows(rows: readonly number[] | null): void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith('en') ? 'en' : 'pl';
  const ids = useId();
  const rules = design.shaping ?? [];
  const [tooWide, setTooWide] = useState(false);
  const halves = !!design.halves && design.width >= 2;
  const perRow = stitchesPerRow(design);

  const apply = (next: readonly ShapingRule[]) => {
    const shaped = withShaping(design, next);
    const refused = shaped === design && next !== rules;
    setTooWide(refused);
    if (!refused) setDesign(shaped);
  };
  const change = (id: string, patch: Partial<ShapingRule>) =>
    apply(rules.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const add = () =>
    apply([
      ...rules,
      {
        id: nextId(rules),
        kind: 'decrease',
        where: halves ? 'sides' : 'edges',
        start: Math.min(design.height, 5),
        every: 6,
        times: 4,
        inset: 1,
        ...DEFAULT_SYMBOLS.decrease,
      },
    ]);
  const symbolsOf = (kind: ShapingRule['kind']) =>
    registry.all().filter((s) => s.family === kind && s.width === 1);

  return (
    <section aria-labelledby={`${ids}-t`} className="shaping">
      <h2 id={`${ids}-t`} className="panel__title">
        {t('shaping.title')}
      </h2>
      <p className="hint">{t('shaping.hint')}</p>
      {rules.length > 0 && (
        <p className="shaping__summary">
          {t('shaping.summary', {
            start: startStitches(design),
            end: perRow[perRow.length - 1] ?? design.width,
            most: Math.max(...perRow),
          })}
        </p>
      )}
      <ol className="shaping__rules">
        {rules.map((rule, i) => {
          const rows = ruleRows(rule, design.height);
          const places = rule.where === 'sides' && halves ? 4 : 2;
          const lost = rule.times - rows.length;
          return (
            <li
              key={rule.id}
              className="shaping__rule"
              onFocus={() => onShowRows(rows)}
              onBlur={() => onShowRows(null)}
              onPointerEnter={() => onShowRows(rows)}
              onPointerLeave={() => onShowRows(null)}
            >
              <div className="shaping__head">
                <b>{t('shaping.rule', { n: i + 1 })}</b>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={t('shaping.remove', { n: i + 1 })}
                  onClick={() => apply(rules.filter((r) => r.id !== rule.id))}
                >
                  <Icon name="trash" size={18} />
                </button>
              </div>
              <div className="shaping__fields">
                <div className="field field--compact">
                  <label htmlFor={`${ids}-${rule.id}-kind`}>{t('shaping.kind')}</label>
                  <select
                    id={`${ids}-${rule.id}-kind`}
                    value={rule.kind}
                    onChange={(e) => {
                      const kind = e.target.value as ShapingRule['kind'];
                      change(rule.id, { kind, ...DEFAULT_SYMBOLS[kind] });
                    }}
                  >
                    <option value="decrease">{t('shaping.decrease')}</option>
                    <option value="increase">{t('shaping.increase')}</option>
                  </select>
                </div>
                <div className="field field--compact">
                  <label htmlFor={`${ids}-${rule.id}-where`}>{t('shaping.where')}</label>
                  <select
                    id={`${ids}-${rule.id}-where`}
                    value={halves ? rule.where : 'edges'}
                    onChange={(e) =>
                      change(rule.id, { where: e.target.value as ShapingRule['where'] })
                    }
                  >
                    <option value="edges">{t('shaping.edges')}</option>
                    {halves && <option value="sides">{t('shaping.sides')}</option>}
                  </select>
                </div>
                <NumberField
                  compact
                  label={t('shaping.start')}
                  value={rule.start}
                  min={1}
                  max={1000}
                  onCommit={(start) => start && change(rule.id, { start })}
                />
                <NumberField
                  compact
                  label={t('shaping.every')}
                  value={rule.every}
                  min={1}
                  max={1000}
                  onCommit={(every) => every && change(rule.id, { every })}
                />
                <NumberField
                  compact
                  label={t('shaping.times')}
                  value={rule.times}
                  min={1}
                  max={500}
                  onCommit={(times) => times && change(rule.id, { times })}
                />
                <NumberField
                  compact
                  label={t('shaping.inset')}
                  value={rule.inset}
                  min={0}
                  max={50}
                  hint={t('shaping.insetHint')}
                  onCommit={(inset) => inset !== undefined && change(rule.id, { inset })}
                />
              </div>
              <div className="shaping__symbols">
                {(['right', 'left'] as const).map((side) => (
                  <fieldset key={side} className="shaping__symbol">
                    <legend>{t(side === 'right' ? 'shaping.right' : 'shaping.left')}</legend>
                    {symbolsOf(rule.kind).map((s) => (
                      <label key={s.id} className="shaping__choice" title={s.description[lang]}>
                        <input
                          type="radio"
                          name={`${ids}-${rule.id}-${side}`}
                          checked={rule[side] === s.id}
                          onChange={() => change(rule.id, { [side]: s.id })}
                        />
                        <SymbolGlyph glyph={s.glyph} width={s.width} cell={22} />
                        <span>{s.label[lang]}</span>
                      </label>
                    ))}
                  </fieldset>
                ))}
              </div>
              <p className="hint">
                {t(rule.kind === 'decrease' ? 'shaping.saysDecrease' : 'shaping.saysIncrease', {
                  count: places * rows.length,
                  rows: rows.slice(0, 5).join(', ') + (rows.length > 5 ? '…' : '') || '–',
                })}
              </p>
              {lost > 0 && (
                <p className="notice notice--warning">
                  {t('shaping.beyond', { count: lost, height: design.height })}
                </p>
              )}
            </li>
          );
        })}
      </ol>
      {tooWide && <p className="notice notice--warning">{t('shaping.tooWide')}</p>}
      <button type="button" className="btn btn--small" onClick={add}>
        <Icon name="plus" size={18} />
        {t('shaping.add')}
      </button>
    </section>
  );
}

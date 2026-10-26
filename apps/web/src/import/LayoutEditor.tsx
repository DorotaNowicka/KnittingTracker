import type { ResolvedPattern } from '@kt/core';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { PatternPreview } from '../editor/PatternPreview';
import { CommitNumber } from '../ui/CommitNumber';
import { NumberField } from '../ui/fields';
import { Icon } from '../ui/Icon';
import type { PartSetup } from './elements';
import type { ChartDraft } from './session';

/**
 * A part's round, as the knitter puts it together: charts added by clicking, each next one to the
 * left of the ones before (the first starts at stitch 1, on the right), each as many stitches
 * wide as she says; the stitches of the whole round and the length to knit. The grid below shows
 * the result, charts in the middle of the round (for a body in the round: of the front and of the
 * back) when they take fewer stitches.
 */
export function LayoutEditor({
  setup,
  charts,
  stage,
  round,
  halves,
  length,
  onChange,
}: {
  setup: PartSetup;
  /** All charts of the file (index = chart in the setup). */
  charts: readonly ChartDraft[];
  /** The part's grid as it would be built now. */
  stage: ResolvedPattern | null;
  round: boolean;
  /** The part is a body in the round: front and back. */
  halves: boolean;
  /** The length the file gives for this part (chosen size), if any. */
  length: { readonly cm: number; readonly evidence: string } | null;
  onChange(setup: PartSetup): void;
}) {
  const { t } = useTranslation();
  const ids = useId();
  const widthOf = (i: number) => charts[i]?.rows[0]?.length ?? 1;
  const seq = setup.sequence;
  // The round follows the charts while it is just their sum; a wider round typed in stays.
  const set = (sequence: PartSetup['sequence']) => {
    const before = setup.sequence.reduce((n, s) => n + s.stitches, 0);
    const after = sequence.reduce((n, s) => n + s.stitches, 0);
    const stitches = setup.stitches <= before ? Math.max(1, after) : setup.stitches;
    onChange({ ...setup, sequence, stitches });
  };
  const move = (from: number, to: number) => {
    if (to < 0 || to >= seq.length) return;
    const next = [...seq];
    const [item] = next.splice(from, 1);
    if (item) next.splice(to, 0, item);
    set(next);
  };
  const used = seq.reduce((n, s) => n + s.stitches, 0);
  const rest = setup.stitches - used;
  const front = Math.ceil(setup.stitches / 2);
  const twice = halves && seq.length > 0 && used <= setup.stitches - front;
  const cm = setup.cm === undefined ? (length?.cm ?? null) : setup.cm;
  const unit = round ? 'round' : 'row';

  return (
    <div className="layout-editor">
      <p className="hint">{t('layout.hint')}</p>
      <div className="layout-editor__add" role="group" aria-label={t('layout.add')}>
        {charts.map((c, i) => (
          <button
            key={i}
            type="button"
            className="btn btn--small"
            onClick={() => set([...seq, { chart: i, stitches: widthOf(i) }])}
          >
            <Icon name="plus" size={16} />
            {c.name}
            <span className="hint num">
              {t('editor.chartSize', { w: widthOf(i), h: c.rows.length })}
            </span>
          </button>
        ))}
      </div>

      {seq.length === 0 ? (
        <p className="hint">{t('layout.empty')}</p>
      ) : (
        <>
          <ol className="layout-seq" aria-label={t('layout.order')}>
            {seq.map((s, i) => (
              <li key={`${i}-${s.chart}`} className="layout-seq__item">
                <b>{charts[s.chart]?.name ?? '?'}</b>
                <CommitNumber
                  key={`${i}-${s.stitches}`}
                  label={t('layout.stitchesOf', { name: charts[s.chart]?.name ?? '' })}
                  value={s.stitches}
                  unit={t('layout.stitchesUnit')}
                  max={1000}
                  hideLabel
                  onCommit={(v) =>
                    set(seq.map((x, k) => (k === i ? { ...x, stitches: Math.max(1, v) } : x)))
                  }
                />
                <span className="layout-seq__tools">
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={t('layout.later', { name: charts[s.chart]?.name ?? '' })}
                    disabled={i === seq.length - 1}
                    onClick={() => move(i, i + 1)}
                  >
                    <Icon name="back" size={16} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn layout-seq__earlier"
                    aria-label={t('layout.earlier', { name: charts[s.chart]?.name ?? '' })}
                    disabled={i === 0}
                    onClick={() => move(i, i - 1)}
                  >
                    <Icon name="back" size={16} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={t('layout.remove', { name: charts[s.chart]?.name ?? '' })}
                    onClick={() => set(seq.filter((_, k) => k !== i))}
                  >
                    <Icon name="close" size={16} />
                  </button>
                </span>
              </li>
            ))}
          </ol>
          <p className="layout-seq__ends hint" aria-hidden="true">
            <span>← {t('layout.next')}</span>
            <span>{t('layout.first')} →</span>
          </p>
        </>
      )}

      <div className="form-grid form-grid--2 layout-editor__fields">
        <NumberField
          label={t(`layout.stitches.${unit}`)}
          value={setup.stitches}
          min={1}
          max={1000}
          onCommit={(v) => onChange({ ...setup, stitches: v })}
        />
        <NumberField
          label={t('layout.cm')}
          value={cm ?? undefined}
          min={1}
          max={300}
          decimals
          hint={
            length ? t('layout.cmFromFile', { words: length.evidence }) : t('layout.cmNotInFile')
          }
          onCommit={(v) => onChange({ ...setup, cm: v })}
        />
      </div>
      {cm !== null && (
        <button type="button" className="link-btn" onClick={() => onChange({ ...setup, cm: null })}>
          {t('layout.noLength')}
        </button>
      )}
      <p
        className={`layout-editor__status${rest < 0 ? ' layout-editor__status--warn' : ''}`}
        id={`${ids}-status`}
        role="status"
      >
        {seq.length === 0
          ? t('layout.noCharts')
          : rest === 0
            ? t(`layout.fits.${unit}`)
            : rest < 0
              ? t(`layout.over.${unit}`, { used, count: setup.stitches })
              : t(twice ? 'layout.centredHalves' : 'layout.centred', { used, rest })}
      </p>
      {cm !== null && <p className="hint">{t(`layout.repeatTo.${unit}`, { cm })}</p>}
      {stage ? <PatternPreview stage={stage} /> : null}
    </div>
  );
}

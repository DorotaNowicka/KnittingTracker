import type { ResolvedPattern } from '@kt/core';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { PatternPreview } from '../editor/PatternPreview';
import { yarnColors } from '../lib/yarns';
import { NumberField } from '../ui/fields';
import type { PartSetup, StackEntry } from './elements';
import { useImport } from './session';

/**
 * "Popraw" of one band of a stack (a yoke's band between arrows): the stitches it is worked over
 * — its chart goes round as many times as they hold — and, for a chart worked to a length, the
 * length. Its rows come from the chart.
 */
export function BandEditor({
  entry,
  setup,
  stage,
  round,
  onChange,
}: {
  entry: StackEntry;
  /** The knitter's corrections so far, if any. */
  setup: PartSetup | undefined;
  stage: ResolvedPattern | null;
  round: boolean;
  onChange(setup: PartSetup): void;
}) {
  const { t } = useTranslation();
  const list = useImport.getState().yarns();
  const key = list.map((y) => `${y.id}${y.color}`).join();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the same colours, the same map
  const colors = useMemo(() => yarnColors(list), [key]);
  const stitches = setup?.stitches ?? entry.stitches;
  const only = entry.sequence.length === 1 ? entry.sequence[0] : undefined;
  const width = only?.chart.rows[0]?.length ?? 0;
  const cm = setup?.cm === undefined ? (entry.cm ?? null) : setup.cm;
  const unit = round ? 'round' : 'row';
  const save = (change: Partial<PartSetup>) =>
    onChange({ sequence: [], stitches, ...(cm !== null ? { cm } : {}), ...setup, ...change });
  return (
    <div className="layout-editor">
      <p className="hint">{t('band.hint')}</p>
      <div className="form-grid form-grid--2 layout-editor__fields">
        <NumberField
          label={t(`layout.stitches.${unit}`)}
          value={stitches}
          min={1}
          max={1000}
          onCommit={(v) => save({ stitches: v })}
        />
        {entry.rows === undefined && (
          <NumberField
            label={t('layout.cm')}
            value={cm ?? undefined}
            min={1}
            max={300}
            decimals
            onCommit={(v) => save({ cm: v })}
          />
        )}
      </div>
      <p
        className={`layout-editor__status${width > 0 && stitches % width !== 0 ? ' layout-editor__status--warn' : ''}`}
        role="status"
      >
        {width > 0 && stitches % width === 0
          ? t('band.fits', { count: stitches / width, width })
          : width > 0
            ? t(`band.notEven.${unit}`, { width, rest: stitches % width })
            : ''}
      </p>
      {stage ? <PatternPreview stage={stage} yarns={colors} /> : null}
    </div>
  );
}

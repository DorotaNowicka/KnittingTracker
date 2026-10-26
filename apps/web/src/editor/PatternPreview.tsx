import type { ResolvedPattern } from '@kt/core';
import { editorOverlay, patternSource, visibleRowCount } from '@kt/grid-renderer';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { EditorCanvas } from './EditorCanvas';

/** A pattern's grid to look at (pan and zoom, no marking): its first rows, at least two repeats. */
export function PatternPreview({ stage }: { stage: ResolvedPattern | null }) {
  const { t } = useTranslation();
  const rows = stage ? visibleRowCount(stage, 1, 'end') : 1;
  const shown = stage ? Math.min(rows, Math.max(tallestRows(stage), 12)) : 1;
  const source = useMemo(
    () => (stage && stage.stitchCount > 0 ? patternSource(stage, shown) : null),
    [stage, shown],
  );
  const overlay = useMemo(() => editorOverlay({}), []);
  if (!stage || !source) return <p className="hint">{t('patternEdit.previewEmpty')}</p>;
  return (
    <div className="stage-preview">
      <EditorCanvas
        source={source}
        overlay={overlay}
        tool="view"
        label={t('patternEdit.previewLabel')}
        help={t('patternEdit.previewHelp')}
        fitKey={`${stage.pattern.id}-${stage.sizeIndex}-${stage.stitchCount}`}
        testId="stage-preview"
      />
      <p className="hint">
        {stage.plannedRows === null
          ? t('patternEdit.previewRowsOpen', { shown })
          : t('patternEdit.previewRows', { shown, rows: stage.plannedRows })}
      </p>
    </div>
  );
}

/** Two repeats of the tallest chart. */
const tallestRows = (stage: ResolvedPattern) =>
  Math.max(1, ...stage.zones.map((z) => z.chart.chart.height)) * 2;

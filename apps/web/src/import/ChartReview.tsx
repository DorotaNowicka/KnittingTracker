import { applySymbolRows, blankChart, parseChart, paintCell, type SymbolRegistry } from '@kt/core';
import { cropRgba, type FoundChart, type ImportResult } from '@kt/importer';
import { chartSource, editorOverlay } from '@kt/grid-renderer';
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { EditorCanvas, type CellPoint } from '../editor/EditorCanvas';
import { TextField } from '../ui/fields';
import { SymbolGlyph } from '../ui/SymbolGlyph';
import { UNCERTAIN, useImport, type ChartDraft } from './session';

/**
 * One recognised chart on the verification screen: the original next to the recognised grid,
 * uncertain cells outlined, and quick fixes for the selected cell (FR-1 step 3).
 */
export function ChartReview({
  index,
  found,
  draft,
  result,
  registry,
  selectable = true,
}: {
  index: number;
  found: FoundChart;
  draft: ChartDraft;
  result: ImportResult;
  registry: SymbolRegistry;
  /** Show the "use this chart" switch (off when charts are assigned to garment elements). */
  selectable?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith('en') ? 'en' : 'pl';
  const ids = useId();
  const update = (change: Partial<ChartDraft>) => useImport.getState().updateChart(index, change);
  const [cursor, setCursor] = useState<CellPoint | null>(null);
  const width = draft.rows[0]?.length ?? 0;
  const height = draft.rows.length;
  const shown = !selectable || draft.include;

  const parsed = useMemo(() => {
    const chart = applySymbolRows(
      blankChart({ id: `c${index}`, name: draft.name || '—' }, 1, 1),
      draft.rows,
    );
    return parseChart(chart, registry);
  }, [draft.rows, draft.name, index, registry]);
  const source = useMemo(() => chartSource(parsed, registry), [parsed, registry]);
  const uncertain = useMemo(() => {
    const out: CellPoint[] = [];
    draft.confidence.forEach((row, r) =>
      row.forEach((c, col) => {
        if (c < UNCERTAIN) out.push({ row: r + 1, col: col + 1 });
      }),
    );
    return out;
  }, [draft.confidence]);
  const overlay = useMemo(
    () => editorOverlay({ cursor, highlights: uncertain }),
    [cursor, uncertain],
  );

  const cell = cursor ? found.recognized.cells[cursor.row - 1]?.[cursor.col - 1] : undefined;
  const anchorCol = cursor
    ? cursor.col - (parsed.cells[cursor.row - 1]?.[cursor.col - 1]?.part ?? 0)
    : 0;
  const current = cursor ? parsed.cells[cursor.row - 1]?.[anchorCol - 1]?.symbolId : undefined;
  const currentDef = current ? registry.get(current) : undefined;
  const choices = [...new Set([...(cell?.candidates.map((c) => c.value) ?? []), ...result.symbols])]
    .map((id) => registry.get(id))
    .filter((d) => d !== undefined)
    .slice(0, 12);

  /** Set the symbol at the cursor (or confirm the current one) and mark those cells as checked. */
  const choose = (symbolId: string | null) => {
    if (!cursor) return;
    const rows = symbolId
      ? paintCell(draft.rows, registry, cursor.row, anchorCol, symbolId)
      : draft.rows;
    const w = registry.get(symbolId ?? current ?? '')?.width ?? 1;
    const confidence = draft.confidence.map((row, r) =>
      r === cursor.row - 1
        ? row.map((c, col) => (col + 1 >= anchorCol && col + 1 < anchorCol + w ? 1 : c))
        : row,
    );
    update({ rows, confidence });
  };

  const nextUncertain = () => {
    if (uncertain.length === 0) return;
    // Reading order of a knitter: bottom row first, right to left.
    const order = [...uncertain].sort((a, b) => a.row - b.row || b.col - a.col);
    const after = cursor
      ? order.find((p) => p.row > cursor.row || (p.row === cursor.row && p.col < cursor.col))
      : undefined;
    setCursor(after ?? order[0] ?? null);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
      ArrowUp: [1, 0],
      ArrowDown: [-1, 0],
    };
    const m = moves[e.key];
    if (m) {
      e.preventDefault();
      // The first arrow press shows the cursor where knitting starts: row 1, rightmost stitch.
      if (!cursor) {
        setCursor({ row: 1, col: width });
        return;
      }
      const from = cursor;
      setCursor({
        row: Math.min(height, Math.max(1, from.row + m[0])),
        col: Math.min(width, Math.max(1, from.col + m[1])),
      });
    } else if (e.key === 'Enter' && cursor) {
      e.preventDefault();
      choose(null);
    } else if (/^[1-9]$/.test(e.key) && cursor) {
      const d = choices[Number(e.key) - 1];
      if (d) {
        e.preventDefault();
        choose(d.id);
      }
    } else if (e.key.toLowerCase() === 'n') {
      e.preventDefault();
      nextUncertain();
    }
  };

  return (
    <article className={`review${shown ? '' : ' review--off'}`} aria-labelledby={`${ids}-t`}>
      <header className="review__head">
        <h3 id={`${ids}-t`} className="review__title">
          {t('importer.chartN', { n: index + 1 })}
          <span className="review__dims num">{t('editor.chartSize', { w: width, h: height })}</span>
        </h3>
        <TextField
          label={t('editor.chartName')}
          value={draft.name}
          required
          maxLength={40}
          className="field--compact review__name"
          hint={t('importer.nameHint')}
          onCommit={(name) => update({ name })}
        />
        {selectable && (
          <label className="check">
            <input
              type="checkbox"
              checked={draft.include}
              onChange={(e) => update({ include: e.target.checked })}
            />
            {t('importer.include')}
          </label>
        )}
      </header>
      {shown && (
        <>
          <p
            className={`review__status${uncertain.length ? ' review__status--todo' : ''}`}
            role="status"
          >
            {uncertain.length
              ? t('importer.uncertain', { count: uncertain.length })
              : t('importer.allChecked')}
          </p>
          <div className="review__panes">
            <figure className="review__pane">
              <figcaption className="hint">{t('importer.original')}</figcaption>
              <Original result={result} found={found} cursor={cursor} />
            </figure>
            <div className="review__pane review__pane--grid">
              <p className="hint">{t('importer.recognised')}</p>
              <div className="review__grid">
                <svg
                  className="review__spacer"
                  viewBox={`0 0 ${width + 3} ${height + 4}`}
                  aria-hidden="true"
                  focusable="false"
                />
                <div className="review__grid-canvas">
                  <EditorCanvas
                    source={source}
                    overlay={overlay}
                    tool="select"
                    label={t('importer.gridLabel', { name: draft.name })}
                    help={t('importer.gridHelp')}
                    fitKey={`${index}-${width}x${height}`}
                    reveal={cursor}
                    onStrokeStart={(c) => setCursor(c)}
                    onKeyDown={onKeyDown}
                    testId={`review-grid-${index}`}
                  />
                </div>
              </div>
            </div>
          </div>
          <div className="review__fix">
            <button
              type="button"
              className="btn btn--small"
              onClick={nextUncertain}
              disabled={uncertain.length === 0}
            >
              {t('importer.next')}
            </button>
            {cursor && (
              <div
                className="review__choices"
                role="group"
                aria-label={t('importer.fixLabel', {
                  row: cursor.row,
                  stitch: width - anchorCol + 1,
                })}
              >
                <p className="hint">
                  {t('importer.cellIs', {
                    row: cursor.row,
                    stitch: width - anchorCol + 1,
                    symbol: currentDef?.label[lang] ?? '…',
                  })}
                </p>
                <button
                  type="button"
                  className="btn btn--small btn--primary"
                  onClick={() => choose(null)}
                >
                  {t('importer.confirm')}
                </button>
                {choices.map((d, i) => (
                  <button
                    key={d.id}
                    type="button"
                    className="palette__item palette__item--inline"
                    aria-pressed={d.id === current}
                    title={i < 9 ? `${d.label[lang]} (${i + 1})` : d.label[lang]}
                    onClick={() => choose(d.id)}
                  >
                    <SymbolGlyph
                      glyph={d.glyph}
                      width={d.width}
                      cell={Math.min(22, 60 / d.width)}
                    />
                    <span className="palette__label">{d.label[lang]}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </article>
  );
}

/** The chart as it appears in the file, with the selected cell outlined. */
function Original({
  result,
  found,
  cursor,
}: {
  result: ImportResult;
  found: FoundChart;
  cursor: CellPoint | null;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLCanvasElement>(null);
  const view = useMemo(() => {
    const src = result.sources[found.source];
    return src ? cropRgba(src, found.view.x, found.view.y, found.view.w, found.view.h) : null;
  }, [result, found]);

  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx || !view) return;
    // Upscale small images so cells are visible.
    const k = Math.max(1, Math.min(4, Math.round(480 / Math.max(1, view.width))));
    c.width = view.width * k;
    c.height = view.height * k;
    const tmp = document.createElement('canvas');
    tmp.width = view.width;
    tmp.height = view.height;
    tmp
      .getContext('2d')
      ?.putImageData(
        new ImageData(new Uint8ClampedArray(view.rgba), view.width, view.height),
        0,
        0,
      );
    ctx.imageSmoothingEnabled = k === 1;
    ctx.drawImage(tmp, 0, 0, c.width, c.height);
    if (cursor) {
      const g = found.grid;
      const rowTop = g.rows - cursor.row;
      const x0 = ((g.xs[cursor.col - 1] ?? 0) - found.view.x) * k;
      const x1 = ((g.xs[cursor.col] ?? 0) - found.view.x) * k;
      const y0 = ((g.ys[rowTop] ?? 0) - found.view.y) * k;
      const y1 = ((g.ys[rowTop + 1] ?? 0) - found.view.y) * k;
      ctx.lineWidth = Math.max(2, k);
      ctx.strokeStyle = '#d8961a';
      ctx.strokeRect(x0 - 1, y0 - 1, x1 - x0 + 2, y1 - y0 + 2);
    }
  }, [view, cursor, found]);

  if (!view) return <p className="hint">{t('importer.noOriginal')}</p>;
  return (
    <canvas
      ref={ref}
      className="review__original"
      role="img"
      aria-label={t('importer.originalLabel')}
    />
  );
}

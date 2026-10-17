import {
  moveItem,
  newChartSegment,
  newMarker,
  patternRegistry,
  resolveStage,
  sizeValueAt,
  updateStage,
  validatePattern,
  type ChartSegment,
  type Pattern,
  type ResolvedStage,
  type Segment,
  type Stage,
} from '@kt/core';
import { editorOverlay, stageSource, visibleRowCount } from '@kt/grid-renderer';
import type { TFunction } from 'i18next';
import { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DraftGate, SaveState } from '../editor/DraftGate';
import { EditorCanvas } from '../editor/EditorCanvas';
import { Link } from '../lib/Link';
import { paths } from '../lib/router';
import { useDraft } from '../state/draft';
import { DiagnosticsPanel } from '../ui/Diagnostics';
import { NumberField, SizeValueField, TextField } from '../ui/fields';
import { Icon } from '../ui/Icon';
import { AppHeader } from './AppHeader';

export function StagePage({ patternId, stageId }: { patternId: string; stageId: string }) {
  const { t } = useTranslation();
  return (
    <DraftGate id={patternId}>
      {(pattern) => {
        const stage = pattern.stages.find((s) => s.id === stageId);
        if (!stage) {
          return (
            <main className="page" id="main">
              <h1 className="page__title">{t('stage.missing')}</h1>
              <Link className="btn" to={paths.pattern(patternId)}>
                {t('chartEditor.back')}
              </Link>
            </main>
          );
        }
        return <StageEditor patternId={patternId} pattern={pattern} stage={stage} />;
      }}
    </DraftGate>
  );
}

const setStage = (stage: Stage) => useDraft.getState().update((p) => updateStage(p, stage));

/** Remove an optional key without leaving `undefined` behind (exactOptionalPropertyTypes). */
function without<T extends object, K extends keyof T>(obj: T, key: K): Omit<T, K> {
  const { [key]: _drop, ...rest } = obj;
  return rest;
}

function StageEditor({
  patternId,
  pattern,
  stage,
}: {
  patternId: string;
  pattern: Pattern;
  stage: Stage;
}) {
  const { t } = useTranslation();
  const ids = useId();
  const [size, setSize] = useState(() =>
    Math.min(pattern.sizes.length - 1, pattern.sizes.length > 2 ? 1 : 0),
  );
  const sizeIndex = Math.min(size, pattern.sizes.length - 1);
  const sizes = pattern.sizes;

  const resolved = useMemo(() => {
    try {
      const registry = patternRegistry(pattern);
      return sizes.map((_, i) => resolveStage(pattern, stage.id, i, { registry }));
    } catch {
      return null;
    }
  }, [pattern, stage.id, sizes]);
  const current: ResolvedStage | null = resolved?.[sizeIndex] ?? null;
  const report = useMemo(() => validatePattern(pattern), [pattern]);
  const charts = new Set(stage.layout.flatMap((s) => (s.kind === 'chart' ? [s.chartId] : [])));
  const diagnostics = report.diagnostics.filter(
    (d) =>
      d.stageId === stage.id ||
      (d.stageId === undefined && d.chartId !== undefined && charts.has(d.chartId)),
  );

  const setLayout = (layout: Segment[]) =>
    setStage({ ...stage, layout: layout.length > 0 ? layout : [newMarker(stage)] });
  const replaceSegment = (index: number, seg: Segment) =>
    setLayout(stage.layout.map((s, i) => (i === index ? seg : s)));
  const addChartSegment = (chartId: string) => {
    const chart = pattern.charts.find((c) => c.id === chartId);
    if (chart) setLayout([...stage.layout, newChartSegment(stage, chart)]);
  };

  return (
    <>
      <AppHeader />
      <main className="page page--wide" id="main">
        <p className="page__back">
          <Link to={paths.pattern(patternId)} className="link-back">
            <Icon name="back" size={18} />
            {pattern.title}
          </Link>
          <SaveState />
        </p>
        <h1 className="page__title">{t('stage.title', { name: stage.name })}</h1>
        <p className="lead">{t('stage.intro')}</p>

        <section className="editor-section" aria-labelledby={`${ids}-basics`}>
          <h2 id={`${ids}-basics`} className="section-title">
            {t('stage.basics')}
          </h2>
          <TextField
            label={t('stage.name')}
            value={stage.name}
            required
            maxLength={60}
            onCommit={(name) => setStage({ ...stage, name })}
          />
          <fieldset className="field">
            <legend>{t('stage.construction')}</legend>
            <div className="segmented">
              {(['round', 'flat'] as const).map((c) => (
                <label key={c} className="segmented__item">
                  <input
                    type="radio"
                    name={`${ids}-con`}
                    checked={stage.construction === c}
                    onChange={() => setStage({ ...stage, construction: c })}
                  />
                  <span>{t(c === 'round' ? 'editor.round' : 'editor.flat')}</span>
                </label>
              ))}
            </div>
            <p className="hint">
              {t(stage.construction === 'round' ? 'stage.roundHint' : 'stage.flatHint')}
            </p>
          </fieldset>
          {stage.construction === 'flat' && (
            <fieldset className="field">
              <legend>{t('stage.firstRow')}</legend>
              {(['RS', 'WS'] as const).map((side) => (
                <label key={side} className="check">
                  <input
                    type="radio"
                    name={`${ids}-side`}
                    checked={stage.firstRowSide === side}
                    onChange={() => setStage({ ...stage, firstRowSide: side })}
                  />
                  {t(side === 'RS' ? 'rowText.rs' : 'rowText.ws')}
                </label>
              ))}
            </fieldset>
          )}
          <div className="form-grid">
            <div>
              <label className="check">
                <input
                  type="checkbox"
                  checked={stage.rows !== undefined}
                  onChange={(e) =>
                    setStage(
                      e.target.checked
                        ? { ...stage, rows: Math.max(1, tallest(current)) }
                        : without(stage, 'rows'),
                    )
                  }
                />
                {t('stage.hasRows')}
              </label>
              {stage.rows !== undefined ? (
                <SizeValueField
                  label={t('stage.rows')}
                  value={stage.rows}
                  sizes={sizes}
                  min={1}
                  max={5000}
                  onCommit={(rows) => setStage({ ...stage, rows })}
                />
              ) : (
                <p className="hint">{t('stage.openEnded')}</p>
              )}
            </div>
            <div>
              <label className="check">
                <input
                  type="checkbox"
                  checked={stage.expectedStitches !== undefined}
                  onChange={(e) =>
                    setStage(
                      e.target.checked
                        ? { ...stage, expectedStitches: resolved?.map((r) => r.stitchCount) ?? 0 }
                        : without(stage, 'expectedStitches'),
                    )
                  }
                />
                {t('stage.hasExpected')}
              </label>
              {stage.expectedStitches !== undefined ? (
                <SizeValueField
                  label={t('stage.expected')}
                  value={stage.expectedStitches}
                  sizes={sizes}
                  min={0}
                  max={5000}
                  hint={t('stage.expectedHint')}
                  onCommit={(expectedStitches) => setStage({ ...stage, expectedStitches })}
                />
              ) : (
                <p className="hint">{t('stage.expectedOff')}</p>
              )}
            </div>
          </div>
        </section>

        <section className="editor-section" aria-labelledby={`${ids}-layout`}>
          <h2 id={`${ids}-layout`} className="section-title">
            {t('stage.layout')}
          </h2>
          <p className="hint">{t('stage.layoutHint')}</p>
          <ol className="segments">
            {stage.layout.map((seg, i) => (
              <li
                key={seg.kind === 'chart' ? seg.placementId : seg.id}
                className={`segment segment--${seg.kind}`}
              >
                <div className="segment__head">
                  <span className="segment__index num" aria-hidden="true">
                    {i + 1}
                  </span>
                  <span className="segment__range num">{rangeLabel(current, seg, t)}</span>
                  <div className="segment__controls">
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={t('stage.moveUp')}
                      disabled={i === 0}
                      onClick={() => setLayout(moveItem(stage.layout, i, i - 1))}
                    >
                      <Icon name="up" />
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={t('stage.moveDown')}
                      disabled={i === stage.layout.length - 1}
                      onClick={() => setLayout(moveItem(stage.layout, i, i + 1))}
                    >
                      <Icon name="down" />
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={t('stage.remove')}
                      onClick={() => setLayout(stage.layout.filter((_, k) => k !== i))}
                    >
                      <Icon name="trash" />
                    </button>
                  </div>
                </div>
                {seg.kind === 'chart' ? (
                  <ChartSegmentEditor
                    pattern={pattern}
                    seg={seg}
                    onChange={(next) => replaceSegment(i, next)}
                  />
                ) : (
                  <TextField
                    label={t('stage.markerName')}
                    value={seg.sectionName ?? ''}
                    maxLength={40}
                    hint={t('stage.markerHint')}
                    className="field--compact"
                    onCommit={(v) =>
                      replaceSegment(
                        i,
                        v.trim() ? { ...seg, sectionName: v } : without(seg, 'sectionName'),
                      )
                    }
                  />
                )}
              </li>
            ))}
          </ol>
          <div className="choose__actions">
            {pattern.charts.length === 0 ? (
              <p className="hint">
                {t('stage.noCharts')}{' '}
                <Link to={paths.pattern(patternId)}>{t('stage.toCharts')}</Link>
              </p>
            ) : (
              <div className="field field--inline">
                <label htmlFor={`${ids}-add`}>{t('stage.addChart')}</label>
                <select
                  id={`${ids}-add`}
                  value=""
                  onChange={(e) => {
                    if (e.target.value) addChartSegment(e.target.value);
                  }}
                >
                  <option value="">{t('stage.pickChart')}</option>
                  {pattern.charts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.width}×{c.height})
                    </option>
                  ))}
                </select>
              </div>
            )}
            <button
              type="button"
              className="btn btn--small"
              onClick={() => setLayout([...stage.layout, newMarker(stage)])}
            >
              <Icon name="marker" size={18} />
              {t('stage.addMarker')}
            </button>
          </div>
        </section>

        <section className="editor-section" aria-labelledby={`${ids}-sum`}>
          <h2 id={`${ids}-sum`} className="section-title">
            {t('stage.summary')}
          </h2>
          <table className="size-table">
            <thead>
              <tr>
                <th scope="col">{t('newProject.size')}</th>
                <th scope="col">{t('stage.stitches')}</th>
                <th scope="col">{t('stage.expected')}</th>
                <th scope="col">{t('stage.rows')}</th>
              </tr>
            </thead>
            <tbody>
              {sizes.map((label, i) => {
                const r = resolved?.[i];
                const expected = sizeValueAt(stage.expectedStitches, i);
                const ok = expected === undefined || expected === r?.stitchCount;
                return (
                  <tr key={`${label}-${i}`}>
                    <th scope="row">{label}</th>
                    <td className="num">{r?.stitchCount ?? '–'}</td>
                    <td className="num">
                      {expected === undefined ? (
                        '–'
                      ) : (
                        <span className={ok ? 'ok' : 'bad'}>
                          {expected} <span aria-hidden="true">{ok ? '✓' : '✗'}</span>
                          <span className="visually-hidden">
                            {ok ? t('stage.matches') : t('stage.differs')}
                          </span>
                        </span>
                      )}
                    </td>
                    <td className="num">{r?.plannedRows ?? t('stage.open')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <DiagnosticsPanel items={diagnostics} />
        </section>

        <section className="editor-section" aria-labelledby={`${ids}-pre`}>
          <div className="section-head">
            <h2 id={`${ids}-pre`} className="section-title">
              {t('stage.preview')}
            </h2>
            {sizes.length > 1 && (
              <div className="field field--inline">
                <label htmlFor={`${ids}-psize`}>{t('newProject.size')}</label>
                <select
                  id={`${ids}-psize`}
                  value={sizeIndex}
                  onChange={(e) => setSize(Number(e.target.value))}
                >
                  {sizes.map((s, i) => (
                    <option key={`${s}-${i}`} value={i}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <Preview stage={current} />
        </section>

        <div className="form-actions">
          <Link className="btn btn--primary" to={paths.pattern(patternId)}>
            {t('stage.done')}
          </Link>
        </div>
      </main>
    </>
  );
}

function tallest(stage: ResolvedStage | null): number {
  return Math.max(1, ...(stage?.zones.map((z) => z.chart.chart.height) ?? [1]));
}

function rangeLabel(stage: ResolvedStage | null, seg: Segment, t: TFunction) {
  if (!stage) return '';
  if (seg.kind === 'marker') {
    const m = stage.markers.find((x) => x.id === seg.id);
    return m ? t('stage.markerAt', { n: m.afterStitch }) : '';
  }
  const z = stage.zones.find((x) => x.placementId === seg.placementId);
  return z ? t('stage.range', { from: z.firstStitch, to: z.lastStitch }) : t('stage.noStitches');
}

function ChartSegmentEditor({
  pattern,
  seg,
  onChange,
}: {
  pattern: Pattern;
  seg: ChartSegment;
  onChange(seg: ChartSegment): void;
}) {
  const { t } = useTranslation();
  const ids = useId();
  const chart = pattern.charts.find((c) => c.id === seg.chartId);
  const width = chart?.width ?? 1;
  const height = chart?.height ?? 1;
  const custom = seg.stitches !== undefined;
  return (
    <div className="segment__body">
      <div className="field field--compact">
        <label htmlFor={`${ids}-chart`}>{t('stage.chart')}</label>
        <select
          id={`${ids}-chart`}
          value={seg.chartId}
          onChange={(e) =>
            onChange(
              without(without({ ...seg, chartId: e.target.value }, 'startColumn'), 'rowOffset'),
            )
          }
        >
          {pattern.charts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.width}×{c.height})
            </option>
          ))}
        </select>
      </div>
      <fieldset className="field field--compact">
        <legend>{t('stage.stitchesTitle')}</legend>
        <label className="check">
          <input
            type="radio"
            name={`${ids}-st`}
            checked={!custom}
            onChange={() => onChange(without(seg, 'stitches'))}
          />
          {t('stage.fullWidth', { n: width })}
        </label>
        <label className="check">
          <input
            type="radio"
            name={`${ids}-st`}
            checked={custom}
            onChange={() => onChange({ ...seg, stitches: width })}
          />
          {t('stage.customWidth')}
        </label>
        {custom && (
          <SizeValueField
            label={t('stage.stitchCount')}
            value={seg.stitches}
            sizes={pattern.sizes}
            min={0}
            max={2000}
            hint={t('stage.partialHint')}
            onCommit={(stitches) => onChange({ ...seg, stitches })}
          />
        )}
      </fieldset>
      <details className="segment__more">
        <summary>{t('stage.more')}</summary>
        <div className="form-grid form-grid--3">
          <NumberField
            label={t('stage.startColumn')}
            value={seg.startColumn ?? width}
            min={1}
            max={width}
            hint={t('stage.startColumnHint', { w: width })}
            onCommit={(v) =>
              onChange(v === width ? without(seg, 'startColumn') : { ...seg, startColumn: v })
            }
          />
          <NumberField
            label={t('stage.startRow')}
            value={(seg.rowOffset ?? 0) + 1}
            min={1}
            max={height}
            hint={t('stage.startRowHint')}
            onCommit={(v) =>
              onChange(v === 1 ? without(seg, 'rowOffset') : { ...seg, rowOffset: v - 1 })
            }
          />
          <TextField
            label={t('stage.label')}
            value={seg.label ?? ''}
            maxLength={40}
            hint={t('stage.labelHint', { name: chart?.name ?? '' })}
            onCommit={(v) => onChange(v.trim() ? { ...seg, label: v } : without(seg, 'label'))}
          />
        </div>
      </details>
    </div>
  );
}

function Preview({ stage }: { stage: ResolvedStage | null }) {
  const { t } = useTranslation();
  const rows = stage ? visibleRowCount(stage, 1, 'stageEnd') : 1;
  const shown = stage ? Math.min(rows, Math.max(tallestRows(stage), 12)) : 1;
  const source = useMemo(
    () => (stage && stage.stitchCount > 0 ? stageSource(stage, shown) : null),
    [stage, shown],
  );
  const overlay = useMemo(() => editorOverlay({}), []);
  if (!stage || !source) return <p className="hint">{t('stage.previewEmpty')}</p>;
  return (
    <div className="stage-preview">
      <EditorCanvas
        source={source}
        overlay={overlay}
        tool="view"
        label={t('stage.previewLabel')}
        help={t('stage.previewHelp')}
        fitKey={`${stage.stage.id}-${stage.sizeIndex}-${stage.stitchCount}`}
        testId="stage-preview"
      />
      <p className="hint">{t('stage.previewRows', { shown, rows: stage.plannedRows ?? '∞' })}</p>
    </div>
  );
}

const tallestRows = (stage: ResolvedStage) =>
  Math.max(1, ...stage.zones.map((z) => z.chart.chart.height)) * 2;

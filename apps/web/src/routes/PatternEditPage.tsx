import {
  addChart,
  chartUsage,
  duplicateChart,
  moveItem,
  newChartSegment,
  newMarker,
  patternRegistry,
  removeChart,
  resolvePattern,
  sizeValueAt,
  validatePattern,
  type Chart,
  type ChartSegment,
  type Diagnostic,
  type Modification,
  type Pattern,
  type Project,
  type ResolvedPattern,
  type Segment,
} from '@kt/core';
import type { TFunction } from 'i18next';
import { useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ChartThumb } from '../editor/ChartThumb';
import { PatternGate, SaveState } from '../editor/DraftGate';
import { PatternPreview } from '../editor/PatternPreview';
import { LegendEditor } from '../editor/LegendEditor';
import { RowNotesEditor } from '../editor/RowNotesEditor';
import { Link } from '../lib/Link';
import { navigate, paths } from '../lib/router';
import { useDraft } from '../state/draft';
import { DiagnosticsPanel } from '../ui/Diagnostics';
import { NumberField, SizeValueField, TextField } from '../ui/fields';
import { Icon } from '../ui/Icon';
import { AppHeader } from './AppHeader';

/** One pattern (wzór) of a project: its charts, the order of charts in a round or row, legend. */
export function PatternEditPage({
  projectId,
  patternId,
}: {
  projectId: string;
  patternId: string;
}) {
  return (
    <PatternGate projectId={projectId} patternId={patternId}>
      {(pattern, project) => <PatternEditor project={project} pattern={pattern} />}
    </PatternGate>
  );
}

const setPattern = (pattern: Pattern) =>
  useDraft.getState().updatePattern(pattern.id, () => pattern);
const update = (patternId: string, f: (p: Pattern) => Pattern) =>
  useDraft.getState().updatePattern(patternId, f);

/** Remove an optional key without leaving `undefined` behind (exactOptionalPropertyTypes). */
function without<T extends object, K extends keyof T>(obj: T, key: K): Omit<T, K> {
  const { [key]: _drop, ...rest } = obj;
  return rest;
}

function PatternEditor({ project, pattern }: { project: Project; pattern: Pattern }) {
  const { t } = useTranslation();
  const ids = useId();
  const stage = pattern;
  const sizes = project.sizes;
  const [size, setSize] = useState(project.sizeIndex);
  const sizeIndex = Math.min(size, sizes.length - 1);

  const resolved = useMemo(() => {
    try {
      const registry = patternRegistry(pattern);
      return sizes.map((_, i) => resolvePattern(project, pattern.id, { sizeIndex: i, registry }));
    } catch {
      return null;
    }
  }, [project, pattern, sizes]);
  const current: ResolvedPattern | null = resolved?.[sizeIndex] ?? null;
  const report = useMemo(() => validatePattern(project, pattern.id), [project, pattern.id]);
  const chartLink = (d: Diagnostic) =>
    d.chartId && pattern.charts.some((c) => c.id === d.chartId)
      ? {
          label: t('editor.openChart'),
          run: () => navigate(paths.chart(project.id, pattern.id, d.chartId ?? '')),
        }
      : null;

  const setLayout = (layout: Segment[]) =>
    setPattern({ ...stage, layout: layout.length > 0 ? layout : [newMarker(stage)] });
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
          <Link to={paths.project(project.id)} className="link-back">
            <Icon name="back" size={18} />
            {project.name}
          </Link>
          <SaveState />
        </p>
        <h1 className="page__title">{t('patternEdit.title', { name: stage.name })}</h1>
        <p className="lead">{t('patternEdit.intro')}</p>

        <section className="editor-section" aria-labelledby={`${ids}-basics`}>
          <h2 id={`${ids}-basics`} className="section-title">
            {t('patternEdit.basics')}
          </h2>
          <TextField
            label={t('patternEdit.name')}
            value={stage.name}
            required
            maxLength={60}
            onCommit={(name) => setPattern({ ...stage, name })}
          />
          <fieldset className="field">
            <legend>{t('patternEdit.construction')}</legend>
            <div className="segmented">
              {(['round', 'flat'] as const).map((c) => (
                <label key={c} className="segmented__item">
                  <input
                    type="radio"
                    name={`${ids}-con`}
                    checked={stage.construction === c}
                    onChange={() => setPattern({ ...stage, construction: c })}
                  />
                  <span>{t(c === 'round' ? 'editor.round' : 'editor.flat')}</span>
                </label>
              ))}
            </div>
            <p className="hint">
              {t(stage.construction === 'round' ? 'patternEdit.roundHint' : 'patternEdit.flatHint')}
            </p>
          </fieldset>
          {stage.construction === 'flat' && (
            <fieldset className="field">
              <legend>{t('patternEdit.firstRow')}</legend>
              {(['RS', 'WS'] as const).map((side) => (
                <label key={side} className="check">
                  <input
                    type="radio"
                    name={`${ids}-side`}
                    checked={stage.firstRowSide === side}
                    onChange={() => setPattern({ ...stage, firstRowSide: side })}
                  />
                  {t(side === 'RS' ? 'rowText.rs' : 'rowText.ws')}
                </label>
              ))}
            </fieldset>
          )}
          <fieldset className="field">
            <legend>{t('patternEdit.tracking')}</legend>
            {(['stitches', 'rows'] as const).map((mode) => (
              <label key={mode} className="check">
                <input
                  type="radio"
                  name={`${ids}-track`}
                  checked={(stage.tracking ?? 'stitches') === mode}
                  onChange={() =>
                    setPattern(
                      mode === 'rows' ? { ...stage, tracking: 'rows' } : without(stage, 'tracking'),
                    )
                  }
                />
                {t(mode === 'rows' ? 'patternEdit.trackRows' : 'patternEdit.trackStitches')}
              </label>
            ))}
            <p className="hint">{t('patternEdit.trackingHint')}</p>
          </fieldset>
          <div className="form-grid">
            <div>
              <label className="check">
                <input
                  type="checkbox"
                  checked={stage.rows !== undefined}
                  onChange={(e) =>
                    setPattern(
                      e.target.checked
                        ? { ...stage, rows: Math.max(1, tallest(current)) }
                        : without(stage, 'rows'),
                    )
                  }
                />
                {t('patternEdit.hasRows')}
              </label>
              {stage.rows !== undefined ? (
                <SizeValueField
                  label={t('patternEdit.rows')}
                  value={stage.rows}
                  sizes={sizes}
                  min={1}
                  max={5000}
                  onCommit={(rows) => setPattern({ ...stage, rows })}
                />
              ) : (
                <>
                  <p className="hint">{t('patternEdit.openEnded')}</p>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={stage.targetCm !== undefined}
                      onChange={(e) =>
                        setPattern(
                          e.target.checked
                            ? { ...stage, targetCm: 30 }
                            : without(stage, 'targetCm'),
                        )
                      }
                    />
                    {t('patternEdit.hasTarget')}
                  </label>
                  {stage.targetCm !== undefined && (
                    <SizeValueField
                      label={t('patternEdit.target')}
                      value={stage.targetCm}
                      sizes={sizes}
                      min={1}
                      max={500}
                      decimals
                      hint={t('patternEdit.targetHint')}
                      onCommit={(targetCm) => setPattern({ ...stage, targetCm })}
                    />
                  )}
                </>
              )}
            </div>
            <div>
              <label className="check">
                <input
                  type="checkbox"
                  checked={stage.expectedStitches !== undefined}
                  onChange={(e) =>
                    setPattern(
                      e.target.checked
                        ? { ...stage, expectedStitches: resolved?.map((r) => r.stitchCount) ?? 0 }
                        : without(stage, 'expectedStitches'),
                    )
                  }
                />
                {t('patternEdit.hasExpected')}
              </label>
              {stage.expectedStitches !== undefined ? (
                <SizeValueField
                  label={t('patternEdit.expected')}
                  value={stage.expectedStitches}
                  sizes={sizes}
                  min={0}
                  max={5000}
                  hint={t('patternEdit.expectedHint')}
                  onCommit={(expectedStitches) => setPattern({ ...stage, expectedStitches })}
                />
              ) : (
                <p className="hint">{t('patternEdit.expectedOff')}</p>
              )}
            </div>
          </div>
        </section>

        {current?.stitchCount === 0 && (
          <section className="editor-section" aria-labelledby={`${ids}-notes`}>
            <h2 id={`${ids}-notes`} className="section-title">
              {t('rowNotes.title')}
            </h2>
            <RowNotesEditor pattern={pattern} update={(f) => update(pattern.id, f)} />
          </section>
        )}

        <Charts project={project} pattern={pattern} />

        <section className="editor-section" aria-labelledby={`${ids}-layout`}>
          <h2 id={`${ids}-layout`} className="section-title">
            {t('patternEdit.layout')}
          </h2>
          <p className="hint">{t('patternEdit.layoutHint')}</p>
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
                      aria-label={t('patternEdit.moveUp')}
                      disabled={i === 0}
                      onClick={() => setLayout(moveItem(stage.layout, i, i - 1))}
                    >
                      <Icon name="up" />
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={t('patternEdit.moveDown')}
                      disabled={i === stage.layout.length - 1}
                      onClick={() => setLayout(moveItem(stage.layout, i, i + 1))}
                    >
                      <Icon name="down" />
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={t('patternEdit.remove')}
                      onClick={() => setLayout(stage.layout.filter((_, k) => k !== i))}
                    >
                      <Icon name="trash" />
                    </button>
                  </div>
                </div>
                {seg.kind === 'chart' ? (
                  <ChartSegmentEditor
                    project={project}
                    pattern={pattern}
                    seg={seg}
                    onChange={(next) => replaceSegment(i, next)}
                  />
                ) : (
                  <TextField
                    label={t('patternEdit.markerName')}
                    value={seg.sectionName ?? ''}
                    maxLength={40}
                    hint={t('patternEdit.markerHint')}
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
              <p className="hint">{t('patternEdit.noCharts')}</p>
            ) : (
              <div className="field field--inline">
                <label htmlFor={`${ids}-add`}>{t('patternEdit.addChart')}</label>
                <select
                  id={`${ids}-add`}
                  value=""
                  onChange={(e) => {
                    if (e.target.value) addChartSegment(e.target.value);
                  }}
                >
                  <option value="">{t('patternEdit.pickChart')}</option>
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
              {t('patternEdit.addMarker')}
            </button>
          </div>
        </section>

        <section className="editor-section" aria-labelledby={`${ids}-sum`}>
          <h2 id={`${ids}-sum`} className="section-title">
            {t('patternEdit.summary')}
          </h2>
          <table className="size-table">
            <thead>
              <tr>
                <th scope="col">{t('newProject.size')}</th>
                <th scope="col">{t('patternEdit.stitches')}</th>
                <th scope="col">{t('patternEdit.expected')}</th>
                <th scope="col">{t('patternEdit.rows')}</th>
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
                            {ok ? t('patternEdit.matches') : t('patternEdit.differs')}
                          </span>
                        </span>
                      )}
                    </td>
                    <td className="num">{r?.plannedRows ?? t('patternEdit.open')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        <section className="editor-section" aria-labelledby={`${ids}-pre`}>
          <div className="section-head">
            <h2 id={`${ids}-pre`} className="section-title">
              {t('patternEdit.preview')}
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
          <PatternPreview stage={current} />
        </section>

        <section className="editor-section" aria-labelledby={`${ids}-legend`}>
          <h2 id={`${ids}-legend`} className="section-title">
            {t('editor.legend')}
          </h2>
          <p className="hint">{t('editor.legendHint')}</p>
          <LegendEditor pattern={pattern} />
        </section>

        <section className="editor-section" aria-labelledby={`${ids}-check`}>
          <h2 id={`${ids}-check`} className="section-title">
            {t('editor.check')}
          </h2>
          <DiagnosticsPanel items={report.diagnostics} action={chartLink} />
        </section>

        <div className="form-actions form-actions--sticky">
          {/* "Gotowe": the pattern is set up (a garment part gets its ✓); back to the parts. */}
          <button
            type="button"
            className="btn btn--done"
            disabled={!report.ok}
            onClick={() => {
              useDraft.getState().updatePattern(pattern.id, (p) => ({ ...p, ready: true }));
              void useDraft
                .getState()
                .flush()
                .then(() =>
                  navigate(
                    project.kind && project.kind !== 'custom'
                      ? paths.parts(project.id)
                      : paths.project(project.id),
                  ),
                );
            }}
          >
            <Icon name="check" size={18} />
            {t('patternEdit.ready')}
          </button>
        </div>
        {!report.ok && <p className="hint form-actions__hint">{t('editor.fixFirst')}</p>}
      </main>
    </>
  );
}

function tallest(stage: ResolvedPattern | null): number {
  return Math.max(1, ...(stage?.zones.map((z) => z.chart.chart.height) ?? [1]));
}

function rangeLabel(stage: ResolvedPattern | null, seg: Segment, t: TFunction) {
  if (!stage) return '';
  if (seg.kind === 'marker') {
    const m = stage.markers.find((x) => x.id === seg.id);
    return m ? t('patternEdit.markerAt', { n: m.afterStitch }) : '';
  }
  const z = stage.zones.find((x) => x.placementId === seg.placementId);
  return z
    ? t('patternEdit.range', { from: z.firstStitch, to: z.lastStitch })
    : t('patternEdit.noStitches');
}

function ChartSegmentEditor({
  project,
  pattern,
  seg,
  onChange,
}: {
  project: Project;
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
        <label htmlFor={`${ids}-chart`}>{t('patternEdit.chart')}</label>
        <select
          id={`${ids}-chart`}
          value={seg.chartId}
          onChange={(e) =>
            onChange(
              without(
                without(without({ ...seg, chartId: e.target.value }, 'startColumn'), 'rowOffset'),
                'continueFrom',
              ),
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
        <legend>{t('patternEdit.stitchesTitle')}</legend>
        <label className="check">
          <input
            type="radio"
            name={`${ids}-st`}
            checked={!custom}
            onChange={() => onChange(without(seg, 'stitches'))}
          />
          {t('patternEdit.fullWidth', { n: width })}
        </label>
        <label className="check">
          <input
            type="radio"
            name={`${ids}-st`}
            checked={custom}
            onChange={() => onChange({ ...seg, stitches: width })}
          />
          {t('patternEdit.customWidth')}
        </label>
        {custom && (
          <SizeValueField
            label={t('patternEdit.stitchCount')}
            value={seg.stitches}
            sizes={project.sizes}
            min={0}
            max={2000}
            hint={t('patternEdit.partialHint')}
            onCommit={(stitches) => onChange({ ...seg, stitches })}
          />
        )}
      </fieldset>
      <RowStart project={project} pattern={pattern} seg={seg} height={height} onChange={onChange} />
      <details className="segment__more">
        <summary>{t('patternEdit.more')}</summary>
        <div className="form-grid form-grid--2">
          <NumberField
            label={t('patternEdit.startColumn')}
            value={seg.startColumn ?? width}
            min={1}
            max={width}
            hint={t('patternEdit.startColumnHint', { w: width })}
            onCommit={(v) =>
              onChange(v === width ? without(seg, 'startColumn') : { ...seg, startColumn: v })
            }
          />
          <TextField
            label={t('patternEdit.label')}
            value={seg.label ?? ''}
            maxLength={40}
            hint={t('patternEdit.labelHint', { name: chart?.name ?? '' })}
            onCommit={(v) => onChange(v.trim() ? { ...seg, label: v } : without(seg, 'label'))}
          />
        </div>
      </details>
    </div>
  );
}

/**
 * Where the chart's rows start: a fixed chart row, or "continue as before" from a placement in
 * another pattern of the project (DR-3), e.g. the front after the split continues the body's A.2.
 */
function RowStart({
  project,
  pattern,
  seg,
  height,
  onChange,
}: {
  project: Project;
  pattern: Pattern;
  seg: ChartSegment;
  height: number;
  onChange(seg: ChartSegment): void;
}) {
  const { t } = useTranslation();
  const ids = useId();
  const chartName = pattern.charts.find((c) => c.id === seg.chartId)?.name;
  const sources = project.patterns.flatMap((st) =>
    st.id === pattern.id
      ? []
      : st.layout.flatMap((x) => {
          if (x.kind !== 'chart') return [];
          const name = st.charts.find((c) => c.id === x.chartId)?.name ?? x.chartId;
          return [
            {
              key: `${st.id}\u0000${x.placementId}`,
              ref: { patternId: st.id, placementId: x.placementId },
              label: `${st.name} — ${x.label ?? name}`,
              same: name === chartName,
            },
          ];
        }),
  );
  // Same chart first: that is almost always the one to continue.
  sources.sort((a, b) => Number(b.same) - Number(a.same));
  const continuing = seg.continueFrom !== undefined;
  const current = seg.continueFrom
    ? `${seg.continueFrom.patternId}\u0000${seg.continueFrom.placementId}`
    : '';
  return (
    <fieldset className="field field--compact">
      <legend>{t('patternEdit.rowStart')}</legend>
      <label className="check">
        <input
          type="radio"
          name={`${ids}-rs`}
          checked={!continuing}
          onChange={() => onChange(without(seg, 'continueFrom'))}
        />
        {t('patternEdit.fixedRow')}
      </label>
      {!continuing && (
        <NumberField
          label={t('patternEdit.startRow')}
          value={(seg.rowOffset ?? 0) + 1}
          min={1}
          max={height}
          compact
          hint={t('patternEdit.startRowHint')}
          onCommit={(v) =>
            onChange(v === 1 ? without(seg, 'rowOffset') : { ...seg, rowOffset: v - 1 })
          }
        />
      )}
      {sources.length > 0 && (
        <label className="check">
          <input
            type="radio"
            name={`${ids}-rs`}
            checked={continuing}
            onChange={() => {
              const first = sources[0];
              if (first) onChange({ ...without(seg, 'rowOffset'), continueFrom: first.ref });
            }}
          />
          {t('patternEdit.continueRows')}
        </label>
      )}
      {continuing && (
        <div className="field field--compact">
          <label htmlFor={`${ids}-src`}>{t('patternEdit.continueFrom')}</label>
          <select
            id={`${ids}-src`}
            value={current}
            onChange={(e) => {
              const src = sources.find((x) => x.key === e.target.value);
              if (src) onChange({ ...seg, continueFrom: src.ref });
            }}
          >
            {!sources.some((x) => x.key === current) && <option value={current}>—</option>}
            {sources.map((x) => (
              <option key={x.key} value={x.key}>
                {x.label}
              </option>
            ))}
          </select>
          <p className="hint">{t('patternEdit.continueHint')}</p>
        </div>
      )}
    </fieldset>
  );
}

/** The knitter's "plain knit instead of this chart" change (DR-1); the chart stays as drawn. */
const knitOnly = (chartId: string): Modification => ({
  kind: 'replaceChart',
  chartId,
  chart: {
    id: `${chartId}-knit`,
    name: chartId,
    width: 1,
    height: 1,
    palette: { k: 'std:k' },
    rows: ['k'],
  },
  note: 'knit-only',
});

const isKnitOnly = (pattern: Pattern, chartId: string) =>
  (pattern.modifications ?? []).some((m) => m.chartId === chartId);

function setKnitOnly(pattern: Pattern, chartId: string, on: boolean): Pattern {
  const others = (pattern.modifications ?? []).filter((m) => m.chartId !== chartId);
  const modifications = on ? [...others, knitOnly(chartId)] : others;
  const { modifications: _old, ...rest } = pattern;
  return modifications.length > 0 ? { ...rest, modifications } : rest;
}

/** Charts (schematy) of the pattern. */
function Charts({ project, pattern }: { project: Project; pattern: Pattern }) {
  const { t } = useTranslation();
  const ids = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const usage = useMemo(() => chartUsage(pattern), [pattern]);
  const change = (f: (p: Pattern) => Pattern) => update(pattern.id, f);

  return (
    <section className="editor-section" aria-labelledby={`${ids}-charts`}>
      <h2 id={`${ids}-charts`} className="section-title">
        {t('editor.charts')}
      </h2>
      {pattern.charts.length === 0 ? (
        <p className="hint">{t('editor.noCharts')}</p>
      ) : (
        <ul className="card-list">
          {pattern.charts.map((c: Chart) => (
            <li key={c.id} className="card">
              <Link className="card__main" to={paths.chart(project.id, pattern.id, c.id)}>
                <ChartThumb pattern={pattern} chart={c} />
                <span className="card__title">{c.name}</span>
                <span className="card__meta">
                  <span className="num">{t('editor.chartSize', { w: c.width, h: c.height })}</span>
                  <span>{t('editor.placements', { count: usage.get(c.id) ?? 0 })}</span>
                </span>
              </Link>
              <label className="check card__option">
                <input
                  type="checkbox"
                  checked={isKnitOnly(pattern, c.id)}
                  onChange={(e) => change((p) => setKnitOnly(p, c.id, e.target.checked))}
                />
                {t('editor.knitOnly')}
              </label>
              <div className="card__actions">
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={t('editor.duplicateChart', { name: c.name })}
                  onClick={() =>
                    change(
                      (p) =>
                        duplicateChart(p, c.id, t('editor.copyName', { name: c.name }).slice(0, 40))
                          .pattern,
                    )
                  }
                >
                  <Icon name="copy" />
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={t('editor.removeChart', { name: c.name })}
                  onClick={() => change((p) => removeChart(p, c.id))}
                >
                  <Icon name="trash" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="hint">{t('editor.knitOnlyHint')}</p>
      <button type="button" className="btn" onClick={() => dialog.current?.showModal()}>
        <Icon name="plus" />
        {t('editor.addChart')}
      </button>
      <NewChartDialog
        ref={dialog}
        suggested={`A.${pattern.charts.length + 1}`}
        onCreate={(name, w, h) => {
          const r = addChart(pattern, name, w, h);
          setPattern(r.pattern);
          navigate(paths.chart(project.id, pattern.id, r.chartId));
        }}
      />
    </section>
  );
}

function NewChartDialog({
  ref,
  suggested,
  onCreate,
}: {
  ref: React.RefObject<HTMLDialogElement | null>;
  suggested: string;
  onCreate(name: string, width: number, height: number): void;
}) {
  const { t } = useTranslation();
  const ids = useId();
  const [name, setName] = useState('');
  const [w, setW] = useState(8);
  const [h, setH] = useState(8);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    ref.current?.close();
    onCreate((name.trim() || suggested).slice(0, 40), w, h);
    setName('');
  };
  return (
    <dialog ref={ref} className="dialog" aria-labelledby={`${ids}-title`}>
      <form onSubmit={submit}>
        <h2 id={`${ids}-title`} className="dialog__title">
          {t('editor.newChart')}
        </h2>
        <TextField
          label={t('editor.chartName')}
          value={name}
          maxLength={40}
          hint={t('editor.chartNameHint', { name: suggested })}
          onCommit={setName}
        />
        <div className="form-grid form-grid--2">
          <NumberField label={t('editor.width')} value={w} min={1} max={200} onCommit={setW} />
          <NumberField label={t('editor.height')} value={h} min={1} max={200} onCommit={setH} />
        </div>
        <div className="dialog__actions">
          <button type="button" className="btn" onClick={() => ref.current?.close()}>
            {t('common.cancel')}
          </button>
          <button type="submit" className="btn btn--primary">
            {t('editor.createChart')}
          </button>
        </div>
      </form>
    </dialog>
  );
}

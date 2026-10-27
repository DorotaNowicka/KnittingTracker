import {
  effectiveGauge,
  lengthEstimate,
  type Gauge,
  type Pattern,
  type ProgressSummary,
  type ResolvedPattern,
  type RowModel,
} from '@kt/core';
import { useId, useMemo, useState, type FormEvent, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import type { StoredProject } from '../lib/storage';
import { NumberField, TextField } from '../ui/fields';
import { Icon } from '../ui/Icon';
import { chartRowsAt, nextPatternOf } from './patterns';

/** "A.1 row 4 · A.2 row 12": which chart row each chart is on in a pattern row. */
export function ChartRows({ grid, row }: { grid: ResolvedPattern; row: number }) {
  const { t } = useTranslation();
  const rows = useMemo(() => chartRowsAt(grid, row), [grid, row]);
  if (rows.length === 0) return null;
  return (
    <dl className="chart-rows" data-testid="chart-rows">
      {rows.map((r) => (
        <div key={`${r.label}-${r.row}`} className="chart-rows__item">
          <dt>{r.label}</dt>
          <dd className="num">
            {t('patternPanel.chartRow', { row: r.row, height: r.height })}
            {!r.known && (
              <span className="chart-rows__unknown" title={t('patternPanel.phaseUnknown')}>
                {' '}
                ?
              </span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

interface PatternPanelProps {
  readonly project: StoredProject;
  readonly grid: ResolvedPattern;
  readonly summary: ProgressSummary;
  onPosition(): void;
  onFinish(): void;
  onReopen(): void;
  onNext(patternId: string): void;
  onProject(): void;
}

/** Pattern section of the side panel: chart rows, length estimate, finishing and moving on. */
export function PatternPanel(props: PatternPanelProps) {
  const { project, grid, summary } = props;
  const { t } = useTranslation();
  const ids = useId();
  const finished = project.finishedRows?.[grid.pattern.id];
  const next = nextPatternOf(project, grid.pattern.id);
  const gauge = effectiveGauge(project);
  const estimate = lengthEstimate(grid, summary.rowsCompleted, gauge);
  const unknown = grid.zones.some((z) => z.continued && !z.continued.known);
  const round = grid.pattern.construction === 'round';
  return (
    <section className="panel__section" aria-labelledby={`${ids}-st`}>
      <h2 id={`${ids}-st`} className="panel__title">
        {t('patternPanel.title', { name: grid.pattern.name })}
      </h2>
      <p className="hint">
        {t(round ? 'patternPanel.round' : 'patternPanel.flat')} ·{' '}
        {grid.plannedRows === null
          ? t('patternPanel.openEnded')
          : t(round ? 'patternPanel.plannedRounds' : 'patternPanel.plannedRows', {
              count: grid.plannedRows,
            })}
        {grid.pattern.tracking === 'rows' && <> · {t('patternPanel.counter')}</>}
      </p>
      {grid.zones.length > 0 && (
        <>
          <h3 className="panel__subtitle">
            {t(round ? 'patternPanel.chartRowsRound' : 'patternPanel.chartRowsRow', {
              row: summary.currentRow,
            })}
          </h3>
          <ChartRows grid={grid} row={summary.currentRow} />
          {unknown && <p className="hint">{t('patternPanel.phaseUnknown')}</p>}
        </>
      )}
      {estimate && (
        <p className="stage-estimate" data-testid="estimate">
          {estimate.doneCm !== null && estimate.rowsLeft !== null
            ? t('patternPanel.estimate', {
                done: formatCm(estimate.doneCm),
                target: formatCm(estimate.targetCm),
                count: estimate.rowsLeft,
              })
            : t('patternPanel.target', { target: formatCm(estimate.targetCm) })}
          {gauge ? (
            <span className="hint">
              {' '}
              {t(project.knitterGauge ? 'patternPanel.ownGauge' : 'patternPanel.patternGauge', {
                rows: formatCm(gauge.rows),
              })}
            </span>
          ) : (
            <span className="hint"> {t('patternPanel.noGauge')}</span>
          )}
        </p>
      )}
      {finished !== undefined && (
        <p className="stage-finished" role="status">
          {t(round ? 'patternPanel.finishedRounds' : 'patternPanel.finishedRows', {
            count: finished,
          })}
        </p>
      )}
      <div className="panel__actions">
        <button type="button" className="btn btn--small" onClick={props.onPosition}>
          <Icon name="edit" size={18} />
          {t('position.open')}
        </button>
        {finished === undefined ? (
          <button type="button" className="btn btn--small" onClick={props.onFinish}>
            <Icon name="rowDone" size={18} />
            {t('finish.open')}
          </button>
        ) : (
          <button type="button" className="btn btn--small" onClick={props.onReopen}>
            {t('finish.reopen')}
          </button>
        )}
        {next && (
          <button type="button" className="btn btn--small" onClick={() => props.onNext(next.id)}>
            {t('patternPanel.next', { name: next.name })}
          </button>
        )}
        <button type="button" className="btn btn--small" onClick={props.onProject}>
          <Icon name="settings" size={18} />
          {t('projectSettings.open')}
        </button>
      </div>
    </section>
  );
}

const formatCm = (n: number) =>
  (Math.round(n * 10) / 10).toLocaleString(document.documentElement.lang || 'pl', {
    maximumFractionDigits: 1,
  });

/** Manual position entry (DR-8): "I am in row R and have knitted S stitches of it". */
export function PositionDialog({
  dialogRef,
  model,
  summary,
  onSet,
}: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  model: RowModel;
  summary: ProgressSummary;
  onSet(done: number): void;
}) {
  const { t } = useTranslation();
  const ids = useId();
  const counter = model.unit === 'row';
  const round = model.grid.pattern.construction === 'round';
  const maxRow = model.grid.plannedRows ?? 9999;
  const [row, setRow] = useState(summary.currentRow);
  const [stitches, setStitches] = useState(summary.doneInCurrentRow);
  const [rows, setRows] = useState(summary.done);
  // Start from the current position whenever the dialog opens on a new position.
  const [seen, setSeen] = useState(summary.done);
  if (seen !== summary.done) {
    setSeen(summary.done);
    setRow(summary.currentRow);
    setStitches(summary.doneInCurrentRow);
    setRows(summary.done);
  }
  const safeRow = Math.min(Math.max(1, row), maxRow);
  const length = counter ? 1 : model.rowLength(safeRow);
  const done = counter
    ? Math.min(rows, maxRow)
    : model.rowStart(safeRow) + Math.min(stitches, length);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    dialogRef.current?.close();
    if (done !== summary.done) onSet(done);
  };
  return (
    <dialog ref={dialogRef} className="dialog" aria-labelledby={`${ids}-t`}>
      <form onSubmit={submit}>
        <h2 id={`${ids}-t`} className="dialog__title">
          {t('position.title')}
        </h2>
        <p className="hint">{t(counter ? 'position.introCounter' : 'position.intro')}</p>
        {counter ? (
          <NumberField
            label={t(round ? 'position.roundsDone' : 'position.rowsDone')}
            value={rows}
            min={0}
            max={maxRow}
            onCommit={setRows}
          />
        ) : (
          <div className="form-grid form-grid--2">
            <NumberField
              label={t(round ? 'position.round' : 'position.row')}
              value={row}
              min={1}
              max={maxRow}
              onCommit={setRow}
            />
            <NumberField
              label={t('position.stitches')}
              value={stitches}
              min={0}
              max={length}
              hint={t('position.stitchesHint', { count: length })}
              onCommit={setStitches}
            />
          </div>
        )}
        <p className="position-preview" aria-live="polite">
          {counter
            ? t(round ? 'position.previewRounds' : 'position.previewRows', { count: done })
            : stitches === 0
              ? t(round ? 'position.previewStartRound' : 'position.previewStartRow', {
                  row: safeRow,
                })
              : t(round ? 'position.previewRound' : 'position.previewRow', {
                  row: safeRow,
                  stitch: Math.min(stitches, length),
                  total: done,
                })}
        </p>
        <div className="dialog__actions">
          <button type="button" className="btn" onClick={() => dialogRef.current?.close()}>
            {t('common.cancel')}
          </button>
          <button type="submit" className="btn btn--primary">
            {t('position.apply')}
          </button>
        </div>
      </form>
    </dialog>
  );
}

/**
 * Finish the pattern after the rows completed so far (DR-5). Shows the chart rows of that last
 * row, so the knitter can check "end after an even row of A.2" (DR-4) before moving on.
 */
export function FinishDialog({
  dialogRef,
  grid,
  summary,
  next,
  onFinish,
}: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  grid: ResolvedPattern;
  summary: ProgressSummary;
  next: Pattern | undefined;
  onFinish(rows: number, next: string | undefined): void;
}) {
  const { t } = useTranslation();
  const ids = useId();
  const [goNext, setGoNext] = useState(true);
  const rows = summary.rowsCompleted;
  const partial = summary.next !== null && summary.doneInCurrentRow > 0;
  const round = grid.pattern.construction === 'round';
  return (
    <dialog ref={dialogRef} className="dialog" aria-labelledby={`${ids}-t`}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          dialogRef.current?.close();
          onFinish(rows, goNext && next ? next.id : undefined);
        }}
      >
        <h2 id={`${ids}-t`} className="dialog__title">
          {t('finish.title', { name: grid.pattern.name })}
        </h2>
        <p>{t(round ? 'finish.bodyRounds' : 'finish.bodyRows', { count: rows })}</p>
        {partial && (
          <p className="field__error">
            {t(round ? 'finish.partialRound' : 'finish.partial', {
              row: summary.currentRow,
              count: summary.doneInCurrentRow,
              button: t(round ? 'actions.roundDone' : 'actions.rowDone'),
            })}
          </p>
        )}
        {rows > 0 && grid.zones.length > 0 && (
          <>
            <p className="hint">{t('finish.lastChartRows')}</p>
            <ChartRows grid={grid} row={rows} />
          </>
        )}
        <p className="hint">{t('finish.continueHint')}</p>
        {next && (
          <label className="check">
            <input type="checkbox" checked={goNext} onChange={(e) => setGoNext(e.target.checked)} />
            {t('finish.goNext', { name: next.name })}
          </label>
        )}
        <div className="dialog__actions">
          <button type="button" className="btn" onClick={() => dialogRef.current?.close()}>
            {t('common.cancel')}
          </button>
          <button type="submit" className="btn btn--primary">
            {t('finish.confirm')}
          </button>
        </div>
      </form>
    </dialog>
  );
}

/** Project settings: name and the knitter's own gauge (used for length estimates). */
export function ProjectDialog({
  dialogRef,
  project,
  onSave,
}: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  project: StoredProject;
  onSave(change: { name: string; gauge: Gauge | null }): void;
}) {
  const { t } = useTranslation();
  const ids = useId();
  const [name, setName] = useState(project.name);
  const [own, setOwn] = useState(project.knitterGauge !== undefined);
  const base = project.knitterGauge ?? project.gauge ?? { stitches: 22, rows: 30 };
  const [stitches, setStitches] = useState(base.stitches);
  const [rows, setRows] = useState(base.rows);
  return (
    <dialog ref={dialogRef} className="dialog" aria-labelledby={`${ids}-t`}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          dialogRef.current?.close();
          onSave({ name, gauge: own ? { stitches, rows } : null });
        }}
      >
        <h2 id={`${ids}-t`} className="dialog__title">
          {t('projectSettings.title')}
        </h2>
        <TextField
          label={t('projectSettings.name')}
          value={name}
          required
          maxLength={120}
          onCommit={setName}
        />
        <p className="hint">
          {t('projectSettings.size', { size: project.sizes[project.sizeIndex] ?? '' })}
        </p>
        <fieldset className="field">
          <legend>{t('projectSettings.gauge')}</legend>
          <p className="hint">
            {project.gauge
              ? t('projectSettings.patternGauge', {
                  stitches: project.gauge.stitches,
                  rows: project.gauge.rows,
                })
              : t('projectSettings.noPatternGauge')}
          </p>
          <label className="check">
            <input type="checkbox" checked={own} onChange={(e) => setOwn(e.target.checked)} />
            {t('projectSettings.ownGauge')}
          </label>
          {own && (
            <div className="form-grid form-grid--2">
              <NumberField
                label={t('gauge.stitches')}
                value={stitches}
                min={1}
                max={100}
                decimals
                onCommit={setStitches}
              />
              <NumberField
                label={t('gauge.rows')}
                value={rows}
                min={1}
                max={200}
                decimals
                onCommit={setRows}
              />
            </div>
          )}
        </fieldset>
        <div className="dialog__actions">
          <button type="button" className="btn" onClick={() => dialogRef.current?.close()}>
            {t('common.cancel')}
          </button>
          <button type="submit" className="btn btn--primary">
            {t('common.save')}
          </button>
        </div>
      </form>
    </dialog>
  );
}

/** Row counter for patterns tracked by rows only and drawn without a chart (DR-9). */
export function RowCounter({
  summary,
  planned,
  round,
  onAdd,
  onRemove,
  name,
  next,
  onDone,
}: {
  summary: ProgressSummary;
  planned: number | null;
  round: boolean;
  onAdd(): void;
  onRemove(): void;
  /** The part being counted (e.g. the bottom rib). */
  name: string;
  /** The part knitted after it, if any. */
  next: { readonly name: string } | null;
  /** The part is done: finish it and go on to the next one. Absent once it is finished. */
  onDone?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="row-counter">
      <p className="row-counter__label">{t(round ? 'counter.roundsDone' : 'counter.rowsDone')}</p>
      <p className="row-counter__value num" data-testid="row-counter">
        {summary.done}
        {planned !== null && <span className="row-counter__of"> / {planned}</span>}
      </p>
      <div className="row-counter__buttons">
        <button
          type="button"
          className="btn row-counter__btn"
          onClick={onRemove}
          disabled={summary.done === 0}
          aria-label={t('counter.minus')}
        >
          <Icon name="minus" />
        </button>
        <button
          type="button"
          className="btn btn--primary row-counter__btn"
          onClick={onAdd}
          disabled={summary.next === null}
          aria-label={t('counter.plus')}
        >
          <Icon name="plus" />
        </button>
      </div>
      {onDone && (
        <div className="row-counter__done">
          <button type="button" className="btn btn--done" onClick={onDone}>
            <Icon name="check" size={18} />
            {t('counter.done', { name })}
          </button>
          <p className="hint">
            {next ? t('counter.thenNext', { name: next.name }) : t('counter.thenEnd')}
          </p>
        </div>
      )}
    </div>
  );
}

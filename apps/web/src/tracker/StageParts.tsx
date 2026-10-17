import {
  effectiveGauge,
  lengthEstimate,
  type Gauge,
  type Pattern,
  type ProgressSummary,
  type ResolvedStage,
  type RowModel,
  type Stage,
} from '@kt/core';
import { useId, useMemo, useState, type FormEvent, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import type { StoredProject } from '../lib/storage';
import { NumberField, TextField } from '../ui/fields';
import { Icon } from '../ui/Icon';
import { chartRowsAt, nextStageOf } from './stages';

/** "A.1 row 4 · A.2 row 12": which chart row each chart is on in a stage row. */
export function ChartRows({ stage, row }: { stage: ResolvedStage; row: number }) {
  const { t } = useTranslation();
  const rows = useMemo(() => chartRowsAt(stage, row), [stage, row]);
  if (rows.length === 0) return null;
  return (
    <dl className="chart-rows" data-testid="chart-rows">
      {rows.map((r) => (
        <div key={`${r.label}-${r.row}`} className="chart-rows__item">
          <dt>{r.label}</dt>
          <dd className="num">
            {t('stagePanel.chartRow', { row: r.row, height: r.height })}
            {!r.known && (
              <span className="chart-rows__unknown" title={t('stagePanel.phaseUnknown')}>
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

interface StagePanelProps {
  readonly pattern: Pattern;
  readonly project: StoredProject;
  readonly stage: ResolvedStage;
  readonly summary: ProgressSummary;
  onPosition(): void;
  onFinish(): void;
  onReopen(): void;
  onNext(stageId: string): void;
  onProject(): void;
}

/** Stage section of the side panel: chart rows, length estimate, finishing and moving on. */
export function StagePanel(props: StagePanelProps) {
  const { pattern, project, stage, summary } = props;
  const { t } = useTranslation();
  const ids = useId();
  const finished = project.finishedRows?.[stage.stage.id];
  const next = nextStageOf(pattern, stage.stage.id);
  const gauge = effectiveGauge(pattern, project);
  const estimate = lengthEstimate(stage, summary.rowsCompleted, gauge);
  const unknown = stage.zones.some((z) => z.continued && !z.continued.known);
  const round = stage.stage.construction === 'round';
  return (
    <section className="panel__section" aria-labelledby={`${ids}-st`}>
      <h2 id={`${ids}-st`} className="panel__title">
        {t('stagePanel.title', { name: stage.stage.name })}
      </h2>
      <p className="hint">
        {t(round ? 'stagePanel.round' : 'stagePanel.flat')} ·{' '}
        {stage.plannedRows === null
          ? t('stagePanel.openEnded')
          : t(round ? 'stagePanel.plannedRounds' : 'stagePanel.plannedRows', {
              count: stage.plannedRows,
            })}
        {stage.stage.tracking === 'rows' && <> · {t('stagePanel.counter')}</>}
      </p>
      {stage.zones.length > 0 && (
        <>
          <h3 className="panel__subtitle">
            {t(round ? 'stagePanel.chartRowsRound' : 'stagePanel.chartRowsRow', {
              row: summary.currentRow,
            })}
          </h3>
          <ChartRows stage={stage} row={summary.currentRow} />
          {unknown && <p className="hint">{t('stagePanel.phaseUnknown')}</p>}
        </>
      )}
      {estimate && (
        <p className="stage-estimate" data-testid="estimate">
          {estimate.doneCm !== null && estimate.rowsLeft !== null
            ? t('stagePanel.estimate', {
                done: formatCm(estimate.doneCm),
                target: formatCm(estimate.targetCm),
                count: estimate.rowsLeft,
              })
            : t('stagePanel.target', { target: formatCm(estimate.targetCm) })}
          {gauge ? (
            <span className="hint">
              {' '}
              {t(project.gauge ? 'stagePanel.ownGauge' : 'stagePanel.patternGauge', {
                rows: formatCm(gauge.rows),
              })}
            </span>
          ) : (
            <span className="hint"> {t('stagePanel.noGauge')}</span>
          )}
        </p>
      )}
      {finished !== undefined && (
        <p className="stage-finished" role="status">
          {t(round ? 'stagePanel.finishedRounds' : 'stagePanel.finishedRows', {
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
            {t('stagePanel.next', { name: next.name })}
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
  const round = model.stage.stage.construction === 'round';
  const maxRow = model.stage.plannedRows ?? 9999;
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
 * Finish the stage after the rows completed so far (DR-5). Shows the chart rows of that last row,
 * so the knitter can check "end after an even row of A.2" (DR-4) before moving on.
 */
export function FinishDialog({
  dialogRef,
  stage,
  summary,
  next,
  onFinish,
}: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  stage: ResolvedStage;
  summary: ProgressSummary;
  next: Stage | undefined;
  onFinish(rows: number, next: string | undefined): void;
}) {
  const { t } = useTranslation();
  const ids = useId();
  const [goNext, setGoNext] = useState(true);
  const rows = summary.rowsCompleted;
  const partial = summary.next !== null && summary.doneInCurrentRow > 0;
  const round = stage.stage.construction === 'round';
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
          {t('finish.title', { name: stage.stage.name })}
        </h2>
        <p>{t(round ? 'finish.bodyRounds' : 'finish.bodyRows', { count: rows })}</p>
        {partial && (
          <p className="field__error">
            {t('finish.partial', { row: summary.currentRow, count: summary.doneInCurrentRow })}
          </p>
        )}
        {rows > 0 && stage.zones.length > 0 && (
          <>
            <p className="hint">{t('finish.lastChartRows')}</p>
            <ChartRows stage={stage} row={rows} />
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
  pattern,
  onSave,
}: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  project: StoredProject;
  pattern: Pattern;
  onSave(change: { name: string; gauge: Gauge | null }): void;
}) {
  const { t } = useTranslation();
  const ids = useId();
  const [name, setName] = useState(project.name);
  const [own, setOwn] = useState(project.gauge !== undefined);
  const base = project.gauge ?? pattern.gauge ?? { stitches: 22, rows: 30 };
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
          {t('projectSettings.size', { size: pattern.sizes[project.sizeIndex] ?? '' })}
        </p>
        <fieldset className="field">
          <legend>{t('projectSettings.gauge')}</legend>
          <p className="hint">
            {pattern.gauge
              ? t('projectSettings.patternGauge', {
                  stitches: pattern.gauge.stitches,
                  rows: pattern.gauge.rows,
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

/** Row counter for stages tracked by rows only and drawn without a chart (DR-9). */
export function RowCounter({
  summary,
  planned,
  round,
  onAdd,
  onRemove,
}: {
  summary: ProgressSummary;
  planned: number | null;
  round: boolean;
  onAdd(): void;
  onRemove(): void;
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
    </div>
  );
}

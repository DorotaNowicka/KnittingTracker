import { canRedo, canUndo, summarize } from '@kt/core';
import { visibleRowCount } from '@kt/grid-renderer';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getWakeLockPref } from '../lib/preferences';
import { Link } from '../lib/Link';
import { navigate, paths } from '../lib/router';
import { useWakeLock } from '../lib/wakeLock';
import { useSession } from '../state/session';
import { RowsControl } from '../tracker/RowsControl';
import { ShapingBadge } from '../tracker/ShapingBadge';
import { GridCanvas, type ViewRequest } from '../tracker/GridCanvas';
import { Legend, RowText, ViewControls, type ViewSettings } from '../tracker/PanelParts';
import {
  FinishDialog,
  PatternPanel,
  PositionDialog,
  ProjectDialog,
  RowCounter,
} from '../tracker/PatternParts';
import { nextPatternOf } from '../tracker/patterns';
import { GuidesToggle } from '../ui/GuidesToggle';
import { Icon } from '../ui/Icon';

/** View settings are kept per pattern (patterns differ in width); 1.0 kept them per project. */
const VIEW_KEY = (projectId: string, patternId: string) => `kt.view.${projectId}.${patternId}`;
const OLD_VIEW_KEY = (projectId: string) => `kt.view.${projectId}`;

function loadView(projectId: string, patternId: string): ViewSettings {
  // cell 0 = not chosen yet: the grid picks a size that fits the screen on first open.
  const fallback: ViewSettings = { cell: 0, rows: 'end', veil: true };
  try {
    const raw =
      localStorage.getItem(VIEW_KEY(projectId, patternId)) ??
      localStorage.getItem(OLD_VIEW_KEY(projectId));
    if (!raw) return fallback;
    const v = JSON.parse(raw) as Partial<Omit<ViewSettings, 'rows'>> & { rows?: unknown };
    return {
      cell: typeof v.cell === 'number' ? v.cell : fallback.cell,
      rows: typeof v.rows === 'number' ? v.rows : fallback.rows,
      veil: typeof v.veil === 'boolean' ? v.veil : fallback.veil,
    };
  } catch {
    return fallback;
  }
}

function saveView(projectId: string, patternId: string, v: ViewSettings) {
  try {
    localStorage.setItem(VIEW_KEY(projectId, patternId), JSON.stringify(v));
  } catch {
    /* per-device convenience only */
  }
}

export function TrackerPage({ projectId, patternId }: { projectId: string; patternId: string }) {
  return <Tracker key={`${projectId}/${patternId}`} projectId={projectId} patternId={patternId} />;
}

function Tracker({ projectId, patternId }: { projectId: string; patternId: string }) {
  const { t } = useTranslation();
  const ids = useId();
  const s = useSession();
  const [view, setView] = useState<ViewSettings>(() => loadView(projectId, patternId));
  const [panelOpen, setPanelOpen] = useState(() => matchMedia('(min-width: 1100px)').matches);
  const [request, setRequest] = useState<ViewRequest | null>(null);
  const positionRef = useRef<HTMLDialogElement>(null);
  const finishRef = useRef<HTMLDialogElement>(null);
  const projectRef = useRef<HTMLDialogElement>(null);
  useWakeLock(getWakeLockPref());
  const goTo = (id: string) => navigate(paths.tracker(projectId, id));

  useEffect(() => {
    void useSession.getState().open(projectId, patternId);
    return () => useSession.getState().close();
  }, [projectId, patternId]);

  useEffect(() => saveView(projectId, patternId, view), [projectId, patternId, view]);

  const summary = useMemo(
    () => (s.model ? summarize(s.model, s.progress.done) : null),
    [s.model, s.progress.done],
  );
  const rows = useMemo(
    () => (s.grid && summary ? visibleRowCount(s.grid, summary.currentRow, view.rows) : 1),
    [s.grid, summary, view.rows],
  );
  const sections = useMemo(
    () =>
      s.grid?.sections.map((sec) => ({
        label: sec.name,
        first: s.grid ? s.grid.stitchCount - sec.lastStitch + 1 : 1,
        last: s.grid ? s.grid.stitchCount - sec.firstStitch + 1 : 1,
      })) ?? [],
    [s.grid],
  );

  const round = s.grid?.pattern.construction === 'round';
  const rowWord = round ? t('status.roundWord') : t('status.rowWord');
  const sectionOf = (stitch: number) =>
    s.grid?.sections.find((x) => stitch >= x.firstStitch && stitch <= x.lastStitch)?.name;

  // Polite announcement of the new position for screen readers (derived, re-read on each change).
  const announcement = summary?.lastDone
    ? t('status.announce', {
        rowWord,
        row: summary.lastDone.row,
        stitch: summary.lastDone.work,
        done: summary.done,
      })
    : '';

  const dispatch = s.dispatch;
  const mode = s.eraser ? 'erase' : 'mark';
  const onTap = useCallback(
    (index: number) => dispatch({ type: 'tap', index, mode }),
    [dispatch, mode],
  );

  // Keyboard shortcuts (FR-12). Ignored while typing in a form field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName)))
        return;
      const mod = e.ctrlKey || e.metaKey;
      const st = useSession.getState();
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        st.dispatch({ type: e.shiftKey ? 'redo' : 'undo' });
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        st.dispatch({ type: 'redo' });
      } else if (mod) {
        return;
      } else if (e.key === 'Enter') {
        e.preventDefault();
        st.dispatch({ type: 'completeRow' });
      } else if (e.key === ' ') {
        e.preventDefault();
        st.dispatch({ type: 'tap', index: st.progress.done + 1, mode: 'mark' });
      } else if (e.key.toLowerCase() === 'e') {
        st.setEraser(!st.eraser);
      } else if (e.key.toLowerCase() === 'c') {
        setRequest({ kind: 'reveal', nonce: Date.now() });
      } else if (e.key.toLowerCase() === 'g') {
        e.preventDefault();
        positionRef.current?.showModal();
      } else if (e.key === '+' || e.key === '=') {
        setView((v) => ({ ...v, cell: Math.min(64, v.cell + 2) }));
      } else if (e.key === '-') {
        setView((v) => ({ ...v, cell: Math.max(6, v.cell - 2) }));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (s.error) {
    return (
      <main className="page" id="main">
        <h1 className="page__title">{t(`tracker.error.${s.error}`)}</h1>
        {s.project ? (
          <Link className="btn" to={paths.project(projectId)}>
            {t('editor.backToProject')}
          </Link>
        ) : (
          <Link className="btn" to={paths.projects()}>
            {t('nav.projects')}
          </Link>
        )}
      </main>
    );
  }
  if (!s.grid || !s.model || !s.project || !summary || s.patternId !== patternId) {
    return <main className="page page--loading" aria-busy="true" />;
  }

  const grid = s.grid;
  const project = s.project;
  const next = summary.next;
  const last = summary.lastDone;
  const counter = s.model.unit === 'row';
  const finished = project.finishedRows?.[grid.pattern.id];
  const complete = next === null || finished !== undefined;
  const nextPattern = nextPatternOf(project, grid.pattern.id);
  const showGrid = grid.stitchCount > 0;

  return (
    <main id="main" className={`tracker${panelOpen ? ' tracker--panel' : ''}`}>
      <header className="tracker__bar">
        <Link
          to={paths.project(project.id)}
          className="icon-btn"
          aria-label={t('tracker.toProject', { name: project.name })}
        >
          <Icon name="back" />
        </Link>
        <div className="tracker__titles">
          <h1 className="tracker__title">{project.name}</h1>
          {project.patterns.length > 1 ? (
            <select
              className="stage-select"
              aria-label={t('tracker.pattern')}
              value={grid.pattern.id}
              onChange={(e) => goTo(e.target.value)}
            >
              {project.patterns.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          ) : (
            <span className="tracker__stage">{grid.pattern.name}</span>
          )}
        </div>
        <button
          type="button"
          className="icon-btn"
          aria-expanded={panelOpen}
          aria-controls={`${ids}-panel`}
          aria-label={panelOpen ? t('tracker.hidePanel') : t('tracker.showPanel')}
          onClick={() => setPanelOpen((o) => !o)}
        >
          <Icon name="panel" />
        </button>
      </header>

      <section className="status" aria-label={t('status.label')}>
        <p className="status__main">
          <span className="status__item">
            <span className="status__label">{rowWord}</span>
            <span className="status__value num">{summary.currentRow}</span>
          </span>
          {counter ? (
            <span className="status__item">
              <span className="status__label">{t('status.rowsDone')}</span>
              <span className="status__value num">
                {summary.done}
                {grid.plannedRows !== null && (
                  <span className="status__of"> / {grid.plannedRows}</span>
                )}
              </span>
            </span>
          ) : (
            <span className="status__item">
              <span className="status__label">{t('status.stitch')}</span>
              <span className="status__value num">
                {next === null ? '—' : next.work}
                <span className="status__of"> / {s.model.rowLength(summary.currentRow)}</span>
              </span>
            </span>
          )}
          {!counter && finished === undefined && (
            <ShapingBadge grid={grid} row={summary.currentRow} />
          )}
          {grid.pattern.design && grid.plannedRows !== null && (
            <span className="status__item status__item--rows">
              <RowsControl
                grid={grid}
                summary={summary}
                onChange={(n) => useSession.getState().setDesignRows(n)}
              />
            </span>
          )}
          {summary.percent !== null && (
            <span className="status__item status__item--secondary">
              <span className="status__label">{t('status.pattern')}</span>
              <span className="status__value status__value--small num">
                {Math.floor(summary.percent)}%
              </span>
            </span>
          )}
        </p>
        <p className="status__detail" data-testid="status-detail">
          {finished !== undefined
            ? t(round ? 'status.finishedRounds' : 'status.finishedRows', { count: finished })
            : next === null
              ? t('status.complete')
              : counter
                ? t(round ? 'status.counterRounds' : 'status.counterRows', {
                    count: summary.done,
                    button: t(round ? 'actions.roundDone' : 'actions.rowDone'),
                  })
                : last
                  ? t('status.lastDone', {
                      rowWord: round ? t('status.roundInline') : t('status.rowInline'),
                      row: last.row,
                      stitch: last.stitch,
                      section: sectionOf(last.stitch) ? ` (${sectionOf(last.stitch) ?? ''})` : '',
                      done: summary.done,
                    })
                  : t('status.nothingYet')}
          {!round && next && !complete && (
            <span className="status__side">
              {next.side === 'RS' ? t('rowText.rs') : t('rowText.ws')}
            </span>
          )}
          <button
            type="button"
            className="link-btn status__edit"
            onClick={() => positionRef.current?.showModal()}
            title={t('position.hint')}
          >
            {t('position.short')}
          </button>
        </p>
        {complete && nextPattern && (
          <p className="status__next">
            <button
              type="button"
              className="btn btn--primary btn--small"
              onClick={() => goTo(nextPattern.id)}
            >
              {t('patternPanel.next', { name: nextPattern.name })}
            </button>
          </p>
        )}
        {s.saveFailed && (
          <p className="status__warning" role="alert">
            {t('tracker.saveFailed')}
          </p>
        )}
      </section>

      <div className="tracker__body">
        <div className={`tracker__grid${showGrid ? '' : ' tracker__grid--counter'}`}>
          {!showGrid ? (
            <RowCounter
              summary={summary}
              planned={grid.plannedRows}
              round={round}
              onAdd={() => dispatch({ type: 'completeRow' })}
              onRemove={() => dispatch({ type: 'set', done: summary.done - 1 })}
              name={grid.pattern.name}
              next={nextPattern ? { name: nextPattern.name } : null}
              {...(finished === undefined
                ? {
                    onDone: () =>
                      void s.finishPattern(summary.rowsCompleted).then(() => {
                        if (nextPattern) goTo(nextPattern.id);
                      }),
                  }
                : {})}
            />
          ) : (
            <GridCanvas
              grid={grid}
              model={s.model}
              done={s.progress.done}
              mode={mode}
              rows={rows}
              cell={view.cell}
              veil={view.veil}
              request={request}
              onCellChange={(cell) => setView((v) => (v.cell === cell ? v : { ...v, cell }))}
              onTap={onTap}
            />
          )}
          {showGrid && <GuidesToggle />}
          <p id="grid-help" className="visually-hidden">
            {t('grid.help')}
          </p>
        </div>
        <aside
          id={`${ids}-panel`}
          className="panel"
          hidden={!panelOpen}
          aria-label={t('tracker.panel')}
        >
          <div className="panel__head">
            <button
              type="button"
              className="icon-btn panel__close"
              aria-label={t('tracker.hidePanel')}
              onClick={() => setPanelOpen(false)}
            >
              <Icon name="close" />
            </button>
          </div>
          <PatternPanel
            project={project}
            grid={grid}
            summary={summary}
            onPosition={() => positionRef.current?.showModal()}
            onReopen={() => void s.reopenPattern(grid.pattern.id)}
            onNext={goTo}
            onProject={() => projectRef.current?.showModal()}
          />
          {showGrid && <RowText grid={grid} row={summary.currentRow} next={next} />}
          {showGrid && <Legend grid={grid} />}
          <ViewControls
            view={view}
            sections={sections}
            onChange={setView}
            onFit={(cols) =>
              setRequest({
                kind: 'fit',
                ...(cols ? { cols: { first: cols.first, last: cols.last } } : {}),
                nonce: Date.now(),
              })
            }
          />
        </aside>
      </div>

      <nav className="actions" aria-label={t('actions.label')}>
        <button
          type="button"
          className="action"
          onClick={() => dispatch({ type: 'undo' })}
          disabled={!canUndo(s.progress)}
          title={t('actions.undoHint')}
        >
          <Icon name="undo" />
          <span className="action__label">{t('actions.undo')}</span>
        </button>
        <button
          type="button"
          className="action"
          onClick={() => dispatch({ type: 'redo' })}
          disabled={!canRedo(s.progress)}
          title={t('actions.redoHint')}
        >
          <Icon name="redo" />
          <span className="action__label">{t('actions.redo')}</span>
        </button>
        {!counter && (
          <button
            type="button"
            className={`action action--toggle${s.eraser ? ' is-on' : ''}`}
            aria-pressed={s.eraser}
            onClick={() => s.setEraser(!s.eraser)}
            title={t('actions.eraserHint')}
          >
            <Icon name="eraser" />
            <span className="action__label">
              {s.eraser ? t('actions.eraserOn') : t('actions.eraser')}
            </span>
          </button>
        )}
        {showGrid && (
          <button
            type="button"
            className="action"
            onClick={() => setRequest({ kind: 'reveal', nonce: Date.now() })}
            title={t('actions.centerHint')}
          >
            <Icon name="target" />
            <span className="action__label">{t('actions.center')}</span>
          </button>
        )}
        <button
          type="button"
          className="action action--primary"
          onClick={() => dispatch({ type: 'completeRow' })}
          disabled={complete}
          title={t('actions.rowDoneHint')}
          data-testid="complete-row"
        >
          <Icon name="rowDone" />
          <span className="action__label">
            {round ? t('actions.roundDone') : t('actions.rowDone')}
          </span>
        </button>
        {/* The part is done: finish it (rows worked, on to the next part). Last, at the right edge. */}
        {showGrid && finished === undefined && (
          <button
            type="button"
            className="action action--done"
            onClick={() => finishRef.current?.showModal()}
            title={t('actions.doneHint')}
          >
            <Icon name="check" />
            <span className="action__label">{t('actions.done')}</span>
          </button>
        )}
      </nav>
      <div className="visually-hidden" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>
      <PositionDialog
        dialogRef={positionRef}
        model={s.model}
        summary={summary}
        onSet={(done) => dispatch({ type: 'set', done })}
      />
      <FinishDialog
        key={grid.pattern.id}
        dialogRef={finishRef}
        grid={grid}
        summary={summary}
        next={nextPattern}
        onFinish={(rows, nextId) => {
          void s.finishPattern(rows).then(() => {
            if (nextId) goTo(nextId);
          });
        }}
      />
      <ProjectDialog
        key={project.id}
        dialogRef={projectRef}
        project={project}
        onSave={(change) => void s.updateProject(change)}
      />
    </main>
  );
}

import { canRedo, canUndo, summarize } from '@kt/core';
import { visibleRowCount } from '@kt/grid-renderer';
import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getWakeLockPref } from '../lib/preferences';
import { Link } from '../lib/Link';
import { paths } from '../lib/router';
import { useWakeLock } from '../lib/wakeLock';
import { useSession } from '../state/session';
import { GridCanvas, type ViewRequest } from '../tracker/GridCanvas';
import { Legend, RowText, ViewControls, type ViewSettings } from '../tracker/PanelParts';
import { Icon } from '../ui/Icon';

const VIEW_KEY = (id: string) => `kt.view.${id}`;

function loadView(projectId: string): ViewSettings {
  // cell 0 = not chosen yet: the grid picks a size that fits the screen on first open.
  const fallback: ViewSettings = { cell: 0, rows: 'stageEnd', veil: true };
  try {
    const raw = localStorage.getItem(VIEW_KEY(projectId));
    if (!raw) return fallback;
    const v = JSON.parse(raw) as Partial<ViewSettings>;
    return {
      cell: typeof v.cell === 'number' ? v.cell : fallback.cell,
      rows: v.rows === 'stageEnd' || typeof v.rows === 'number' ? v.rows : fallback.rows,
      veil: typeof v.veil === 'boolean' ? v.veil : fallback.veil,
    };
  } catch {
    return fallback;
  }
}

function saveView(projectId: string, v: ViewSettings) {
  try {
    localStorage.setItem(VIEW_KEY(projectId), JSON.stringify(v));
  } catch {
    /* per-device convenience only */
  }
}

export function TrackerPage({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const ids = useId();
  const s = useSession();
  const [view, setView] = useState<ViewSettings>(() => loadView(projectId));
  const [panelOpen, setPanelOpen] = useState(() => matchMedia('(min-width: 1100px)').matches);
  const [request, setRequest] = useState<ViewRequest | null>(null);
  useWakeLock(getWakeLockPref());

  useEffect(() => {
    void useSession.getState().open(projectId);
    return () => useSession.getState().close();
  }, [projectId]);

  useEffect(() => saveView(projectId, view), [projectId, view]);

  const summary = useMemo(
    () => (s.model ? summarize(s.model, s.progress.done) : null),
    [s.model, s.progress.done],
  );
  const rows = useMemo(
    () => (s.stage && summary ? visibleRowCount(s.stage, summary.currentRow, view.rows) : 1),
    [s.stage, summary, view.rows],
  );
  const sections = useMemo(
    () =>
      s.stage?.sections.map((sec) => ({
        label: sec.name,
        first: s.stage ? s.stage.stitchCount - sec.lastStitch + 1 : 1,
        last: s.stage ? s.stage.stitchCount - sec.firstStitch + 1 : 1,
      })) ?? [],
    [s.stage],
  );

  const round = s.stage?.stage.construction === 'round';
  const rowWord = round ? t('status.roundWord') : t('status.rowWord');
  const sectionOf = (stitch: number) =>
    s.stage?.sections.find((x) => stitch >= x.firstStitch && stitch <= x.lastStitch)?.name;

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
        <Link className="btn" to={paths.projects()}>
          {t('nav.projects')}
        </Link>
      </main>
    );
  }
  if (!s.stage || !s.model || !s.project || !s.pattern || !summary) {
    return <main className="page page--loading" aria-busy="true" />;
  }

  const stage = s.stage;
  const next = summary.next;
  const last = summary.lastDone;
  const complete = next === null;

  return (
    <div className={`tracker${panelOpen ? ' tracker--panel' : ''}`}>
      <header className="tracker__bar">
        <Link to={paths.projects()} className="icon-btn" aria-label={t('nav.projects')}>
          <Icon name="back" />
        </Link>
        <div className="tracker__titles">
          <h1 className="tracker__title">{s.project.name}</h1>
          {s.pattern.stages.length > 1 ? (
            <select
              className="stage-select"
              aria-label={t('tracker.stage')}
              value={stage.stage.id}
              onChange={(e) => void s.setStage(e.target.value)}
            >
              {s.pattern.stages.map((st) => (
                <option key={st.id} value={st.id}>
                  {st.name}
                </option>
              ))}
            </select>
          ) : (
            <span className="tracker__stage">{stage.stage.name}</span>
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
          <span className="status__item">
            <span className="status__label">{t('status.stitch')}</span>
            <span className="status__value num">
              {complete ? '—' : next.work}
              <span className="status__of"> / {s.model.rowLength(summary.currentRow)}</span>
            </span>
          </span>
          {summary.percent !== null && (
            <span className="status__item status__item--secondary">
              <span className="status__label">{t('status.stage')}</span>
              <span className="status__value status__value--small num">
                {Math.floor(summary.percent)}%
              </span>
            </span>
          )}
        </p>
        <p className="status__detail" data-testid="status-detail">
          {complete
            ? t('status.complete')
            : last
              ? t('status.lastDone', {
                  rowWord: round ? t('status.roundInline') : t('status.rowInline'),
                  row: last.row,
                  stitch: last.stitch,
                  section: sectionOf(last.stitch) ? ` (${sectionOf(last.stitch) ?? ''})` : '',
                  done: summary.done,
                })
              : t('status.nothingYet')}
          {!round && next && (
            <span className="status__side">
              {next.side === 'RS' ? t('rowText.rs') : t('rowText.ws')}
            </span>
          )}
        </p>
        {s.saveFailed && (
          <p className="status__warning" role="alert">
            {t('tracker.saveFailed')}
          </p>
        )}
      </section>

      <div className="tracker__body">
        <div className="tracker__grid">
          <GridCanvas
            stage={stage}
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
          <RowText stage={stage} row={summary.currentRow} next={next} />
          <Legend stage={stage} pattern={s.pattern} />
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
        <button
          type="button"
          className="action"
          onClick={() => setRequest({ kind: 'reveal', nonce: Date.now() })}
          title={t('actions.centerHint')}
        >
          <Icon name="target" />
          <span className="action__label">{t('actions.center')}</span>
        </button>
        <button
          type="button"
          className="action action--primary"
          onClick={() => dispatch({ type: 'completeRow' })}
          disabled={complete}
          title={t('actions.rowDoneHint')}
        >
          <Icon name="rowDone" />
          <span className="action__label">
            {round ? t('actions.roundDone') : t('actions.rowDone')}
          </span>
        </button>
      </nav>
      <div className="visually-hidden" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>
    </div>
  );
}

import {
  applySymbolRows,
  chartToSymbolRows,
  copyRect,
  createHistory,
  DEFAULT_FILL,
  deleteColumns,
  deleteRows,
  fillRect,
  gridWidth,
  insertColumns,
  insertRows,
  mirrorRect,
  normalizeRect,
  paintCell,
  parseChart,
  pasteClip,
  patternRegistry,
  pushHistory,
  redoHistory,
  replacePresent,
  resizeRows,
  snapRect,
  STD,
  symbolUsage,
  undoHistory,
  upsertCustomSymbol,
  usedSymbolIds,
  validateChart,
  type CellRect,
  type Chart,
  type Clip,
  type History,
  type Pattern,
  type SymbolDef,
  type SymbolRegistry,
  type SymbolRows,
} from '@kt/core';
import { chartSource, editorOverlay } from '@kt/grid-renderer';
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import { create } from 'zustand';
import { Link } from '../lib/Link';
import { paths } from '../lib/router';
import { useDraft } from '../state/draft';
import { DiagnosticsPanel } from '../ui/Diagnostics';
import { NumberField, TextField } from '../ui/fields';
import { Icon, type IconName } from '../ui/Icon';
import { SymbolGlyph } from '../ui/SymbolGlyph';
import { CustomSymbolDialog } from './CustomSymbolDialog';
import { DraftGate, SaveState } from './DraftGate';
import { EditorCanvas, type CanvasTool, type CellPoint } from './EditorCanvas';
import { SymbolLibraryDialog } from './SymbolLibraryDialog';

/** Copied cells, shared by all charts during the session (copy from A.1, paste into A.2). */
const useClipboard = create<{ clip: Clip | null; set(clip: Clip): void }>((set) => ({
  clip: null,
  set: (clip) => set({ clip }),
}));

const update = (f: (p: Pattern) => Pattern) => useDraft.getState().update(f);

export function ChartEditorPage({ patternId, chartId }: { patternId: string; chartId: string }) {
  const { t } = useTranslation();
  return (
    <DraftGate id={patternId}>
      {(pattern) => {
        const chart = pattern.charts.find((c) => c.id === chartId);
        if (!chart) {
          return (
            <main className="page" id="main">
              <h1 className="page__title">{t('chartEditor.missing')}</h1>
              <Link className="btn" to={paths.pattern(patternId)}>
                {t('chartEditor.back')}
              </Link>
            </main>
          );
        }
        return <ChartEditor key={chartId} patternId={patternId} pattern={pattern} chart={chart} />;
      }}
    </DraftGate>
  );
}

const sameRows = (a: SymbolRows, b: SymbolRows) =>
  a.length === b.length &&
  a.every((r, i) => r.length === b[i]?.length && r.every((v, j) => v === b[i]?.[j]));

function safeRegistry(pattern: Pattern): SymbolRegistry | null {
  try {
    return patternRegistry(pattern);
  } catch {
    return null;
  }
}

function ChartEditor({
  patternId,
  pattern,
  chart,
}: {
  patternId: string;
  pattern: Pattern;
  chart: Chart;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith('en') ? 'en' : 'pl';
  const ids = useId();
  const registry = useMemo(() => safeRegistry(pattern), [pattern]);
  const [history, setHistory] = useState<History<SymbolRows>>(() =>
    createHistory(chartToSymbolRows(chart)),
  );
  const rows = history.present;
  const [tool, setTool] = useState<CanvasTool>('paint');
  const [active, setActive] = useState<string>(STD.purl);
  const [recent, setRecent] = useState<string[]>(() => {
    const used = [...symbolUsage(chartToSymbolRows(chart)).keys()];
    return [...new Set([STD.knit, STD.purl, ...used, ...usedSymbolIds(pattern)])].slice(0, 12);
  });
  const [selection, setSelection] = useState<CellRect | null>(null);
  const [cursor, setCursor] = useState<CellPoint | null>(null);
  const [fitKey, setFitKey] = useState(() => `${chart.id}`);
  const clip = useClipboard((s) => s.clip);
  const libraryRef = useRef<HTMLDialogElement>(null);
  const customRef = useRef<HTMLDialogElement>(null);
  const sizeRef = useRef<HTMLDialogElement>(null);
  /** The stroke in progress: rows are tracked here so state updaters stay pure. */
  const stroke = useRef<{
    base: History<SymbolRows>;
    rows: SymbolRows;
    anchor: CellPoint;
    span: { row: number; c1: number; c2: number } | null;
  } | null>(null);

  // Editor history → pattern draft (debounced save).
  useEffect(() => {
    update((p) => {
      const current = p.charts.find((c) => c.id === chart.id);
      if (!current || sameRows(chartToSymbolRows(current), rows)) return p;
      const next = applySymbolRows(current, rows);
      return { ...p, charts: p.charts.map((c) => (c.id === chart.id ? next : c)) };
    });
  }, [rows, chart.id]);

  const meta = pattern.charts.find((c) => c.id === chart.id) ?? chart;
  const current = useMemo(() => applySymbolRows(meta, rows), [meta, rows]);
  const width = gridWidth(rows);
  const height = rows.length;
  const parsed = useMemo(
    () => (registry ? parseChart(current, registry) : null),
    [current, registry],
  );
  const diagnostics = useMemo(
    () => (parsed && registry ? validateChart(parsed, registry) : []),
    [parsed, registry],
  );
  const source = useMemo(
    () => (parsed && registry ? chartSource(parsed, registry) : null),
    [parsed, registry],
  );
  const highlights = useMemo(() => {
    const out: CellPoint[] = [];
    for (const d of diagnostics) {
      if (d.severity === 'info' || d.row === undefined) continue;
      if (d.col !== undefined) out.push({ row: d.row, col: d.col });
      else for (let c = 1; c <= width && out.length < 400; c++) out.push({ row: d.row, col: c });
    }
    return out;
  }, [diagnostics, width]);
  const overlay = useMemo(
    () => editorOverlay({ cursor, selection, highlights }),
    [cursor, selection, highlights],
  );

  if (!registry || !source) {
    return (
      <main className="page" id="main">
        <p className="notice notice--danger">{t('chartEditor.brokenSymbols')}</p>
      </main>
    );
  }

  const def = (id: string): SymbolDef | undefined => registry.get(id);
  const commit = (next: SymbolRows) => setHistory((h) => pushHistory(h, next, sameRows));
  const pick = (id: string) => {
    setActive(id);
    setRecent((r) => [id, ...r.filter((x) => x !== id)].slice(0, 12));
    if (tool === 'pan' || tool === 'view') setTool('paint');
  };

  // ── Strokes ───────────────────────────────────────────────────────────────────────────
  const paintAt = (cell: CellPoint) => {
    const s = stroke.current;
    if (!s) return;
    // Dragging a wide symbol: don't stamp over the copy just placed.
    if (s.span && s.span.row === cell.row && cell.col >= s.span.c1 && cell.col <= s.span.c2) return;
    const w = Math.min(def(active)?.width ?? 1, width);
    const start = Math.min(Math.max(1, cell.col), width - w + 1);
    s.span = { row: cell.row, c1: start, c2: start + w - 1 };
    const next = paintCell(s.rows, registry, cell.row, start, active);
    s.rows = next;
    setHistory((h) => replacePresent(h, next));
  };
  const onStrokeStart = (cell: CellPoint) => {
    stroke.current = { base: history, rows: history.present, anchor: cell, span: null };
    setCursor(cell);
    if (tool === 'paint') paintAt(cell);
    else setSelection({ row1: cell.row, col1: cell.col, row2: cell.row, col2: cell.col });
  };
  const onStrokeMove = (cell: CellPoint) => {
    const s = stroke.current;
    if (!s) return;
    setCursor(cell);
    if (tool === 'paint') paintAt(cell);
    else setSelection({ row1: s.anchor.row, col1: s.anchor.col, row2: cell.row, col2: cell.col });
  };
  const onStrokeEnd = () => {
    const s = stroke.current;
    stroke.current = null;
    if (!s) return;
    if (tool === 'paint') setHistory(pushHistory(s.base, s.rows, sameRows));
    else setSelection((sel) => (sel ? snapRect(rows, registry, sel) : sel));
  };
  const onStrokeCancel = () => {
    const s = stroke.current;
    stroke.current = null;
    if (!s) return;
    if (tool === 'paint') setHistory(s.base);
    else setSelection(null);
  };

  // ── Selection actions ─────────────────────────────────────────────────────────────────
  const target = (): CellRect | null =>
    selection ??
    (cursor ? { row1: cursor.row, col1: cursor.col, row2: cursor.row, col2: cursor.col } : null);
  const sel = selection ? normalizeRect(selection, width, height) : null;
  const doCopy = () => {
    const r = target();
    if (r) useClipboard.getState().set(copyRect(rows, registry, r));
  };
  const doCut = () => {
    const r = target();
    if (!r) return;
    useClipboard.getState().set(copyRect(rows, registry, r));
    commit(fillRect(rows, registry, snapRect(rows, registry, r), DEFAULT_FILL));
  };
  const doPaste = () => {
    const r = target();
    if (!clip || !r) return;
    const at = normalizeRect(r, width, height);
    commit(pasteClip(rows, registry, clip, at.row1, at.col1));
    setSelection({
      row1: at.row1,
      col1: at.col1,
      row2: Math.min(height, at.row1 + clip.height - 1),
      col2: Math.min(width, at.col1 + clip.width - 1),
    });
  };
  const doFill = (symbolId: string) => {
    const r = target();
    if (r) commit(fillRect(rows, registry, r, symbolId));
  };
  const doMirror = (axis: 'horizontal' | 'vertical') => {
    const r = target();
    if (r) commit(mirrorRect(rows, registry, r, axis));
  };
  const clearSelectionIfOutside = (w: number, h: number) =>
    setSelection((s) =>
      s && (Math.max(s.row1, s.row2) > h || Math.max(s.col1, s.col2) > w) ? null : s,
    );
  const doInsertRow = () => {
    const r = target() ?? { row1: height, row2: height, col1: 1, col2: 1 };
    commit(insertRows(rows, Math.max(r.row1, r.row2)));
  };
  const doDeleteRows = () => {
    const r = target();
    if (!r || height <= 1) return;
    commit(deleteRows(rows, r.row1, r.row2));
    setSelection(null);
  };
  const doInsertCol = () => {
    const r = target() ?? { row1: 1, row2: 1, col1: 1, col2: 1 };
    commit(insertColumns(rows, registry, Math.min(r.col1, r.col2) - 1));
  };
  const doDeleteCols = () => {
    const r = target();
    if (!r || width <= 1) return;
    commit(deleteColumns(rows, registry, r.col1, r.col2));
    setSelection(null);
  };
  const undo = () => setHistory((h) => undoHistory(h));
  const redo = () => setHistory((h) => redoHistory(h));

  // ── Keyboard ─────────────────────────────────────────────────────────────────────────
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    const handled = () => {
      e.preventDefault();
      e.stopPropagation();
    };
    if (mod) {
      const shortcuts: Record<string, () => void> = {
        z: e.shiftKey ? redo : undo,
        y: redo,
        c: doCopy,
        x: doCut,
        v: doPaste,
        a: () => setSelection({ row1: 1, col1: 1, row2: height, col2: width }),
      };
      const run = shortcuts[key];
      if (run) {
        handled();
        run();
      }
      return;
    }
    const arrows: Record<string, [number, number]> = {
      arrowleft: [0, -1],
      arrowright: [0, 1],
      arrowup: [1, 0],
      arrowdown: [-1, 0],
    };
    const move = arrows[key];
    if (move) {
      handled();
      const from = cursor ?? { row: Math.ceil(height / 2), col: Math.ceil(width / 2) };
      const next = {
        row: Math.min(height, Math.max(1, from.row + move[0])),
        col: Math.min(width, Math.max(1, from.col + move[1])),
      };
      if (e.shiftKey) {
        const anchor = selection ? { row: selection.row1, col: selection.col1 } : from;
        setSelection({ row1: anchor.row, col1: anchor.col, row2: next.row, col2: next.col });
      } else setSelection(null);
      setCursor(next);
      return;
    }
    if ((key === 'enter' || key === ' ') && cursor) {
      handled();
      commit(paintCell(rows, registry, cursor.row, cursor.col, active));
    } else if (key === 'delete' || key === 'backspace') {
      handled();
      doFill(DEFAULT_FILL);
    } else if (key === 'escape') {
      if (selection || cursor) handled();
      setSelection(null);
      setCursor(null);
    } else if (/^[1-9]$/.test(key)) {
      const id = recent[Number(key) - 1];
      if (id) {
        handled();
        pick(id);
      }
    } else if (key === 'b' || key === 's' || key === 'h') {
      handled();
      setTool(key === 'b' ? 'paint' : key === 's' ? 'select' : 'pan');
    }
  };

  const activeDef = def(active);
  const tools: { id: CanvasTool; icon: IconName; label: string }[] = [
    { id: 'paint', icon: 'brush', label: t('chartEditor.tools.paint') },
    { id: 'select', icon: 'select', label: t('chartEditor.tools.select') },
    { id: 'pan', icon: 'hand', label: t('chartEditor.tools.pan') },
  ];
  const where = cursor
    ? t('chartEditor.where', {
        row: cursor.row,
        stitch: width - cursor.col + 1,
        symbol: def(rows[cursor.row - 1]?.[cursor.col - 1] ?? '')?.label[lang] ?? '…',
      })
    : t('chartEditor.whereNone');

  return (
    <main className="editor" id="main">
      <header className="editor__bar">
        <h1 className="visually-hidden">{t('chartEditor.heading', { name: meta.name })}</h1>
        <Link to={paths.pattern(patternId)} className="icon-btn" aria-label={t('chartEditor.back')}>
          <Icon name="back" />
        </Link>
        <TextField
          label={t('editor.chartName')}
          value={meta.name}
          required
          maxLength={40}
          className="field--compact editor__name"
          onCommit={(name) =>
            update((p) => ({
              ...p,
              charts: p.charts.map((c) => (c.id === chart.id ? { ...c, name } : c)),
            }))
          }
        />
        <span className="editor__dims num">{t('editor.chartSize', { w: width, h: height })}</span>
        <SaveState />
      </header>

      <div className="editor__toolbar" role="toolbar" aria-label={t('chartEditor.toolbar')}>
        <div className="segmented" role="radiogroup" aria-label={t('chartEditor.tool')}>
          {tools.map((x) => (
            <label key={x.id} className="segmented__item">
              <input
                type="radio"
                name={`${ids}-tool`}
                checked={tool === x.id}
                onChange={() => setTool(x.id)}
              />
              <span>
                <Icon name={x.icon} size={20} />
                <span className="segmented__text">{x.label}</span>
              </span>
            </label>
          ))}
        </div>
        <button
          type="button"
          className="icon-btn"
          onClick={undo}
          disabled={history.past.length === 0}
          aria-label={t('actions.undoHint')}
        >
          <Icon name="undo" />
        </button>
        <button
          type="button"
          className="icon-btn"
          onClick={redo}
          disabled={history.future.length === 0}
          aria-label={t('actions.redoHint')}
        >
          <Icon name="redo" />
        </button>
        <button
          type="button"
          className="btn btn--small"
          onClick={() => sizeRef.current?.showModal()}
        >
          <Icon name="resize" size={18} />
          {t('chartEditor.size')}
        </button>
      </div>

      <div className="editor__body">
        <div className="editor__canvas">
          <EditorCanvas
            source={source}
            overlay={overlay}
            tool={tool}
            label={t('chartEditor.canvasLabel', { name: meta.name })}
            help={t('chartEditor.help')}
            fitKey={fitKey}
            reveal={cursor}
            onStrokeStart={onStrokeStart}
            onStrokeMove={onStrokeMove}
            onStrokeEnd={onStrokeEnd}
            onStrokeCancel={onStrokeCancel}
            onKeyDown={onKeyDown}
            testId="chart-editor"
          />
          <p className="editor__where" aria-live="polite">
            {where}
            {sel && (
              <span className="num">
                {' '}
                {t('chartEditor.selected', {
                  w: sel.col2 - sel.col1 + 1,
                  h: sel.row2 - sel.row1 + 1,
                })}
              </span>
            )}
          </p>
        </div>

        <aside className="editor__panel">
          <section aria-labelledby={`${ids}-pal`}>
            <h2 id={`${ids}-pal`} className="panel__title">
              {t('chartEditor.palette')}
            </h2>
            <ul className="palette">
              {recent.map((id, i) => {
                const s = def(id);
                if (!s) return null;
                return (
                  <li key={id}>
                    <button
                      type="button"
                      className="palette__item"
                      aria-pressed={active === id}
                      title={i < 9 ? `${s.label[lang]} (${i + 1})` : s.label[lang]}
                      onClick={() => pick(id)}
                    >
                      <SymbolGlyph
                        glyph={s.glyph}
                        width={s.width}
                        cell={Math.min(26, 64 / s.width)}
                      />
                      <span className="palette__label">{s.label[lang]}</span>
                    </button>
                  </li>
                );
              })}
              <li>
                <button
                  type="button"
                  className="palette__item palette__more"
                  onClick={() => libraryRef.current?.showModal()}
                >
                  <Icon name="library" />
                  <span className="palette__label">{t('chartEditor.more')}</span>
                </button>
              </li>
            </ul>
            {activeDef && (
              <p className="hint palette__active">
                {t('chartEditor.active', { name: activeDef.label[lang] })}{' '}
                {activeDef.description[lang]}
              </p>
            )}
          </section>

          <section aria-labelledby={`${ids}-sel`}>
            <h2 id={`${ids}-sel`} className="panel__title">
              {t('chartEditor.selection')}
            </h2>
            {!selection && <p className="hint">{t('chartEditor.selectionHint')}</p>}
            <div className="action-grid">
              <ActionBtn
                icon="copy"
                label={t('chartEditor.copy')}
                onClick={doCopy}
                disabled={!target()}
              />
              <ActionBtn
                icon="cut"
                label={t('chartEditor.cut')}
                onClick={doCut}
                disabled={!target()}
              />
              <ActionBtn
                icon="paste"
                label={t('chartEditor.paste')}
                onClick={doPaste}
                disabled={!clip || !target()}
              />
              <ActionBtn
                icon="fill"
                label={t('chartEditor.fill')}
                onClick={() => doFill(active)}
                disabled={!target()}
              />
              <ActionBtn
                icon="mirrorH"
                label={t('chartEditor.mirrorH')}
                onClick={() => doMirror('horizontal')}
                disabled={!target()}
              />
              <ActionBtn
                icon="mirrorV"
                label={t('chartEditor.mirrorV')}
                onClick={() => doMirror('vertical')}
                disabled={!target()}
              />
              <ActionBtn icon="rowAdd" label={t('chartEditor.insertRow')} onClick={doInsertRow} />
              <ActionBtn
                icon="rowRemove"
                label={t('chartEditor.deleteRows')}
                onClick={doDeleteRows}
                disabled={!target() || height <= 1}
              />
              <ActionBtn icon="colAdd" label={t('chartEditor.insertCol')} onClick={doInsertCol} />
              <ActionBtn
                icon="colRemove"
                label={t('chartEditor.deleteCols')}
                onClick={doDeleteCols}
                disabled={!target() || width <= 1}
              />
            </div>
            {selection && (
              <button type="button" className="btn btn--small" onClick={() => setSelection(null)}>
                {t('chartEditor.deselect')}
              </button>
            )}
          </section>

          <section aria-labelledby={`${ids}-chk`}>
            <h2 id={`${ids}-chk`} className="panel__title">
              {t('editor.check')}
            </h2>
            <DiagnosticsPanel
              items={diagnostics}
              limit={6}
              action={(d) =>
                d.row !== undefined
                  ? {
                      label: t('chartEditor.showCell'),
                      run: () => {
                        const row = d.row ?? 1;
                        const col = d.col ?? 1;
                        setCursor({ row, col });
                        setSelection(
                          d.col === undefined
                            ? { row1: row, col1: 1, row2: row, col2: width }
                            : null,
                        );
                      },
                    }
                  : null
              }
            />
          </section>
        </aside>
      </div>

      <SymbolLibraryDialog
        dialogRef={libraryRef}
        registry={registry}
        onPick={(s) => pick(s.id)}
        onCreate={() => customRef.current?.showModal()}
      />
      <CustomSymbolDialog
        dialogRef={customRef}
        pattern={pattern}
        symbol={null}
        onSave={(sym) => {
          update((p) => upsertCustomSymbol(p, sym));
          // The registry updates with the pattern; select the new symbol right away.
          setTimeout(() => pick(sym.id), 0);
        }}
      />
      <ResizeDialog
        dialogRef={sizeRef}
        width={width}
        height={height}
        onResize={(w, h, anchor) => {
          commit(resizeRows(rows, registry, w, h, anchor));
          clearSelectionIfOutside(w, h);
          setFitKey(`${chart.id}-${w}x${h}-${Date.now()}`);
        }}
      />
    </main>
  );
}

function ActionBtn({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: IconName;
  label: string;
  onClick(): void;
  disabled?: boolean;
}) {
  return (
    <button type="button" className="action-btn" onClick={onClick} disabled={disabled}>
      <Icon name={icon} size={20} />
      <span>{label}</span>
    </button>
  );
}

function ResizeDialog({
  dialogRef,
  width,
  height,
  onResize,
}: {
  dialogRef: React.RefObject<HTMLDialogElement | null>;
  width: number;
  height: number;
  onResize(w: number, h: number, anchor: { x: 'left' | 'right'; y: 'bottom' | 'top' }): void;
}) {
  const { t } = useTranslation();
  const ids = useId();
  const [w, setW] = useState(width);
  const [h, setH] = useState(height);
  const [x, setX] = useState<'left' | 'right'>('right');
  const [y, setY] = useState<'bottom' | 'top'>('bottom');
  const [seen, setSeen] = useState(`${width}x${height}`);
  if (seen !== `${width}x${height}`) {
    setSeen(`${width}x${height}`);
    setW(width);
    setH(height);
  }
  const submit = (e: FormEvent) => {
    e.preventDefault();
    dialogRef.current?.close();
    if (w !== width || h !== height) onResize(w, h, { x, y });
  };
  return (
    <dialog ref={dialogRef} className="dialog" aria-labelledby={`${ids}-t`}>
      <form onSubmit={submit}>
        <h2 id={`${ids}-t`} className="dialog__title">
          {t('chartEditor.sizeTitle')}
        </h2>
        <div className="form-grid form-grid--2">
          <NumberField label={t('editor.width')} value={w} min={1} max={500} onCommit={setW} />
          <NumberField label={t('editor.height')} value={h} min={1} max={500} onCommit={setH} />
        </div>
        <fieldset className="field">
          <legend>{t('chartEditor.colsSide')}</legend>
          {(['left', 'right'] as const).map((side) => (
            <label key={side} className="check">
              {/* x = the edge that stays: columns change on the other side. */}
              <input
                type="radio"
                name={`${ids}-x`}
                checked={x === (side === 'left' ? 'right' : 'left')}
                onChange={() => setX(side === 'left' ? 'right' : 'left')}
              />
              {t(`chartEditor.side.${side}`)}
            </label>
          ))}
        </fieldset>
        <fieldset className="field">
          <legend>{t('chartEditor.rowsSide')}</legend>
          {(['top', 'bottom'] as const).map((side) => (
            <label key={side} className="check">
              <input
                type="radio"
                name={`${ids}-y`}
                checked={y === (side === 'top' ? 'bottom' : 'top')}
                onChange={() => setY(side === 'top' ? 'bottom' : 'top')}
              />
              {t(`chartEditor.side.${side}`)}
            </label>
          ))}
        </fieldset>
        <div className="dialog__actions">
          <button type="button" className="btn" onClick={() => dialogRef.current?.close()}>
            {t('common.cancel')}
          </button>
          <button type="submit" className="btn btn--primary">
            {t('chartEditor.applySize')}
          </button>
        </div>
      </form>
    </dialog>
  );
}

import {
  applyDesign,
  blankDesign,
  designChart,
  firstHalf,
  halfCuts,
  mirrorAreas,
  mirrorAxis,
  MOTIF_LIBRARY,
  parseChart,
  patternRegistry,
  splitsFrontBack,
  type Chart,
  type Design,
  type Pattern,
  type Project,
  type SymbolRegistry,
} from '@kt/core';
import { chartSource, editorOverlay, quarterGuides, type GridSource } from '@kt/grid-renderer';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PatternGate, SaveState } from '../editor/DraftGate';
import { EditorCanvas, type CanvasTool, type CellPoint } from '../editor/EditorCanvas';
import { Link } from '../lib/Link';
import { navigate, paths } from '../lib/router';
import { useDraft } from '../state/draft';
import { useGuides } from '../state/guides';
import { useMotifs } from '../state/motifs';
import { useTileClip } from '../state/tileClip';
import { NumberField } from '../ui/fields';
import { GuidesToggle } from '../ui/GuidesToggle';
import { Icon } from '../ui/Icon';
import { AppHeader } from '../routes/AppHeader';
import {
  areaRect,
  brushCell,
  clipConflict,
  clipRects,
  conflictOf,
  copyTiles,
  eraseCell,
  fromRight,
  inMirror,
  moveTiles,
  onBottom,
  placeClip,
  placeMotif,
  removeTiles,
  resizeDesign,
  tileAt,
  toggleMirror,
  type Clip,
  type Conflict,
} from './designOps';
import { MotifDialog } from './MotifDialog';
import { PiecesPanel } from './PiecesPanel';
import { TileBar } from './TileBar';
import { SymbolPalette } from './SymbolPalette';

/**
 * The pattern creator: a grid of the size the knitter types, pieces of pattern from the library
 * (or drawn by the knitter) laid on it as tiles that never overlap — moved by dragging and
 * stretched in whole repeats from the bar above the grid — and a brush for single stitches.
 */
export function DesignerPage({ projectId, patternId }: { projectId: string; patternId: string }) {
  return (
    <PatternGate projectId={projectId} patternId={patternId}>
      {(pattern, project) => <Designer key={pattern.id} project={project} pattern={pattern} />}
    </PatternGate>
  );
}

type Tool = 'tiles' | 'brush' | 'eraser' | 'pan';

function Designer({ project, pattern }: { project: Project; pattern: Pattern }) {
  const { t } = useTranslation();
  const registry = useMemo(() => patternRegistry(pattern), [pattern]);
  const design = pattern.design;
  const setDesign = (next: Design) =>
    useDraft
      .getState()
      .updatePattern(pattern.id, (p) => applyDesign({ ...p, design: next }, registry));
  const back =
    project.kind && project.kind !== 'custom' ? paths.parts(project.id) : paths.project(project.id);
  /** "Gotowe": the part is set up; back to the garment's parts (or the project). */
  const finish = async () => {
    useDraft.getState().updatePattern(pattern.id, (p) => ({ ...p, ready: true }));
    await useDraft.getState().flush();
    navigate(back);
  };
  return design ? (
    <Workbench
      project={project}
      pattern={pattern}
      design={design}
      registry={registry}
      setDesign={setDesign}
      back={back}
      onDone={() => void finish()}
    />
  ) : (
    <GridSize
      pattern={pattern}
      back={back}
      onDone={() => void finish()}
      onCreate={(w, h) =>
        setDesign({
          ...blankDesign(w, h),
          // A body in the round has a front and a back: shown apart from the start.
          ...(splitsFrontBack(project.kind, pattern.id)
            ? { halves: [t('importer.front'), t('importer.back')] as [string, string] }
            : {}),
        })
      }
    />
  );
}

/** First step: how big the grid is (stitches × rows). */
function GridSize({
  pattern,
  back,
  onCreate,
  onDone,
}: {
  pattern: Pattern;
  back: string;
  onCreate(width: number, height: number): void;
  /** Done without a grid: the part is tracked by counting rows. */
  onDone(): void;
}) {
  const { t } = useTranslation();
  const [width, setWidth] = useState<number | undefined>(undefined);
  const [height, setHeight] = useState<number | undefined>(undefined);
  const replaces = pattern.charts.length > 0;
  return (
    <>
      <AppHeader />
      <main className="page" id="main">
        <p className="page__back">
          <Link to={back} className="link-back">
            <Icon name="back" size={18} />
            {t('designer.back')}
          </Link>
        </p>
        <h1 className="page__title">{t('designer.title', { name: pattern.name })}</h1>
        <p className="lead">{t('designer.sizeLead')}</p>
        <div className="form-grid form-grid--2 designer-size">
          <NumberField
            label={t('designer.width')}
            value={width}
            min={1}
            max={1000}
            hint={t('designer.widthHint')}
            onCommit={setWidth}
          />
          <NumberField
            label={t('designer.height')}
            value={height}
            min={1}
            max={1000}
            hint={t('designer.heightHint')}
            onCommit={setHeight}
          />
        </div>
        {replaces && <p className="notice notice--warning">{t('designer.replaces')}</p>}
        <div className="form-actions">
          <button
            type="button"
            className="btn btn--primary"
            disabled={!width || !height}
            onClick={() => width && height && onCreate(width, height)}
          >
            {t('designer.createGrid')}
          </button>
          <button type="button" className="btn" onClick={onDone}>
            {t('designer.doneWithoutGrid')}
          </button>
        </div>
      </main>
    </>
  );
}

function Workbench({
  project,
  pattern,
  design,
  registry,
  setDesign,
  back,
  onDone,
}: {
  project: Project;
  pattern: Pattern;
  design: Design;
  registry: SymbolRegistry;
  setDesign(next: Design): void;
  back: string;
  /** "Gotowe": this part is set up. */
  onDone(): void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith('en') ? 'en' : 'pl';
  const ids = useId();
  const own = useMotifs((s) => s.motifs);
  const clip = useTileClip((s) => s.clip);
  useEffect(() => {
    void useMotifs.getState().load();
  }, []);
  const [tool, setTool] = useState<Tool>('tiles');
  const [symbol, setSymbol] = useState('std:p');
  const [holding, setHolding] = useState<{ motif: Chart; times: number } | null>(null);
  /** Copied tiles in hand, laid together by clicking a column. */
  const [pasting, setPasting] = useState<Clip | null>(null);
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  /** What the last action did, shown in the bar until something else happens. */
  const [info, setInfo] = useState<string | null>(null);
  const [cursor, setCursor] = useState<CellPoint | null>(null);
  const [hover, setHover] = useState<CellPoint | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [newPiece, setNewPiece] = useState(false);
  const stroke = useRef<Design | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  /** On a phone the library is below the grid: bring the bar (and the grid) back into view. */
  const showBar = () => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    barRef.current?.scrollIntoView?.({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
  };

  const fromFile = useMemo(() => project.motifs ?? [], [project.motifs]);
  const library: readonly Chart[] = useMemo(
    () => [
      ...fromFile,
      ...MOTIF_LIBRARY.map((m) => ({ ...m.chart, name: m.label[lang].slice(0, 40) })),
      ...own,
    ],
    [lang, own, fromFile],
  );
  const motifOf = (id: string) =>
    design.motifs.find((m) => m.id === id) ?? library.find((m) => m.id === id);
  const chosen = selectedIds.filter((id) => design.placements.some((p) => p.id === id));
  const selected =
    chosen.length === 1 ? (design.placements.find((p) => p.id === chosen[0]) ?? null) : null;
  const mirrors = useMemo(() => mirrorAreas(design), [design]);
  /** Quarter whose mirror axis lies on the left edge of display column `col`, if any. */
  const quarterAt = (col: number) =>
    QUARTERS.find((q) => design.width - mirrorAxis(design.width, q) + 1 === col);

  // What the grid shows before a click: the piece or the copied tiles in hand under the mouse, or
  // the tiles being dragged, where they would land.
  const ghost = useMemo(() => {
    const small = design.width * design.height <= 200_000;
    if (tool === 'tiles' && hover && (holding || pasting)) {
      const col = fromRight(design, hover.col);
      if (pasting) {
        const conflict = clipConflict(design, pasting, col);
        return {
          rects: clipRects(design, pasting, col),
          conflict,
          preview: conflict || !small ? null : placeClip(design, pasting, col).design,
        };
      }
      if (holding) {
        const input = onBottom(col, holding.times);
        const conflict = conflictOf(design, holding.motif, input);
        const rect = areaRect(design, { ...input, id: '', motifId: '' }, holding.motif);
        return {
          rects: rect ? [rect] : [],
          conflict,
          // The grid shows the pattern with the tile in place when it fits (on grids small enough
          // to redraw while the mouse moves); otherwise only its outline.
          preview: conflict || !small ? null : placeMotif(design, holding.motif, input).design,
        };
      }
    }
    if (drag && drag.shift !== 0) {
      const moved = moveTiles(design, drag.ids, drag.shift);
      const after = moved.design ?? {
        ...design,
        placements: design.placements.map((p) =>
          drag.ids.includes(p.id) ? { ...p, col: p.col - drag.shift } : p,
        ),
      };
      return {
        rects: rectsOf(after, drag.ids),
        conflict: moved.conflict,
        preview: small ? moved.design : null,
      };
    }
    return null;
  }, [holding, pasting, hover, tool, drag, design]);

  const chart = useMemo(
    () => designChart(ghost?.preview ?? design, registry, pattern.name),
    [ghost, design, registry, pattern.name],
  );
  const parsed = useMemo(() => parseChart(chart, registry), [chart, registry]);
  const guides = useGuides((s) => s.on);
  // Rows where the front | back split cuts a symbol (a cable) in two.
  const cuts = useMemo(() => halfCuts(design, registry), [design, registry]);
  const source = useMemo((): GridSource => {
    const base = chartSource(parsed, registry);
    // Halves are drawn apart: the second (back) on the left, the first (front) on the right.
    const cut = design.width - firstHalf(design.width);
    const sections =
      design.halves && cut > 0
        ? [
            { label: design.halves[1], firstCol: 1, lastCol: cut },
            { label: design.halves[0], firstCol: cut + 1, lastCol: design.width },
          ]
        : [];
    const shown = { ...base, sections };
    // Mirror axes are always shown (dashed), with the mirror image hatched.
    const axes = mirrors.map((m) => ({ atCol: m.axisCol, kind: 'mirror' as const }));
    const counting = guides
      ? quarterGuides(shown).filter((g) => !axes.some((a) => a.atCol === g.atCol))
      : [];
    return {
      ...shown,
      guides: [...counting, ...axes],
      shaded: mirrors.map((m) => ({ firstCol: m.firstCol, lastCol: m.lastCol })),
    };
  }, [parsed, registry, design.width, design.halves, guides, mirrors]);
  const rects = ghost ? ghost.rects : rectsOf(design, chosen);
  const overlay = editorOverlay({
    cursor: ghost ? null : cursor,
    selection: rects[0] ?? null,
    selections: rects.slice(1),
  });

  const conflictText = (conflict: Conflict) =>
    conflict.kind === 'off'
      ? t('designer.offGrid')
      : conflict.kind === 'mirror'
        ? t('designer.mirrorConflict')
        : t('designer.overlap', { name: motifOf(conflict.with.motifId)?.name ?? '' });
  /** Show why a tile can't go somewhere (or clear the message). */
  const explain = (conflict: Conflict | null) => {
    setMessage(conflict ? conflictText(conflict) : null);
    setInfo(null);
  };

  /** Select these tiles (nothing in hand any more). */
  const selectTiles = (next: readonly string[]) => {
    setSelectedIds(next);
    setHolding(null);
    setPasting(null);
    setMessage(null);
    setInfo(null);
    if (next.length > 0) {
      setTool('tiles');
      showBar();
    }
  };
  /** A tile in the list: select it alone, or with Shift add it to (or take it out of) the rest. */
  const selectFromList = (id: string | null, add: boolean) => {
    if (id === null) return selectTiles([]);
    if (add) {
      return selectTiles(chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id]);
    }
    selectTiles(chosen.length === 1 && chosen[0] === id ? [] : [id]);
  };
  const pick = (motif: Chart) => {
    setInfo(null);
    setHolding({ motif, times: 1 });
    setPasting(null);
    setSelectedIds([]);
    setMessage(null);
    setTool('tiles');
    showBar();
  };
  const copy = () => {
    const copied = copyTiles(design, chosen);
    if (!copied) return;
    useTileClip.getState().set(copied);
    setMessage(null);
    setInfo(t('designer.copied', { count: copied.items.length }));
  };
  const paste = () => {
    setInfo(null);
    const current = useTileClip.getState().clip;
    if (!current) return;
    setPasting(current);
    setHolding(null);
    setSelectedIds([]);
    setMessage(null);
    setTool('tiles');
    showBar();
  };
  const removeSelected = () => {
    if (chosen.length === 0) return;
    setDesign(removeTiles(design, chosen));
    setSelectedIds([]);
    setMessage(null);
  };
  const cancel = () => {
    setInfo(null);
    setHolding(null);
    setPasting(null);
    setSelectedIds([]);
    setMessage(null);
  };
  const flipMirror = (quarter: 1 | 2 | 3) => {
    const on = !(design.mirrors ?? []).includes(quarter);
    setDesign(toggleMirror(design, quarter));
    setMessage(null);
    setInfo(t(on ? 'designer.mirrorOn' : 'designer.mirrorOff', { line: QUARTER_LABEL[quarter] }));
  };

  // Ctrl/⌘+C copies the selected tiles, Ctrl/⌘+V takes the copy in hand, Delete removes the
  // selected tiles, Escape lets go — unless the knitter is typing in a field.
  const keys = useRef({ copy, paste, removeSelected, cancel });
  useEffect(() => {
    keys.current = { copy, paste, removeSelected, cancel };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target?.closest('input, textarea, select, [contenteditable="true"]') ||
        document.querySelector('dialog[open]')
      ) {
        return;
      }
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && key === 'c') keys.current.copy();
      else if (mod && key === 'v') keys.current.paste();
      else if (!mod && (e.key === 'Delete' || e.key === 'Backspace')) keys.current.removeSelected();
      else if (e.key === 'Escape') keys.current.cancel();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /** Lay the held piece as a tile standing on the bottom row, its right edge at stitch `col`. */
  const lay = (col: number) => {
    if (!holding) return;
    const input = onBottom(col, holding.times);
    const conflict = conflictOf(design, holding.motif, input);
    explain(conflict);
    if (conflict) return;
    const placed = placeMotif(design, holding.motif, input);
    setDesign(placed.design);
    setHolding(null);
    setSelectedIds([placed.id]);
  };
  /** Lay the copied tiles, the rightmost with its right edge at stitch `col`. */
  const layClip = (col: number) => {
    if (!pasting) return;
    const conflict = clipConflict(design, pasting, col);
    explain(conflict);
    if (conflict) return;
    const placed = placeClip(design, pasting, col);
    setDesign(placed.design);
    setPasting(null);
    setSelectedIds(placed.ids);
  };
  const tilesStart = (cell: CellPoint, shift: boolean) => {
    if (holding) return lay(fromRight(design, cell.col));
    if (pasting) return layClip(fromRight(design, cell.col));
    setMessage(null);
    // A mirror image is drawn from the other side of its axis: nothing to pick there.
    if (inMirror(design, cell.col, cell.col)) {
      setSelectedIds([]);
      return setMessage(t('designer.inMirror'));
    }
    const tile = tileAt(design, cell.row, cell.col);
    if (shift) {
      if (tile) {
        setSelectedIds(
          chosen.includes(tile.id) ? chosen.filter((x) => x !== tile.id) : [...chosen, tile.id],
        );
      }
      return;
    }
    if (!tile) return setSelectedIds([]);
    // Dragging one of several selected tiles moves them all.
    const group = chosen.includes(tile.id) ? chosen : [tile.id];
    setSelectedIds(group);
    setDrag({ ids: group, start: cell, shift: 0 });
  };
  const tilesMove = (cell: CellPoint) => {
    // Tiles stand on the bottom row: a drag moves them sideways only.
    if (drag) setDrag({ ...drag, shift: cell.col - drag.start.col });
  };
  const tilesEnd = () => {
    if (drag && drag.shift !== 0) {
      const moved = moveTiles(design, drag.ids, drag.shift);
      explain(moved.conflict);
      if (moved.design) setDesign(moved.design);
    }
    setDrag(null);
  };
  const paint = (cell: CellPoint) => {
    if (inMirror(design, cell.col, cell.col)) return setMessage(t('designer.inMirror'));
    const base = stroke.current ?? design;
    const next =
      tool === 'brush'
        ? brushCell(base, registry, cell.row, cell.col, symbol)
        : eraseCell(base, registry, cell.row, cell.col);
    if (next === base) return;
    stroke.current = next;
    setDesign(next);
  };
  const canvasTool: CanvasTool = tool === 'pan' ? 'pan' : tool === 'tiles' ? 'select' : 'paint';
  const tools: { id: Tool; icon: 'select' | 'brush' | 'eraser' | 'hand'; label: string }[] = [
    { id: 'tiles', icon: 'select', label: t('designer.toolTiles') },
    { id: 'brush', icon: 'brush', label: t('designer.toolBrush') },
    { id: 'eraser', icon: 'eraser', label: t('designer.toolEraser') },
    { id: 'pan', icon: 'hand', label: t('designer.toolPan') },
  ];
  // Pointing at a quarter line tells how to mirror there.
  const nearLine =
    hover && !holding && !pasting && (tool === 'tiles' || tool === 'pan')
      ? (quarterAt(hover.col) ?? quarterAt(hover.col + 1))
      : undefined;

  return (
    <main className="editor designer" id="main">
      <header className="editor__bar">
        <Link to={back} className="icon-btn" aria-label={t('designer.back')}>
          <Icon name="back" />
        </Link>
        <h1 className="designer__title">{t('designer.title', { name: pattern.name })}</h1>
        <SaveState />
        <button type="button" className="btn btn--primary btn--small" onClick={onDone}>
          <Icon name="check" size={18} />
          {t('designer.done')}
        </button>
      </header>

      <div className="editor__toolbar" role="toolbar" aria-label={t('designer.toolbar')}>
        <div className="segmented" role="radiogroup" aria-label={t('designer.tool')}>
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
        <div className="designer__dims">
          <NumberField
            compact
            label={t('designer.widthShort')}
            value={design.width}
            min={1}
            max={1000}
            onCommit={(w) => setDesign(resizeDesign(design, w, design.height))}
          />
          <span aria-hidden="true">×</span>
          <NumberField
            compact
            label={t('designer.heightShort')}
            value={design.height}
            min={1}
            max={1000}
            onCommit={(h) => setDesign(resizeDesign(design, design.width, h))}
          />
        </div>
        {(pattern.construction === 'round' || design.halves) && (
          <label className="check designer__halves">
            <input
              type="checkbox"
              checked={!!design.halves}
              onChange={(e) => {
                const { halves: _off, ...rest } = design;
                setDesign(
                  e.target.checked
                    ? { ...rest, halves: [t('importer.front'), t('importer.back')] }
                    : rest,
                );
              }}
            />
            <span>{t('designer.halves')}</span>
          </label>
        )}
      </div>

      <div ref={barRef} className="designer__bar">
        <TileBar
          design={design}
          holding={holding}
          pasting={pasting}
          selected={selected}
          count={chosen.length}
          canPaste={clip !== null}
          motifOf={motifOf}
          message={message}
          info={info}
          onCancel={cancel}
          onHoldTimes={(times) => holding && setHolding({ ...holding, times })}
          onDeselect={() => selectTiles([])}
          onCopy={copy}
          onPaste={paste}
          onRemoveSelected={removeSelected}
          setDesign={setDesign}
          onConflict={explain}
        />
        {cuts.length > 0 && (
          <p className="notice notice--warning designer__cuts" role="status">
            {t('designer.halfCut', {
              count: cuts.length,
              rows: cuts.slice(0, 6).join(', ') + (cuts.length > 6 ? '…' : ''),
            })}
          </p>
        )}
      </div>

      <div className="editor__body">
        <div className="editor__canvas">
          <GuidesToggle />
          <EditorCanvas
            source={source}
            overlay={overlay}
            tool={canvasTool}
            label={t('designer.canvasLabel', { name: pattern.name })}
            help={t('designer.help')}
            fitKey={`${design.width}x${design.height}${design.halves ? '/2' : ''}`}
            testId="designer-canvas"
            onHover={setHover}
            onStrokeStart={(cell, mods) => {
              setCursor(cell);
              stroke.current = null;
              if (tool === 'tiles') tilesStart(cell, mods?.shift ?? false);
              else if (tool === 'brush' || tool === 'eraser') paint(cell);
            }}
            onStrokeMove={(cell) => {
              if (tool === 'tiles') tilesMove(cell);
              else if (tool === 'brush' || tool === 'eraser') paint(cell);
            }}
            onStrokeEnd={() => {
              stroke.current = null;
              if (tool === 'tiles') tilesEnd();
            }}
            onStrokeCancel={() => {
              stroke.current = null;
              setDrag(null);
            }}
            onLineDoubleClick={(col) => {
              // Brush strokes own double clicks; the panel's switches work with every tool.
              if (tool === 'brush' || tool === 'eraser') return;
              const quarter = quarterAt(col);
              if (quarter) flipMirror(quarter);
            }}
          />
          <p
            className={`editor__where${ghost?.conflict ? ' editor__where--refused' : ''}`}
            aria-live="polite"
          >
            {ghost?.conflict
              ? conflictText(ghost.conflict)
              : hover && pasting
                ? t('designer.pasteHere', { col: fromRight(design, hover.col) })
                : hover && holding
                  ? t('designer.layHere', { col: fromRight(design, hover.col) })
                  : nearLine
                    ? t(
                        (design.mirrors ?? []).includes(nearLine)
                          ? 'designer.mirrorOffHere'
                          : 'designer.mirrorHere',
                        { line: QUARTER_LABEL[nearLine] },
                      )
                    : cursor
                      ? t('designer.where', { col: fromRight(design, cursor.col), row: cursor.row })
                      : t(`designer.hint.${tool}`)}
          </p>
        </div>

        <aside className="editor__panel">
          <PiecesPanel
            design={design}
            library={library}
            fromFile={fromFile}
            own={own}
            holding={holding?.motif ?? null}
            selected={chosen}
            onPick={pick}
            onSelect={selectFromList}
            setDesign={setDesign}
            onNewPiece={() => setNewPiece(true)}
            pattern={pattern}
          />
          <section aria-labelledby={`${ids}-mirror`}>
            <h2 id={`${ids}-mirror`} className="panel__title">
              {t('designer.mirror')}
            </h2>
            <p className="hint">{t('designer.mirrorHint')}</p>
            <div className="mirror-switches">
              {QUARTERS.map((q) => (
                <label key={q} className="check">
                  <input
                    type="checkbox"
                    checked={(design.mirrors ?? []).includes(q)}
                    onChange={() => flipMirror(q)}
                  />
                  <span>{t('designer.mirrorAt', { line: QUARTER_LABEL[q] })}</span>
                </label>
              ))}
            </div>
          </section>
          <section aria-labelledby={`${ids}-brush`}>
            <h2 id={`${ids}-brush`} className="panel__title">
              {t('designer.brush')}
            </h2>
            <p className="hint">{t('designer.brushHint')}</p>
            <SymbolPalette
              registry={registry}
              active={tool === 'brush' ? symbol : null}
              onPick={(id) => {
                setSymbol(id);
                setTool('brush');
              }}
            />
          </section>
        </aside>
      </div>
      {newPiece && (
        <MotifDialog registry={registry} onSaved={pick} onClose={() => setNewPiece(false)} />
      )}
    </main>
  );
}

const QUARTERS = [1, 2, 3] as const;
const QUARTER_LABEL = { 1: '¼', 2: '½', 3: '¾' } as const;

/** Canvas rectangles of these tiles. */
function rectsOf(design: Design, ids: readonly string[]) {
  return design.placements.flatMap((p) => {
    if (!ids.includes(p.id)) return [];
    const motif = design.motifs.find((m) => m.id === p.motifId);
    const r = motif ? areaRect(design, p, motif) : null;
    return r ? [r] : [];
  });
}

/** Tiles being dragged together: where the drag started and how far it has moved (columns). */
interface Drag {
  readonly ids: readonly string[];
  readonly start: CellPoint;
  readonly shift: number;
}

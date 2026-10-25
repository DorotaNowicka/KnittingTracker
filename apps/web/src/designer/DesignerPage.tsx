import {
  applyDesign,
  blankDesign,
  designChart,
  firstHalf,
  halfCuts,
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
import { paths } from '../lib/router';
import { useDraft } from '../state/draft';
import { useGuides } from '../state/guides';
import { useMotifs } from '../state/motifs';
import { NumberField } from '../ui/fields';
import { GuidesToggle } from '../ui/GuidesToggle';
import { Icon } from '../ui/Icon';
import { AppHeader } from '../routes/AppHeader';
import {
  areaRect,
  brushCell,
  conflictOf,
  eraseCell,
  onBottom,
  fromRight,
  placeMotif,
  resizeDesign,
  tileAt,
  updatePlacement,
  type Conflict,
  type PlaceInput,
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
  return design ? (
    <Workbench
      project={project}
      pattern={pattern}
      design={design}
      registry={registry}
      setDesign={setDesign}
      back={back}
    />
  ) : (
    <GridSize
      pattern={pattern}
      back={back}
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
}: {
  pattern: Pattern;
  back: string;
  onCreate(width: number, height: number): void;
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
}: {
  project: Project;
  pattern: Pattern;
  design: Design;
  registry: SymbolRegistry;
  setDesign(next: Design): void;
  back: string;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith('en') ? 'en' : 'pl';
  const ids = useId();
  const own = useMotifs((s) => s.motifs);
  useEffect(() => {
    void useMotifs.getState().load();
  }, []);
  const [tool, setTool] = useState<Tool>('tiles');
  const [symbol, setSymbol] = useState('std:p');
  const [holding, setHolding] = useState<{ motif: Chart; times: number } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
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
  const selected = design.placements.find((p) => p.id === selectedId) ?? null;
  const selectedMotif = selected ? motifOf(selected.motifId) : undefined;
  const shown = drag?.preview ?? selected;
  // The tile in hand under the mouse, or the tile being dragged, where it would land.
  const ghost = useMemo(() => {
    let motif: Chart | undefined;
    let input: PlaceInput | null = null;
    let ignore: string | null = null;
    if (holding && hover && tool === 'tiles') {
      motif = holding.motif;
      input = onBottom(fromRight(design, hover.col), holding.times);
    } else if (drag?.preview) {
      const tile = design.placements.find((p) => p.id === drag.id);
      motif = design.motifs.find((m) => m.id === tile?.motifId);
      input = drag.preview;
      ignore = drag.id;
    }
    if (!motif || !input) return null;
    const conflict = conflictOf(design, motif, input, ignore);
    // The grid shows the pattern with the tile in place when it fits (on grids small enough to
    // redraw while the mouse moves); otherwise only its outline.
    const small = design.width * design.height <= 200_000;
    const preview =
      conflict || !small
        ? null
        : ignore
          ? updatePlacement(design, ignore, input)
          : placeMotif(design, motif, input).design;
    return {
      rect: areaRect(design, { ...input, id: '', motifId: '' }, motif),
      conflict,
      preview,
    };
  }, [holding, hover, tool, drag, design]);

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
    return guides ? { ...shown, guides: quarterGuides(shown) } : shown;
  }, [parsed, registry, design.width, design.halves, guides]);
  const selection =
    ghost?.rect ??
    (selected && shown && selectedMotif
      ? areaRect(design, { ...selected, ...shown }, selectedMotif)
      : null);
  const overlay = editorOverlay({ cursor: ghost ? null : cursor, selection });

  const conflictText = (conflict: Conflict) =>
    conflict.kind === 'off'
      ? t('designer.offGrid')
      : t('designer.overlap', { name: motifOf(conflict.with.motifId)?.name ?? '' });
  /** Show why a tile can't go somewhere (or clear the message). */
  const explain = (conflict: Conflict | null) =>
    setMessage(conflict ? conflictText(conflict) : null);

  const select = (id: string | null) => {
    setSelectedId(id);
    setHolding(null);
    setMessage(null);
    if (id) {
      setTool('tiles');
      showBar();
    }
  };
  const pick = (motif: Chart) => {
    setHolding({ motif, times: 1 });
    setSelectedId(null);
    setMessage(null);
    setTool('tiles');
    showBar();
  };

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
    setSelectedId(placed.id);
  };
  const tilesStart = (cell: CellPoint) => {
    if (holding) return lay(fromRight(design, cell.col));
    const tile = tileAt(design, cell.row, cell.col);
    setSelectedId(tile?.id ?? null);
    setMessage(null);
    if (tile) {
      const orig = { col: tile.col, row: tile.row, repeatX: tile.repeatX, repeatY: tile.repeatY };
      setDrag({ id: tile.id, start: cell, orig, preview: null });
    }
  };
  const tilesMove = (cell: CellPoint) => {
    if (!drag) return;
    // Tiles stand on the bottom row: a drag moves them sideways only.
    const col = drag.orig.col - (cell.col - drag.start.col);
    if (col === drag.orig.col) return setDrag({ ...drag, preview: null });
    setDrag({ ...drag, preview: onBottom(col, drag.orig.repeatX) });
  };
  const tilesEnd = () => {
    const moved = drag?.preview;
    const motif = drag
      ? motifOf(design.placements.find((p) => p.id === drag.id)?.motifId ?? '')
      : undefined;
    if (drag && moved && motif) {
      const conflict = conflictOf(design, motif, moved, drag.id);
      explain(conflict);
      if (!conflict) setDesign(updatePlacement(design, drag.id, moved));
    }
    setDrag(null);
  };
  const paint = (cell: CellPoint) => {
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

  return (
    <main className="editor designer" id="main">
      <header className="editor__bar">
        <Link to={back} className="icon-btn" aria-label={t('designer.back')}>
          <Icon name="back" />
        </Link>
        <h1 className="designer__title">{t('designer.title', { name: pattern.name })}</h1>
        <SaveState />
        <Link className="btn btn--primary btn--small" to={paths.tracker(project.id, pattern.id)}>
          {t('designer.knit')}
        </Link>
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
          selected={selected}
          motifOf={motifOf}
          message={message}
          onCancel={() => {
            setHolding(null);
            setMessage(null);
          }}
          onHoldTimes={(times) => holding && setHolding({ ...holding, times })}
          onDeselect={() => select(null)}
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
          {source && (
            <EditorCanvas
              source={source}
              overlay={overlay}
              tool={canvasTool}
              label={t('designer.canvasLabel', { name: pattern.name })}
              help={t('designer.help')}
              fitKey={`${design.width}x${design.height}${design.halves ? '/2' : ''}`}
              testId="designer-canvas"
              onHover={setHover}
              onStrokeStart={(cell) => {
                setCursor(cell);
                stroke.current = null;
                if (tool === 'tiles') tilesStart(cell);
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
            />
          )}
          <p
            className={`editor__where${ghost?.conflict ? ' editor__where--refused' : ''}`}
            aria-live="polite"
          >
            {ghost?.conflict
              ? conflictText(ghost.conflict)
              : hover && holding
                ? t('designer.layHere', { col: fromRight(design, hover.col) })
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
            selected={selectedId}
            onPick={pick}
            onSelect={select}
            setDesign={setDesign}
            onNewPiece={() => setNewPiece(true)}
            pattern={pattern}
          />
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

/** A tile being dragged: where the drag started and where the tile would go. */
interface Drag {
  readonly id: string;
  readonly start: CellPoint;
  readonly orig: PlaceInput;
  readonly preview: PlaceInput | null;
}

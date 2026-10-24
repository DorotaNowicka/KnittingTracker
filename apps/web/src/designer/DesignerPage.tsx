import {
  applyDesign,
  blankDesign,
  MOTIF_LIBRARY,
  parseChart,
  patternRegistry,
  type Chart,
  type Design,
  type Pattern,
  type Project,
  type SymbolRegistry,
} from '@kt/core';
import { chartSource, editorOverlay } from '@kt/grid-renderer';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PatternGate, SaveState } from '../editor/DraftGate';
import { EditorCanvas, type CanvasTool, type CellPoint } from '../editor/EditorCanvas';
import { Link } from '../lib/Link';
import { paths } from '../lib/router';
import { useDraft } from '../state/draft';
import { useMotifs } from '../state/motifs';
import { NumberField } from '../ui/fields';
import { Icon } from '../ui/Icon';
import { AppHeader } from '../routes/AppHeader';
import { areaRect, brushCell, eraseCell, fromRight, resizeDesign } from './designOps';
import { MotifDialog } from './MotifDialog';
import { PiecesPanel, type PlaceForm } from './PiecesPanel';
import { SymbolPalette } from './SymbolPalette';

/**
 * The pattern creator: a grid of the size the knitter types, pieces of pattern from the library
 * (or drawn by the knitter) placed on it with their repeats, and a brush for single stitches.
 */
export function DesignerPage({ projectId, patternId }: { projectId: string; patternId: string }) {
  return (
    <PatternGate projectId={projectId} patternId={patternId}>
      {(pattern, project) => <Designer key={pattern.id} project={project} pattern={pattern} />}
    </PatternGate>
  );
}

type Tool = 'place' | 'brush' | 'eraser' | 'pan';

function Designer({ project, pattern }: { project: Project; pattern: Pattern }) {
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
    <GridSize pattern={pattern} back={back} onCreate={(w, h) => setDesign(blankDesign(w, h))} />
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
  const [tool, setTool] = useState<Tool>('place');
  const [symbol, setSymbol] = useState('std:p');
  const [form, setForm] = useState<PlaceForm | null>(null);
  const [cursor, setCursor] = useState<CellPoint | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const stroke = useRef<Design | null>(null);

  const chart = pattern.charts[0];
  const parsed = useMemo(() => (chart ? parseChart(chart, registry) : null), [chart, registry]);
  const source = useMemo(() => (parsed ? chartSource(parsed, registry) : null), [parsed, registry]);
  const library: readonly Chart[] = useMemo(
    () => [...MOTIF_LIBRARY.map((m) => ({ ...m.chart, name: m.label[lang].slice(0, 40) })), ...own],
    [lang, own],
  );
  const motifOf = (id: string) =>
    design.motifs.find((m) => m.id === id) ?? library.find((m) => m.id === id);
  const formMotif = form ? motifOf(form.motifId) : undefined;
  const preview =
    form && formMotif
      ? areaRect(design, { ...form.input, id: 'preview', motifId: form.motifId }, formMotif)
      : null;
  const overlay = editorOverlay({ cursor, selection: preview });

  const at = (cell: CellPoint) => {
    setCursor(cell);
    if (tool === 'place' && form) {
      setForm({
        ...form,
        input: { ...form.input, col: fromRight(design, cell.col), row: cell.row },
      });
    }
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
  const canvasTool: CanvasTool = tool === 'pan' ? 'pan' : tool === 'place' ? 'select' : 'paint';
  const tools: { id: Tool; icon: 'plus' | 'brush' | 'eraser' | 'hand'; label: string }[] = [
    { id: 'place', icon: 'plus', label: t('designer.toolPlace') },
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
      </div>

      <div className="editor__body">
        <div className="editor__canvas">
          {source && (
            <EditorCanvas
              source={source}
              overlay={overlay}
              tool={canvasTool}
              label={t('designer.canvasLabel', { name: pattern.name })}
              help={t('designer.help')}
              fitKey={`${design.width}x${design.height}`}
              testId="designer-canvas"
              onStrokeStart={(cell) => {
                stroke.current = null;
                at(cell);
                if (tool === 'brush' || tool === 'eraser') paint(cell);
              }}
              onStrokeMove={(cell) => {
                if (tool === 'brush' || tool === 'eraser') paint(cell);
              }}
              onStrokeEnd={() => {
                stroke.current = null;
              }}
              onStrokeCancel={() => {
                stroke.current = null;
              }}
            />
          )}
          <p className="editor__where" aria-live="polite">
            {cursor
              ? t('designer.where', { col: fromRight(design, cursor.col), row: cursor.row })
              : t(`designer.hint.${tool}`)}
          </p>
        </div>

        <aside className="editor__panel">
          <PiecesPanel
            design={design}
            library={library}
            own={own}
            form={form}
            setForm={(f) => {
              setForm(f);
              if (f) setTool('place');
            }}
            setDesign={setDesign}
            onNewPiece={() => dialog.current?.showModal()}
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
      <MotifDialog
        dialogRef={dialog}
        registry={registry}
        onSaved={(motif) =>
          setForm({
            motifId: motif.id,
            editing: null,
            input: { col: 1, row: 1, repeatX: 'fill', repeatY: 'fill' },
          })
        }
      />
    </main>
  );
}

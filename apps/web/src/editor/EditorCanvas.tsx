import { GridRenderer, type GridSource, type Overlay } from '@kt/grid-renderer';
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { useTranslation } from 'react-i18next';

export type CanvasTool = 'paint' | 'select' | 'pan' | 'view';

export interface CellPoint {
  readonly row: number;
  readonly col: number;
}

interface Props {
  readonly source: GridSource;
  readonly overlay: Overlay;
  readonly tool: CanvasTool;
  readonly label: string;
  readonly help: string;
  /** Re-fit the view when this changes (e.g. another chart or a resize). */
  readonly fitKey: string;
  /** A stroke (paint or selection drag) starts, moves over cells, ends or is cancelled. */
  onStrokeStart?(cell: CellPoint): void;
  onStrokeMove?(cell: CellPoint): void;
  onStrokeEnd?(): void;
  onStrokeCancel?(): void;
  onKeyDown?(e: KeyboardEvent<HTMLDivElement>): void;
  /** Called with a cell to keep in view (keyboard cursor). */
  readonly reveal?: CellPoint | null;
  readonly testId?: string;
}

const FONT = "'Atkinson Hyperlegible Next Variable', system-ui, sans-serif";
const TAP_SLOP = 6;

/**
 * Canvas for the chart editor and the layout preview (ADR-6 renderer). With the paint and select
 * tools one finger (or the mouse) draws a stroke over cells and two fingers pan and pinch; with
 * the pan tool one finger pans. Wheel pans, ctrl/⌘ + wheel zooms.
 */
export function EditorCanvas(props: Props) {
  const { source, overlay, tool, label, help, fitKey, reveal, testId } = props;
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<GridRenderer | null>(null);
  const [unsupported] = useState(() => {
    try {
      return !document.createElement('canvas').getContext('2d');
    } catch {
      return true;
    }
  });
  const cb = useRef(props);
  useEffect(() => {
    cb.current = props;
  });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  /**
   * Keep the view fitted while the layout settles (fonts, panels) until the user pans or zooms
   * themselves; after that a resize keeps their view.
   */
  const autoFit = useRef(true);
  const g = useRef<{
    mode: 'stroke' | 'pan' | 'pinch' | 'pending';
    startX: number;
    startY: number;
    last: CellPoint | null;
    pinchDist: number;
    pinchCell: number;
  } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || unsupported) return;
    const r = new GridRenderer(canvas);
    rendererRef.current = r;
    r.setFont(FONT);
    if (import.meta.env.VITE_APP_ENV !== 'prod') {
      (window as unknown as { __ktEditor?: unknown }).__ktEditor = {
        renderer: r,
        pointOf: (row: number, col: number) => {
          const p = r.cellCenter(row, col);
          const rect = canvas.getBoundingClientRect();
          return p ? { x: rect.left + p.x, y: rect.top + p.y } : null;
        },
      };
    }
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return;
      r.resize(entry.contentRect.width, entry.contentRect.height, window.devicePixelRatio);
      if (autoFit.current) fitView(r, cb.current.source);
      r.draw();
    });
    ro.observe(canvas);
    const refresh = () => r.refreshPalette();
    const media = matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', refresh);
    window.addEventListener('kt:themechange', refresh);
    void document.fonts?.ready.then(() => r.invalidate());
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      autoFit.current = false;
      const rect = canvas.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) {
        r.zoomTo(
          r.camera.cell * Math.exp(-e.deltaY * 0.01),
          e.clientX - rect.left,
          e.clientY - rect.top,
        );
      } else {
        const k = e.deltaMode === 1 ? 16 : 1;
        r.panBy(-(e.shiftKey ? e.deltaY : e.deltaX) * k, -(e.shiftKey ? 0 : e.deltaY) * k);
      }
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      ro.disconnect();
      media.removeEventListener('change', refresh);
      window.removeEventListener('kt:themechange', refresh);
      canvas.removeEventListener('wheel', onWheel);
      r.destroy();
      rendererRef.current = null;
    };
  }, [unsupported]);

  const dims = useRef('');
  useEffect(() => {
    const r = rendererRef.current;
    if (!r) return;
    r.setSource(source);
    // A new size (rows/columns added or removed) re-fits, unless the user has taken over the view.
    const next = `${source.cols}x${source.rows}`;
    if (dims.current && dims.current !== next && autoFit.current) fitView(r, source);
    dims.current = next;
  }, [source]);

  useEffect(() => {
    rendererRef.current?.setOverlay(overlay);
  }, [overlay]);

  // Fit the whole chart on open (and when asked to), at a comfortable size for painting.
  useEffect(() => {
    const r = rendererRef.current;
    autoFit.current = true;
    if (r) fitView(r, source);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on fitKey changes
  }, [fitKey]);

  useEffect(() => {
    if (reveal) rendererRef.current?.reveal(reveal.row, reveal.col, 'nearest');
  }, [reveal]);

  const cellAt = (e: PointerEvent<HTMLDivElement>): CellPoint | null => {
    const rect = e.currentTarget.getBoundingClientRect();
    return rendererRef.current?.hitTest(e.clientX - rect.left, e.clientY - rect.top) ?? null;
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.focus({ preventScroll: true });
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) {
      const drawing = tool === 'paint' || tool === 'select';
      // Touch strokes wait for the slop so a second finger can still turn them into a pinch.
      const mode = !drawing ? 'pan' : e.pointerType === 'touch' ? 'pending' : 'stroke';
      const cell = cellAt(e);
      g.current = {
        mode,
        startX: e.clientX,
        startY: e.clientY,
        last: null,
        pinchDist: 0,
        pinchCell: 0,
      };
      if (mode === 'stroke' && cell) {
        g.current.last = cell;
        cb.current.onStrokeStart?.(cell);
      }
    } else if (pointers.current.size === 2 && g.current) {
      if (g.current.mode === 'stroke') cb.current.onStrokeCancel?.();
      const [a, b] = [...pointers.current.values()];
      if (a && b) {
        g.current.mode = 'pinch';
        g.current.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
        g.current.pinchCell = rendererRef.current?.camera.cell ?? 20;
      }
    }
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const prev = pointers.current.get(e.pointerId);
    const s = g.current;
    const r = rendererRef.current;
    if (!prev || !s || !r) return;
    const next = { x: e.clientX, y: e.clientY };
    pointers.current.set(e.pointerId, next);
    if (s.mode === 'pinch' || s.mode === 'pan') autoFit.current = false;
    if (s.mode === 'pinch') {
      const [a, b] = [...pointers.current.values()];
      if (!a || !b || s.pinchDist === 0) return;
      const rect = e.currentTarget.getBoundingClientRect();
      r.zoomTo(
        s.pinchCell * (Math.hypot(a.x - b.x, a.y - b.y) / s.pinchDist),
        (a.x + b.x) / 2 - rect.left,
        (a.y + b.y) / 2 - rect.top,
      );
      r.panBy(next.x - prev.x, next.y - prev.y);
      return;
    }
    if (s.mode === 'pan') {
      r.panBy(next.x - prev.x, next.y - prev.y);
      return;
    }
    if (s.mode === 'pending') {
      if (Math.hypot(next.x - s.startX, next.y - s.startY) < TAP_SLOP) return;
      s.mode = 'stroke';
      const rect = e.currentTarget.getBoundingClientRect();
      const start = r.hitTest(s.startX - rect.left, s.startY - rect.top);
      if (start) {
        s.last = start;
        cb.current.onStrokeStart?.(start);
      }
    }
    const cell = cellAt(e);
    if (!cell) return;
    if (!s.last) {
      s.last = cell;
      cb.current.onStrokeStart?.(cell);
    } else if (cell.row !== s.last.row || cell.col !== s.last.col) {
      s.last = cell;
      cb.current.onStrokeMove?.(cell);
    }
  };

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const s = g.current;
    pointers.current.delete(e.pointerId);
    if (!s) return;
    if (pointers.current.size > 0) return;
    if (s.mode === 'pending' && e.type === 'pointerup') {
      // A tap: a one-cell stroke.
      const cell = cellAt(e);
      if (cell) {
        cb.current.onStrokeStart?.(cell);
        cb.current.onStrokeEnd?.();
      }
    } else if (s.mode === 'stroke') {
      if (e.type === 'pointerup') cb.current.onStrokeEnd?.();
      else cb.current.onStrokeCancel?.();
    }
    g.current = null;
  };

  if (unsupported) {
    return (
      <p className="grid-unsupported" role="alert">
        {t('grid.unsupported')}
      </p>
    );
  }

  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      className={`grid-host editor-canvas editor-canvas--${tool}`}
      role="application"
      aria-roledescription={t('editor.canvasRole')}
      aria-label={label}
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={(e) => cb.current.onKeyDown?.(e)}
      data-testid={testId}
    >
      <canvas ref={canvasRef} className="grid-canvas" aria-hidden="true" />
      <p className="visually-hidden">{help}</p>
    </div>
  );
}

/** Zoom so the whole grid fits (cells between 12 and 44 px) and centre it. False if not laid out yet. */
function fitView(r: GridRenderer, source: GridSource): boolean {
  const m = r.geometry?.m;
  const cam = r.camera;
  if (!m || cam.width === 0 || cam.height === 0) return false;
  const byW = (cam.width - 2 * m.gutter - 8) / source.cols;
  const byH = (cam.height - m.header - m.footer - 8) / source.rows;
  r.zoomTo(Math.max(12, Math.min(44, byW, byH)));
  r.reveal(Math.ceil(source.rows / 2), Math.ceil(source.cols / 2), 'center');
  return true;
}

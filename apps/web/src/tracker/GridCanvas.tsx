import { indexOfCol, type ResolvedPattern, type RowModel, type TapMode } from '@kt/core';
import { GridRenderer, progressOverlay, patternSource, type GridSource } from '@kt/grid-renderer';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { useTranslation } from 'react-i18next';

export interface ViewRequest {
  readonly kind: 'reveal' | 'fit';
  /** For `fit`: display columns to fit; omitted = whole width. */
  readonly cols?: { readonly first: number; readonly last: number };
  readonly nonce: number;
}

interface Props {
  readonly grid: ResolvedPattern;
  readonly model: RowModel;
  readonly done: number;
  readonly mode: TapMode;
  readonly rows: number;
  readonly cell: number;
  readonly veil: boolean;
  readonly request: ViewRequest | null;
  onCellChange(cell: number): void;
  onTap(index: number): void;
}

const TAP_SLOP = 8;
const FONT = "'Atkinson Hyperlegible Next Variable', system-ui, sans-serif";

/**
 * The chart grid: a focusable canvas driven by @kt/grid-renderer (ADR-6). One finger drags to pan,
 * a tap marks, two fingers pinch to zoom; wheel pans, ctrl+wheel zooms; keyboard moves a cursor.
 */
export function GridCanvas(props: Props) {
  const { grid, model, done, mode, rows, cell, veil, request, onCellChange, onTap } = props;
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<GridRenderer | null>(null);
  const [cursor, setCursor] = useState<{ row: number; col: number } | null>(null);
  // Feature check once, before the first render (no state updates from effects).
  const [unsupported] = useState(() => {
    try {
      return !document.createElement('canvas').getContext('2d');
    } catch {
      return true;
    }
  });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{
    startX: number;
    startY: number;
    moved: boolean;
    pinchDist: number;
    pinchCell: number;
  } | null>(null);
  const callbacks = useRef({ onCellChange, onTap });
  useEffect(() => {
    callbacks.current = { onCellChange, onTap };
  });

  const source: GridSource = useMemo(() => patternSource(grid, rows), [grid, rows]);
  const overlay = useMemo(
    () => progressOverlay(model, done, { cursor, veilAbove: veil }),
    [model, done, cursor, veil],
  );

  // Create the renderer once.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const r = new GridRenderer(canvas);
    rendererRef.current = r;
    r.setFont(FONT);
    // Test hook outside production builds: e2e tests tap exact cells and read frame timings.
    if (import.meta.env.VITE_APP_ENV !== 'prod') {
      (window as unknown as { __ktGrid?: unknown }).__ktGrid = {
        renderer: r,
        pointOf: (row: number, col: number) => {
          const p = r.cellCenter(row, col);
          const rect = canvas.getBoundingClientRect();
          return p ? { x: rect.left + p.x, y: rect.top + p.y } : null;
        },
      };
    }
    r.onCameraChange = (cam) => callbacks.current.onCellChange(Math.round(cam.cell));
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      r.resize(width, height, window.devicePixelRatio);
    });
    ro.observe(canvas);
    const refresh = () => r.refreshPalette();
    const media = matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', refresh);
    window.addEventListener('kt:themechange', refresh);
    void document.fonts?.ready.then(() => r.invalidate());
    // Wheel must be non-passive to prevent page scroll/zoom.
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) {
        const factor = Math.exp(-e.deltaY * 0.01);
        r.zoomTo(r.camera.cell * factor, e.clientX - rect.left, e.clientY - rect.top);
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
  }, []);

  // Data → renderer.
  const firstSource = useRef(true);
  useEffect(() => {
    const r = rendererRef.current;
    if (!r) return;
    r.setSource(source);
    if (firstSource.current) {
      firstSource.current = false;
      if (cell === 0) {
        // First open: fit the whole width if the cells stay comfortable, else a readable 18 px.
        const m = r.geometry?.m;
        const fit = m ? (r.camera.width - 2 * m.gutter - 8) / grid.stitchCount : 18;
        r.zoomTo(Math.max(16, Math.min(30, fit)));
      } else if (Math.abs(r.camera.cell - cell) > 0.5) r.zoomTo(cell);
      // Start where the knitter left off.
      const next =
        overlay.marker ??
        (overlay.currentRow ? { row: overlay.currentRow, col: grid.stitchCount } : null);
      requestAnimationFrame(() => {
        if (next) r.reveal(next.row, next.col, 'center');
        else r.reveal(1, grid.stitchCount, 'center');
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the grid itself changes
  }, [source]);

  useEffect(() => {
    rendererRef.current?.setOverlay(overlay);
  }, [overlay]);

  // Follow the work: keep the last done stitch in view after each change.
  const lastDone = useRef(done);
  useEffect(() => {
    if (lastDone.current === done) return;
    lastDone.current = done;
    const r = rendererRef.current;
    const target =
      overlay.marker ??
      (overlay.currentRow ? { row: overlay.currentRow, col: grid.stitchCount } : null);
    if (r && target) r.reveal(target.row, target.col, 'nearest');
  }, [done, overlay, grid.stitchCount]);

  // Zoom slider → renderer.
  useEffect(() => {
    const r = rendererRef.current;
    if (r && cell > 0 && Math.abs(r.camera.cell - cell) > 0.5) r.zoomTo(cell);
  }, [cell]);

  // Explicit view requests (centre on work, fit width / section).
  useEffect(() => {
    const r = rendererRef.current;
    if (!r || !request) return;
    const row = overlay.currentRow ?? overlay.marker?.row ?? 1;
    if (request.kind === 'fit') {
      const cols = request.cols ?? { first: 1, last: grid.stitchCount };
      r.fitColumns(cols.first, cols.last, row);
    } else {
      const target = overlay.marker ?? { row, col: grid.stitchCount };
      r.reveal(target.row, target.col, 'center');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per request
  }, [request?.nonce]);

  const tapAt = (x: number, y: number) => {
    const hit = rendererRef.current?.hitTest(x, y);
    if (!hit) return;
    const index = indexOfCol(model, hit.row, hit.col);
    if (index !== null) callbacks.current.onTap(index);
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) {
      gesture.current = {
        startX: e.clientX,
        startY: e.clientY,
        moved: false,
        pinchDist: 0,
        pinchCell: cell,
      };
    } else if (pointers.current.size === 2 && gesture.current) {
      const [a, b] = [...pointers.current.values()];
      if (a && b) {
        gesture.current.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
        gesture.current.pinchCell = rendererRef.current?.camera.cell ?? cell;
        gesture.current.moved = true;
      }
    }
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const prev = pointers.current.get(e.pointerId);
    const g = gesture.current;
    const r = rendererRef.current;
    if (!prev || !g || !r) return;
    const next = { x: e.clientX, y: e.clientY };
    pointers.current.set(e.pointerId, next);
    if (pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      if (!a || !b || g.pinchDist === 0) return;
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const rect = e.currentTarget.getBoundingClientRect();
      r.zoomTo(
        g.pinchCell * (dist / g.pinchDist),
        (a.x + b.x) / 2 - rect.left,
        (a.y + b.y) / 2 - rect.top,
      );
      return;
    }
    if (!g.moved && Math.hypot(next.x - g.startX, next.y - g.startY) > TAP_SLOP) g.moved = true;
    if (g.moved) r.panBy(next.x - prev.x, next.y - prev.y);
  };

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) {
      if (g && !g.moved && e.type === 'pointerup') {
        const rect = e.currentTarget.getBoundingClientRect();
        setCursor(null);
        tapAt(e.clientX - rect.left, e.clientY - rect.top);
      }
      gesture.current = null;
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const r = rendererRef.current;
    if (!r) return;
    const move = (dr: number, dc: number) => {
      e.preventDefault();
      e.stopPropagation();
      const start = cursor ??
        overlay.marker ?? { row: overlay.currentRow ?? 1, col: grid.stitchCount };
      const next = {
        row: Math.min(rows, Math.max(1, start.row + dr)),
        col: Math.min(grid.stitchCount, Math.max(1, start.col + dc)),
      };
      setCursor(next);
      r.reveal(next.row, next.col, 'nearest');
    };
    switch (e.key) {
      case 'ArrowLeft':
        return move(0, e.shiftKey ? -10 : -1);
      case 'ArrowRight':
        return move(0, e.shiftKey ? 10 : 1);
      case 'ArrowUp':
        return move(1, 0);
      case 'ArrowDown':
        return move(-1, 0);
      case 'Enter':
      case ' ':
        if (cursor) {
          e.preventDefault();
          e.stopPropagation();
          const index = indexOfCol(model, cursor.row, cursor.col);
          if (index !== null) onTap(index);
        }
        return;
      case 'Escape':
        if (cursor) {
          e.stopPropagation();
          setCursor(null);
        }
        return;
    }
  };

  if (unsupported) {
    return (
      <p className="grid-unsupported" role="alert">
        {t('grid.unsupported')}
      </p>
    );
  }

  // role="application" is the right role for a custom 2-D widget with its own keyboard model (WAI-ARIA
  // APG); jsx-a11y classifies it as non-interactive, hence the targeted disables.
  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      className={`grid-host${mode === 'erase' ? ' grid-host--erase' : ''}`}
      role="application"
      aria-roledescription={t('grid.roleDescription')}
      aria-label={t('grid.label')}
      aria-describedby="grid-help"
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
      data-testid="grid"
    >
      <canvas ref={canvasRef} className="grid-canvas" aria-hidden="true" />
    </div>
  );
}

import { patternRegistry, parseChart, type Chart, type Pattern } from '@kt/core';
import {
  buildScene,
  chartSource,
  clampCellPx,
  editorOverlay,
  GridGeometry,
  paint,
  readPalette,
} from '@kt/grid-renderer';
import { useEffect, useRef } from 'react';

const FONT = "'Atkinson Hyperlegible Next Variable', system-ui, sans-serif";

/** A small static picture of a chart, drawn with the same renderer as the grid. */
export function ChartThumb({
  pattern,
  chart,
  maxWidth = 160,
  maxHeight = 96,
}: {
  pattern: Pattern;
  chart: Chart;
  maxWidth?: number;
  maxHeight?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const cell = clampCellPx(Math.min(16, maxWidth / chart.width, maxHeight / chart.height));
  const w = Math.ceil(chart.width * cell);
  const h = Math.ceil(chart.height * cell);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d', { alpha: false });
    if (!canvas || !ctx) return;
    let registry;
    try {
      registry = patternRegistry(pattern);
    } catch {
      return;
    }
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const source = chartSource(parseChart(chart, registry), registry);
    const geo = new GridGeometry(source, cell);
    const cam = { cell, scrollX: geo.colX(1), scrollY: geo.gridTop, width: w, height: h };
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    paint(
      ctx,
      buildScene(source, geo, cam, editorOverlay({}), 'static'),
      readPalette(canvas),
      dpr,
      FONT,
    );
  }, [pattern, chart, cell, w, h]);

  return (
    <canvas ref={ref} className="chart-thumb" style={{ width: w, height: h }} aria-hidden="true" />
  );
}

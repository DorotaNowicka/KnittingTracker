import type { GlyphPrimitive } from '@kt/core';
import type { ColorRole, DrawCommand } from './scene';

export type Palette = Readonly<Record<ColorRole, string>>;

/** CSS custom properties that hold the theme colours (see docs/design.md). */
export const PALETTE_VARS: Readonly<Record<ColorRole, string>> = {
  sheet: '--sheet',
  paper: '--paper',
  ink: '--ink',
  inkMuted: '--ink-muted',
  rule: '--rule',
  ruleStrong: '--rule-strong',
  zone: '--zone',
  indigo: '--indigo',
  onIndigo: '--on-indigo',
  done: '--done',
  doneHatch: '--done-hatch',
  marker: '--marker',
  noStitch: '--no-stitch',
};

/** Read the palette from computed CSS custom properties of an element. */
export function readPalette(el: Element): Palette {
  const style = getComputedStyle(el);
  const entries = Object.entries(PALETTE_VARS).map(([role, v]) => [
    role,
    style.getPropertyValue(v).trim() || '#808080',
  ]);
  return Object.fromEntries(entries) as Record<ColorRole, string>;
}

/**
 * Thin rules are drawn with a whole number of device pixels (about 0.75 CSS px) and snapped to the
 * device-pixel grid, so they stay crisp and equally strong on every screen density.
 */
const hairline = (dpr: number) => Math.max(1, Math.round(dpr * 0.75));
const snap = (v: number, dpr: number) => {
  const w = hairline(dpr);
  return (Math.round(v * dpr) + (w % 2 === 1 ? 0.5 : 0)) / dpr;
};

function tracePrimitive(
  ctx: CanvasRenderingContext2D,
  p: GlyphPrimitive,
  x: number,
  y: number,
  c: number,
) {
  const X = (px: number) => x + px * c;
  const Y = (py: number) => y + py * c;
  switch (p.kind) {
    case 'line':
      ctx.moveTo(X(p.from[0]), Y(p.from[1]));
      ctx.lineTo(X(p.to[0]), Y(p.to[1]));
      break;
    case 'polyline':
    case 'polygon': {
      p.points.forEach(([px, py], i) =>
        i === 0 ? ctx.moveTo(X(px), Y(py)) : ctx.lineTo(X(px), Y(py)),
      );
      if (p.kind === 'polygon') ctx.closePath();
      break;
    }
    case 'circle':
      ctx.moveTo(X(p.center[0]) + p.radius * c, Y(p.center[1]));
      ctx.arc(X(p.center[0]), Y(p.center[1]), p.radius * c, 0, Math.PI * 2);
      break;
    case 'text':
      break;
  }
}

/** Execute draw commands on a 2D context whose transform already maps CSS px to device px. */
export function paint(
  ctx: CanvasRenderingContext2D,
  commands: readonly DrawCommand[],
  palette: Palette,
  dpr: number,
  font: string,
): void {
  // Setting ctx.font is costly (it is parsed every time), so text state is only set on change.
  let currentFont = '';
  let currentAlign: CanvasTextAlign | '' = '';
  const setText = (f: string, align: CanvasTextAlign) => {
    if (f !== currentFont) {
      ctx.font = f;
      currentFont = f;
    }
    if (align !== currentAlign) {
      ctx.textAlign = align;
      currentAlign = align;
    }
  };
  ctx.textBaseline = 'middle';
  for (const cmd of commands) {
    switch (cmd.t) {
      case 'rect':
        ctx.globalAlpha = cmd.alpha ?? 1;
        ctx.fillStyle = palette[cmd.fill];
        ctx.fillRect(cmd.x, cmd.y, cmd.w, cmd.h);
        ctx.globalAlpha = 1;
        break;
      case 'lines': {
        ctx.beginPath();
        const s = cmd.segments;
        const crisp = cmd.width <= 1.01;
        for (let i = 0; i + 3 < s.length; i += 4) {
          const [x1, y1, x2, y2] = [s[i] ?? 0, s[i + 1] ?? 0, s[i + 2] ?? 0, s[i + 3] ?? 0];
          ctx.moveTo(
            crisp && x1 === x2 ? snap(x1, dpr) : x1,
            crisp && y1 === y2 ? snap(y1, dpr) : y1,
          );
          ctx.lineTo(
            crisp && x1 === x2 ? snap(x2, dpr) : x2,
            crisp && y1 === y2 ? snap(y2, dpr) : y2,
          );
        }
        ctx.strokeStyle = palette[cmd.stroke];
        ctx.lineWidth = crisp ? hairline(dpr) / dpr : cmd.width;
        ctx.setLineDash(cmd.dash ? [...cmd.dash] : []);
        ctx.lineCap = 'butt';
        ctx.stroke();
        ctx.setLineDash([]);
        break;
      }
      case 'hatch': {
        ctx.save();
        ctx.beginPath();
        ctx.rect(cmd.x, cmd.y, cmd.w, cmd.h);
        ctx.clip();
        ctx.beginPath();
        // 45° lines anchored to the chart (not the screen) so they never jump while panning.
        const start =
          Math.floor((cmd.x - cmd.h - cmd.y + cmd.phase) / cmd.spacing) * cmd.spacing - cmd.phase;
        for (let k = start; k < cmd.x + cmd.w - cmd.y; k += cmd.spacing) {
          ctx.moveTo(k + cmd.y, cmd.y);
          ctx.lineTo(k + cmd.y + cmd.h, cmd.y + cmd.h);
        }
        ctx.strokeStyle = palette[cmd.stroke];
        ctx.lineWidth = cmd.width;
        ctx.globalAlpha = 0.55;
        ctx.stroke();
        ctx.restore();
        break;
      }
      case 'glyphs': {
        const strokePath = new Path2D();
        const ctxProxy = strokePath as unknown as CanvasRenderingContext2D;
        ctx.fillStyle = palette.ink;
        for (const item of cmd.items) {
          for (const p of item.glyph.primitives) {
            if (p.kind === 'polygon' || (p.kind === 'circle' && p.fill === 'ink')) {
              ctx.beginPath();
              tracePrimitive(ctx, p, item.x, item.y, cmd.cell);
              ctx.fillStyle =
                p.kind === 'polygon' && p.fill === 'muted' ? palette.noStitch : palette.ink;
              ctx.fill();
            } else if (p.kind === 'text') {
              ctx.fillStyle = palette.ink;
              setText(`600 ${Math.round(p.size * cmd.cell)}px ${font}`, 'center');
              ctx.fillText(p.text, item.x + p.at[0] * cmd.cell, item.y + p.at[1] * cmd.cell);
            } else {
              tracePrimitive(ctxProxy, p, item.x, item.y, cmd.cell);
            }
          }
        }
        ctx.strokeStyle = palette[cmd.stroke];
        ctx.lineWidth = cmd.lineWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke(strokePath);
        break;
      }
      case 'text':
        ctx.fillStyle = palette[cmd.color];
        setText(`${cmd.weight} ${Math.round(cmd.size * 2) / 2}px ${font}`, cmd.align);
        ctx.fillText(cmd.text, cmd.x, cmd.y);
        break;
      case 'marker': {
        // Stitch marker: a saffron ring with an ink outline (contrast in the light theme) and a tab.
        const inset = Math.max(1.5, cmd.size * 0.08);
        const r = Math.max(2, cmd.size * 0.22);
        const x = cmd.x + inset;
        const y = cmd.y + inset;
        const s = cmd.size - 2 * inset;
        ctx.beginPath();
        ctx.roundRect(x, y, s, s, r);
        const band = Math.max(2, cmd.size * 0.14);
        ctx.lineWidth = band + 2;
        ctx.strokeStyle = palette.ink;
        ctx.stroke();
        ctx.lineWidth = band;
        ctx.strokeStyle = palette.marker;
        ctx.stroke();
        const tab = Math.max(3, cmd.size * 0.2);
        ctx.beginPath();
        ctx.arc(cmd.x + cmd.size - inset, cmd.y + inset, tab / 2 + 1, 0, Math.PI * 2);
        ctx.fillStyle = palette.ink;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cmd.x + cmd.size - inset, cmd.y + inset, tab / 2, 0, Math.PI * 2);
        ctx.fillStyle = palette.marker;
        ctx.fill();
        break;
      }
      case 'arrow': {
        const d = cmd.dir === 'left' ? -1 : 1;
        const h = cmd.size;
        ctx.beginPath();
        ctx.moveTo(cmd.x + d * h * 0.6, cmd.y);
        ctx.lineTo(cmd.x - d * h * 0.4, cmd.y - h * 0.5);
        ctx.lineTo(cmd.x - d * h * 0.4, cmd.y + h * 0.5);
        ctx.closePath();
        ctx.fillStyle = palette[cmd.color];
        ctx.fill();
        break;
      }
      case 'clip':
        ctx.save();
        ctx.beginPath();
        ctx.rect(cmd.x, cmd.y, cmd.w, cmd.h);
        ctx.clip();
        break;
      case 'unclip':
        ctx.restore();
        // restore() also resets text state to what it was at save().
        currentFont = '';
        currentAlign = '';
        ctx.textBaseline = 'middle';
        break;
    }
  }
}

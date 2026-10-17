import type { Glyph } from '@kt/core';

/**
 * A chart symbol drawn as SVG from the same glyph primitives the canvas uses (DR-11), so the legend
 * can never disagree with the grid.
 */
export function SymbolGlyph({
  glyph,
  width,
  cell = 24,
}: {
  glyph: Glyph;
  width: number;
  cell?: number;
}) {
  const w = width * cell;
  const s = (v: number) => v * cell;
  return (
    <svg
      className="glyph"
      width={w + 2}
      height={cell + 2}
      viewBox={`-1 -1 ${w + 2} ${cell + 2}`}
      aria-hidden="true"
    >
      {Array.from({ length: width + 1 }, (_, i) => (
        <line key={`v${i}`} x1={s(i)} y1={0} x2={s(i)} y2={cell} className="glyph__rule" />
      ))}
      <line x1={0} y1={0} x2={w} y2={0} className="glyph__rule" />
      <line x1={0} y1={cell} x2={w} y2={cell} className="glyph__rule" />
      {glyph.primitives.map((p, i) => {
        switch (p.kind) {
          case 'line':
            return (
              <line
                key={i}
                x1={s(p.from[0])}
                y1={s(p.from[1])}
                x2={s(p.to[0])}
                y2={s(p.to[1])}
                className="glyph__ink"
              />
            );
          case 'polyline':
            return (
              <polyline
                key={i}
                points={p.points.map(([x, y]) => `${s(x)},${s(y)}`).join(' ')}
                className="glyph__ink"
              />
            );
          case 'polygon':
            return (
              <polygon
                key={i}
                points={p.points.map(([x, y]) => `${s(x)},${s(y)}`).join(' ')}
                className={p.fill === 'muted' ? 'glyph__muted' : 'glyph__fill'}
              />
            );
          case 'circle':
            return (
              <circle
                key={i}
                cx={s(p.center[0])}
                cy={s(p.center[1])}
                r={s(p.radius)}
                className={p.fill === 'ink' ? 'glyph__fill' : 'glyph__ink'}
              />
            );
          case 'text':
            return (
              <text
                key={i}
                x={s(p.at[0])}
                y={s(p.at[1])}
                fontSize={s(p.size)}
                className="glyph__text"
                textAnchor="middle"
                dominantBaseline="central"
              >
                {p.text}
              </text>
            );
        }
      })}
    </svg>
  );
}

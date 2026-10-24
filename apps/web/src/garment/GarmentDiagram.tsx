import type { ProjectKind } from '@kt/core';
import { DIAGRAM_VIEWBOX, DIAGRAMS } from './diagrams';

/**
 * The drawing of a garment split into its parts (body, sleeves, neckline…), each with its number
 * in the knitting order. Pointing at a part highlights it, clicking acts on it. The list of parts
 * next to it is the accessible way to the same choices, so the drawing itself is hidden from
 * assistive technology.
 */
export function GarmentDiagram({
  kind,
  elements,
  selected,
  hovered,
  onSelect,
  onHover,
  numbers,
  inert,
  size = 'normal',
}: {
  kind: Exclude<ProjectKind, 'custom'>;
  /** Parts that are in the project; `include: false` draws a part as left out. */
  elements: Readonly<Record<string, { readonly include: boolean } | undefined>>;
  /** The part outlined as chosen; null for none. */
  selected: string | null;
  hovered: string | null;
  onSelect(id: string): void;
  onHover(id: string | null): void;
  /** Knitting order of each part, shown on it. */
  numbers?: Readonly<Record<string, number>>;
  /** Parts that can't be clicked (not tracked). */
  inert?: (id: string) => boolean;
  size?: 'normal' | 'large';
}) {
  const diagram = DIAGRAMS[kind];
  const outline = diagram.regions.find((r) => r.id === selected)?.d;
  return (
    <svg
      className={`garment__drawing garment__drawing--${size}`}
      viewBox={DIAGRAM_VIEWBOX}
      aria-hidden="true"
      focusable="false"
      data-testid="garment-diagram"
    >
      {diagram.regions.map((r) => {
        const classes = [
          'garment__region',
          elements[r.id]?.include === false ? 'is-off' : '',
          r.id === hovered ? 'is-hover' : '',
          r.id === selected ? 'is-selected' : '',
          inert?.(r.id) ? 'is-inert' : '',
        ].filter(Boolean);
        const act = inert?.(r.id) ? undefined : () => onSelect(r.id);
        return (
          <path
            key={r.id}
            d={r.d}
            className={classes.join(' ')}
            data-part={r.id}
            onClick={act}
            onPointerEnter={() => onHover(r.id)}
            onPointerLeave={() => onHover(null)}
          />
        );
      })}
      <path className="garment__decor" d={diagram.decor} />
      {/* The selected part's outline on top, so neighbours don't cover it. */}
      {outline && <path className="garment__outline" d={outline} />}
      {numbers &&
        diagram.regions.flatMap((r) => {
          const n = numbers[r.id];
          if (n === undefined) return [];
          const off = elements[r.id]?.include === false;
          return r.marks.map(([x, y], i) => (
            <g
              key={`${r.id}-${i}`}
              className={`garment__mark${off ? ' is-off' : ''}${inert?.(r.id) ? ' is-inert' : ''}`}
              data-mark={r.id}
              onClick={inert?.(r.id) ? undefined : () => onSelect(r.id)}
              onPointerEnter={() => onHover(r.id)}
              onPointerLeave={() => onHover(null)}
            >
              <circle cx={x} cy={y} r={8.5} />
              <text x={x} y={y}>
                {n}
              </text>
            </g>
          ));
        })}
    </svg>
  );
}

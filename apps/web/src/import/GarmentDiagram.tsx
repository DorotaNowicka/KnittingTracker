import type { ProjectKind } from '@kt/core';
import { DIAGRAM_VIEWBOX, DIAGRAMS } from './diagrams';
import type { Elements } from './elements';

/**
 * The drawing of a garment split into its parts (body, sleeves, neckline…). Pointing at a part
 * highlights it, clicking selects it. The list of parts next to it is the accessible way to the
 * same choices, so the drawing itself is hidden from assistive technology.
 */
export function GarmentDiagram({
  kind,
  elements,
  selected,
  hovered,
  onSelect,
  onHover,
}: {
  kind: Exclude<ProjectKind, 'custom'>;
  elements: Elements;
  selected: string;
  hovered: string | null;
  onSelect(id: string): void;
  onHover(id: string | null): void;
}) {
  const diagram = DIAGRAMS[kind];
  const outline = diagram.regions.find((r) => r.id === selected)?.d;
  return (
    <svg
      className="garment__drawing"
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
        ].filter(Boolean);
        return (
          <path
            key={r.id}
            d={r.d}
            className={classes.join(' ')}
            data-part={r.id}
            onClick={() => onSelect(r.id)}
            onPointerEnter={() => onHover(r.id)}
            onPointerLeave={() => onHover(null)}
          />
        );
      })}
      <path className="garment__decor" d={diagram.decor} />
      {/* The selected part's outline on top, so neighbours don't cover it. */}
      {outline && <path className="garment__outline" d={outline} />}
    </svg>
  );
}

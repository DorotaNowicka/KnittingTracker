/**
 * A yarn's colour as a small square. Drawn as SVG with a fill attribute: the app sets no inline
 * styles (strict Content-Security-Policy), and a yarn's colour is the knitter's own.
 */
export function YarnSwatch({ color, size = 14 }: { color: string; size?: number }) {
  return (
    <svg className="yarn-swatch" width={size} height={size} viewBox="0 0 14 14" aria-hidden="true">
      <rect
        x="0.5"
        y="0.5"
        width="13"
        height="13"
        rx="3"
        fill={color}
        stroke="currentColor"
        strokeOpacity="0.4"
      />
    </svg>
  );
}

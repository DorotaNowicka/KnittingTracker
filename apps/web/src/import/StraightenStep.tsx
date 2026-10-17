import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from 'react';
import { useTranslation } from 'react-i18next';

type Corner = [number, number];

/**
 * Crop & straighten (ADR-5) for photos: the user drags the four corners of the chart; the worker
 * maps that quadrilateral to an upright rectangle. Screenshots and scans skip this.
 */
export function StraightenStep({
  image,
  onRun,
  onCancel,
}: {
  image: { width: number; height: number; rgba: Uint8ClampedArray };
  onRun(corners?: readonly Corner[]): void;
  onCancel(): void;
}) {
  const { t } = useTranslation();
  const canvas = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const inset = Math.round(Math.min(image.width, image.height) * 0.04);
  const initial: Corner[] = [
    [inset, inset],
    [image.width - inset, inset],
    [image.width - inset, image.height - inset],
    [inset, image.height - inset],
  ];
  const [corners, setCorners] = useState<Corner[]>(initial);
  const drag = useRef<number | null>(null);

  useEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    // Small pictures get a larger bitmap so they are shown big enough to place corners precisely.
    // The page sets no inline styles (strict CSP): the size comes from the bitmap and the CSS
    // limits, which keep the aspect ratio.
    const k = Math.max(1, Math.ceil(560 / Math.max(image.width, image.height)));
    const src = document.createElement('canvas');
    src.width = image.width;
    src.height = image.height;
    src
      .getContext('2d')
      ?.putImageData(
        new ImageData(new Uint8ClampedArray(image.rgba), image.width, image.height),
        0,
        0,
      );
    c.width = image.width * k;
    c.height = image.height * k;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(src, 0, 0, c.width, c.height);
  }, [image]);

  // Image pixels per CSS pixel, so the corner handles keep their on-screen size.
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => {
      const w = el.getBoundingClientRect().width;
      if (w > 0) setScale(image.width / w);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [image.width]);
  const radius = 22 * scale;

  const toImage = (e: PointerEvent): Corner | null => {
    const rect = box.current?.getBoundingClientRect();
    if (!rect) return null;
    const x = ((e.clientX - rect.left) / rect.width) * image.width;
    const y = ((e.clientY - rect.top) / rect.height) * image.height;
    return [Math.max(0, Math.min(image.width, x)), Math.max(0, Math.min(image.height, y))];
  };

  const names = [
    t('importer.corners.tl'),
    t('importer.corners.tr'),
    t('importer.corners.br'),
    t('importer.corners.bl'),
  ];
  const nudge = (i: number, dx: number, dy: number) =>
    setCorners((cs) =>
      cs.map((c, k) =>
        k === i
          ? ([
              Math.max(0, Math.min(image.width, c[0] + dx)),
              Math.max(0, Math.min(image.height, c[1] + dy)),
            ] as Corner)
          : c,
      ),
    );
  const step = Math.max(2, Math.round(Math.max(image.width, image.height) / 200));

  return (
    <section className="straighten" aria-labelledby="straighten-title">
      <h2 id="straighten-title" className="section-title">
        {t('importer.straightenTitle')}
      </h2>
      <p className="hint">{t('importer.straightenHint')}</p>
      <div
        ref={box}
        className="straighten__box"
        onPointerMove={(e) => {
          if (drag.current === null) return;
          const p = toImage(e);
          if (p) setCorners((cs) => cs.map((c, k) => (k === drag.current ? p : c)));
        }}
        onPointerDown={(e) => {
          // Single-pointer alternative to dragging (WCAG 2.5.7): a tap on the picture moves the
          // nearest corner there. Taps on a handle start a drag instead (handled by the handle).
          if ((e.target as Element).closest('.straighten__handle')) return;
          const p = toImage(e);
          if (!p) return;
          let nearest = 0;
          corners.forEach((c, i) => {
            const best = corners[nearest] ?? c;
            if (Math.hypot(c[0] - p[0], c[1] - p[1]) < Math.hypot(best[0] - p[0], best[1] - p[1]))
              nearest = i;
          });
          setCorners((cs) => cs.map((c, k) => (k === nearest ? p : c)));
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
      >
        <canvas ref={canvas} className="straighten__image" aria-hidden="true" />
        <svg
          className="straighten__quad"
          viewBox={`0 0 ${image.width} ${image.height}`}
          role="group"
          aria-label={t('importer.cornersLabel')}
        >
          <polygon points={corners.map((c) => c.join(',')).join(' ')} aria-hidden="true" />
          {corners.map((c, i) => (
            // Handles are SVG, positioned by attributes: no inline styles under the strict CSP.
            <g
              key={i}
              className="straighten__handle"
              role="button"
              tabIndex={0}
              aria-label={t('importer.cornerLabel', { name: names[i] })}
              transform={`translate(${c[0]} ${c[1]})`}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                drag.current = i;
              }}
              onKeyDown={(e) => {
                const d: Record<string, [number, number]> = {
                  ArrowLeft: [-step, 0],
                  ArrowRight: [step, 0],
                  ArrowUp: [0, -step],
                  ArrowDown: [0, step],
                };
                const m = d[e.key];
                if (m) {
                  e.preventDefault();
                  nudge(i, m[0], m[1]);
                }
              }}
            >
              <circle className="straighten__ring" r={radius} />
              <circle className="straighten__dot" r={radius * 0.18} />
            </g>
          ))}
        </svg>
      </div>
      <div className="form-actions">
        <button type="button" className="btn" onClick={onCancel}>
          {t('importer.otherFile')}
        </button>
        <button type="button" className="btn" onClick={() => onRun()}>
          {t('importer.noStraighten')}
        </button>
        <button type="button" className="btn btn--primary" onClick={() => onRun(corners)}>
          {t('importer.straightenRun')}
        </button>
      </div>
    </section>
  );
}

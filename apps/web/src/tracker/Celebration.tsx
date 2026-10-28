import { useEffect, useId, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../ui/Icon';

/**
 * The last part is finished: the screen dims, confetti falls and a short congratulation is left
 * lit. "Cofnij" opens the part again (a finish by mistake); the other way out is the project list.
 */
export function Celebration({
  project,
  onUndo,
  onProjects,
  onClose,
}: {
  project: string;
  onUndo(): void;
  onProjects(): void;
  /** Escape: the screen goes away and the project stays finished. */
  onClose(): void;
}) {
  const { t } = useTranslation();
  const ids = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const d = dialog.current;
    // jsdom has no showModal; the open attribute is enough there.
    if (d && !d.open) {
      if (typeof d.showModal === 'function') d.showModal();
      else d.setAttribute('open', '');
    }
  }, []);

  useEffect(() => {
    const c = canvas.current;
    if (!c || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    return confetti(c);
  }, []);

  return (
    <dialog
      ref={dialog}
      className="celebration"
      aria-labelledby={`${ids}-t`}
      aria-describedby={`${ids}-d`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <canvas ref={canvas} className="celebration__confetti" aria-hidden="true" />
      <div className="celebration__card">
        <p className="celebration__icon" aria-hidden="true">
          <Icon name="check" size={32} />
        </p>
        <h2 id={`${ids}-t`} className="celebration__title">
          {t('celebration.title')}
        </h2>
        <p id={`${ids}-d`} className="celebration__body">
          {t('celebration.body', { name: project })}
        </p>
        <div className="celebration__actions">
          <button type="button" className="btn" onClick={onUndo}>
            <Icon name="undo" size={18} />
            {t('celebration.undo')}
          </button>
          <button type="button" className="btn btn--primary" onClick={onProjects}>
            <Icon name="library" size={18} />
            {t('celebration.projects')}
          </button>
        </div>
      </div>
    </dialog>
  );
}

interface Piece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  angle: number;
  spin: number;
  color: string;
  wobble: number;
}

/** Confetti in the theme's own colours, thrown from both lower corners; returns a stop function. */
function confetti(c: HTMLCanvasElement): () => void {
  const ctx = c.getContext('2d');
  if (!ctx) return () => undefined;
  const css = getComputedStyle(document.documentElement);
  const colors = ['--success', '--marker', '--indigo', '--fur', '--guide-half', '--done-hatch']
    .map((v) => css.getPropertyValue(v).trim())
    .filter(Boolean);
  if (colors.length === 0) colors.push('#d8961a', '#1f6f5c', '#2d4a7e');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const resize = () => {
    c.width = Math.floor(innerWidth * dpr);
    c.height = Math.floor(innerHeight * dpr);
  };
  resize();
  addEventListener('resize', resize);
  const w = () => c.width / dpr;
  const h = () => c.height / dpr;
  const pieces: Piece[] = [];
  const burst = (n: number) => {
    for (let i = 0; i < n; i++) {
      const left = i % 2 === 0;
      const speed = 9 + Math.random() * 9;
      const angle = (left ? -60 : -120) + (Math.random() - 0.5) * 40;
      const rad = (angle * Math.PI) / 180;
      pieces.push({
        x: left ? 0 : w(),
        y: h() * 0.85,
        vx: Math.cos(rad) * speed,
        vy: Math.sin(rad) * speed,
        size: 6 + Math.random() * 6,
        angle: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 0.3,
        color: colors[i % colors.length] ?? '#d8961a',
        wobble: Math.random() * Math.PI * 2,
      });
    }
  };
  burst(140);
  const second = setTimeout(() => burst(90), 450);
  let frame = 0;
  let last = performance.now();
  const started = last;
  const tick = (now: number) => {
    const dt = Math.min(2.5, (now - last) / 16.7);
    last = now;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w(), h());
    for (const p of pieces) {
      p.vy += 0.32 * dt;
      p.vx *= 0.985;
      p.vy = Math.min(p.vy, 5);
      p.wobble += 0.12 * dt;
      p.x += (p.vx + Math.sin(p.wobble) * 0.8) * dt;
      p.y += p.vy * dt;
      p.angle += p.spin * dt;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, (p.size / 2) * Math.abs(Math.cos(p.wobble)));
      ctx.restore();
    }
    // Stop once everything has fallen out of view (or after a while).
    const visible = pieces.some((p) => p.y < h() + 20);
    if (visible && now - started < 9000) frame = requestAnimationFrame(tick);
    else ctx.clearRect(0, 0, w(), h());
  };
  frame = requestAnimationFrame(tick);
  return () => {
    cancelAnimationFrame(frame);
    clearTimeout(second);
    removeEventListener('resize', resize);
  };
}

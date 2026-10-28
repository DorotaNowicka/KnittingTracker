import { useId, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { THEMES, type ThemeId, type ThemePref } from '../lib/preferences';
import { Icon } from './Icon';
import { KittenMark } from './KittenMark';

const OPTIONS: readonly ThemePref[] = ['system', ...THEMES.map((t) => t.id)];

/**
 * Theme choice in Settings (the only place to change it). Every tile is a radio whose preview is
 * painted with that theme's own tokens (data-theme-preview), so what you see is what you get.
 */
export function ThemePicker({
  value,
  onChange,
}: {
  readonly value: ThemePref;
  onChange(pref: ThemePref): void;
}) {
  const { t } = useTranslation();
  const name = useId();
  return (
    <fieldset className="field">
      <legend>{t('settings.theme')}</legend>
      <div className="theme-picker">
        {OPTIONS.map((id) => {
          const premium = THEMES.some((th) => th.id === id && 'premium' in th && th.premium);
          return (
            // The tile's name is three elements deep, past where the rule looks for label text.
            // eslint-disable-next-line jsx-a11y/label-has-associated-control
            <label
              key={id}
              htmlFor={`${name}-${id}`}
              className="theme-tile"
              data-testid={`theme-${id}`}
            >
              <input
                id={`${name}-${id}`}
                type="radio"
                name={name}
                value={id}
                checked={value === id}
                onChange={() => onChange(id)}
              />
              <span className="theme-tile__body">
                <span className="theme-tile__preview" aria-hidden="true">
                  {id === 'system' ? (
                    <>
                      <ThemeMini theme="light" half="left" />
                      <ThemeMini theme="dark" half="right" />
                    </>
                  ) : (
                    <ThemeMini theme={id} />
                  )}
                  <span className="theme-tile__check">
                    <Icon name="check" size={16} />
                  </span>
                </span>
                <span className="theme-tile__name">
                  {t(`settings.themes.${id}`)}
                  {premium && <span className="theme-tile__badge">{t('settings.premium')}</span>}
                </span>
                <span className="theme-tile__hint">{t(`settings.themeHints.${id}`)}</span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

const COLS = 8;
const ROWS = 4;
const CW = 13;
const CH = 11;
const X0 = 8;
const Y0 = 12;

/** A tiny chart in one theme: knitted rows (tint + hatch), the row keeper, the stitch marker. */
function ThemeMini({ theme, half }: { readonly theme: ThemeId; readonly half?: 'left' | 'right' }) {
  const hatch = useId();
  const kitten = theme === 'yarn' || theme === 'yarn-night';
  // Rows from the bottom: rows 1-2 knitted, row 3 current (worked right to left, 4 stitches done).
  const cells: ReactNode[] = [];
  for (let r = 1; r <= ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const x = X0 + c * CW;
      const y = Y0 + (ROWS - r) * CH;
      const done = r < 3 || (r === 3 && c >= 4);
      cells.push(
        <g key={`${r}-${c}`}>
          <rect x={x} y={y} width={CW} height={CH} className={done ? 'tm-done' : 'tm-sheet'} />
          {done && <rect x={x} y={y} width={CW} height={CH} fill={`url(#${hatch})`} />}
          {(c === 0 || c === COLS - 1) && (
            <line x1={x + 4} x2={x + CW - 4} y1={y + CH / 2} y2={y + CH / 2} className="tm-ink" />
          )}
        </g>,
      );
    }
  }
  const keeperY = Y0 + (ROWS - 3) * CH;
  return (
    <span className="theme-mini" data-theme-preview={theme}>
      <svg
        className="theme-mini__chart"
        viewBox={half === 'right' ? '64 0 64 64' : half === 'left' ? '0 0 64 64' : '0 0 128 64'}
      >
        <defs>
          <pattern
            id={hatch}
            width="4"
            height="4"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <line x1="0" y1="0" x2="0" y2="4" className="tm-hatch" />
          </pattern>
        </defs>
        {cells}
        <line
          x1={X0 + 2 * CW + 3}
          y1={Y0 + 2 * CH - 3}
          x2={X0 + 4 * CW - 3}
          y2={Y0 + CH + 3}
          className="tm-ink"
        />
        <rect x={X0} y={Y0} width={COLS * CW} height={ROWS * CH} className="tm-frame" />
        <rect x={X0 - 2} y={keeperY - 3} width={COLS * CW + 4} height={3} className="tm-keeper" />
        {(['tm-marker-outline', 'tm-marker'] as const).map((cls) => (
          <rect
            key={cls}
            x={X0 + 4 * CW + 2}
            y={keeperY + 2}
            width={CW - 4}
            height={CH - 4}
            rx="2"
            className={cls}
          />
        ))}
      </svg>
      {kitten && <KittenMark size={22} paws className="theme-mini__kitten" />}
    </span>
  );
}

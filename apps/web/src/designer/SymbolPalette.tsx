import type { SymbolRegistry } from '@kt/core';
import { useTranslation } from 'react-i18next';
import { SymbolGlyph } from '../ui/SymbolGlyph';

/** Every symbol the pattern knows, to paint with. */
export function SymbolPalette({
  registry,
  active,
  onPick,
}: {
  registry: SymbolRegistry;
  active: string | null;
  onPick(symbolId: string): void;
}) {
  const { i18n } = useTranslation();
  const lang = i18n.language.startsWith('en') ? 'en' : 'pl';
  return (
    <ul className="palette">
      {registry.all().map((s) => (
        <li key={s.id}>
          <button
            type="button"
            className="palette__item"
            aria-pressed={active === s.id}
            title={s.description[lang]}
            onClick={() => onPick(s.id)}
          >
            <SymbolGlyph glyph={s.glyph} width={s.width} cell={Math.min(26, 64 / s.width)} />
            <span className="palette__label">{s.label[lang]}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

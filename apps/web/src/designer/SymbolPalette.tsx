import type { SymbolDef, SymbolRegistry } from '@kt/core';
import { useTranslation } from 'react-i18next';
import { SymbolGlyph } from '../ui/SymbolGlyph';

/** The palette's groups, in order, by symbol family. */
const GROUPS = [
  { id: 'basic', families: ['basic'], hint: false },
  { id: 'shaping', families: ['decrease', 'increase'], hint: true },
  { id: 'bindOff', families: ['bind-off', 'no-stitch'], hint: true },
  { id: 'cable', families: ['cable'], hint: false },
] as const;

/**
 * Every symbol the pattern knows, to paint with, in groups: plain stitches, lace and single
 * decreases (shaping at the edges belongs to the Shape tool), binding off and "no stitch", cables.
 */
export function SymbolPalette({
  registry,
  active,
  onPick,
}: {
  registry: SymbolRegistry;
  active: string | null;
  onPick(symbolId: string): void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith('en') ? 'en' : 'pl';
  const all = registry.all();
  const item = (s: SymbolDef) => (
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
  );
  return (
    <div className="palette-groups">
      {GROUPS.map((g) => {
        const symbols = all.filter((s) => (g.families as readonly string[]).includes(s.family));
        if (symbols.length === 0) return null;
        return (
          <div key={g.id} className="palette-group">
            <h3 className="palette-group__title">{t(`designer.brushGroups.${g.id}`)}</h3>
            {g.hint && <p className="hint">{t(`designer.brushGroups.${g.id}Hint`)}</p>}
            <ul className="palette">{symbols.map(item)}</ul>
          </div>
        );
      })}
    </div>
  );
}

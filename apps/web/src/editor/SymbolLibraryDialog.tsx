import type { SymbolDef, SymbolFamily, SymbolRegistry } from '@kt/core';
import { useId, useMemo, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { SymbolGlyph } from '../ui/SymbolGlyph';

const FAMILIES: readonly (SymbolFamily | 'all')[] = [
  'all',
  'basic',
  'decrease',
  'increase',
  'cable',
  'bind-off',
  'no-stitch',
];

/** Browse every symbol available to the pattern (built-in and the pattern's own) and pick one. */
export function SymbolLibraryDialog({
  dialogRef,
  registry,
  onPick,
  onCreate,
}: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  registry: SymbolRegistry;
  onPick(symbol: SymbolDef): void;
  onCreate(): void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith('en') ? 'en' : 'pl';
  const ids = useId();
  const [query, setQuery] = useState('');
  const [family, setFamily] = useState<SymbolFamily | 'all'>('all');
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return registry.all().filter((s) => {
      if (family !== 'all' && s.family !== family) return false;
      if (!q) return true;
      const hay = [s.label.pl, s.label.en, s.description[lang], ...Object.values(s.numbers ?? {})]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [registry, query, family, lang]);

  return (
    <dialog ref={dialogRef} className="dialog dialog--wide" aria-labelledby={`${ids}-t`}>
      <h2 id={`${ids}-t`} className="dialog__title">
        {t('library.title')}
      </h2>
      <div className="field">
        <label htmlFor={`${ids}-q`}>{t('library.search')}</label>
        <input
          id={`${ids}-q`}
          type="search"
          value={query}
          placeholder={t('library.searchHint')}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="chip-group" role="group" aria-label={t('library.family')}>
        {FAMILIES.map((f) => (
          <button
            key={f}
            type="button"
            className="chip chip--button"
            aria-pressed={family === f}
            onClick={() => setFamily(f)}
          >
            {f === 'all' ? t('library.all') : t(`symbol.families.${f}`)}
          </button>
        ))}
      </div>
      <ul className="library">
        {shown.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              className="library__item"
              onClick={() => {
                onPick(s);
                dialogRef.current?.close();
              }}
            >
              <SymbolGlyph glyph={s.glyph} width={s.width} cell={30} />
              <span className="library__text">
                <span className="library__label">
                  {s.label[lang]}
                  {s.numbers?.['drops'] && (
                    <span className="legend__number num">{s.numbers['drops']}</span>
                  )}
                </span>
                <span className="library__desc">{s.description[lang]}</span>
                <span className="library__counts num">
                  {t('library.counts', {
                    consumes: s.consumes,
                    produces: s.produces,
                    width: s.width,
                  })}
                </span>
              </span>
            </button>
          </li>
        ))}
        {shown.length === 0 && <li className="hint">{t('library.none')}</li>}
      </ul>
      <div className="dialog__actions">
        <button type="button" className="btn" onClick={() => dialogRef.current?.close()}>
          {t('common.close')}
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => {
            dialogRef.current?.close();
            onCreate();
          }}
        >
          {t('symbol.add')}
        </button>
      </div>
    </dialog>
  );
}

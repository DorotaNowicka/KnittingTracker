import {
  patternRegistry,
  removeCustomSymbol,
  setLegendEntry,
  upsertCustomSymbol,
  usedSymbolIds,
  type CustomSymbol,
  type Pattern,
  type SymbolDef,
} from '@kt/core';
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDraft } from '../state/draft';
import { TextField } from '../ui/fields';
import { Icon } from '../ui/Icon';
import { SymbolGlyph } from '../ui/SymbolGlyph';
import { CustomSymbolDialog } from './CustomSymbolDialog';

/**
 * The pattern's own legend (FR-15): for every symbol used in the charts, the number and wording
 * of the source pattern. Also lists the pattern's custom symbols.
 */
export function LegendEditor({ pattern }: { pattern: Pattern }) {
  const update = (f: (p: Pattern) => Pattern) => useDraft.getState().updatePattern(pattern.id, f);
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith('en') ? 'en' : 'pl';
  const dialog = useRef<HTMLDialogElement>(null);
  const [editing, setEditing] = useState<CustomSymbol | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);

  const symbols = useMemo((): SymbolDef[] => {
    let registry;
    try {
      registry = patternRegistry(pattern);
    } catch {
      return [];
    }
    const ids = new Set([...usedSymbolIds(pattern), ...pattern.symbols.map((s) => s.id)]);
    return [...ids].flatMap((id) => registry.get(id) ?? []);
  }, [pattern]);

  return (
    <>
      {symbols.length === 0 ? (
        <p className="hint">{t('editor.legendEmpty')}</p>
      ) : (
        <ul className="legend-editor">
          {symbols.map((s) => {
            const entry = pattern.legend.find((e) => e.symbolId === s.id);
            const custom = pattern.symbols.find((c) => c.id === s.id) ?? null;
            return (
              <li key={s.id} className="legend-editor__item">
                <SymbolGlyph glyph={s.glyph} width={s.width} cell={28} />
                <div className="legend-editor__body">
                  <p className="legend-editor__name">
                    {s.label[lang]}
                    {custom && <span className="tag">{t('symbol.own')}</span>}
                  </p>
                  <p className="hint">{s.description[lang]}</p>
                  <div className="legend-editor__fields">
                    <TextField
                      label={t('editor.legendNumber')}
                      value={entry?.number ?? ''}
                      maxLength={20}
                      className="field--compact field--narrow"
                      hint={
                        s.numbers?.['drops']
                          ? t('editor.legendNumberHint', { n: s.numbers['drops'] })
                          : undefined
                      }
                      onCommit={(number) =>
                        update((p) => setLegendEntry(p, s.id, { number, text: entry?.text ?? '' }))
                      }
                    />
                    <TextField
                      label={t('editor.legendText')}
                      value={entry?.text ?? ''}
                      maxLength={500}
                      className="field--compact field--grow"
                      onCommit={(text) =>
                        update((p) =>
                          setLegendEntry(p, s.id, { number: entry?.number ?? '', text }),
                        )
                      }
                    />
                  </div>
                  {custom && (
                    <div className="legend-editor__actions">
                      <button
                        type="button"
                        className="btn btn--small"
                        onClick={() => {
                          setEditing(custom);
                          dialog.current?.showModal();
                        }}
                      >
                        <Icon name="edit" size={18} />
                        {t('symbol.edit')}
                      </button>
                      <button
                        type="button"
                        className="btn btn--small"
                        onClick={() => {
                          const next = removeCustomSymbol(pattern, custom.id);
                          if (next) update(() => next);
                          setBlocked(next ? null : custom.id);
                        }}
                      >
                        <Icon name="trash" size={18} />
                        {t('symbol.remove')}
                      </button>
                      {blocked === custom.id && (
                        <p className="field__error" role="alert">
                          {t('symbol.inUse')}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <button
        type="button"
        className="btn btn--small"
        onClick={() => {
          setEditing(null);
          dialog.current?.showModal();
        }}
      >
        <Icon name="plus" />
        {t('symbol.add')}
      </button>
      <CustomSymbolDialog
        dialogRef={dialog}
        pattern={pattern}
        symbol={editing}
        onSave={(sym) => update((p) => upsertCustomSymbol(p, sym))}
      />
    </>
  );
}

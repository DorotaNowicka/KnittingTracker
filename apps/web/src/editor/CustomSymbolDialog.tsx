import { customSymbolId, type CustomSymbol, type Pattern } from '@kt/core';
import { useId, useState, type FormEvent, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { NumberField, TextField } from '../ui/fields';
import { SymbolGlyph } from '../ui/SymbolGlyph';
import { GLYPH_SHAPES, presetGlyph, type GlyphShape } from './glyphPresets';

type Ws = 'same' | 'unsupported' | 'explicit';
type Family = CustomSymbol['family'];
const FAMILIES: readonly Family[] = [
  'basic',
  'decrease',
  'increase',
  'cable',
  'bind-off',
  'no-stitch',
];

interface FormState {
  name: string;
  description: string;
  family: Family;
  width: number;
  consumes: number;
  produces: number;
  ws: Ws;
  wsText: string;
  shape: GlyphShape;
  text: string;
}

function initial(symbol: CustomSymbol | null, lang: 'pl' | 'en'): FormState {
  if (!symbol) {
    return {
      name: '',
      description: '',
      family: 'basic',
      width: 1,
      consumes: 1,
      produces: 1,
      ws: 'same',
      wsText: '',
      shape: 'text',
      text: '',
    };
  }
  const first = symbol.glyph.primitives[0];
  return {
    name: symbol.label[lang],
    description: symbol.description[lang],
    family: symbol.family,
    width: symbol.width,
    consumes: symbol.consumes,
    produces: symbol.produces,
    ws: symbol.ws.mode === 'invert' ? 'same' : symbol.ws.mode,
    wsText: symbol.ws.mode === 'explicit' ? symbol.ws.text[lang] : '',
    shape: first?.kind === 'text' ? 'text' : 'dot',
    text: first?.kind === 'text' ? first.text : '',
  };
}

/** Create or edit one of the pattern's own symbols (FR-6). */
export function CustomSymbolDialog({
  dialogRef,
  pattern,
  symbol,
  onSave,
}: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  pattern: Pattern;
  /** The symbol being edited, or null to create one. */
  symbol: CustomSymbol | null;
  onSave(symbol: CustomSymbol): void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith('en') ? 'en' : 'pl';
  const ids = useId();
  const [f, setF] = useState<FormState>(() => initial(symbol, lang));
  const [keyOf, setKeyOf] = useState(symbol?.id ?? '');
  // Re-initialise when a different symbol is opened.
  if ((symbol?.id ?? '') !== keyOf) {
    setKeyOf(symbol?.id ?? '');
    setF(initial(symbol, lang));
  }
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => ({ ...s, [k]: v }));
  const glyph = presetGlyph(f.shape, f.width, f.text || f.name.slice(0, 3));
  const nameMissing = f.name.trim() === '';

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (nameMissing) return;
    const text = (v: string) => ({ pl: v, en: v });
    const next: CustomSymbol = {
      id: symbol?.id ?? customSymbolId(f.name, pattern),
      family: f.family,
      width: f.width,
      consumes: f.family === 'no-stitch' ? 0 : f.consumes,
      produces: f.family === 'no-stitch' ? 0 : f.produces,
      worked: f.family !== 'no-stitch',
      ws:
        f.ws === 'explicit' && f.wsText.trim()
          ? { mode: 'explicit', text: text(f.wsText.trim()) }
          : f.ws === 'unsupported'
            ? { mode: 'unsupported' }
            : { mode: 'same' },
      // Same data, as the schema's mutable arrays.
      glyph: JSON.parse(JSON.stringify(glyph)) as CustomSymbol['glyph'],
      label: text(f.name.trim()),
      description: text(f.description.trim() || f.name.trim()),
    };
    onSave(next);
    dialogRef.current?.close();
    if (!symbol) setF(initial(null, lang));
  };

  return (
    <dialog ref={dialogRef} className="dialog dialog--wide" aria-labelledby={`${ids}-t`}>
      <form onSubmit={submit} noValidate>
        <h2 id={`${ids}-t`} className="dialog__title">
          {symbol ? t('symbol.editTitle') : t('symbol.newTitle')}
        </h2>
        <div className="symbol-form">
          <div className="symbol-form__preview" aria-hidden="true">
            <SymbolGlyph glyph={glyph} width={f.width} cell={40} />
          </div>
          <div className="symbol-form__fields">
            <TextField
              label={t('symbol.name')}
              value={f.name}
              required
              maxLength={40}
              onCommit={(v) => set('name', v)}
            />
            {nameMissing && <p className="hint">{t('symbol.nameHint')}</p>}
            <TextField
              label={t('symbol.description')}
              value={f.description}
              maxLength={300}
              onCommit={(v) => set('description', v)}
            />
          </div>
        </div>
        <fieldset className="field">
          <legend>{t('symbol.look')}</legend>
          <div className="shape-picker" role="radiogroup" aria-label={t('symbol.look')}>
            {GLYPH_SHAPES.map((shape) => (
              <label key={shape} className="shape-picker__item">
                <input
                  type="radio"
                  name={`${ids}-shape`}
                  checked={f.shape === shape}
                  onChange={() => set('shape', shape)}
                />
                <SymbolGlyph glyph={presetGlyph(shape, 1, f.text || 'ab')} width={1} cell={28} />
                <span className="visually-hidden">{t(`symbol.shapes.${shape}`)}</span>
              </label>
            ))}
          </div>
          {f.shape === 'text' && (
            <TextField
              label={t('symbol.abbr')}
              value={f.text}
              maxLength={4}
              hint={t('symbol.abbrHint')}
              onCommit={(v) => set('text', v)}
            />
          )}
        </fieldset>
        <div className="field">
          <label htmlFor={`${ids}-fam`}>{t('symbol.family')}</label>
          <select
            id={`${ids}-fam`}
            value={f.family}
            onChange={(e) => set('family', e.target.value as Family)}
          >
            {FAMILIES.map((fam) => (
              <option key={fam} value={fam}>
                {t(`symbol.families.${fam}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="form-grid form-grid--3">
          <NumberField
            label={t('symbol.width')}
            value={f.width}
            min={1}
            max={12}
            onCommit={(v) => set('width', v)}
          />
          {f.family !== 'no-stitch' && (
            <>
              <NumberField
                label={t('symbol.consumes')}
                value={f.consumes}
                min={0}
                max={12}
                onCommit={(v) => set('consumes', v)}
              />
              <NumberField
                label={t('symbol.produces')}
                value={f.produces}
                min={0}
                max={12}
                onCommit={(v) => set('produces', v)}
              />
            </>
          )}
        </div>
        <p className="hint">{t('symbol.countsHint')}</p>
        <fieldset className="field">
          <legend>{t('symbol.ws')}</legend>
          {(['same', 'explicit', 'unsupported'] as const).map((mode) => (
            <label key={mode} className="check">
              <input
                type="radio"
                name={`${ids}-ws`}
                checked={f.ws === mode}
                onChange={() => set('ws', mode)}
              />
              {t(`symbol.wsModes.${mode}`)}
            </label>
          ))}
          {f.ws === 'explicit' && (
            <TextField
              label={t('symbol.wsText')}
              value={f.wsText}
              maxLength={300}
              onCommit={(v) => set('wsText', v)}
            />
          )}
        </fieldset>
        <div className="dialog__actions">
          <button type="button" className="btn" onClick={() => dialogRef.current?.close()}>
            {t('common.cancel')}
          </button>
          <button type="submit" className="btn btn--primary" disabled={nameMissing}>
            {t('symbol.save')}
          </button>
        </div>
      </form>
    </dialog>
  );
}

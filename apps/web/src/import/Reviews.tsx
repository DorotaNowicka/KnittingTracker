import { createRegistry, type Yarn } from '@kt/core';
import type { LegendItem, LegendKind } from '@kt/importer';
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SymbolGlyph } from '../ui/SymbolGlyph';
import { checkFile, ImportError } from './client';
import { useImport } from './session';

/** Sections of the import check shared by the new-project and add-a-pattern screens. */
const registry = createRegistry();

/**
 * The file's legend: each symbol as cut out of the file, with its wording as the name. The
 * knitter can type her own name; which library symbol it is was recognised from the file.
 */
export function LegendReview({ items }: { items: readonly LegendItem[] }) {
  const { t } = useTranslation();
  const ids = useId();
  const names = useImport((s) => s.legendNames);
  const kinds = useImport((s) => s.legendKinds);
  const chosen = useImport((s) => s.legend);
  // Recomputed with the names and shades: a colour entry shows its yarn's shade.
  useImport((s) => s.legendColors);
  const yarns = useImport.getState().yarns();
  return (
    <section className="editor-section" aria-labelledby={`${ids}-lg`}>
      <h2 id={`${ids}-lg`} className="section-title">
        {t('importer.legend')}
      </h2>
      <p className="hint">{t('importer.legendHint')}</p>
      <ul className="legend-review">
        {items.map((item, i) => (
          <li key={i} className="legend-review__item">
            <IconImage item={item} />
            {/* The file's wording is the name; the knitter can type her own instead. */}
            <div className="field field--compact legend-review__name">
              <label htmlFor={`${ids}-n${i}`}>{t('importer.legendName')}</label>
              <input
                id={`${ids}-n${i}`}
                value={names[i] ?? ''}
                placeholder={item.text || t('importer.legendNameEmpty')}
                title={item.text || undefined}
                maxLength={80}
                autoComplete="off"
                aria-describedby={item.text.length > 32 ? `${ids}-t${i}` : undefined}
                onChange={(e) => useImport.getState().setLegendName(i, e.target.value)}
              />
              {/* A long wording does not fit in the field: shown whole below it. */}
              {item.text.length > 32 && (
                <p id={`${ids}-t${i}`} className="hint">
                  {t('importer.legendFromFile', { text: item.text })}
                </p>
              )}
            </div>
            {/* Colourwork: an entry may be a yarn's colour, or a mark that is not a stitch. */}
            <div className="field field--compact legend-review__kind">
              <label htmlFor={`${ids}-k${i}`}>{t('importer.legendKind')}</label>
              <select
                id={`${ids}-k${i}`}
                value={kinds[i] ?? item.kind}
                onChange={(e) =>
                  void useImport.getState().setLegendKind(i, e.target.value as LegendKind)
                }
              >
                <option value="stitch">{t('importer.kindStitch')}</option>
                <option value="color">{t('importer.kindColor')}</option>
                <option value="mark">{t('importer.kindMark')}</option>
              </select>
            </div>
            {(kinds[i] ?? item.kind) === 'color' && (
              <ColorOf
                index={i}
                letter={chosen[i]?.slice(6) ?? ''}
                yarns={yarns}
                label={t('importer.legendShade', {
                  name: names[i] || item.color?.name || item.text,
                })}
              />
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The shade of a colour entry: the yarn's colour, changed with a colour picker. */
function ColorOf({
  index,
  letter,
  yarns,
  label,
}: {
  index: number;
  letter: string;
  yarns: readonly Yarn[];
  label: string;
}) {
  const yarn = yarns.find((y) => y.id === letter);
  return (
    <span className="legend-review__color">
      <span className="legend-review__letter num" aria-hidden="true">
        {letter}
      </span>
      <input
        type="color"
        value={yarn?.color ?? '#808080'}
        aria-label={label}
        onChange={(e) => useImport.getState().setLegendColor(index, e.target.value)}
      />
    </span>
  );
}

export function SymbolsReview() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith('en') ? 'en' : 'pl';
  const ids = useId();
  const result = useImport((s) => s.result);
  const [set, setSet] = useState<ReadonlySet<string>>(() => new Set(result?.symbols ?? []));
  if (!result) return null;
  const changed = [...set].sort().join() !== [...result.symbols].sort().join();
  return (
    <section className="editor-section" aria-labelledby={`${ids}-sy`}>
      <h2 id={`${ids}-sy`} className="section-title">
        {t('importer.symbols')}
      </h2>
      <p className="hint">{t('importer.symbolsHint')}</p>
      <div className="symbol-choice">
        {registry.all().map((d) => (
          <label key={d.id} className="symbol-choice__item">
            <input
              type="checkbox"
              checked={set.has(d.id)}
              onChange={(e) => {
                const next = new Set(set);
                if (e.target.checked) next.add(d.id);
                else next.delete(d.id);
                setSet(next);
              }}
            />
            <SymbolGlyph glyph={d.glyph} width={d.width} cell={Math.min(20, 56 / d.width)} />
            <span>{d.label[lang]}</span>
          </label>
        ))}
      </div>
      {changed && set.size > 0 && (
        <button
          type="button"
          className="btn"
          onClick={() => void useImport.getState().rerun([...set])}
        >
          {t('importer.rerun')}
        </button>
      )}
    </section>
  );
}

/** The legend icon as found in the file, enlarged; an image sized by attributes (no inline styles). */
function IconImage({ item }: { item: LegendItem }) {
  const ref = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const img = ref.current;
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d');
    if (!img || !ctx) return;
    c.width = item.icon.width;
    c.height = item.icon.height;
    ctx.putImageData(
      new ImageData(new Uint8ClampedArray(item.icon.rgba), item.icon.width, item.icon.height),
      0,
      0,
    );
    img.src = c.toDataURL('image/png');
  }, [item]);
  return (
    <img ref={ref} className="legend-review__icon" width={28 * item.cells} height={28} alt="" />
  );
}

export function DescriptionReview({ headingLevel = 2 }: { headingLevel?: 2 | 3 } = {}) {
  const { t } = useTranslation();
  const ids = useId();
  const description = useImport((s) => s.description);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const d = description.parsed;
  const file = useRef<HTMLInputElement>(null);
  const sequence = d.sequence?.value ?? [];
  return (
    <section className="editor-section" aria-labelledby={`${ids}-d`}>
      {headingLevel === 2 ? (
        <h2 id={`${ids}-d`} className="section-title">
          {t('importer.description')}
        </h2>
      ) : (
        <h3 id={`${ids}-d`} className="panel__subtitle">
          {t('importer.description')}
        </h3>
      )}
      <p className="hint">{t('importer.descriptionHint')}</p>
      <dl className="facts">
        <div>
          <dt>{t('editor.sizes')}</dt>
          <dd>{d.sizes ? d.sizes.value.join(' – ') : t('importer.notFound')}</dd>
        </div>
        <div>
          <dt>{t('importer.order')}</dt>
          <dd>
            {sequence.length === 0
              ? t('importer.notFound')
              : sequence.map((x, i) => (
                  <span key={i} className="chip">
                    {x.chart}
                    {x.stitches ? <span className="num"> {x.stitches.join('-')}</span> : null}
                  </span>
                ))}
          </dd>
        </div>
        <div>
          <dt>{t('importer.stitchCount')}</dt>
          <dd className="num">
            {d.stitchCount ? d.stitchCount.value.join('-') : t('importer.notFound')}
          </dd>
        </div>
        <div>
          <dt>{t('importer.marker')}</dt>
          <dd className="num">{d.marker ? d.marker.value.join('-') : t('importer.notFound')}</dd>
        </div>
      </dl>
      <div className="choose__actions">
        <button
          type="button"
          className="btn btn--small"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
        >
          {t('importer.pasteText')}
        </button>
        <label className="btn btn--small btn--file">
          {t('importer.descriptionPdf')}
          <input
            ref={file}
            type="file"
            accept="application/pdf,.pdf"
            className="visually-hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              setError(null);
              try {
                await useImport.getState().addDescriptionPdf(await checkFile(f, 'pdf'));
              } catch (err) {
                setError(err instanceof ImportError ? err.code : 'unreadable');
              } finally {
                if (file.current) file.current.value = '';
              }
            }}
          />
        </label>
      </div>
      {error && (
        <p className="notice notice--danger" role="alert">
          {t(`importer.errors.${error}`, { defaultValue: t('importer.errors.unreadable') })}
        </p>
      )}
      {open && (
        <div className="field">
          <label htmlFor={`${ids}-txt`}>{t('importer.descriptionText')}</label>
          <textarea
            id={`${ids}-txt`}
            rows={8}
            value={description.text}
            onChange={(e) => useImport.getState().setDescription(e.target.value)}
          />
        </div>
      )}
    </section>
  );
}

import { createRegistry, PROJECT_KIND_LIST, type KindItem, type ProjectKind } from '@kt/core';
import { useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { navigate, paths } from '../lib/router';
import { TextField } from '../ui/fields';
import { Icon } from '../ui/Icon';
import { KIND_ICONS } from '../ui/kindIcons';
import { ChartReview } from './ChartReview';
import { kindItems, mainItemId, partsOf, type ElementState } from './elements';
import { GarmentDiagram } from './GarmentDiagram';
import { DescriptionReview, LegendReview, SymbolsReview } from './Reviews';
import { splitSizes, UNCERTAIN, useImport } from './session';

const registry = createRegistry();

/**
 * Checking a PDF for a new project: what kind of project it is (recognised from the text), the
 * garment drawn and split into parts, and for the chosen part its own piece of the form — which
 * charts it uses, its options, and for the main part the description of a round.
 */
export function ElementsVerify() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith('en') ? 'en' : 'pl';
  const ids = useId();
  const s = useImport();
  const kind = s.projectKind;
  const items = kindItems(kind);
  const main = mainItemId(kind);
  const [chosen, setChosen] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const panel = useRef<HTMLElement>(null);
  const selected = chosen && items.some((i) => i.id === chosen) ? chosen : main;
  const item = items.find((i) => i.id === selected) ?? items[0];
  const result = s.result;
  if (!result || !item) return null;

  const select = (id: string) => {
    setChosen(id);
    // The part's form is below the drawing: when it is out of sight, bring its start to the
    // middle of the screen, so the drawing stays partly in view.
    const box = panel.current?.getBoundingClientRect();
    if (box && box.top > window.innerHeight * 0.75) {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      window.scrollBy({
        top: box.top - window.innerHeight * 0.45,
        behavior: reduce ? 'auto' : 'smooth',
      });
    }
  };
  const kindLabel = PROJECT_KIND_LIST.find((k) => k.id === kind)?.label[lang] ?? '';
  const pair = PROJECT_KIND_LIST.find((k) => k.id === kind)?.pair === true;

  return (
    <div className="verify">
      <p className="lead" role="status">
        {result.charts.length === 0
          ? t('elements.noChartsFound')
          : t('importer.found', { count: result.charts.length })}
      </p>

      <section className="editor-section" aria-labelledby={`${ids}-kind`}>
        <h2 id={`${ids}-kind`} className="section-title">
          {t('elements.kindTitle')}
        </h2>
        <div className="kind-pick">
          <Icon name={KIND_ICONS[kind]} size={40} />
          <div className="field field--compact">
            <label htmlFor={`${ids}-k`}>{t('elements.kindLabel')}</label>
            <select
              id={`${ids}-k`}
              value={kind}
              onChange={(e) => {
                setChosen(null);
                s.setProjectKind(e.target.value as ProjectKind);
              }}
            >
              {PROJECT_KIND_LIST.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label[lang]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="hint">
          {s.guess && s.guess.kind === kind
            ? t('elements.recognised', { words: s.guess.evidence.join(', ') })
            : s.guess
              ? t('elements.changed')
              : t('elements.unsure')}
        </p>
      </section>

      {kind !== 'custom' && (
        <section className="editor-section" aria-labelledby={`${ids}-parts`}>
          <h2 id={`${ids}-parts`} className="section-title">
            {t('elements.partsTitle', { kind: kindLabel })}
          </h2>
          <p className="hint">
            {t('elements.partsHint')} {pair && t('elements.pair')}
          </p>
          <div className="garment">
            <GarmentDiagram
              kind={kind}
              elements={s.elements}
              selected={selected}
              hovered={hovered}
              onSelect={select}
              onHover={setHovered}
            />
            <ul
              className="garment__parts"
              aria-label={t('elements.partsTitle', { kind: kindLabel })}
            >
              {items.map((it) => (
                <li key={it.id}>
                  <PartButton
                    item={it}
                    state={s.elements[it.id]}
                    selected={it.id === selected}
                    hovered={it.id === hovered}
                    onSelect={() => select(it.id)}
                    onHover={(on) => setHovered(on ? it.id : null)}
                  />
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <section
        ref={panel}
        className="part-panel"
        aria-labelledby={`${ids}-panel`}
        data-testid="part-panel"
      >
        <PartPanel
          key={`${kind}-${item.id}`}
          titleId={`${ids}-panel`}
          item={item}
          isMain={item.id === main}
          kind={kind}
        />
      </section>

      {result.legend.length > 0 && <LegendReview items={result.legend} />}
      {result.legend.length === 0 && result.charts.length > 0 && <SymbolsReview />}

      <ProjectForm />
    </div>
  );
}

/** How a part will be made, in a few words: skipped, its charts, or a row counter. */
function useStatus(item: KindItem, state: ElementState | undefined) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith('en') ? 'en' : 'pl';
  if (!state?.include) return t('elements.skipped');
  const option =
    item.type === 'choice' ? item.options.find((o) => o.id === state.option)?.label[lang] : null;
  const charts =
    state.charts.length > 0
      ? t('elements.charts', { count: state.charts.length })
      : t('elements.rowCounter');
  return option ? `${option} · ${charts}` : charts;
}

function PartButton({
  item,
  state,
  selected,
  hovered,
  onSelect,
  onHover,
}: {
  item: KindItem;
  state: ElementState | undefined;
  selected: boolean;
  hovered: boolean;
  onSelect(): void;
  onHover(on: boolean): void;
}) {
  const { i18n } = useTranslation();
  const lang = i18n.language.startsWith('en') ? 'en' : 'pl';
  const status = useStatus(item, state);
  const count = item.type === 'part' && item.count && item.count > 1 ? ` ×${item.count}` : '';
  return (
    <button
      type="button"
      className={`part-button${hovered ? ' is-hover' : ''}${state?.include ? '' : ' is-off'}`}
      aria-pressed={selected}
      data-part={item.id}
      onClick={onSelect}
      onPointerEnter={() => onHover(true)}
      onPointerLeave={() => onHover(false)}
      onFocus={() => onHover(true)}
      onBlur={() => onHover(false)}
    >
      <span className="part-button__name">
        {item.label[lang]}
        {count}
      </span>
      <span className="part-button__status">{status}</span>
    </button>
  );
}

/** The piece of the form that belongs to one part of the garment. */
function PartPanel({
  titleId,
  item,
  isMain,
  kind,
}: {
  titleId: string;
  item: KindItem;
  isMain: boolean;
  kind: ProjectKind;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith('en') ? 'en' : 'pl';
  const ids = useId();
  const s = useImport();
  const state = s.elements[item.id];
  const result = s.result;
  if (!state || !result) return null;
  const update = (change: Partial<ElementState>) => s.updateElement(item.id, change);
  const parts = partsOf(item, state);
  const described = isMain && parts.length === 1;
  const owner = (chart: number) =>
    kindItems(kind).find((it) => it.id !== item.id && s.elements[it.id]?.charts.includes(chart));
  const hint = item.type === 'part' ? item.hint?.[lang] : undefined;
  const count = item.type === 'part' && item.count && item.count > 1 ? item.count : 0;

  return (
    <>
      <h2 id={titleId} className="section-title part-panel__title">
        {item.label[lang]}
        {count > 0 && <span className="badge">{t('elements.times', { count })}</span>}
      </h2>
      {hint && <p className="hint">{hint}</p>}

      {!isMain && (
        <label className="check">
          <input
            type="checkbox"
            checked={state.include}
            onChange={(e) => update({ include: e.target.checked })}
          />
          {t('elements.include')}
        </label>
      )}

      {state.include && item.type === 'choice' && (
        <fieldset className="field">
          <legend>{t('elements.how')}</legend>
          <div className="segmented">
            {item.options.map((o) => (
              <label key={o.id} className="segmented__item">
                <input
                  type="radio"
                  name={`${ids}-opt`}
                  checked={state.option === o.id}
                  onChange={() => update({ option: o.id })}
                />
                <span>{o.label[lang]}</span>
              </label>
            ))}
          </div>
          {parts.length > 1 && (
            <p className="hint">
              {t('elements.pieces', { parts: parts.map((p) => p.label[lang]).join(', ') })}
            </p>
          )}
        </fieldset>
      )}

      {state.include && (
        <>
          {s.charts.length > 0 && (
            <fieldset className="field">
              <legend>{t('elements.chartsTitle')}</legend>
              <ul className="chart-picks">
                {s.charts.map((c, i) => {
                  const other = owner(i);
                  return (
                    <li key={i}>
                      <label className="check">
                        <input
                          type="checkbox"
                          checked={state.charts.includes(i)}
                          onChange={(e) =>
                            update({
                              charts: e.target.checked
                                ? [...state.charts, i]
                                : state.charts.filter((x) => x !== i),
                            })
                          }
                        />
                        <span>
                          {c.name}{' '}
                          <span className="hint num">
                            {t('editor.chartSize', { w: c.rows[0]?.length ?? 0, h: c.rows.length })}
                          </span>
                          {other && (
                            <span className="chart-picks__owner">
                              {' '}
                              {t('elements.chartIn', { part: other.label[lang] })}
                            </span>
                          )}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </fieldset>
          )}
          {state.charts.length === 0 && <p className="hint">{t('elements.noCharts')}</p>}
          {[...state.charts]
            .sort((a, b) => a - b)
            .map((i) => {
              const found = result.charts[i];
              const draft = s.charts[i];
              return found && draft ? (
                <ChartReview
                  key={i}
                  index={i}
                  found={found}
                  draft={draft}
                  result={result}
                  registry={registry}
                  selectable={false}
                />
              ) : null;
            })}
          {described && (
            <>
              <p className="hint">{t('elements.mainHint')}</p>
              <DescriptionReview headingLevel={3} />
            </>
          )}
          {isMain && !described && <p className="hint">{t('elements.piecesNoRound')}</p>}
        </>
      )}
    </>
  );
}

/** The project's name and sizes, and the button that creates it. */
function ProjectForm() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith('en') ? 'en' : 'pl';
  const ids = useId();
  const s = useImport();
  const [busy, setBusy] = useState(false);
  const parsedSizes = s.description.parsed.sizes?.value;
  const defaultTitle = useMemo(
    () =>
      s.projectName.slice(0, 120) ||
      (s.file?.name ?? '').replace(/\.[a-z0-9]+$/i, '').slice(0, 120) ||
      t('newProject.blankName'),
    [s.projectName, s.file, t],
  );
  const [title, setTitle] = useState(defaultTitle);
  const [sizesText, setSizesText] = useState<string | null>(null);
  const sizesValue = sizesText ?? (parsedSizes ?? [t('editor.oneSize')]).join(' - ');
  const sizes = splitSizes(sizesValue);

  const items = kindItems(s.projectKind);
  const included = items.filter((it) => s.elements[it.id]?.include);
  const patterns = included.flatMap((it) =>
    partsOf(it, s.elements[it.id]).map((p) => p.label[lang]),
  );
  const used = new Set(included.flatMap((it) => s.elements[it.id]?.charts ?? []));
  const uncertain = s.charts.reduce(
    (n, c, i) => n + (used.has(i) ? c.confidence.flat().filter((v) => v < UNCERTAIN).length : 0),
    0,
  );
  const unused = s.charts.length - used.size;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const id = await s.createProject({
        title: title.trim() || defaultTitle,
        sizes: sizes.length ? sizes : [t('editor.oneSize')],
        sections: [t('importer.front'), t('importer.back')],
        lang,
      });
      useImport.getState().reset();
      navigate(paths.project(id));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="editor-section" aria-labelledby={`${ids}-c`} onSubmit={(e) => void submit(e)}>
      <h2 id={`${ids}-c`} className="section-title">
        {t('importer.create')}
      </h2>
      <div className="form-grid">
        <TextField
          label={t('project.name')}
          value={title}
          required
          maxLength={120}
          onCommit={setTitle}
        />
        <TextField
          label={t('editor.sizes')}
          value={sizesValue}
          maxLength={200}
          hint={t('importer.sizesHint')}
          onCommit={setSizesText}
        />
      </div>
      <p className="hint">
        {t('elements.willCreate', { count: patterns.length, parts: patterns.join(', ') })}
      </p>
      {unused > 0 && (
        <p className="notice notice--warning" role="status">
          {t('elements.unused', { count: unused })}
        </p>
      )}
      {uncertain > 0 && (
        <p className="notice notice--warning" role="status">
          {t('importer.stillUncertain', { count: uncertain })}
        </p>
      )}
      <div className="form-actions">
        <button type="button" className="btn" onClick={() => useImport.getState().reset()}>
          {t('importer.otherFile')}
        </button>
        <button type="submit" className="btn btn--primary" disabled={busy}>
          {t('elements.create')}
        </button>
      </div>
    </form>
  );
}

import {
  createRegistry,
  PROJECT_KIND_INFO,
  PROJECT_KIND_LIST,
  type KindItem,
  type ProjectKind,
} from '@kt/core';
import { useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { navigate, paths } from '../lib/router';
import { TextField } from '../ui/fields';
import { Icon } from '../ui/Icon';
import { KIND_ICONS } from '../ui/kindIcons';
import { ChartReview } from './ChartReview';
import { kindItems, mainItemId, orderedItems, partsOf, type ElementState } from './elements';
import { GarmentDiagram } from './GarmentDiagram';
import { DescriptionReview, LegendReview, SymbolsReview } from './Reviews';
import { splitSizes, UNCERTAIN, useImport } from './session';

const registry = createRegistry();

/**
 * Checking a PDF for a new project, in two steps. First the garment of the recognised kind,
 * numbered in knitting order, where the knitter picks the parts to track. Then the details: for
 * the chosen part its own piece of the form — which charts it uses, its options, and for the main
 * part the description of a round.
 */
export function ElementsVerify() {
  const step = useImport((s) => s.step);
  const goTo = (next: 'parts' | 'details') => {
    useImport.getState().setStep(next);
    window.scrollTo({ top: 0 });
  };
  return step === 'parts' ? (
    <PartsStep onNext={() => goTo('details')} />
  ) : (
    <DetailsStep onBack={() => goTo('parts')} />
  );
}

/** Knitting order of each item (1 = first), and the items in that order. */
function useOrder() {
  const kind = useImport((s) => s.projectKind);
  const order = useImport((s) => s.order.order);
  return useMemo(() => {
    const items = orderedItems(kind, order);
    const numbers = Object.fromEntries(items.map((it, i) => [it.id, i + 1]));
    return { items, numbers };
  }, [kind, order]);
}

/** Step 1: the symbol of the kind, split into numbered parts; the knitter picks what to track. */
function PartsStep({ onNext }: { onNext(): void }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith('en') ? 'en' : 'pl';
  const ids = useId();
  const s = useImport();
  const kind = s.projectKind;
  const info = PROJECT_KIND_INFO[kind];
  const { items, numbers } = useOrder();
  const [hovered, setHovered] = useState<string | null>(null);
  const toggle = (id: string) =>
    s.updateElement(id, { include: !(s.elements[id]?.include ?? false) });
  const tracked = items.filter((it) => s.elements[it.id]?.include).length;
  const order = s.order;
  const orderText =
    order.source === 'headings'
      ? t('elements.orderHeadings', { words: order.evidence.join(', ') })
      : order.source === 'other-way' && info.otherWay
        ? t('elements.orderOtherWay', {
            way: info.otherWay.label[lang],
            words: order.evidence.join(', '),
          })
        : t('elements.orderUsual', { way: info.usualWay[lang] });

  return (
    <div className="verify parts-step">
      <div className="kind-line">
        <h2 className="kind-line__name">
          <Icon name={KIND_ICONS[kind]} size={32} />
          {info.label[lang]}
        </h2>
        <div className="field field--compact field--inline">
          <label htmlFor={`${ids}-k`}>{t('elements.kindChange')}</label>
          <select
            id={`${ids}-k`}
            value={kind}
            onChange={(e) => s.setProjectKind(e.target.value as ProjectKind)}
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

      {kind === 'custom' ? (
        <p className="lead">{t('elements.customParts')}</p>
      ) : (
        <div className="track">
          <GarmentDiagram
            kind={kind}
            elements={s.elements}
            selected={null}
            hovered={hovered}
            onSelect={toggle}
            onHover={setHovered}
            numbers={numbers}
            size="large"
          />
          <fieldset className="track__list">
            <legend className="section-title">{t('elements.trackTitle')}</legend>
            <p className="hint">
              {t('elements.trackHint')} {info.pair && t('elements.pair')}
            </p>
            <ol className="track-list">
              {items.map((it) => {
                const on = s.elements[it.id]?.include ?? false;
                const count = it.type === 'part' && it.count && it.count > 1 ? it.count : 0;
                return (
                  <li key={it.id}>
                    <label
                      className={`track-item${hovered === it.id ? ' is-hover' : ''}${on ? '' : ' is-off'}`}
                      data-part={it.id}
                      onPointerEnter={() => setHovered(it.id)}
                      onPointerLeave={() => setHovered(null)}
                    >
                      <span className="track-item__no" aria-hidden="true">
                        {numbers[it.id]}
                      </span>
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggle(it.id)}
                        onFocus={() => setHovered(it.id)}
                        onBlur={() => setHovered(null)}
                      />
                      <span className="track-item__name">
                        <span className="visually-hidden">{numbers[it.id]}. </span>
                        {it.label[lang]}
                        {count > 0 && ` ×${count}`}
                      </span>
                      {it.type === 'part' && it.optional && (
                        <span className="track-item__note">{t('elements.optional')}</span>
                      )}
                    </label>
                  </li>
                );
              })}
            </ol>
            <p className="hint">{orderText}</p>
          </fieldset>
        </div>
      )}

      <div className="form-actions">
        <button type="button" className="btn" onClick={() => s.reset()}>
          {t('importer.otherFile')}
        </button>
        <button
          type="button"
          className="btn btn--primary"
          disabled={kind !== 'custom' && tracked === 0}
          onClick={onNext}
        >
          {kind === 'custom' ? t('elements.next') : t('elements.nextCount', { count: tracked })}
        </button>
      </div>
    </div>
  );
}

/** Step 2: the tracked parts, each with its own piece of the form, and the project's details. */
function DetailsStep({ onBack }: { onBack(): void }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith('en') ? 'en' : 'pl';
  const ids = useId();
  const s = useImport();
  const kind = s.projectKind;
  const { items: ordered, numbers } = useOrder();
  const items = ordered.filter((it) => s.elements[it.id]?.include);
  const main = mainItemId(kind);
  const [chosen, setChosen] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const panel = useRef<HTMLElement>(null);
  const selected =
    (chosen && items.some((i) => i.id === chosen) ? chosen : null) ??
    (items.some((i) => i.id === main) ? main : items[0]?.id);
  const item = items.find((i) => i.id === selected);
  const result = s.result;
  if (!result) return null;

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
  const kindLabel = PROJECT_KIND_INFO[kind].label[lang];

  return (
    <div className="verify">
      <p className="page__back">
        <button type="button" className="link-back" onClick={onBack}>
          <Icon name="back" size={18} />
          {t('elements.backToParts')}
        </button>
      </p>
      <p className="lead" role="status">
        {result.charts.length === 0
          ? t('elements.noChartsFound')
          : t('importer.found', { count: result.charts.length })}
      </p>

      {kind !== 'custom' && (
        <section className="editor-section" aria-labelledby={`${ids}-parts`}>
          <h2 id={`${ids}-parts`} className="section-title">
            {t('elements.partsTitle', { kind: kindLabel })}
          </h2>
          <p className="hint">{t('elements.partsHint')}</p>
          <div className="garment">
            <GarmentDiagram
              kind={kind}
              elements={s.elements}
              selected={selected ?? null}
              hovered={hovered}
              onSelect={select}
              onHover={setHovered}
              numbers={numbers}
              inert={(id) => !s.elements[id]?.include}
            />
            <ul
              className="garment__parts"
              aria-label={t('elements.partsTitle', { kind: kindLabel })}
            >
              {items.map((it) => (
                <li key={it.id}>
                  <PartButton
                    item={it}
                    number={numbers[it.id]}
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

      {item && (
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
            number={kind === 'custom' ? undefined : numbers[item.id]}
            isMain={item.id === main}
            kind={kind}
          />
        </section>
      )}

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
  number,
  state,
  selected,
  hovered,
  onSelect,
  onHover,
}: {
  item: KindItem;
  number: number | undefined;
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
        {number !== undefined && <span className="part-button__no">{number}</span>}
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
  number,
  isMain,
  kind,
}: {
  titleId: string;
  item: KindItem;
  number: number | undefined;
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
    kindItems(kind).find(
      (it) =>
        it.id !== item.id &&
        s.elements[it.id]?.include &&
        s.elements[it.id]?.charts.includes(chart),
    );
  const hint = item.type === 'part' ? item.hint?.[lang] : undefined;
  const count = item.type === 'part' && item.count && item.count > 1 ? item.count : 0;

  return (
    <>
      <h2 id={titleId} className="section-title part-panel__title">
        {number !== undefined && <span className="part-button__no">{number}</span>}
        {item.label[lang]}
        {count > 0 && <span className="badge">{t('elements.times', { count })}</span>}
      </h2>
      {hint && <p className="hint">{hint}</p>}

      {item.type === 'choice' && (
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

  const items = orderedItems(s.projectKind, s.order.order);
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

import {
  createRegistry,
  PROJECT_KIND_INFO,
  PROJECT_KIND_LIST,
  resolvePattern,
  type KindItem,
  type Project,
  type ProjectKind,
  type ResolvedPattern,
} from '@kt/core';
import { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { navigate, paths } from '../lib/router';
import { PatternPreview } from '../editor/PatternPreview';
import { TextField } from '../ui/fields';
import { Icon } from '../ui/Icon';
import { KIND_ICONS } from '../ui/kindIcons';
import { ChartReview } from './ChartReview';
import {
  describedSequence,
  kindItems,
  mainItemId,
  orderedItems,
  partsOf,
  type ElementState,
} from './elements';
import { GarmentDiagram } from './GarmentDiagram';
import { DescriptionReview, LegendReview, SymbolsReview } from './Reviews';
import {
  pendingSymbols,
  splitSizes,
  UNCERTAIN,
  useImport,
  type CreateProjectInput,
  type ImportStep,
} from './session';

const registry = createRegistry();

/**
 * Checking a PDF for a new project, step by step: the size being knitted, the legend, the
 * garment of the recognised kind (numbered in knitting order) where the knitter picks the parts
 * to track, and a preview of their grids. The project is created after the preview.
 */
export function ElementsVerify() {
  const step = useImport((s) => s.step);
  const result = useImport((s) => s.result);
  // Nothing to confirm in a legend when the file has neither a legend nor charts.
  const steps: readonly ImportStep[] =
    result && (result.legend.length > 0 || result.charts.length > 0)
      ? ['size', 'legend', 'parts', 'preview']
      : ['size', 'parts', 'preview'];
  const at = Math.max(0, steps.indexOf(step));
  const goTo = (next: ImportStep | undefined) => {
    if (!next) return;
    useImport.getState().setStep(next);
    window.scrollTo({ top: 0 });
  };
  const back = () => goTo(steps[at - 1]);
  const next = () => goTo(steps[at + 1]);
  return (
    <>
      <Steps steps={steps} at={at} onGo={goTo} />
      {step === 'size' && <SizeStep onNext={next} />}
      {step === 'legend' && <LegendStep onBack={back} onNext={next} />}
      {step === 'parts' && <PartsStep onBack={back} onNext={next} />}
      {step === 'preview' && <PreviewStep onSize={() => goTo('size')} />}
    </>
  );
}

/** Where the knitter is in the check; earlier steps can be reopened. */
function Steps({
  steps,
  at,
  onGo,
}: {
  steps: readonly ImportStep[];
  at: number;
  onGo(step: ImportStep): void;
}) {
  const { t } = useTranslation();
  return (
    <ol className="steps" aria-label={t('elements.stepsLabel')}>
      {steps.map((st, i) => (
        <li
          key={st}
          className={`steps__item${i === at ? ' is-current' : ''}${i < at ? ' is-done' : ''}`}
          aria-current={i === at ? 'step' : undefined}
        >
          {i < at ? (
            <button type="button" className="steps__link" onClick={() => onGo(st)}>
              <span className="steps__no">{i + 1}</span>
              {t(`elements.step.${st}`)}
            </button>
          ) : (
            <span className="steps__link">
              <span className="steps__no">{i + 1}</span>
              {t(`elements.step.${st}`)}
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}

/** Step 1: which size is knitted; the sizes come from the description and can be corrected. */
function SizeStep({ onNext }: { onNext(): void }) {
  const { t } = useTranslation();
  const ids = useId();
  const s = useImport();
  const found = s.description.parsed.sizes;
  const text = s.description.text;
  // The line the sizes were read from, so the knitter can compare.
  const quote = found ? lineAround(text, found.span.start, found.span.end) : null;
  const [editing, setEditing] = useState(s.sizes.length === 0);
  // The typed text stays as typed ("S - "); the list of sizes follows it.
  const [sizesText, setSizesText] = useState(() => s.sizes.join(' - '));
  return (
    <section className="verify size-step" aria-labelledby={`${ids}-t`}>
      <h2 id={`${ids}-t`} className="section-title">
        {t('elements.sizeTitle')}
      </h2>
      {quote ? (
        <p className="hint">
          {t('elements.sizesFound')} <q className="quote">{quote}</q>
        </p>
      ) : (
        <p className="hint">{t('elements.sizesNone')}</p>
      )}
      {s.sizes.length > 0 ? (
        <div className="size-tiles" role="radiogroup" aria-labelledby={`${ids}-t`}>
          {s.sizes.map((size, i) => (
            <label key={`${size}-${i}`} className="size-tile">
              <input
                type="radio"
                name={`${ids}-size`}
                checked={s.chosenSize() === i}
                onChange={() => s.setSizeIndex(i)}
              />
              <span>{size}</span>
            </label>
          ))}
        </div>
      ) : (
        <p className="lead">{t('elements.oneSize')}</p>
      )}
      {editing ? (
        <TextField
          label={t('editor.sizes')}
          value={sizesText}
          maxLength={200}
          hint={t('elements.sizesEditHint')}
          onCommit={(v) => {
            setSizesText(v);
            s.setSizes(splitSizes(v));
          }}
        />
      ) : (
        <button type="button" className="btn size-step__edit" onClick={() => setEditing(true)}>
          {t('elements.sizesEdit')}
        </button>
      )}
      <div className="form-actions">
        <button type="button" className="btn" onClick={() => s.reset()}>
          {t('importer.otherFile')}
        </button>
        <button type="button" className="btn btn--primary" onClick={onNext}>
          {s.sizes.length > 0
            ? t('elements.sizeNext', { size: s.sizes[s.chosenSize()] ?? '' })
            : t('elements.next')}
        </button>
      </div>
    </section>
  );
}

/** The line of `text` holding [start, end), shortened around it when long. */
function lineAround(text: string, start: number, end: number): string {
  const from = text.lastIndexOf('\n', start - 1) + 1;
  const to = text.indexOf('\n', end);
  const line = text
    .slice(from, to < 0 ? undefined : to)
    .replace(/\s+/g, ' ')
    .trim();
  if (line.length <= 80) return line;
  const at = start - from;
  return `…${line.slice(Math.max(0, at - 30), at + (end - start) + 30).trim()}…`;
}

/** Step 2: the legend read from the file (or the symbols used, when it has none). */
function LegendStep({ onBack, onNext }: { onBack(): void; onNext(): void }) {
  const { t } = useTranslation();
  const s = useImport();
  const result = s.result;
  if (!result) return null;
  const pending = pendingSymbols(s.legend, result);
  const confirm = () => {
    onNext();
    // A changed legend means the charts are read again with the confirmed symbols.
    if (pending) void s.rerun(pending);
  };
  return (
    <div className="verify legend-step">
      {result.legend.length > 0 ? <LegendReview items={result.legend} /> : <SymbolsReview />}
      <div className="form-actions">
        <button type="button" className="btn" onClick={onBack}>
          {t('common.back')}
        </button>
        <button type="button" className="btn btn--primary" onClick={confirm}>
          {t('elements.legendConfirm')}
        </button>
      </div>
    </div>
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

/** Step 3: the symbol of the kind, split into numbered parts; the knitter picks what to track. */
function PartsStep({ onBack, onNext }: { onBack(): void; onNext(): void }) {
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
        <button type="button" className="btn" onClick={onBack}>
          {t('common.back')}
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

/** One pattern the project will have: a part of a tracked item, with the item's number. */
interface PreviewPart {
  readonly patternId: string;
  readonly label: string;
  readonly number: number | undefined;
  readonly item: KindItem;
}

/**
 * Step 4: the grid of each tracked part as it will be knitted, with what it was built from. The
 * project is created only when the knitter agrees; corrections are optional ("Popraw").
 */
function PreviewStep({ onSize }: { onSize(): void }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith('en') ? 'en' : 'pl';
  const ids = useId();
  const s = useImport();
  const { items, numbers } = useOrder();
  const defaultTitle = useMemo(
    () =>
      s.projectName.slice(0, 120) ||
      (s.file?.name ?? '').replace(/\.[a-z0-9]+$/i, '').slice(0, 120) ||
      t('newProject.blankName'),
    [s.projectName, s.file, t],
  );
  const [title, setTitle] = useState(defaultTitle);
  const [fixing, setFixing] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sizes = useMemo(() => (s.sizes.length > 0 ? s.sizes : [t('editor.oneSize')]), [s.sizes, t]);
  const input = useMemo(
    (): CreateProjectInput => ({
      title: title.trim() || defaultTitle,
      sizes,
      sections: [t('importer.front'), t('importer.back')] as const,
      lang,
    }),
    [title, defaultTitle, sizes, t, lang],
  );
  // Rebuilt whenever anything the project is made of changes.
  const draft = useMemo(
    () => useImport.getState().draftProject(input),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the session's data the draft reads
    [input, s.elements, s.charts, s.legend, s.result, s.description, s.sizeIndex, s.order],
  );
  const parts: PreviewPart[] = items
    .filter((it) => s.elements[it.id]?.include)
    .flatMap((it) =>
      partsOf(it, s.elements[it.id]).map((p) => ({
        patternId: p.id,
        label: p.label[lang],
        number: s.projectKind === 'custom' ? undefined : numbers[it.id],
        item: it,
      })),
    )
    .filter((p) => draft.patterns.some((x) => x.id === p.patternId));
  const main = mainItemId(s.projectKind);
  const part =
    parts.find((p) => p.patternId === chosen) ?? parts.find((p) => p.item.id === main) ?? parts[0];
  if (!s.result || !part) return null;

  const create = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const id = await s.createProject(input);
      useImport.getState().reset();
      navigate(paths.tracker(id, part.patternId));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="verify preview-step">
      {parts.length > 1 && (
        <div className="preview-tabs" role="group" aria-label={t('preview.partsLabel')}>
          {parts.map((p) => (
            <button
              key={p.patternId}
              type="button"
              className="preview-tab"
              aria-pressed={p.patternId === part.patternId}
              onClick={() => setChosen(p.patternId)}
            >
              {p.number !== undefined && <span className="part-button__no">{p.number}</span>}
              {p.label}
            </button>
          ))}
        </div>
      )}
      {fixing ? (
        <FixPart
          key={part.patternId}
          part={part}
          title={title}
          onTitle={setTitle}
          draft={draft}
          onSize={onSize}
          headingId={`${ids}-h`}
        />
      ) : (
        <PartPreview key={part.patternId} part={part} draft={draft} headingId={`${ids}-h`} />
      )}
      <ProjectNotes draft={draft} />
      <div className="form-actions preview-step__actions">
        {fixing ? (
          <button type="button" className="btn btn--primary" onClick={() => setFixing(false)}>
            {t('preview.backToPreview')}
          </button>
        ) : (
          <>
            <button type="button" className="btn" onClick={() => setFixing(true)}>
              {t('preview.fix')}
            </button>
            <button
              type="button"
              className="btn btn--primary"
              disabled={busy}
              onClick={() => void create()}
            >
              {t('preview.start')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/** The part's pattern resolved at the chosen size, or null when it can't be built. */
function useResolved(draft: Project, patternId: string): ResolvedPattern | null {
  return useMemo(() => {
    try {
      return resolvePattern(draft, patternId, { sizeIndex: draft.sizeIndex, registry });
    } catch {
      return null;
    }
  }, [draft, patternId]);
}

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
const lcm = (a: number, b: number) => (a > 0 && b > 0 ? (a / gcd(a, b)) * b : Math.max(a, b));

/** What the part's grid is built from, in a few lines. */
function useFacts(part: PreviewPart, stage: ResolvedPattern | null) {
  const { t } = useTranslation();
  const s = useImport();
  const state = s.elements[part.item.id];
  const charts = state?.charts ?? [];
  const uncertain = charts.reduce(
    (n, i) => n + (s.charts[i]?.confidence.flat().filter((v) => v < UNCERTAIN).length ?? 0),
    0,
  );
  const described =
    part.item.id === mainItemId(s.projectKind) &&
    partsOf(part.item, state).length === 1 &&
    describedSequence(
      { sequence: s.description.parsed.sequence?.value ?? [], sectionNames: ['', ''] },
      charts.flatMap((i) => (s.charts[i] ? [s.charts[i]] : [])),
    ) !== null;
  const layout = stage
    ? [...stage.zones]
        .sort((a, b) => a.firstStitch - b.firstStitch)
        .map((z) => z.label)
        .join(' · ')
    : '';
  const round = stage?.pattern.construction !== 'flat';
  // Charts of different heights line up again after the least common multiple of their heights.
  const repeat = stage ? stage.zones.reduce((m, z) => lcm(m, z.chart.chart.height), 1) : 0;
  return {
    charts,
    uncertain,
    described,
    stitches: stage
      ? t(round ? 'preview.stitchesRound' : 'preview.stitchesFlat', { count: stage.stitchCount })
      : '',
    layout: layout
      ? t(described ? 'preview.layoutDescribed' : 'preview.layoutSideBySide', { charts: layout })
      : '',
    repeat:
      repeat > 0 ? t(round ? 'preview.repeatRound' : 'preview.repeatFlat', { count: repeat }) : '',
  };
}

function PartPreview({
  part,
  draft,
  headingId,
}: {
  part: PreviewPart;
  draft: Project;
  headingId: string;
}) {
  const { t } = useTranslation();
  const s = useImport();
  const stage = useResolved(draft, part.patternId);
  const facts = useFacts(part, stage);
  const size = s.sizes[s.chosenSize()];
  const tracked = Object.values(s.elements).filter((e) => e.include).length;
  return (
    <section className="part-preview" aria-labelledby={headingId}>
      <h2 id={headingId} className="section-title part-panel__title">
        {part.number !== undefined && <span className="part-button__no">{part.number}</span>}
        {size ? t('preview.title', { part: part.label, size }) : part.label}
      </h2>
      {facts.charts.length === 0 ? (
        <div className="notice notice--warning">
          <p>{t('preview.noCharts')}</p>
          {tracked > 1 && (
            <button
              type="button"
              className="btn"
              onClick={() => s.updateElement(part.item.id, { include: false })}
            >
              {t('preview.skipPart')}
            </button>
          )}
        </div>
      ) : (
        <>
          <ul className="facts-list">
            {[facts.stitches, facts.layout, facts.repeat].filter(Boolean).map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          {facts.uncertain > 0 && (
            <p className="chip-warn">{t('preview.uncertain', { count: facts.uncertain })}</p>
          )}
          {stage ? (
            <PatternPreview stage={stage} />
          ) : (
            <p className="notice notice--danger">{t('preview.cannotBuild')}</p>
          )}
        </>
      )}
    </section>
  );
}

/** Corrections for one part, each folded until needed. */
function FixPart({
  part,
  title,
  onTitle,
  draft,
  onSize,
  headingId,
}: {
  part: PreviewPart;
  title: string;
  onTitle(title: string): void;
  draft: Project;
  onSize(): void;
  headingId: string;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith('en') ? 'en' : 'pl';
  const ids = useId();
  const s = useImport();
  const result = s.result;
  const item = part.item;
  const state = s.elements[item.id];
  const stage = useResolved(draft, part.patternId);
  const facts = useFacts(part, stage);
  if (!state || !result) return null;
  const update = (change: Partial<ElementState>) => s.updateElement(item.id, change);
  const owner = (chart: number) =>
    kindItems(s.projectKind).find(
      (it) =>
        it.id !== item.id &&
        s.elements[it.id]?.include &&
        s.elements[it.id]?.charts.includes(chart),
    );
  const names = state.charts
    .map((i) => s.charts[i]?.name)
    .filter(Boolean)
    .join(', ');
  const size = s.sizes[s.chosenSize()] ?? t('elements.oneSize');
  return (
    <section className="fix-part" aria-labelledby={headingId}>
      <h2 id={headingId} className="section-title part-panel__title">
        {t('preview.fixTitle', { part: part.label })}
      </h2>

      <details className="fix" open={facts.uncertain > 0}>
        <summary>
          <b>{t('preview.fixCells')}</b>
          <span>
            {facts.charts.length === 0
              ? t('preview.none')
              : facts.uncertain > 0
                ? t('preview.uncertain', { count: facts.uncertain })
                : t('preview.allSure')}
          </span>
        </summary>
        {[...state.charts]
          .sort((a, b) => a - b)
          .map((i) => {
            const found = result.charts[i];
            const draftChart = s.charts[i];
            return found && draftChart ? (
              <ChartReview
                key={i}
                index={i}
                found={found}
                draft={draftChart}
                result={result}
                registry={registry}
                selectable={false}
              />
            ) : null;
          })}
      </details>

      {s.charts.length > 0 && (
        <details className="fix">
          <summary>
            <b>{t('preview.fixCharts')}</b>
            <span>{names || t('preview.none')}</span>
          </summary>
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
        </details>
      )}

      {item.type === 'choice' && (
        <details className="fix">
          <summary>
            <b>{t('elements.how')}</b>
            <span>{item.options.find((o) => o.id === state.option)?.label[lang]}</span>
          </summary>
          <div className="segmented" role="radiogroup" aria-label={t('elements.how')}>
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
        </details>
      )}

      {facts.described && (
        <details className="fix">
          <summary>
            <b>{t('preview.fixLayout')}</b>
            <span>{facts.layout}</span>
          </summary>
          <DescriptionReview headingLevel={3} />
        </details>
      )}

      <details className="fix">
        <summary>
          <b>{t('preview.fixSize')}</b>
          <span>{[t('preview.sizeIs', { size }), facts.stitches].filter(Boolean).join(' · ')}</span>
        </summary>
        <p className="hint">{t('preview.stitchesFrom')}</p>
        <button type="button" className="btn" onClick={onSize}>
          {t('preview.changeSize')}
        </button>
      </details>

      <details className="fix">
        <summary>
          <b>{t('project.name')}</b>
          <span>{title}</span>
        </summary>
        <TextField
          label={t('project.name')}
          value={title}
          required
          maxLength={120}
          onCommit={onTitle}
        />
      </details>
    </section>
  );
}

/** What else the project will hold, and charts that went to no part. */
function ProjectNotes({ draft }: { draft: Project }) {
  const { t } = useTranslation();
  const s = useImport();
  const used = new Set(
    Object.values(s.elements)
      .filter((e) => e.include)
      .flatMap((e) => e.charts),
  );
  const unused = s.charts.length - used.size;
  return (
    <>
      <p className="hint">
        {t('elements.willCreate', {
          count: draft.patterns.length,
          parts: draft.patterns.map((p) => p.name).join(', '),
        })}
      </p>
      {unused > 0 && (
        <p className="notice notice--warning" role="status">
          {t('elements.unused', { count: unused })}
        </p>
      )}
    </>
  );
}

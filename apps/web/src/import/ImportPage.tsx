import { createRegistry } from '@kt/core';
import { UPLOAD_LIMITS, type ImportProgress, type LegendItem } from '@kt/importer';
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from '../lib/Link';
import { navigate, paths } from '../lib/router';
import { AppHeader } from '../routes/AppHeader';
import { TextField } from '../ui/fields';
import { Icon } from '../ui/Icon';
import { SymbolGlyph } from '../ui/SymbolGlyph';
import { ChartReview } from './ChartReview';
import { checkFile, ImportError } from './client';
import { useLibrary } from '../state/library';
import { UNCERTAIN, useImport, type CreateInput } from './session';
import { StraightenStep } from './StraightenStep';

const registry = createRegistry();

/**
 * "From file to grid" (FR-1): pick a PDF or a picture, check what was recognised, create the
 * pattern — in a new project, or as a new pattern of `projectId`.
 */
export function ImportPage({ projectId }: { projectId?: string } = {}) {
  const { t } = useTranslation();
  const s = useImport();
  const project = useLibrary((st) => (projectId ? st.project(projectId) : undefined));

  return (
    <>
      <AppHeader />
      <main className="page page--wide" id="main">
        <p className="page__back">
          {project ? (
            <Link to={paths.project(project.id)} className="link-back">
              <Icon name="back" size={18} />
              {project.name}
            </Link>
          ) : (
            <Link to={paths.new()} className="link-back">
              <Icon name="back" size={18} />
              {t('newProject.title')}
            </Link>
          )}
        </p>
        <h1 className="page__title">
          {project ? t('importer.titleAdd', { name: project.name }) : t('importer.title')}
        </h1>
        {(s.status === 'idle' || s.status === 'error') && <PickFile error={s.error} />}
        {s.status === 'straighten' && s.preview && (
          <StraightenStep image={s.preview} onRun={(c) => void s.run(c)} onCancel={s.reset} />
        )}
        {s.status === 'running' && <Progress progress={s.progress} onCancel={s.reset} />}
        {s.status === 'verify' && <Verify projectId={project?.id} />}
      </main>
    </>
  );
}

function PickFile({ error }: { error: string | null }) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const [local, setLocal] = useState<string | null>(null);
  const shown = local ?? error;
  const pick = async (file: File | undefined) => {
    if (!file) return;
    setLocal(null);
    try {
      await useImport.getState().start(await checkFile(file));
    } catch (e) {
      setLocal(e instanceof ImportError ? e.code : 'unreadable');
    } finally {
      if (input.current) input.current.value = '';
    }
  };
  return (
    <section className="choose">
      <p className="lead">{t('importer.intro')}</p>
      <div className="choose__actions">
        <label className="btn btn--primary btn--file">
          <Icon name="upload" />
          {t('importer.pick')}
          <input
            ref={input}
            type="file"
            accept="application/pdf,.pdf,image/png,image/jpeg,image/webp"
            className="visually-hidden"
            onChange={(e) => void pick(e.target.files?.[0])}
          />
        </label>
      </div>
      <p className="hint">
        {t('importer.limits', {
          mb: Math.round(UPLOAD_LIMITS.maxBytes / 1024 / 1024),
          pages: UPLOAD_LIMITS.maxPdfPages,
        })}
      </p>
      <p className="hint">{t('importer.privacy')}</p>
      {shown && (
        <p className="notice notice--danger" role="alert">
          {t(`importer.errors.${shown}`, { defaultValue: t('importer.errors.unreadable') })}
        </p>
      )}
    </section>
  );
}

function Progress({ progress, onCancel }: { progress: ImportProgress | null; onCancel(): void }) {
  const { t } = useTranslation();
  const text = !progress
    ? t('importer.progress.start')
    : progress.stage === 'reading'
      ? progress.page
        ? t('importer.progress.page', { page: progress.page, pages: progress.pages })
        : t('importer.progress.reading')
      : progress.stage === 'grids'
        ? t('importer.progress.grids', { done: progress.done + 1, total: progress.total })
        : t(`importer.progress.${progress.stage}`);
  return (
    <section className="import-progress" aria-busy="true">
      <div className="import-progress__bar" aria-hidden="true" />
      <p role="status">{text}</p>
      <button type="button" className="btn" onClick={onCancel}>
        {t('common.cancel')}
      </button>
    </section>
  );
}

function Verify({ projectId }: { projectId?: string | undefined }) {
  const { t } = useTranslation();
  const ids = useId();
  const s = useImport();
  const result = s.result;
  const [busy, setBusy] = useState(false);
  const uncertain = s.charts.reduce(
    (n, c) => n + (c.include ? c.confidence.flat().filter((v) => v < UNCERTAIN).length : 0),
    0,
  );
  if (!result) return null;
  const included = s.charts.filter((c) => c.include);

  return (
    <div className="verify">
      <p className="lead" role="status">
        {result.charts.length === 0
          ? t('importer.none')
          : t('importer.found', { count: result.charts.length })}
      </p>
      {result.legend.length > 0 && <LegendReview items={result.legend} />}
      {result.legend.length === 0 && result.charts.length > 0 && <SymbolsReview />}

      <section className="editor-section" aria-labelledby={`${ids}-charts`}>
        <h2 id={`${ids}-charts`} className="section-title">
          {t('importer.charts')}
        </h2>
        <p className="hint">{t('importer.chartsHint')}</p>
        {result.charts.map((c, i) => {
          const draft = s.charts[i];
          return draft ? (
            <ChartReview
              key={i}
              index={i}
              found={c}
              draft={draft}
              result={result}
              registry={registry}
            />
          ) : null;
        })}
      </section>

      <DescriptionReview />

      <CreateForm
        projectId={projectId}
        disabled={included.length === 0 || busy}
        uncertain={uncertain}
        onCreate={async (input) => {
          setBusy(true);
          try {
            const created = await useImport.getState().create(input);
            if (!created) return;
            useImport.getState().reset();
            navigate(paths.pattern(created.projectId, created.patternId));
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
}

function LegendReview({ items }: { items: readonly LegendItem[] }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith('en') ? 'en' : 'pl';
  const ids = useId();
  const chosen = useImport((s) => s.legend);
  const result = useImport((s) => s.result);
  const symbols = [...new Set(chosen.filter((x): x is string => !!x))];
  const changed = result
    ? symbols.slice().sort().join() !== [...result.symbols].sort().join()
    : false;
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
            <p className="legend-review__text">{item.text}</p>
            <div className="field field--compact">
              <label htmlFor={`${ids}-s${i}`}>{t('importer.symbol')}</label>
              <select
                id={`${ids}-s${i}`}
                value={chosen[i] ?? ''}
                onChange={(e) => useImport.getState().setLegend(i, e.target.value || null)}
              >
                <option value="">{t('importer.notStitch')}</option>
                {registry
                  .all()
                  .filter((d) => d.width === item.cells)
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.label[lang]}
                      {d.numbers?.['drops'] ? ` (${d.numbers['drops']})` : ''}
                    </option>
                  ))}
              </select>
            </div>
            {chosen[i] && (
              <span className="legend-review__glyph" aria-hidden="true">
                <SymbolGlyph
                  glyph={registry.require(chosen[i] ?? 'std:k').glyph}
                  width={item.cells}
                  cell={22}
                />
              </span>
            )}
          </li>
        ))}
      </ul>
      {changed && symbols.length > 0 && (
        <button
          type="button"
          className="btn"
          onClick={() => void useImport.getState().rerun(symbols)}
        >
          {t('importer.rerun')}
        </button>
      )}
    </section>
  );
}

function SymbolsReview() {
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

function DescriptionReview() {
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
      <h2 id={`${ids}-d`} className="section-title">
        {t('importer.description')}
      </h2>
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

function CreateForm({
  projectId,
  disabled,
  uncertain,
  onCreate,
}: {
  projectId: string | undefined;
  disabled: boolean;
  uncertain: number;
  onCreate(input: CreateInput): Promise<void>;
}) {
  const { t } = useTranslation();
  const ids = useId();
  const project = useLibrary((st) => (projectId ? st.project(projectId) : undefined));
  const suggestedName =
    project && project.patterns.length > 0
      ? t('editor.stageName', { n: project.patterns.length + 1 })
      : t('editor.firstStage');
  const [patternName, setPatternName] = useState(suggestedName);
  const file = useImport((s) => s.file);
  const parsedSizes = useImport((s) => s.description.parsed.sizes?.value);
  const typedName = useImport((s) => s.projectName);
  // The name typed on the "new project" screen wins over the file name.
  const defaultTitle = useMemo(
    () =>
      typedName.slice(0, 120) ||
      (file?.name ?? '').replace(/\.[a-z0-9]+$/i, '').slice(0, 120) ||
      t('newProject.blankName'),
    [typedName, file, t],
  );
  const [title, setTitle] = useState(defaultTitle);
  const [sizesText, setSizesText] = useState<string | null>(null);
  const sizesValue = sizesText ?? (parsedSizes ?? [t('editor.oneSize')]).join(' - ');
  const sizes = sizesValue
    .split(/\s*-\s*|\s*,\s*/)
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => x.slice(0, 20));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void onCreate({
      ...(project ? { projectId: project.id } : {}),
      title: title.trim() || defaultTitle,
      sizes: sizes.length ? sizes : [t('editor.oneSize')],
      patternName: patternName.trim().slice(0, 60) || suggestedName,
      sections: [t('importer.front'), t('importer.back')],
    });
  };
  return (
    <form className="editor-section" aria-labelledby={`${ids}-c`} onSubmit={submit}>
      <h2 id={`${ids}-c`} className="section-title">
        {t(project ? 'importer.createInProject' : 'importer.create')}
      </h2>
      <div className="form-grid">
        {!project && (
          <TextField
            label={t('project.name')}
            value={title}
            required
            maxLength={120}
            onCommit={setTitle}
          />
        )}
        <TextField
          label={t('project.patternName')}
          value={patternName}
          required
          maxLength={60}
          onCommit={setPatternName}
        />
        {!project && (
          <TextField
            label={t('editor.sizes')}
            value={sizesValue}
            maxLength={200}
            hint={t('importer.sizesHint')}
            onCommit={setSizesText}
          />
        )}
      </div>
      {project && (
        <p className="hint">{t('importer.projectSizes', { sizes: project.sizes.join(' – ') })}</p>
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
        <button type="submit" className="btn btn--primary" disabled={disabled}>
          {t('importer.createButton')}
        </button>
      </div>
    </form>
  );
}

import {
  readPatternFile,
  validatePattern,
  type Diagnostic,
  type Modification,
  type Pattern,
} from '@kt/core';
import { useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { createBlankPattern } from '../editor/createBlankPattern';
import { readTextFile } from '../lib/files';
import { Link } from '../lib/Link';
import { navigate, paths } from '../lib/router';
import type { StoredPattern } from '../lib/storage';
import { samplePattern } from '../sample/samplePattern';
import { useLibrary } from '../state/library';
import { useDiagnosticText } from '../ui/diagnosticText';
import { Icon } from '../ui/Icon';
import { AppHeader } from './AppHeader';

interface Loaded {
  readonly pattern: Pattern;
  readonly source: StoredPattern['source'];
  readonly fileName?: string;
  /** Already on the device (a pattern from the library or the editor). */
  readonly stored?: StoredPattern;
}

/** "From file to grid": pick a pattern file (or the sample), check it, set up the project (FR-1 subset for M2). */
export function NewProjectPage({ patternId }: { patternId?: string } = {}) {
  const { t } = useTranslation();
  const preset = useLibrary((s) =>
    patternId ? s.patterns.find((p) => p.id === patternId) : undefined,
  );
  const [picked, setLoaded] = useState<Loaded | null>(null);
  const loaded: Loaded | null =
    picked ?? (preset ? { pattern: preset.pattern, source: preset.source, stored: preset } : null);
  const [errors, setErrors] = useState<readonly string[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setErrors([]);
    try {
      const result = readPatternFile(await readTextFile(file));
      if (!result.ok) {
        setErrors(result.errors);
        setLoaded(null);
        return;
      }
      setLoaded({ pattern: result.value, source: 'file', fileName: file.name });
    } catch (e) {
      setErrors([
        e instanceof Error && e.message === 'too-large'
          ? t('newProject.tooLarge')
          : t('newProject.unreadable'),
      ]);
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  return (
    <>
      <AppHeader />
      <main className="page" id="main">
        <p className="page__back">
          <Link to={paths.projects()} className="link-back">
            <Icon name="back" size={18} />
            {t('nav.projects')}
          </Link>
        </p>
        <h1 className="page__title">{t('newProject.title')}</h1>
        {!loaded ? (
          <section className="choose">
            <p className="lead">{t('newProject.intro')}</p>
            <div className="choose__actions">
              <label className="btn btn--primary btn--file">
                <Icon name="upload" />
                {t('newProject.pickFile')}
                <input
                  ref={fileInput}
                  type="file"
                  accept=".json,application/json"
                  className="visually-hidden"
                  onChange={(e) => void onFile(e.target.files?.[0])}
                />
              </label>
              <button
                type="button"
                className="btn"
                onClick={() =>
                  void createBlankPattern(
                    t('editor.newTitle'),
                    t('editor.oneSize'),
                    t('editor.firstStage'),
                  )
                }
              >
                <Icon name="edit" />
                {t('newProject.fromScratch')}
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => setLoaded({ pattern: samplePattern, source: 'sample' })}
              >
                {t('newProject.useSample')}
              </button>
            </div>
            {useLibrary.getState().patterns.length > 0 && (
              <p className="hint">
                {t('newProject.fromLibrary')} <Link to={paths.patterns()}>{t('nav.patterns')}</Link>
              </p>
            )}
            <p className="hint">{t('newProject.privacy')}</p>
            {errors.length > 0 && (
              <div className="notice notice--danger" role="alert">
                <p className="notice__title">{t('newProject.invalid')}</p>
                <ul>
                  {errors.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        ) : (
          <ConfigureProject
            loaded={loaded}
            onBack={() => (picked ? setLoaded(null) : navigate(paths.pattern(patternId ?? '')))}
          />
        )}
      </main>
    </>
  );
}

function ConfigureProject({ loaded, onBack }: { loaded: Loaded; onBack: () => void }) {
  const { t } = useTranslation();
  const { pattern } = loaded;
  const ids = useId();
  const [name, setName] = useState(pattern.title);
  const [sizeIndex, setSizeIndex] = useState(pattern.sizes.length > 1 ? 1 : 0);
  const [stageId, setStageId] = useState(pattern.stages[0]?.id ?? '');
  const [knitCharts, setKnitCharts] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const modifications = useMemo<Modification[]>(
    () =>
      [...knitCharts].map((chartId) => ({
        kind: 'replaceChart',
        chartId,
        chart: {
          id: `${chartId}-knit`,
          name: chartId,
          width: 1,
          height: 1,
          palette: { k: 'std:k' },
          rows: ['k'],
        },
        note: 'knit-only',
      })),
    [knitCharts],
  );
  const report = useMemo(() => validatePattern(pattern, modifications), [pattern, modifications]);
  const errors = report.diagnostics.filter((d) => d.severity === 'error');
  const warnings = report.diagnostics.filter((d) => d.severity === 'warning');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!report.ok) return;
    setBusy(true);
    try {
      const lib = useLibrary.getState();
      const stored = loaded.stored ?? (await lib.savePattern(pattern, loaded.source));
      const project = await lib.createProject({
        pattern: stored,
        name,
        sizeIndex,
        stageId,
        modifications,
      });
      navigate(paths.project(project.id));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="configure" onSubmit={(e) => void submit(e)}>
      <section className="summary" aria-labelledby={`${ids}-summary`}>
        <h2 id={`${ids}-summary`} className="section-title">
          {pattern.title}
        </h2>
        {pattern.designer && <p className="summary__designer">{pattern.designer}</p>}
        {loaded.fileName && <p className="hint">{loaded.fileName}</p>}
        <dl className="facts">
          <div>
            <dt>{t('newProject.charts')}</dt>
            <dd>
              {pattern.charts.map((c) => (
                <span key={c.id} className="chip">
                  {c.name}{' '}
                  <span className="num">
                    {c.width}×{c.height}
                  </span>
                </span>
              ))}
            </dd>
          </div>
          <div>
            <dt>{t('newProject.stages')}</dt>
            <dd>{pattern.stages.map((s) => s.name).join(', ')}</dd>
          </div>
        </dl>
      </section>

      {errors.length > 0 && (
        <DiagnosticsList title={t('newProject.errors')} items={errors} tone="danger" />
      )}
      {warnings.length > 0 && (
        <DiagnosticsList title={t('newProject.warnings')} items={warnings} tone="warning" />
      )}

      <div className="field">
        <label htmlFor={`${ids}-name`}>{t('newProject.name')}</label>
        <input
          id={`${ids}-name`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={120}
          required
        />
      </div>
      {pattern.sizes.length > 1 && (
        <div className="field">
          <label htmlFor={`${ids}-size`}>{t('newProject.size')}</label>
          <select
            id={`${ids}-size`}
            value={sizeIndex}
            onChange={(e) => setSizeIndex(Number(e.target.value))}
          >
            {pattern.sizes.map((s, i) => (
              <option key={s} value={i}>
                {s}
              </option>
            ))}
          </select>
        </div>
      )}
      {pattern.stages.length > 1 && (
        <div className="field">
          <label htmlFor={`${ids}-stage`}>{t('newProject.startStage')}</label>
          <select id={`${ids}-stage`} value={stageId} onChange={(e) => setStageId(e.target.value)}>
            {pattern.stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <fieldset className="field">
        <legend>{t('newProject.variants')}</legend>
        <p className="hint">{t('newProject.variantsHint')}</p>
        {pattern.charts.map((c) => (
          <label key={c.id} className="check">
            <input
              type="checkbox"
              checked={knitCharts.has(c.id)}
              onChange={(e) => {
                const next = new Set(knitCharts);
                if (e.target.checked) next.add(c.id);
                else next.delete(c.id);
                setKnitCharts(next);
              }}
            />
            {t('newProject.knitOnly', { name: c.name })}
          </label>
        ))}
      </fieldset>
      <div className="form-actions">
        <button type="button" className="btn" onClick={onBack}>
          {loaded.stored ? t('newProject.backToPattern') : t('newProject.otherFile')}
        </button>
        <button type="submit" className="btn btn--primary" disabled={!report.ok || busy}>
          {t('newProject.create')}
        </button>
      </div>
    </form>
  );
}

function DiagnosticsList({
  title,
  items,
  tone,
}: {
  title: string;
  items: readonly Diagnostic[];
  tone: 'danger' | 'warning';
}) {
  const text = useDiagnosticText();
  const shown = items.slice(0, 8);
  return (
    <div className={`notice notice--${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
      <p className="notice__title">{title}</p>
      <ul>
        {shown.map((d, i) => (
          <li key={`${d.code}-${i}`}>{text(d)}</li>
        ))}
        {items.length > shown.length && <li>… +{items.length - shown.length}</li>}
      </ul>
    </div>
  );
}

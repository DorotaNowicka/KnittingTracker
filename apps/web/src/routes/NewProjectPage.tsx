import {
  blankProject,
  readProjectFile,
  validateProject,
  type Diagnostic,
  type Project,
} from '@kt/core';
import { useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { newId, readTextFile } from '../lib/files';
import { Link } from '../lib/Link';
import { navigate, paths } from '../lib/router';
import { sampleProject } from '../sample/sampleProject';
import { useLibrary } from '../state/library';
import { useDiagnosticText } from '../ui/diagnosticText';
import { Icon } from '../ui/Icon';
import { AppHeader } from './AppHeader';

interface Loaded {
  readonly project: Project;
  readonly fileName?: string;
}

/** A new project: from a project file, from a PDF or picture, from scratch, or the sample. */
export function NewProjectPage() {
  const { t } = useTranslation();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [errors, setErrors] = useState<readonly string[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setErrors([]);
    try {
      const result = readProjectFile(await readTextFile(file));
      if (!result.ok) {
        setErrors(result.errors);
        setLoaded(null);
        return;
      }
      setLoaded({ project: result.value, fileName: file.name });
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

  const fromScratch = async () => {
    const now = new Date().toISOString();
    const project = blankProject({
      id: newId(),
      name: t('newProject.blankName'),
      sizes: [t('editor.oneSize')],
      patternName: t('editor.firstStage'),
      now,
    });
    await useLibrary.getState().addProject(project);
    const first = project.patterns[0];
    navigate(first ? paths.pattern(project.id, first.id) : paths.project(project.id));
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
              <Link className="btn btn--primary" to={paths.import()}>
                <Icon name="upload" />
                {t('newProject.recognise')}
              </Link>
              <label className="btn btn--file">
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
              <button type="button" className="btn" onClick={() => void fromScratch()}>
                <Icon name="edit" />
                {t('newProject.fromScratch')}
              </button>
              <button
                type="button"
                className="btn"
                onClick={() =>
                  setLoaded({
                    project: sampleProject(
                      'sample',
                      t('projects.sampleName'),
                      new Date().toISOString(),
                    ),
                  })
                }
              >
                {t('newProject.useSample')}
              </button>
            </div>
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
          <ConfigureProject loaded={loaded} onBack={() => setLoaded(null)} />
        )}
      </main>
    </>
  );
}

/** Check a loaded project and choose a name, a size and the pattern to start with. */
function ConfigureProject({ loaded, onBack }: { loaded: Loaded; onBack: () => void }) {
  const { t } = useTranslation();
  const { project } = loaded;
  const ids = useId();
  const [name, setName] = useState(project.name);
  const [sizeIndex, setSizeIndex] = useState(
    project.sizeIndex > 0 ? project.sizeIndex : project.sizes.length > 1 ? 1 : 0,
  );
  const [start, setStart] = useState(project.activePatternId ?? project.patterns[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const report = useMemo(() => validateProject({ ...project, sizeIndex }), [project, sizeIndex]);
  const errors = report.diagnostics.filter((d) => d.severity === 'error');
  const warnings = report.diagnostics.filter((d) => d.severity === 'warning');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!report.ok) return;
    setBusy(true);
    try {
      const now = new Date().toISOString();
      // A file may hold a project that is already on this device: the new one gets its own id.
      const created: Project = {
        ...project,
        id: newId(),
        name: name.trim().slice(0, 120) || project.name,
        sizeIndex,
        ...(start ? { activePatternId: start } : {}),
        createdAt: now,
        updatedAt: now,
      };
      await useLibrary.getState().addProject(created);
      navigate(start ? paths.tracker(created.id, start) : paths.project(created.id));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="configure" onSubmit={(e) => void submit(e)}>
      <section className="summary" aria-labelledby={`${ids}-summary`}>
        <h2 id={`${ids}-summary`} className="section-title">
          {project.name}
        </h2>
        {project.designer && <p className="summary__designer">{project.designer}</p>}
        {loaded.fileName && <p className="hint">{loaded.fileName}</p>}
        <dl className="facts">
          {project.patterns.map((p) => (
            <div key={p.id}>
              <dt>{p.name}</dt>
              <dd>
                {p.charts.map((c) => (
                  <span key={c.id} className="chip">
                    {c.name}{' '}
                    <span className="num">
                      {c.width}×{c.height}
                    </span>
                  </span>
                ))}
              </dd>
            </div>
          ))}
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
      {project.sizes.length > 1 && (
        <div className="field">
          <label htmlFor={`${ids}-size`}>{t('newProject.size')}</label>
          <select
            id={`${ids}-size`}
            value={sizeIndex}
            onChange={(e) => setSizeIndex(Number(e.target.value))}
          >
            {project.sizes.map((s, i) => (
              <option key={`${s}-${i}`} value={i}>
                {s}
              </option>
            ))}
          </select>
        </div>
      )}
      {project.patterns.length > 1 && (
        <div className="field">
          <label htmlFor={`${ids}-start`}>{t('newProject.startPattern')}</label>
          <select id={`${ids}-start`} value={start} onChange={(e) => setStart(e.target.value)}>
            {project.patterns.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="form-actions">
        <button type="button" className="btn" onClick={onBack}>
          {t('newProject.otherFile')}
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

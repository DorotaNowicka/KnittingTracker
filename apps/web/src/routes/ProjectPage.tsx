import {
  addPattern,
  addSize,
  continuePattern,
  createProgressModel,
  duplicatePattern,
  movePattern,
  patternRegistry,
  PROJECT_KIND_INFO,
  removePattern,
  removeSize,
  renameSize,
  resolvePattern,
  serializeProject,
  summarize,
  validateProject,
  type Diagnostic,
  type Pattern,
  type Project,
} from '@kt/core';
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { DraftGate, SaveState } from '../editor/DraftGate';
import { saveFile, slug } from '../lib/files';
import { Link } from '../lib/Link';
import { navigate, paths } from '../lib/router';
import type { StoredProgress } from '../lib/storage';
import { getStorage, useLibrary } from '../state/library';
import { useDraft } from '../state/draft';
import { DiagnosticsPanel } from '../ui/Diagnostics';
import { NumberField, TextField } from '../ui/fields';
import { Icon } from '../ui/Icon';
import { KIND_ICONS } from '../ui/kindIcons';
import { AppHeader } from './AppHeader';

/** A project (projekt): its patterns in knitting order, sizes and details. */
export function ProjectPage({ projectId }: { projectId: string }) {
  return <DraftGate id={projectId}>{(project) => <ProjectEditor project={project} />}</DraftGate>;
}

const update = (f: (p: Project) => Project) => useDraft.getState().update(f);

function ProjectEditor({ project }: { project: Project }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith('en') ? 'en' : 'pl';
  const ids = useId();
  const report = useMemo(() => validateProject(project), [project]);
  const active =
    project.patterns.find((p) => p.id === project.activePatternId) ?? project.patterns[0];

  const action = (d: Diagnostic) => {
    const pattern = project.patterns.find((p) => p.id === d.patternId);
    if (!pattern) return null;
    if (d.chartId && pattern.charts.some((c) => c.id === d.chartId)) {
      return {
        label: t('editor.openChart'),
        run: () => navigate(paths.chart(project.id, pattern.id, d.chartId ?? '')),
      };
    }
    return {
      label: t('project.openPattern'),
      run: () => navigate(paths.pattern(project.id, pattern.id)),
    };
  };

  const exportFile = async () => {
    await useDraft.getState().flush();
    await saveFile(`${slug(project.name)}.ktproject.json`, serializeProject(project));
  };

  return (
    <>
      <AppHeader />
      <main className="page page--wide" id="main">
        <p className="page__back">
          <Link to={paths.projects()} className="link-back">
            <Icon name="back" size={18} />
            {t('nav.projects')}
          </Link>
          <SaveState />
        </p>
        <h1 className="page__title">{project.name}</h1>
        {project.kind && project.kind !== 'custom' && (
          <p className="project-kind">
            <Icon name={KIND_ICONS[project.kind]} size={20} />
            {PROJECT_KIND_INFO[project.kind].label[lang]}
            <Link to={paths.parts(project.id)} className="project-kind__parts">
              {t('parts.link')}
            </Link>
          </p>
        )}
        {project.designer && <p className="lead">{project.designer}</p>}
        {active && (
          <p className="project-continue">
            <Link
              className="btn btn--primary"
              to={paths.tracker(project.id, active.id)}
              data-testid="continue-knitting"
            >
              <Icon name="rowDone" />
              {t('project.continue', { name: active.name })}
            </Link>
          </p>
        )}

        <Patterns project={project} />

        <section className="editor-section" aria-labelledby={`${ids}-about`}>
          <h2 id={`${ids}-about`} className="section-title">
            {t('project.about')}
          </h2>
          <div className="form-grid">
            <TextField
              label={t('project.name')}
              value={project.name}
              required
              maxLength={120}
              onCommit={(name) => update((p) => ({ ...p, name }))}
            />
            <TextField
              label={t('editor.designer')}
              value={project.designer ?? ''}
              maxLength={120}
              onCommit={(v) =>
                update(({ designer: _d, ...p }) => (v.trim() ? { ...p, designer: v } : p))
              }
            />
          </div>
          <TextField
            label={t('editor.notes')}
            value={project.notes ?? ''}
            maxLength={5000}
            multiline
            hint={t('editor.notesHint')}
            onCommit={(v) => update(({ notes: _n, ...p }) => (v.trim() ? { ...p, notes: v } : p))}
          />
          <GaugeFields project={project} />
        </section>

        <Sizes project={project} />

        <section className="editor-section" aria-labelledby={`${ids}-check`}>
          <h2 id={`${ids}-check`} className="section-title">
            {t('editor.check')}
          </h2>
          <DiagnosticsPanel items={report.diagnostics} action={action} />
        </section>

        <div className="form-actions">
          <button type="button" className="btn" onClick={() => void exportFile()}>
            <Icon name="download" />
            {t('project.export')}
          </button>
        </div>
      </main>
    </>
  );
}

/** Progress of every pattern, kept fresh while the page is open. */
function useProgress(projectId: string): Record<string, StoredProgress> {
  const [progress, setProgress] = useState<Record<string, StoredProgress>>({});
  const tick = useLibrary((s) => s.progress[projectId]);
  useEffect(() => {
    let alive = true;
    void useLibrary
      .getState()
      .progressOf(projectId)
      .then((p) => alive && setProgress(p));
    return () => {
      alive = false;
    };
  }, [projectId, tick]);
  return progress;
}

interface PatternInfo {
  readonly stitches: number[];
  readonly row: number | null;
  readonly percent: number | null;
}

function patternInfo(project: Project, pattern: Pattern, done: number): PatternInfo | null {
  try {
    const registry = patternRegistry(pattern);
    const stitches = project.sizes.map(
      (_, i) => resolvePattern(project, pattern.id, { sizeIndex: i, registry }).stitchCount,
    );
    const grid = resolvePattern(project, pattern.id, { registry });
    const s = summarize(createProgressModel(grid), done);
    return { stitches, row: done > 0 ? s.currentRow : null, percent: done > 0 ? s.percent : null };
  } catch {
    return null;
  }
}

/** The patterns of the project in knitting order, with their progress. */
function Patterns({ project }: { project: Project }) {
  const { t } = useTranslation();
  const ids = useId();
  const progress = useProgress(project.id);
  const addRef = useRef<HTMLDialogElement>(null);
  const removeRef = useRef<HTMLDialogElement>(null);
  const [removing, setRemoving] = useState<Pattern | null>(null);

  const create = (make: (p: Project) => { project: Project; patternId: string }) => {
    let created = '';
    update((p) => {
      const r = make(p);
      created = r.patternId;
      return r.project;
    });
    if (created) navigate(paths.pattern(project.id, created));
  };

  const remove = async (pattern: Pattern) => {
    update((p) => removePattern(p, pattern.id));
    await useDraft.getState().flush();
    const storage = await getStorage();
    await storage.deleteProgress(project.id, pattern.id).catch(() => undefined);
  };

  return (
    <section className="editor-section" aria-labelledby={`${ids}-patterns`}>
      <h2 id={`${ids}-patterns`} className="section-title">
        {t('project.patterns')}
      </h2>
      <p className="hint">{t('project.patternsHint')}</p>
      {project.patterns.length === 0 ? (
        <p className="empty-line">{t('project.noPatterns')}</p>
      ) : (
        <ol className="card-list card-list--rows" data-testid="pattern-list">
          {project.patterns.map((pattern, i) => {
            const done = progress[pattern.id]?.done ?? 0;
            const info = patternInfo(project, pattern, done);
            const round = pattern.construction === 'round';
            const finished = project.finishedRows?.[pattern.id];
            return (
              <li key={pattern.id} className="card card--row">
                <Link className="card__main" to={paths.tracker(project.id, pattern.id)}>
                  <span className="card__title">
                    <span className="num card__index">{i + 1}.</span> {pattern.name}
                    {pattern.id === project.activePatternId && (
                      <span className="badge">{t('project.active')}</span>
                    )}
                  </span>
                  <span className="card__meta">
                    <span>{t(round ? 'editor.round' : 'editor.flat')}</span>
                    <span>{t('project.charts', { count: pattern.charts.length })}</span>
                    {info && (
                      <span className="num">
                        {t('editor.stitchesPerSize', { list: info.stitches.join('-') || '0' })}
                      </span>
                    )}
                    {pattern.rows === undefined ? (
                      <span>{t('editor.stageOpen')}</span>
                    ) : (
                      <span className="num">
                        {t('editor.stageRows', { list: rowsList(pattern.rows) })}
                      </span>
                    )}
                    {pattern.tracking === 'rows' && <span>{t('editor.stageCounter')}</span>}
                    {pattern.layout.some((seg) => seg.kind === 'chart' && seg.continueFrom) && (
                      <span>{t('editor.stageContinues')}</span>
                    )}
                  </span>
                  <span className="card__progress num">
                    {finished !== undefined
                      ? t(round ? 'project.finishedRounds' : 'project.finishedRows', {
                          count: finished,
                        })
                      : info?.row
                        ? `${t(round ? 'status.round' : 'status.row', { row: info.row })}${
                            info.percent !== null ? ` · ${Math.floor(info.percent)}%` : ''
                          }`
                        : t('project.notStarted')}
                  </span>
                </Link>
                <div className="card__actions">
                  <Link className="btn btn--small" to={paths.pattern(project.id, pattern.id)}>
                    <Icon name="edit" size={18} />
                    {t('project.editPattern')}
                  </Link>
                  <button
                    type="button"
                    className="btn btn--small"
                    title={t('editor.continueStageHint')}
                    onClick={() =>
                      create((p) =>
                        continuePattern(
                          p,
                          pattern.id,
                          t('editor.continueName', { name: pattern.name }).slice(0, 60),
                        ),
                      )
                    }
                  >
                    {t('editor.continueStage')}
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={t('project.duplicate', { name: pattern.name })}
                    onClick={() =>
                      create((p) =>
                        duplicatePattern(
                          p,
                          pattern.id,
                          t('editor.copyName', { name: pattern.name }).slice(0, 60),
                        ),
                      )
                    }
                  >
                    <Icon name="copy" />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={t('editor.moveStageUp', { name: pattern.name })}
                    disabled={i === 0}
                    onClick={() => update((p) => movePattern(p, i, i - 1))}
                  >
                    <Icon name="up" />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={t('editor.moveStageDown', { name: pattern.name })}
                    disabled={i === project.patterns.length - 1}
                    onClick={() => update((p) => movePattern(p, i, i + 1))}
                  >
                    <Icon name="down" />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={t('editor.removeStage', { name: pattern.name })}
                    onClick={() => {
                      setRemoving(pattern);
                      removeRef.current?.showModal();
                    }}
                  >
                    <Icon name="trash" />
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <div className="choose__actions">
        <button type="button" className="btn" onClick={() => addRef.current?.showModal()}>
          <Icon name="plus" />
          {t('project.addPattern')}
        </button>
        <Link className="btn" to={paths.import(project.id)}>
          <Icon name="upload" />
          {t('project.importPattern')}
        </Link>
      </div>
      <NewPatternDialog
        dialogRef={addRef}
        suggested={t('editor.stageName', { n: project.patterns.length + 1 })}
        onCreate={(name) => create((p) => addPattern(p, name))}
      />
      <dialog ref={removeRef} className="dialog" aria-labelledby={`${ids}-rm`}>
        <h2 id={`${ids}-rm`} className="dialog__title">
          {t('project.removeTitle', { name: removing?.name ?? '' })}
        </h2>
        <p>{t('project.removeBody')}</p>
        <div className="dialog__actions">
          <button type="button" className="btn" onClick={() => removeRef.current?.close()}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="btn btn--danger"
            onClick={() => {
              removeRef.current?.close();
              if (removing) void remove(removing);
            }}
          >
            {t('project.removeConfirm')}
          </button>
        </div>
      </dialog>
    </section>
  );
}

function NewPatternDialog({
  dialogRef,
  suggested,
  onCreate,
}: {
  dialogRef: React.RefObject<HTMLDialogElement | null>;
  suggested: string;
  onCreate(name: string): void;
}) {
  const { t } = useTranslation();
  const ids = useId();
  const [name, setName] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    dialogRef.current?.close();
    onCreate((name.trim() || suggested).slice(0, 60));
    setName('');
  };
  return (
    <dialog ref={dialogRef} className="dialog" aria-labelledby={`${ids}-title`}>
      <form onSubmit={submit}>
        <h2 id={`${ids}-title`} className="dialog__title">
          {t('project.newPattern')}
        </h2>
        <TextField
          label={t('project.patternName')}
          value={name}
          maxLength={60}
          hint={t('project.patternNameHint', { name: suggested })}
          onCommit={setName}
        />
        <div className="dialog__actions">
          <button type="button" className="btn" onClick={() => dialogRef.current?.close()}>
            {t('common.cancel')}
          </button>
          <button type="submit" className="btn btn--primary">
            {t('project.createPattern')}
          </button>
        </div>
      </form>
    </dialog>
  );
}

function Sizes({ project }: { project: Project }) {
  const { t } = useTranslation();
  const ids = useId();
  return (
    <section className="editor-section" aria-labelledby={`${ids}-sizes`}>
      <h2 id={`${ids}-sizes`} className="section-title">
        {t('editor.sizes')}
      </h2>
      <p className="hint">{t('editor.sizesHint')}</p>
      {project.patterns.some((p) => p.design) && (
        <p>
          <Link to={paths.sizes(project.id)} className="btn btn--small">
            {t('sizes.table')}
          </Link>
        </p>
      )}
      {project.sizes.length > 1 && (
        <div className="field">
          <label htmlFor={`${ids}-size`}>{t('project.knittedSize')}</label>
          <select
            id={`${ids}-size`}
            value={project.sizeIndex}
            onChange={(e) => {
              const sizeIndex = Number(e.target.value);
              update((p) => ({ ...p, sizeIndex }));
            }}
          >
            {project.sizes.map((s, i) => (
              <option key={`${s}-${i}`} value={i}>
                {s}
              </option>
            ))}
          </select>
        </div>
      )}
      <ol className="size-list">
        {project.sizes.map((s, i) => (
          <li key={i} className="size-list__item">
            <TextField
              label={t('editor.sizeLabel', { n: i + 1 })}
              value={s}
              required
              maxLength={20}
              className="field--compact"
              onCommit={(v) => update((p) => renameSize(p, i, v))}
            />
            {project.sizes.length > 1 && (
              <button
                type="button"
                className="icon-btn"
                aria-label={t('editor.removeSize', { name: s })}
                onClick={() => update((p) => removeSize(p, i))}
              >
                <Icon name="trash" />
              </button>
            )}
          </li>
        ))}
      </ol>
      <button
        type="button"
        className="btn btn--small"
        onClick={() => update((p) => addSize(p, String(p.sizes.length + 1)))}
      >
        <Icon name="plus" />
        {t('editor.addSize')}
      </button>
    </section>
  );
}

/** The designer's gauge (10 × 10 cm), used to estimate rows for "knit until X cm" (DR-5). */
function GaugeFields({ project }: { project: Project }) {
  const { t } = useTranslation();
  const on = project.gauge !== undefined;
  const gauge = project.gauge ?? { stitches: 22, rows: 30 };
  return (
    <fieldset className="field">
      <legend>{t('editor.gauge')}</legend>
      <label className="check">
        <input
          type="checkbox"
          checked={on}
          onChange={(e) =>
            update(({ gauge: _g, ...p }) => (e.target.checked ? { ...p, gauge } : p))
          }
        />
        {t('editor.hasGauge')}
      </label>
      {on && (
        <div className="form-grid form-grid--2">
          <NumberField
            label={t('gauge.stitches')}
            value={gauge.stitches}
            min={1}
            max={100}
            decimals
            onCommit={(stitches) => update((p) => ({ ...p, gauge: { ...gauge, stitches } }))}
          />
          <NumberField
            label={t('gauge.rows')}
            value={gauge.rows}
            min={1}
            max={200}
            decimals
            onCommit={(rows) => update((p) => ({ ...p, gauge: { ...gauge, rows } }))}
          />
        </div>
      )}
      <p className="hint">{t('editor.gaugeHint')}</p>
    </fieldset>
  );
}

const rowsList = (rows: number | readonly number[]) =>
  typeof rows === 'number' ? String(rows) : rows.join('-');

import { createProgressModel, resolveStage, summarize } from '@kt/core';
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from '../lib/Link';
import { navigate, paths } from '../lib/router';
import type { StoredProject } from '../lib/storage';
import { samplePattern } from '../sample/samplePattern';
import { useLibrary } from '../state/library';
import { Icon } from '../ui/Icon';
import { AppHeader } from './AppHeader';

export function ProjectsPage() {
  const { t } = useTranslation();
  const projects = useLibrary((s) => s.projects);
  const [busy, setBusy] = useState(false);

  const startSample = async () => {
    setBusy(true);
    try {
      const lib = useLibrary.getState();
      const pattern = await lib.savePattern(samplePattern, 'sample');
      const project = await lib.createProject({
        pattern,
        name: t('projects.sampleName'),
        sizeIndex: 0,
        stageId: samplePattern.stages[0]?.id ?? 'body',
        modifications: [],
      });
      navigate(paths.project(project.id));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <AppHeader />
      <main className="page" id="main">
        <h1 className="page__title">{t('projects.title')}</h1>
        {projects.length === 0 ? (
          <section className="empty" aria-labelledby="empty-title">
            <h2 id="empty-title" className="empty__title">
              {t('projects.empty.title')}
            </h2>
            <p className="empty__body">{t('projects.empty.body')}</p>
            <div className="empty__actions">
              <Link className="btn btn--primary" to={paths.new()}>
                <Icon name="upload" />
                {t('projects.loadFile')}
              </Link>
              <button
                type="button"
                className="btn"
                onClick={() => void startSample()}
                disabled={busy}
              >
                {t('projects.trySample')}
              </button>
            </div>
          </section>
        ) : (
          <>
            <ul className="project-list">
              {projects.map((p) => (
                <ProjectRow key={p.id} project={p} />
              ))}
            </ul>
            <div className="page__actions">
              <Link className="btn btn--primary" to={paths.new()}>
                <Icon name="plus" />
                {t('projects.new')}
              </Link>
            </div>
          </>
        )}
      </main>
    </>
  );
}

function ProjectRow({ project }: { project: StoredProject }) {
  const { t, i18n } = useTranslation();
  const pattern = useLibrary((s) => s.patterns.find((p) => p.id === project.patternId));
  const progress = useLibrary((s) => s.progress[project.id]);
  const dialog = useRef<HTMLDialogElement>(null);
  const done = progress?.done ?? 0;

  const summary = useMemo(() => {
    if (!pattern) return null;
    try {
      const stage = resolveStage(pattern.pattern, project.activeStageId, project.sizeIndex, {
        modifications: project.modifications,
        ...(project.finishedRows ? { finishedRows: project.finishedRows } : {}),
      });
      return {
        stageName: stage.stage.name,
        round: stage.stage.construction === 'round',
        s: summarize(createProgressModel(stage), done),
      };
    } catch {
      return null;
    }
  }, [pattern, project, done]);

  const remove = async () => {
    dialog.current?.close();
    await useLibrary.getState().deleteProject(project.id);
  };

  return (
    <li className="project">
      <Link className="project__link" to={paths.project(project.id)}>
        <span className="project__name">{project.name}</span>
        <span className="project__meta">
          {pattern?.pattern.title ?? t('projects.patternMissing')}
          {summary && <span>{summary.stageName}</span>}
        </span>
        {summary && (
          <span className="project__progress">
            <span className="num">
              {t(summary.round ? 'status.round' : 'status.row', { row: summary.s.currentRow })}
            </span>
            {summary.s.percent !== null && (
              <span className="num">{Math.floor(summary.s.percent)}%</span>
            )}
          </span>
        )}
        <span className="project__date">
          {t('projects.updated', {
            date: new Date(project.updatedAt).toLocaleDateString(i18n.language, {
              day: 'numeric',
              month: 'short',
            }),
          })}
        </span>
      </Link>
      <button
        type="button"
        className="icon-btn project__delete"
        aria-label={t('projects.delete', { name: project.name })}
        onClick={() => dialog.current?.showModal()}
      >
        <Icon name="trash" />
      </button>
      <dialog ref={dialog} className="dialog" aria-labelledby={`del-${project.id}`}>
        <h2 id={`del-${project.id}`} className="dialog__title">
          {t('projects.deleteTitle', { name: project.name })}
        </h2>
        <p>{t('projects.deleteBody')}</p>
        <div className="dialog__actions">
          <button type="button" className="btn" onClick={() => dialog.current?.close()}>
            {t('common.cancel')}
          </button>
          <button type="button" className="btn btn--danger" onClick={() => void remove()}>
            {t('projects.deleteConfirm')}
          </button>
        </div>
      </dialog>
    </li>
  );
}

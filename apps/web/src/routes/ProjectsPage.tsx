import { createProgressModel, resolvePattern, summarize } from '@kt/core';
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from '../lib/Link';
import { newId } from '../lib/files';
import { navigate, paths } from '../lib/router';
import type { StoredProject } from '../lib/storage';
import { sampleProject } from '../sample/sampleProject';
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
      const project = await useLibrary
        .getState()
        .addProject(sampleProject(newId(), t('projects.sampleName'), new Date().toISOString()));
      navigate(paths.tracker(project.id, project.activePatternId ?? 'body'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <AppHeader />
      <main className="page" id="main">
        <div className="page__head">
          <h1 className="page__title">{t('projects.title')}</h1>
          {projects.length > 0 && (
            <Link className="btn btn--primary" to={paths.new()}>
              <Icon name="plus" />
              {t('projects.new')}
            </Link>
          )}
        </div>
        {projects.length === 0 ? (
          <section className="empty" aria-labelledby="empty-title">
            <h2 id="empty-title" className="empty__title">
              {t('projects.empty.title')}
            </h2>
            <p className="empty__body">{t('projects.empty.body')}</p>
            <div className="empty__actions">
              <Link className="btn btn--primary" to={paths.new()}>
                <Icon name="plus" />
                {t('projects.new')}
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
          <ul className="project-list">
            {projects.map((p) => (
              <ProjectRow key={p.id} project={p} />
            ))}
          </ul>
        )}
      </main>
    </>
  );
}

function ProjectRow({ project }: { project: StoredProject }) {
  const { t, i18n } = useTranslation();
  const progress = useLibrary((s) => s.progress[project.id]);
  const dialog = useRef<HTMLDialogElement>(null);
  const done = progress?.done ?? 0;

  const summary = useMemo(() => {
    const active = project.activePatternId ?? project.patterns[0]?.id;
    if (!active) return null;
    try {
      const grid = resolvePattern(project, active);
      return {
        patternName: grid.pattern.name,
        round: grid.pattern.construction === 'round',
        s: summarize(createProgressModel(grid), done),
      };
    } catch {
      return null;
    }
  }, [project, done]);

  const remove = async () => {
    dialog.current?.close();
    await useLibrary.getState().deleteProject(project.id);
  };
  // Every part finished: the project is done.
  const finished =
    project.patterns.length > 0 &&
    project.patterns.every((p) => project.finishedRows?.[p.id] !== undefined);
  const again = useRef<HTMLDialogElement>(null);
  const restart = async () => {
    again.current?.close();
    await useLibrary.getState().restartProject(project.id);
    const first = project.patterns[0];
    if (first) navigate(paths.tracker(project.id, first.id));
  };

  return (
    <li className={`project${finished ? ' project--done' : ''}`}>
      <Link className="project__link" to={paths.project(project.id)}>
        <span className="project__name">
          {project.name}
          {finished && (
            <span className="project__done">
              <Icon name="check" size={16} />
              {t('projects.done')}
            </span>
          )}
        </span>
        <span className="project__meta">
          {project.patterns.length === 0 ? (
            t('projects.noPatterns')
          ) : (
            <>
              {t('projects.patterns', { count: project.patterns.length })}
              {summary && <span>{summary.patternName}</span>}
            </>
          )}
        </span>
        {summary && !finished && (
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
      {finished && (
        <button
          type="button"
          className="btn btn--small project__again"
          onClick={() => again.current?.showModal()}
        >
          <Icon name="undo" size={18} />
          {t('projects.again')}
        </button>
      )}
      <dialog ref={again} className="dialog" aria-labelledby={`again-${project.id}`}>
        <h2 id={`again-${project.id}`} className="dialog__title">
          {t('projects.againTitle', { name: project.name })}
        </h2>
        <p>{t('projects.againBody')}</p>
        <div className="dialog__actions">
          <button type="button" className="btn" onClick={() => again.current?.close()}>
            {t('common.cancel')}
          </button>
          <button type="button" className="btn btn--danger" onClick={() => void restart()}>
            {t('projects.againConfirm')}
          </button>
        </div>
      </dialog>
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

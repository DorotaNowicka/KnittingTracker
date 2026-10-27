import { useTranslation } from 'react-i18next';
import { navigate, paths } from '../lib/router';
import { useLibrary } from '../state/library';
import { AppHeader } from './AppHeader';
import { NotFoundPage } from './NotFoundPage';

/**
 * Shown once, right after a project is made by hand (not from a PDF): every part is designed in
 * the size being knitted; scaling for the other sizes comes at the end. Lists what scaling will
 * change, so the knitter knows what to leave for later.
 */
export function StartPage({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const project = useLibrary((s) => s.projects.find((p) => p.id === projectId));
  if (!project) return <NotFoundPage />;
  // A garment opens split into its parts; an own project has none.
  const next =
    project.kind && project.kind !== 'custom' ? paths.parts(project.id) : paths.project(project.id);
  return (
    <>
      <AppHeader />
      <main className="page start-page" id="main">
        <h1 className="page__title">{t('start.title')}</h1>
        <p className="hint">{t('newProject.kindFor', { name: project.name })}</p>
        <p className="lead">{t('start.lead')}</p>
        <section className="start-page__scale" aria-labelledby="start-scale">
          <h2 id="start-scale" className="section-title">
            {t('start.scaleTitle')}
          </h2>
          <ul className="start-page__list">
            <li>{t('start.scaleWidth')}</li>
            <li>{t('start.scaleLength')}</li>
            <li>{t('start.scaleRepeats')}</li>
            <li>{t('start.scaleFixed')}</li>
          </ul>
        </section>
        <p className="hint">{t('start.dimensions')}</p>
        <div className="form-actions">
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => navigate(next, { replace: true })}
          >
            {t('start.go')}
          </button>
        </div>
      </main>
    </>
  );
}

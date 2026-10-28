import { lazy, Suspense, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useRoute } from './lib/router';
import { NewProjectKindPage, NewProjectPage } from './routes/NewProjectPage';
import { NotFoundPage } from './routes/NotFoundPage';
import { ProjectsPage } from './routes/ProjectsPage';
import { SettingsPage } from './routes/SettingsPage';
import { StartPage } from './routes/StartPage';
import { TrackerPage } from './routes/TrackerPage';
import { useLibrary } from './state/library';
import { useUpdate } from './state/update';

// Code that is not needed to track a project loads when it is opened: the import wizard (and its
// worker) and the editors. The service worker precaches these chunks, so they work offline.
const ImportPage = lazy(() =>
  import('./import/ImportPage').then((m) => ({ default: m.ImportPage })),
);
const ProjectPage = lazy(() =>
  import('./routes/ProjectPage').then((m) => ({ default: m.ProjectPage })),
);
const ReviewPage = lazy(() =>
  import('./routes/ReviewPage').then((m) => ({ default: m.ReviewPage })),
);
const SizesPage = lazy(() => import('./routes/SizesPage').then((m) => ({ default: m.SizesPage })));
const PartsPage = lazy(() => import('./routes/PartsPage').then((m) => ({ default: m.PartsPage })));
const PatternEditPage = lazy(() =>
  import('./routes/PatternEditPage').then((m) => ({ default: m.PatternEditPage })),
);
const DesignerPage = lazy(() =>
  import('./designer/DesignerPage').then((m) => ({ default: m.DesignerPage })),
);
const ChartEditorPage = lazy(() =>
  import('./editor/ChartEditorPage').then((m) => ({ default: m.ChartEditorPage })),
);

const loading = <main className="page page--loading" aria-busy="true" />;

export function App() {
  const route = useRoute();
  const load = useLibrary((s) => s.load);
  const status = useLibrary((s) => s.status);
  const storageKind = useLibrary((s) => s.storageKind);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      {storageKind === 'memory' && <StorageWarning />}
      <UpdateBanner />
      {status !== 'ready' ? (
        <main className="page page--loading" aria-busy="true" />
      ) : route.name === 'projects' ? (
        <ProjectsPage />
      ) : route.name === 'new' ? (
        <NewProjectPage />
      ) : route.name === 'newKind' ? (
        <NewProjectKindPage />
      ) : route.name === 'tracker' ? (
        <TrackerPage projectId={route.id} patternId={route.patternId} />
      ) : route.name === 'settings' ? (
        <SettingsPage />
      ) : route.name === 'import' ? (
        <Suspense fallback={loading}>
          <ImportPage {...(route.id ? { projectId: route.id } : {})} />
        </Suspense>
      ) : route.name === 'start' ? (
        <StartPage projectId={route.id} />
      ) : route.name === 'review' ? (
        <Suspense fallback={loading}>
          <ReviewPage projectId={route.id} />
        </Suspense>
      ) : route.name === 'sizes' ? (
        <Suspense fallback={loading}>
          <SizesPage projectId={route.id} />
        </Suspense>
      ) : route.name === 'parts' ? (
        <Suspense fallback={loading}>
          <PartsPage projectId={route.id} />
        </Suspense>
      ) : route.name === 'project' ? (
        <Suspense fallback={loading}>
          <ProjectPage projectId={route.id} />
        </Suspense>
      ) : route.name === 'pattern' ? (
        <Suspense fallback={loading}>
          <PatternEditPage projectId={route.id} patternId={route.patternId} />
        </Suspense>
      ) : route.name === 'designer' ? (
        <Suspense fallback={loading}>
          <DesignerPage projectId={route.id} patternId={route.patternId} />
        </Suspense>
      ) : route.name === 'chart' ? (
        <Suspense fallback={loading}>
          <ChartEditorPage
            projectId={route.id}
            patternId={route.patternId}
            chartId={route.chartId}
          />
        </Suspense>
      ) : (
        <NotFoundPage />
      )}
    </>
  );
}

function StorageWarning() {
  const { t } = useTranslation();
  return (
    <div className="banner banner--danger" role="alert">
      <strong>{t('storage.memory.title')}</strong> {t('storage.memory.body')}
    </div>
  );
}

function UpdateBanner() {
  const { t } = useTranslation();
  const apply = useUpdate((s) => s.apply);
  if (!apply) return null;
  return (
    <div className="banner" role="status">
      <span>{t('update.available')}</span>
      <button type="button" className="btn btn--small" onClick={apply}>
        {t('update.apply')}
      </button>
    </div>
  );
}

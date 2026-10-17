import { lazy, Suspense, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useRoute } from './lib/router';
import { NewProjectPage } from './routes/NewProjectPage';
import { NotFoundPage } from './routes/NotFoundPage';
import { PatternsPage } from './routes/PatternsPage';
import { ProjectsPage } from './routes/ProjectsPage';
import { SettingsPage } from './routes/SettingsPage';
import { TrackerPage } from './routes/TrackerPage';
import { useLibrary } from './state/library';
import { useUpdate } from './state/update';

// Code that is not needed to track a project loads when it is opened: the import wizard (and its
// worker) and the pattern editor. The service worker precaches these chunks, so they work offline.
const ImportPage = lazy(() =>
  import('./import/ImportPage').then((m) => ({ default: m.ImportPage })),
);
const PatternPage = lazy(() =>
  import('./routes/PatternPage').then((m) => ({ default: m.PatternPage })),
);
const StagePage = lazy(() => import('./routes/StagePage').then((m) => ({ default: m.StagePage })));
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
      ) : route.name === 'project' ? (
        <TrackerPage projectId={route.id} />
      ) : route.name === 'settings' ? (
        <SettingsPage />
      ) : route.name === 'patterns' ? (
        <PatternsPage />
      ) : route.name === 'import' ? (
        <Suspense fallback={loading}>
          <ImportPage />
        </Suspense>
      ) : route.name === 'pattern' ? (
        <Suspense fallback={loading}>
          <PatternPage patternId={route.id} />
        </Suspense>
      ) : route.name === 'patternProject' ? (
        <NewProjectPage patternId={route.id} />
      ) : route.name === 'chart' ? (
        <Suspense fallback={loading}>
          <ChartEditorPage patternId={route.id} chartId={route.chartId} />
        </Suspense>
      ) : route.name === 'stage' ? (
        <Suspense fallback={loading}>
          <StagePage patternId={route.id} stageId={route.stageId} />
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

import { lazy, Suspense, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useRoute } from './lib/router';
import { ChartEditorPage } from './editor/ChartEditorPage';
import { NewProjectPage } from './routes/NewProjectPage';
import { NotFoundPage } from './routes/NotFoundPage';
import { PatternPage } from './routes/PatternPage';
import { PatternsPage } from './routes/PatternsPage';
import { ProjectsPage } from './routes/ProjectsPage';
import { SettingsPage } from './routes/SettingsPage';
import { StagePage } from './routes/StagePage';
import { TrackerPage } from './routes/TrackerPage';
import { useLibrary } from './state/library';
import { useUpdate } from './state/update';

// The import wizard (and its worker) loads only when it is opened.
const ImportPage = lazy(() =>
  import('./import/ImportPage').then((m) => ({ default: m.ImportPage })),
);

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
        <Suspense fallback={<main className="page page--loading" aria-busy="true" />}>
          <ImportPage />
        </Suspense>
      ) : route.name === 'pattern' ? (
        <PatternPage patternId={route.id} />
      ) : route.name === 'patternProject' ? (
        <NewProjectPage patternId={route.id} />
      ) : route.name === 'chart' ? (
        <ChartEditorPage patternId={route.id} chartId={route.chartId} />
      ) : route.name === 'stage' ? (
        <StagePage patternId={route.id} stageId={route.stageId} />
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

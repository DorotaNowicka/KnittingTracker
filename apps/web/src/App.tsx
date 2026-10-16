import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useRoute } from './lib/router';
import { NewProjectPage } from './routes/NewProjectPage';
import { NotFoundPage } from './routes/NotFoundPage';
import { ProjectsPage } from './routes/ProjectsPage';
import { SettingsPage } from './routes/SettingsPage';
import { TrackerPage } from './routes/TrackerPage';
import { useLibrary } from './state/library';
import { useUpdate } from './state/update';

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

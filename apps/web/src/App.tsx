import { useTranslation } from 'react-i18next';

export function App() {
  const { t } = useTranslation();
  const env = import.meta.env.VITE_APP_ENV ?? 'dev';

  return (
    <div className="shell">
      <header className="shell__header">
        <p className="shell__brand">{t('app.name')}</p>
      </header>
      <main className="shell__main" id="main">
        <h1 className="shell__title">{t('projects.title')}</h1>
        <section className="empty" aria-labelledby="empty-title">
          <h2 id="empty-title" className="empty__title">
            {t('projects.empty.title')}
          </h2>
          <p className="empty__body">{t('projects.empty.body')}</p>
        </section>
      </main>
      {env !== 'prod' && (
        <footer className="shell__footer">
          <p>{t('app.buildInfo', { env })}</p>
        </footer>
      )}
    </div>
  );
}

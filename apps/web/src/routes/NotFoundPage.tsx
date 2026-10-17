import { useTranslation } from 'react-i18next';
import { Link } from '../lib/Link';
import { paths } from '../lib/router';

export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <main className="page" id="main">
      <h1 className="page__title">{t('notFound.title')}</h1>
      <p>{t('notFound.body')}</p>
      <Link className="btn" to={paths.projects()}>
        {t('notFound.back')}
      </Link>
    </main>
  );
}

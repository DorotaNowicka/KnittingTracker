import { useTranslation } from 'react-i18next';
import { Link } from '../lib/Link';
import { paths } from '../lib/router';
import { Icon } from '../ui/Icon';

/** Header of the non-tracker screens: wordmark (home, the project list) and settings. */
export function AppHeader() {
  const { t } = useTranslation();
  return (
    <header className="app-header">
      <Link to={paths.projects()} className="wordmark" aria-label={t('nav.home')}>
        <svg
          width="26"
          height="26"
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="wordmark__mark"
        >
          <rect x="1" y="1" width="22" height="22" rx="5" className="wordmark__bg" />
          <path d="M5 8l3 4 3-4M11 8l3 4 3-4M5 13l3 4 3-4" className="wordmark__stitch" />
          <path d="M11 13l3 4 3-4" className="wordmark__marker" />
        </svg>
        <span>KnittingTracker</span>
      </Link>
      <Link to={paths.settings()} className="icon-btn" aria-label={t('nav.settings')}>
        <Icon name="settings" />
      </Link>
    </header>
  );
}

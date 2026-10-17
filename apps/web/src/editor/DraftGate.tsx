import type { Pattern } from '@kt/core';
import { useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from '../lib/Link';
import { paths } from '../lib/router';
import { useDraft } from '../state/draft';
import { AppHeader } from '../routes/AppHeader';

/**
 * Opens the pattern draft for `id` and renders `children` once it is loaded. Shared by the
 * pattern, chart and layout screens, so moving between them keeps unsaved edits in memory.
 */
export function DraftGate({
  id,
  children,
}: {
  id: string;
  children: (pattern: Pattern) => ReactNode;
}) {
  const { t } = useTranslation();
  const status = useDraft((s) => (s.id === id ? s.status : 'loading'));
  const pattern = useDraft((s) => (s.id === id ? s.pattern : null));

  useEffect(() => {
    void useDraft.getState().open(id);
  }, [id]);

  if (status === 'missing') {
    return (
      <>
        <AppHeader />
        <main className="page" id="main">
          <h1 className="page__title">{t('editor.missing')}</h1>
          <Link className="btn" to={paths.patterns()}>
            {t('nav.patterns')}
          </Link>
        </main>
      </>
    );
  }
  if (!pattern) return <main className="page page--loading" aria-busy="true" />;
  return <>{children(pattern)}</>;
}

/** "Saved" / "Saving…" / "Not saved" for the editor headers. */
export function SaveState() {
  const { t } = useTranslation();
  const dirty = useDraft((s) => s.dirty);
  const error = useDraft((s) => s.saveError);
  return (
    <span className={`save-state${error ? ' save-state--error' : ''}`} role="status">
      {error ? t('editor.saveError') : dirty ? t('editor.saving') : t('editor.saved')}
    </span>
  );
}

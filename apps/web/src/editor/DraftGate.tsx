import type { Pattern, Project } from '@kt/core';
import { useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from '../lib/Link';
import { paths } from '../lib/router';
import { useDraft } from '../state/draft';
import { AppHeader } from '../routes/AppHeader';

/**
 * Opens the project draft for `id` and renders `children` once it is loaded. Shared by the
 * project, pattern and chart screens, so moving between them keeps unsaved edits in memory.
 */
export function DraftGate({
  id,
  children,
}: {
  id: string;
  children: (project: Project) => ReactNode;
}) {
  const status = useDraft((s) => (s.id === id ? s.status : 'loading'));
  const project = useDraft((s) => (s.id === id ? s.project : null));

  useEffect(() => {
    void useDraft.getState().open(id);
  }, [id]);

  if (status === 'missing') return <Missing title="editor.missingProject" />;
  if (!project) return <main className="page page--loading" aria-busy="true" />;
  return <>{children(project)}</>;
}

/** {@link DraftGate} for one pattern of the project. */
export function PatternGate({
  projectId,
  patternId,
  children,
}: {
  projectId: string;
  patternId: string;
  children: (pattern: Pattern, project: Project) => ReactNode;
}) {
  return (
    <DraftGate id={projectId}>
      {(project) => {
        const pattern = project.patterns.find((p) => p.id === patternId);
        if (!pattern) return <Missing title="editor.missing" back={paths.project(projectId)} />;
        return children(pattern, project);
      }}
    </DraftGate>
  );
}

function Missing({ title, back }: { title: string; back?: string }) {
  const { t } = useTranslation();
  return (
    <>
      <AppHeader />
      <main className="page" id="main">
        <h1 className="page__title">{t(title)}</h1>
        <Link className="btn" to={back ?? paths.projects()}>
          {back ? t('editor.backToProject') : t('nav.projects')}
        </Link>
      </main>
    </>
  );
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

import { blankProject } from '@kt/core';
import { UPLOAD_LIMITS } from '@kt/importer';
import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { checkFile, ImportError } from '../import/client';
import { useImport } from '../import/session';
import { newId } from '../lib/files';
import { Link } from '../lib/Link';
import { navigate, paths } from '../lib/router';
import { useLibrary } from '../state/library';
import { Icon } from '../ui/Icon';
import { AppHeader } from './AppHeader';

/**
 * A new project: its name, then one of two starts — a PDF with the pattern description (charts,
 * legend and layout are recognised from it) or an empty project.
 */
export function NewProjectPage() {
  const { t } = useTranslation();
  const ids = useId();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const fromPdf = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      const checked = await checkFile(file, 'pdf');
      const session = useImport.getState();
      session.reset();
      session.setProjectName(name.trim());
      navigate(paths.import());
      void session.start(checked);
    } catch (e) {
      const code = e instanceof ImportError ? e.code : 'unreadable';
      setError(code === 'wrong-type' ? t('newProject.notPdf') : t(`importer.errors.${code}`));
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const create = async () => {
    setBusy(true);
    try {
      const project = blankProject({
        id: newId(),
        name: name.trim() || t('newProject.blankName'),
        sizes: [t('editor.oneSize')],
        now: new Date().toISOString(),
      });
      await useLibrary.getState().addProject(project);
      navigate(paths.project(project.id));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <AppHeader />
      <main className="page" id="main">
        <p className="page__back">
          <Link to={paths.projects()} className="link-back">
            <Icon name="back" size={18} />
            {t('nav.projects')}
          </Link>
        </p>
        <h1 className="page__title">{t('newProject.title')}</h1>

        <div className="field">
          <label htmlFor={`${ids}-name`}>{t('newProject.name')}</label>
          <input
            id={`${ids}-name`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            placeholder={t('newProject.namePlaceholder')}
            autoComplete="off"
          />
        </div>

        <div className="tiles">
          <label className="tile tile--file">
            <Icon name="upload" size={32} />
            <span className="tile__title">{t('newProject.fromPdf')}</span>
            <span className="tile__body">{t('newProject.fromPdfHint')}</span>
            <input
              ref={fileInput}
              type="file"
              accept="application/pdf,.pdf"
              className="visually-hidden"
              onChange={(e) => void fromPdf(e.target.files?.[0])}
            />
          </label>
          <button type="button" className="tile" onClick={() => void create()} disabled={busy}>
            <Icon name="plus" size={32} />
            <span className="tile__title">{t('newProject.create')}</span>
            <span className="tile__body">{t('newProject.createHint')}</span>
          </button>
        </div>

        {error && (
          <p className="notice notice--danger" role="alert">
            {error}
          </p>
        )}
        <p className="hint">
          {t('newProject.limits', {
            mb: Math.round(UPLOAD_LIMITS.maxBytes / 1024 / 1024),
            pages: UPLOAD_LIMITS.maxPdfPages,
          })}{' '}
          {t('newProject.privacy')}
        </p>
      </main>
    </>
  );
}

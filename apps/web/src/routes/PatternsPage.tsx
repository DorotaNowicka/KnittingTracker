import { serializePattern, validatePattern } from '@kt/core';
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createBlankPattern } from '../editor/createBlankPattern';
import { saveFile } from '../lib/files';
import { Link } from '../lib/Link';
import { navigate, paths } from '../lib/router';
import type { StoredPattern } from '../lib/storage';
import { samplePattern } from '../sample/samplePattern';
import { useLibrary } from '../state/library';
import { Icon } from '../ui/Icon';
import { AppHeader } from './AppHeader';

/** All patterns on this device: build new ones, edit, export, start projects. */
export function PatternsPage() {
  const { t } = useTranslation();
  const patterns = useLibrary((s) => s.patterns);
  const [busy, setBusy] = useState(false);
  const sorted = useMemo(
    () =>
      [...patterns].sort((a, b) =>
        (b.updatedAt ?? b.importedAt).localeCompare(a.updatedAt ?? a.importedAt),
      ),
    [patterns],
  );

  const create = async () => {
    setBusy(true);
    try {
      await createBlankPattern(t('editor.newTitle'), t('editor.oneSize'), t('editor.firstStage'));
    } finally {
      setBusy(false);
    }
  };

  const addSample = async () => {
    const stored = await useLibrary.getState().savePattern(samplePattern, 'sample');
    navigate(paths.pattern(stored.id));
  };

  return (
    <>
      <AppHeader />
      <main className="page" id="main">
        <h1 className="page__title">{t('patterns.title')}</h1>
        <p className="lead">{t('patterns.intro')}</p>
        <div className="choose__actions">
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => void create()}
            disabled={busy}
          >
            <Icon name="plus" />
            {t('patterns.create')}
          </button>
          <Link className="btn" to={paths.import()}>
            <Icon name="upload" />
            {t('patterns.recognise')}
          </Link>
          <Link className="btn" to={paths.new()}>
            {t('patterns.import')}
          </Link>
          {!patterns.some((p) => p.pattern.id === samplePattern.id) && (
            <button type="button" className="btn" onClick={() => void addSample()}>
              {t('patterns.addSample')}
            </button>
          )}
        </div>
        {sorted.length > 0 && (
          <ul className="project-list pattern-list">
            {sorted.map((p) => (
              <PatternRow key={p.id} stored={p} />
            ))}
          </ul>
        )}
      </main>
    </>
  );
}

function PatternRow({ stored }: { stored: StoredPattern }) {
  const { t } = useTranslation();
  const projects = useLibrary((s) => s.projects.filter((p) => p.patternId === stored.id).length);
  const dialog = useRef<HTMLDialogElement>(null);
  const { pattern } = stored;
  const ok = useMemo(() => validatePattern(pattern).ok, [pattern]);

  const exportFile = async () => {
    await saveFile(`${stored.id}.ktpattern.json`, serializePattern(pattern));
  };

  const remove = async () => {
    dialog.current?.close();
    await useLibrary.getState().deletePattern(stored.id);
  };

  return (
    <li className="project">
      <Link className="project__link" to={paths.pattern(stored.id)}>
        <span className="project__name">{pattern.title}</span>
        <span className="project__meta">
          <span>{t('patterns.charts', { count: pattern.charts.length })}</span>
          <span>{t('patterns.projects', { count: projects })}</span>
          {!ok && <span className="tag tag--danger">{t('patterns.needsWork')}</span>}
        </span>
      </Link>
      <button
        type="button"
        className="icon-btn"
        aria-label={t('patterns.export', { name: pattern.title })}
        onClick={() => void exportFile()}
      >
        <Icon name="download" />
      </button>
      {projects === 0 && (
        <button
          type="button"
          className="icon-btn"
          aria-label={t('patterns.delete', { name: pattern.title })}
          onClick={() => dialog.current?.showModal()}
        >
          <Icon name="trash" />
        </button>
      )}
      <dialog ref={dialog} className="dialog" aria-labelledby={`delp-${stored.id}`}>
        <h2 id={`delp-${stored.id}`} className="dialog__title">
          {t('patterns.deleteTitle', { name: pattern.title })}
        </h2>
        <p>{t('patterns.deleteBody')}</p>
        <div className="dialog__actions">
          <button type="button" className="btn" onClick={() => dialog.current?.close()}>
            {t('common.cancel')}
          </button>
          <button type="button" className="btn btn--danger" onClick={() => void remove()}>
            {t('patterns.deleteConfirm')}
          </button>
        </div>
      </dialog>
    </li>
  );
}

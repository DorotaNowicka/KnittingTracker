import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { readTextFile, saveFile } from '../lib/files';
import { sync } from '../lib/sync';
import {
  getLanguagePref,
  getThemePref,
  getWakeLockPref,
  setLanguagePref,
  setThemePref,
  setWakeLockPref,
  type LanguagePref,
  type ThemePref,
} from '../lib/preferences';
import { Link } from '../lib/Link';
import { paths } from '../lib/router';
import { persistenceState, type PersistState } from '../lib/storage';
import { useLibrary, type RestorePreview } from '../state/library';
import { Icon } from '../ui/Icon';
import { AppHeader } from './AppHeader';

export function SettingsPage() {
  const { t, i18n } = useTranslation();
  const ids = useId();
  const [theme, setTheme] = useState<ThemePref>(getThemePref);
  const [lang, setLang] = useState<LanguagePref>(getLanguagePref);
  const [wake, setWake] = useState(getWakeLockPref);
  const [persist, setPersist] = useState<PersistState | null>(null);
  const [exported, setExported] = useState<string | null>(null);
  const [restore, setRestore] = useState<RestorePreview | null>(null);
  const [restored, setRestored] = useState<string | null>(null);
  const storageKind = useLibrary((s) => s.storageKind);

  useEffect(() => {
    void persistenceState().then(setPersist);
  }, []);

  const exportBackup = async () => {
    const text = await useLibrary.getState().exportBackup();
    const date = new Date().toISOString().slice(0, 10);
    const how = await saveFile(`knitting-tracker-kopia-${date}.ktbackup.json`, text);
    setExported(how === 'shared' ? t('settings.backupShared') : t('settings.backupSaved'));
  };

  const pickBackup = async (file: File | undefined) => {
    setRestored(null);
    if (!file) return;
    try {
      const text = await readTextFile(file);
      setRestore(await useLibrary.getState().previewRestore(text));
    } catch {
      setRestore({ ok: false, errors: [t('settings.restoreTooLarge')] });
    }
  };

  const applyRestore = async () => {
    if (!restore?.ok) return;
    await useLibrary.getState().applyRestore(restore.plan);
    const added = restore.plan.projects.filter((p) => p.action !== 'keep' && p.action !== 'same');
    setRestored(t('settings.restoreDone', { count: added.length }));
    setRestore(null);
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
        <h1 className="page__title">{t('settings.title')}</h1>

        <fieldset className="field">
          <legend>{t('settings.theme')}</legend>
          <div className="segmented">
            {(['system', 'light', 'dark'] as const).map((v) => (
              <label key={v} className="segmented__item">
                <input
                  type="radio"
                  name={`${ids}-theme`}
                  value={v}
                  checked={theme === v}
                  onChange={() => {
                    setTheme(v);
                    setThemePref(v);
                  }}
                />
                <span>{t(`settings.themes.${v}`)}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="field">
          <legend>{t('settings.language')}</legend>
          <div className="segmented">
            {(['pl', 'en'] as const).map((v) => (
              <label key={v} className="segmented__item">
                <input
                  type="radio"
                  name={`${ids}-lang`}
                  value={v}
                  checked={lang === v}
                  onChange={() => {
                    setLang(v);
                    setLanguagePref(v);
                    void i18n.changeLanguage(v);
                  }}
                />
                <span>{v === 'pl' ? 'Polski' : 'English'}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="field">
          <label className="check">
            <input
              type="checkbox"
              checked={wake}
              onChange={(e) => {
                setWake(e.target.checked);
                setWakeLockPref(e.target.checked);
              }}
            />
            {t('settings.wakeLock')}
          </label>
          <p className="hint">{t('settings.wakeLockHint')}</p>
        </div>

        <section className="field" aria-labelledby={`${ids}-data`}>
          <h2 id={`${ids}-data`} className="section-title">
            {t('settings.data')}
          </h2>
          <p>
            {storageKind === 'memory'
              ? t('settings.storageMemory')
              : persist === 'persisted'
                ? t('settings.storagePersisted')
                : t('settings.storageBestEffort')}
          </p>
          <p className="hint">{t('settings.privacy')}</p>
          <p className="hint" data-testid="sync-status">
            {t(`settings.sync.${sync.status().state}`)}
          </p>
          <button type="button" className="btn" onClick={() => void exportBackup()}>
            <Icon name="download" />
            {t('settings.backup')}
          </button>
          <p className="hint" role="status">
            {exported}
          </p>

          <h3 className="subsection-title">{t('settings.restore')}</h3>
          <p className="hint">{t('settings.restoreHint')}</p>
          <label className="btn btn--file">
            <Icon name="upload" />
            {t('settings.restorePick')}
            <input
              type="file"
              accept=".json,application/json"
              className="visually-hidden"
              data-testid="restore-input"
              onChange={(e) => {
                void pickBackup(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </label>
          {restore && !restore.ok && (
            <div className="notice notice--danger" role="alert">
              <p>{t('settings.restoreInvalid')}</p>
              <ul>
                {restore.errors.slice(0, 5).map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
          )}
          {restore?.ok && (
            <RestoreSummary
              preview={restore}
              onApply={() => void applyRestore()}
              onCancel={() => setRestore(null)}
            />
          )}
          <p className="hint" role="status">
            {restored}
          </p>
        </section>
        <p className="hint app-version">{t('settings.version', { version: __APP_VERSION__ })}</p>
      </main>
    </>
  );
}

function RestoreSummary({
  preview,
  onApply,
  onCancel,
}: {
  preview: Extract<RestorePreview, { ok: true }>;
  onApply(): void;
  onCancel(): void;
}) {
  const { t, i18n } = useTranslation();
  const { plan, backup } = preview;
  const count = (list: readonly { action: string }[], action: string) =>
    list.filter((x) => x.action === action).length;
  const changes = count(plan.projects, 'add') + count(plan.projects, 'update');
  return (
    <div className="notice notice--info restore-summary" data-testid="restore-summary">
      {backup.exportedAt && (
        <p>
          {t('settings.restoreFrom', {
            date: new Date(backup.exportedAt).toLocaleString(i18n.language, {
              dateStyle: 'medium',
              timeStyle: 'short',
            }),
          })}
        </p>
      )}
      <div className="table-scroll">
        <table className="size-table">
          <thead>
            <tr>
              <th scope="col" />
              <th scope="col">{t('settings.restoreAdd')}</th>
              <th scope="col">{t('settings.restoreUpdate')}</th>
              <th scope="col">{t('settings.restoreKeep')}</th>
              <th scope="col">{t('settings.restoreSame')}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">{t('settings.restore_projects')}</th>
              {(['add', 'update', 'keep', 'same'] as const).map((a) => (
                <td key={a} className="num">
                  {count(plan.projects, a)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="hint">{t('settings.restoreRule')}</p>
      {backup.skipped.length > 0 && (
        <p className="hint">{t('settings.restoreSkipped', { count: backup.skipped.length })}</p>
      )}
      <div className="form-actions">
        <button type="button" className="btn" onClick={onCancel}>
          {t('common.cancel')}
        </button>
        <button
          type="button"
          className="btn btn--primary"
          disabled={changes === 0}
          onClick={onApply}
        >
          {changes === 0 ? t('settings.restoreNothing') : t('settings.restoreApply')}
        </button>
      </div>
    </div>
  );
}

import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { saveFile } from '../lib/files';
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
import { useLibrary } from '../state/library';
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
          <button type="button" className="btn" onClick={() => void exportBackup()}>
            <Icon name="download" />
            {t('settings.backup')}
          </button>
          <p className="hint" role="status">
            {exported}
          </p>
        </section>
      </main>
    </>
  );
}

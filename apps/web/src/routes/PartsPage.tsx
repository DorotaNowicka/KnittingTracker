import { PROJECT_KIND_INFO, type KindItem, type Project, type ProjectKind } from '@kt/core';
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DraftGate } from '../editor/DraftGate';
import { GarmentDiagram } from '../garment/GarmentDiagram';
import { addItemPatterns, itemPatterns, partStatus, startPattern } from '../garment/parts';
import { Link } from '../lib/Link';
import { navigate, paths } from '../lib/router';
import { useDraft } from '../state/draft';
import { Icon } from '../ui/Icon';
import { KIND_ICONS } from '../ui/kindIcons';
import { AppHeader } from './AppHeader';

/**
 * A project's garment split into numbered parts (body, sleeves…). A part with a pattern opens it;
 * a part without one gets a new pattern and opens the pattern creator.
 */
export function PartsPage({ projectId }: { projectId: string }) {
  return <DraftGate id={projectId}>{(project) => <Parts project={project} />}</DraftGate>;
}

function Parts({ project }: { project: Project }) {
  const kind = project.kind;
  // Own projects have no fixed parts: their patterns are on the project page.
  useEffect(() => {
    if (!kind || kind === 'custom') navigate(paths.project(project.id), { replace: true });
  }, [kind, project.id]);
  return kind && kind !== 'custom' ? <Garment project={project} kind={kind} /> : null;
}

function Garment({ project, kind }: { project: Project; kind: Exclude<ProjectKind, 'custom'> }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith('en') ? 'en' : 'pl';
  const ids = useId();
  const info = PROJECT_KIND_INFO[kind];
  const [hovered, setHovered] = useState<string | null>(null);
  const [choosing, setChoosing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const numbers = Object.fromEntries(info.items.map((it, i) => [it.id, i + 1]));
  const has = Object.fromEntries(
    info.items.map((it) => [it.id, { include: itemPatterns(project, it).length > 0 }]),
  );
  const choice = info.items.find((it) => it.id === choosing);
  const status = Object.fromEntries(info.items.map((it) => [it.id, partStatus(project, it)]));
  const tracked = info.items.filter((it) => status[it.id] !== 'off');
  const unready = tracked.filter((it) => status[it.id] === 'todo');
  const start = startPattern(project);
  const warnRef = useRef<HTMLDialogElement>(null);

  /** Take the ✓ off a part: it needs another look. */
  const unmark = (item: KindItem) => {
    const ids = itemPatterns(project, item).map((p) => p.id);
    useDraft.getState().update((p) => ({
      ...p,
      patterns: p.patterns.map((x) => (ids.includes(x.id) ? { ...x, ready: false } : x)),
      updatedAt: new Date().toISOString(),
    }));
  };
  /** Start knitting: right away when every tracked part is ready, else after the warning. */
  const knit = async (anyway = false) => {
    if (!start) return;
    if (unready.length > 0 && !anyway) {
      warnRef.current?.showModal();
      return;
    }
    warnRef.current?.close();
    await useDraft.getState().flush();
    navigate(paths.tracker(project.id, start.id));
  };

  /** Open the item's pattern, or create it (a choice first asks how the part is made). */
  const open = async (item: KindItem, optionId: string | null = null) => {
    if (busy) return;
    const existing = itemPatterns(project, item)[0];
    if (existing) {
      // Patterns read from a PDF keep their charts: they open in the pattern editor.
      const drawn = existing.design || existing.charts.length === 0;
      navigate(
        drawn ? paths.designer(project.id, existing.id) : paths.pattern(project.id, existing.id),
      );
      return;
    }
    if (item.type === 'choice' && optionId === null) {
      setChoosing(item.id);
      return;
    }
    setBusy(true);
    try {
      let created = '';
      useDraft.getState().update((p) => {
        const r = addItemPatterns(p, kind, item, optionId, lang);
        created = r.patternId;
        return { ...r.project, updatedAt: new Date().toISOString() };
      });
      await useDraft.getState().flush();
      if (created) navigate(paths.designer(project.id, created));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <AppHeader />
      <main className="page page--wide" id="main">
        <p className="page__back">
          <Link to={paths.project(project.id)} className="link-back">
            <Icon name="back" size={18} />
            {t('parts.toProject')}
          </Link>
        </p>
        <h1 className="page__title">{project.name}</h1>
        <p className="project-kind">
          <Icon name={KIND_ICONS[kind]} size={20} />
          {info.label[lang]}
        </p>

        <div className="track">
          <GarmentDiagram
            kind={kind}
            elements={has}
            selected={choosing}
            hovered={hovered}
            onSelect={(id) => {
              const item = info.items.find((it) => it.id === id);
              if (item) void open(item);
            }}
            onHover={setHovered}
            numbers={numbers}
            size="large"
          />
          <section className="track__list" aria-labelledby={`${ids}-t`}>
            <h2 id={`${ids}-t`} className="section-title">
              {t('parts.title')}
            </h2>
            <p className="hint">
              {t('parts.hint', { way: info.usualWay[lang] })} {info.pair && t('elements.pair')}
            </p>
            <ol className="track-list">
              {info.items.map((it) => {
                const patterns = itemPatterns(project, it);
                const count = it.type === 'part' && it.count && it.count > 1 ? it.count : 0;
                return (
                  <li key={it.id}>
                    <button
                      type="button"
                      className={`track-item part-link${hovered === it.id ? ' is-hover' : ''}${patterns.length > 0 ? ' has-status' : ' is-off'}`}
                      data-part={it.id}
                      aria-expanded={
                        it.type === 'choice' && patterns.length === 0
                          ? choosing === it.id
                          : undefined
                      }
                      onClick={() => void open(it)}
                      onPointerEnter={() => setHovered(it.id)}
                      onPointerLeave={() => setHovered(null)}
                      onFocus={() => setHovered(it.id)}
                      onBlur={() => setHovered(null)}
                    >
                      <span className="track-item__no" aria-hidden="true">
                        {numbers[it.id]}
                      </span>
                      <span className="track-item__name">
                        <span className="visually-hidden">{numbers[it.id]}. </span>
                        {it.label[lang]}
                        {count > 0 && ` ×${count}`}
                      </span>
                      <span className="track-item__note">
                        {patterns.length > 0
                          ? t('parts.open', { names: patterns.map((p) => p.name).join(', ') })
                          : t('parts.create')}
                      </span>
                      {status[it.id] !== 'off' && (
                        <span className={`part-status part-status--${status[it.id]}`}>
                          {status[it.id] === 'ready' && <Icon name="check" size={16} />}
                          {t(status[it.id] === 'ready' ? 'parts.ready' : 'parts.todo')}
                        </span>
                      )}
                    </button>
                    {status[it.id] === 'ready' && (
                      <button
                        type="button"
                        className="link-btn part-unmark"
                        onClick={() => unmark(it)}
                      >
                        {t('parts.unmark', { part: it.label[lang] })}
                      </button>
                    )}
                    {choice?.id === it.id && choice.type === 'choice' && (
                      <fieldset className="part-choice">
                        <legend>{t('parts.how', { part: it.label[lang] })}</legend>
                        <div className="part-choice__options">
                          {choice.options.map((o) => (
                            <button
                              key={o.id}
                              type="button"
                              className="btn"
                              disabled={busy}
                              onClick={() => void open(choice, o.id)}
                            >
                              {o.label[lang]}
                            </button>
                          ))}
                        </div>
                      </fieldset>
                    )}
                  </li>
                );
              })}
            </ol>
            {tracked.length > 0 && (
              <div className="parts-sizes">
                <p>
                  <b>{t('sizes.title')}:</b>{' '}
                  {project.sizes.length > 1 ? project.sizes.join(' – ') : t('sizes.oneSizeYet')}
                </p>
                <Link to={paths.sizes(project.id)} className="btn">
                  {t(project.sizes.length > 1 ? 'sizes.edit' : 'sizes.add')}
                </Link>
              </div>
            )}
            {tracked.length > 0 && start && (
              <div className="parts-finish">
                <p className="parts-finish__summary">
                  {t('parts.summary', {
                    ready: tracked.length - unready.length,
                    count: tracked.length,
                  })}
                </p>
                <button type="button" className="btn btn--primary" onClick={() => void knit()}>
                  {t('parts.start')}
                </button>
                <p className="hint">{t('parts.startHint', { name: start.name })}</p>
              </div>
            )}
          </section>
        </div>
        <dialog ref={warnRef} className="dialog" aria-labelledby={`${ids}-warn`}>
          <h2 id={`${ids}-warn`} className="dialog__title">
            {t('parts.notReadyTitle')}
          </h2>
          <p>{t('parts.notReadyBody')}</p>
          <ul className="parts-unready">
            {unready.map((it) => (
              <li key={it.id}>
                {numbers[it.id]}. {it.label[lang]}
              </li>
            ))}
          </ul>
          <div className="dialog__actions">
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => warnRef.current?.close()}
            >
              {t('parts.backToParts')}
            </button>
            <button type="button" className="btn" onClick={() => void knit(true)}>
              {t('parts.startAnyway')}
            </button>
          </div>
        </dialog>
      </main>
    </>
  );
}

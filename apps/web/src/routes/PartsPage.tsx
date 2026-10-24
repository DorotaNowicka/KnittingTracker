import { PROJECT_KIND_INFO, type KindItem, type Project, type ProjectKind } from '@kt/core';
import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DraftGate } from '../editor/DraftGate';
import { GarmentDiagram } from '../garment/GarmentDiagram';
import { addItemPatterns, itemPatterns } from '../garment/parts';
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

  /** Open the item's pattern, or create it (a choice first asks how the part is made). */
  const open = async (item: KindItem, optionId: string | null = null) => {
    if (busy) return;
    const existing = itemPatterns(project, item)[0];
    if (existing) {
      navigate(paths.pattern(project.id, existing.id));
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
      if (created) navigate(paths.pattern(project.id, created));
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
                      className={`track-item part-link${hovered === it.id ? ' is-hover' : ''}${patterns.length > 0 ? '' : ' is-off'}`}
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
                    </button>
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
          </section>
        </div>
      </main>
    </>
  );
}

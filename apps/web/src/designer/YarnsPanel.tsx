import { nextYarn, type Project, type Yarn } from '@kt/core';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../ui/Icon';
import { yarnInUse } from '../lib/yarns';
import { YarnSwatch } from '../ui/YarnSwatch';

/**
 * "Kolory" in the creator's panel (colourwork): the project's yarns — pick one to paint with the
 * colour brush, rename it, change its colour; yarns no pattern uses can be removed. Yarn A is the
 * main colour: cells without a colour of their own are knitted with it.
 */
export function YarnsPanel({
  project,
  active,
  painting,
  onPick,
  onChange,
}: {
  project: Project;
  /** Yarn the colour brush paints with. */
  active: string;
  /** The colour brush is the current tool. */
  painting: boolean;
  onPick(id: string): void;
  onChange(yarns: Yarn[]): void;
}) {
  const { t } = useTranslation();
  const ids = useId();
  const yarns = project.yarns ?? [];
  const name = (letter: string) => t('yarns.default', { letter });
  const add = (count = 1) => {
    let next = [...yarns];
    for (let i = 0; i < count; i++) {
      const y = nextYarn(next, name);
      if (y) next = [...next, y];
    }
    onChange(next);
    const last = next.at(-1);
    if (last) onPick(last.id);
  };
  const edit = (id: string, change: Partial<Yarn>) =>
    onChange(yarns.map((y) => (y.id === id ? { ...y, ...change } : y)));

  return (
    <section aria-labelledby={`${ids}-t`} className="yarns">
      <h2 id={`${ids}-t`} className="panel__title">
        {t('yarns.title')}
      </h2>
      {yarns.length === 0 ? (
        <>
          <p className="hint">{t('yarns.empty')}</p>
          <button type="button" className="btn btn--small" onClick={() => add(2)}>
            <Icon name="plus" size={18} />
            {t('yarns.start')}
          </button>
        </>
      ) : (
        <>
          <p className="hint">{t('yarns.hint')}</p>
          <ul className="yarns__list">
            {yarns.map((y) => {
              const used = yarnInUse(project, y.id);
              return (
                <li key={y.id} className="yarns__item">
                  <button
                    type="button"
                    className={`yarns__pick${painting && active === y.id ? ' is-active' : ''}`}
                    aria-pressed={painting && active === y.id}
                    aria-label={t('yarns.paintWith', { name: y.name })}
                    title={t('yarns.paintWith', { name: y.name })}
                    onClick={() => onPick(y.id)}
                  >
                    <YarnSwatch color={y.color} size={26} />
                    <span className="yarns__letter num">{y.id}</span>
                  </button>
                  <YarnName
                    value={y.name}
                    label={t('yarns.name', { letter: y.id })}
                    onCommit={(n) => edit(y.id, { name: n })}
                  />
                  <input
                    className="yarns__color"
                    type="color"
                    value={y.color}
                    aria-label={t('yarns.color', { name: y.name })}
                    onChange={(e) => edit(y.id, { color: e.target.value })}
                  />
                  <button
                    type="button"
                    className="icon-btn"
                    disabled={used}
                    aria-label={t('yarns.remove', { name: y.name })}
                    title={used ? t('yarns.inUse') : t('yarns.remove', { name: y.name })}
                    onClick={() => onChange(yarns.filter((x) => x.id !== y.id))}
                  >
                    <Icon name="trash" size={18} />
                  </button>
                </li>
              );
            })}
          </ul>
          {yarns.length < 12 && (
            <button type="button" className="btn btn--small" onClick={() => add()}>
              <Icon name="plus" size={18} />
              {t('yarns.add')}
            </button>
          )}
        </>
      )}
    </section>
  );
}

/** A yarn's name: saved as typed; an empty field keeps the last name until something is typed. */
function YarnName({
  value,
  label,
  onCommit,
}: {
  value: string;
  label: string;
  onCommit(name: string): void;
}) {
  const [text, setText] = useState(value);
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    setText(value);
  }
  return (
    <input
      className="yarns__name"
      type="text"
      value={text}
      maxLength={40}
      aria-label={label}
      onChange={(e) => {
        setText(e.target.value);
        const name = e.target.value.trim();
        if (name) {
          setSeen(name);
          onCommit(name);
        }
      }}
      onBlur={() => setText(value)}
    />
  );
}

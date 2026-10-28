import { useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { getSectionOpenPref, setSectionOpenPref } from '../lib/preferences';
import { Icon } from './Icon';

/**
 * A panel section whose title folds it away. The choice is remembered on this device, per kind of
 * section, so a knitter who knows the symbols keeps the legend closed in every pattern.
 */
export function Foldable({
  id,
  title,
  children,
  defaultOpen = true,
  remember = true,
}: {
  id: 'legend' | 'rowText' | 'description';
  title: ReactNode;
  /** The content, or a function of whether the section is open (to act when it opens). */
  children: ReactNode | ((open: boolean) => ReactNode);
  /** Open until the knitter folds it (the default), or folded until she opens it. */
  defaultOpen?: boolean;
  /** Keep the knitter's choice on this device; false: every page load starts at `defaultOpen`. */
  remember?: boolean;
}) {
  const { t } = useTranslation();
  const ids = useId();
  const [open, setOpen] = useState(() =>
    remember ? getSectionOpenPref(id, defaultOpen) : defaultOpen,
  );
  const toggle = () => {
    if (remember) setSectionOpenPref(id, !open);
    setOpen(!open);
  };
  return (
    <section
      className={`panel__section foldable${open ? '' : ' is-closed'}`}
      aria-labelledby={`${ids}-t`}
    >
      <h2 className="panel__title">
        <button
          type="button"
          id={`${ids}-t`}
          className="foldable__toggle"
          aria-expanded={open}
          aria-controls={`${ids}-c`}
          title={open ? t('panel.fold') : t('panel.unfold')}
          onClick={toggle}
        >
          <span>{title}</span>
          <Icon name="chevron" size={22} />
        </button>
      </h2>
      <div id={`${ids}-c`} hidden={!open}>
        {typeof children === 'function' ? children(open) : children}
      </div>
    </section>
  );
}

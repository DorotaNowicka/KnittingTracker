import { useTranslation } from 'react-i18next';
import { useGuides } from '../state/guides';
import { Icon } from './Icon';

/** Show or hide the guide lines at ¼, ½ and ¾ of the grid; sits in the grid's corner. */
export function GuidesToggle() {
  const { t } = useTranslation();
  const on = useGuides((s) => s.on);
  return (
    <button
      type="button"
      className={`grid-toggle${on ? ' is-on' : ''}`}
      aria-pressed={on}
      aria-label={t('guides.label')}
      title={t('guides.hint')}
      onClick={() => useGuides.getState().toggle()}
    >
      <Icon name="guides" size={18} />
    </button>
  );
}

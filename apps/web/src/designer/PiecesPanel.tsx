import type { Chart, Design, Pattern } from '@kt/core';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { ChartThumb } from '../editor/ChartThumb';
import { useMotifs } from '../state/motifs';
import { Icon } from '../ui/Icon';
import { removePlacement } from './designOps';

/** The library of pieces (tiles to lay on the grid) and the tiles already on it. */
export function PiecesPanel({
  design,
  library,
  own,
  holding,
  selected,
  onPick,
  onSelect,
  setDesign,
  onNewPiece,
  pattern,
}: {
  design: Design;
  library: readonly Chart[];
  own: readonly Chart[];
  /** The piece about to be laid on the grid. */
  holding: Chart | null;
  /** The tile selected on the grid. */
  selected: string | null;
  onPick(motif: Chart): void;
  onSelect(id: string | null): void;
  setDesign(design: Design): void;
  onNewPiece(): void;
  pattern: Pattern;
}) {
  const { t } = useTranslation();
  const ids = useId();
  const motifOf = (id: string) =>
    design.motifs.find((m) => m.id === id) ?? library.find((m) => m.id === id);

  return (
    <>
      <section aria-labelledby={`${ids}-lib`}>
        <h2 id={`${ids}-lib`} className="panel__title">
          {t('designer.library')}
        </h2>
        <p className="hint">{t('designer.libraryHint')}</p>
        <ul className="piece-list">
          {library.map((m) => (
            <li key={m.id} className="piece-list__item">
              <button
                type="button"
                className="piece"
                aria-pressed={holding?.id === m.id}
                onClick={() => onPick(m)}
              >
                <ChartThumb pattern={pattern} chart={m} maxWidth={72} maxHeight={48} />
                <span className="piece__name">{m.name}</span>
                <span className="piece__size num">
                  {t('editor.chartSize', { w: m.width, h: m.height })}
                </span>
              </button>
              {own.some((o) => o.id === m.id) && (
                <button
                  type="button"
                  className="icon-btn piece__remove"
                  aria-label={t('designer.removePiece', { name: m.name })}
                  onClick={() => void useMotifs.getState().remove(m.id)}
                >
                  <Icon name="trash" size={18} />
                </button>
              )}
            </li>
          ))}
        </ul>
        <button type="button" className="btn" onClick={onNewPiece}>
          <Icon name="plus" size={18} />
          {t('designer.newPiece')}
        </button>
      </section>

      <section aria-labelledby={`${ids}-on`}>
        <h2 id={`${ids}-on`} className="panel__title">
          {t('designer.onGrid')}
        </h2>
        {design.placements.length === 0 ? (
          <p className="hint">{t('designer.onGridEmpty')}</p>
        ) : (
          <ul className="placed-list">
            {design.placements.map((p) => {
              const motif = motifOf(p.motifId);
              return (
                <li key={p.id} className="placed">
                  <button
                    type="button"
                    className="placed__text"
                    aria-pressed={selected === p.id}
                    onClick={() => onSelect(selected === p.id ? null : p.id)}
                  >
                    <b>{motif?.name ?? p.motifId}</b>
                    <span className="hint">
                      {t('designer.placedAt', { col: p.col, row: p.row })} ·{' '}
                      {p.repeatX === 'fill'
                        ? t('designer.acrossFill')
                        : t('designer.acrossTimes', { count: p.repeatX })}{' '}
                      ·{' '}
                      {p.repeatY === 'fill'
                        ? t('designer.upFill')
                        : t('designer.upTimes', { count: p.repeatY })}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={t('designer.remove', { name: motif?.name ?? '' })}
                    onClick={() => {
                      if (selected === p.id) onSelect(null);
                      setDesign(removePlacement(design, p.id));
                    }}
                  >
                    <Icon name="trash" size={18} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}

import { placementArea, type Chart, type Design, type Pattern } from '@kt/core';
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
  fromFile,
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
  /** Every piece on offer: the file's, the ready-made ones and the knitter's own. */
  library: readonly Chart[];
  /** Charts of the imported pattern file. */
  fromFile: readonly Chart[];
  own: readonly Chart[];
  /** The piece about to be laid on the grid. */
  holding: Chart | null;
  /** The tiles selected on the grid. */
  selected: readonly string[];
  onPick(motif: Chart): void;
  /** Select a tile (null: none); `add`: Shift held, add it to the selection or take it out. */
  onSelect(id: string | null, add: boolean): void;
  setDesign(design: Design): void;
  onNewPiece(): void;
  pattern: Pattern;
}) {
  const { t } = useTranslation();
  const ids = useId();
  const motifOf = (id: string) =>
    design.motifs.find((m) => m.id === id) ?? library.find((m) => m.id === id);

  const file = new Set(fromFile.map((m) => m.id));
  const pieces = (list: readonly Chart[]) => (
    <ul className="piece-list">
      {list.map((m) => (
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
  );

  return (
    <>
      {fromFile.length > 0 && (
        <section aria-labelledby={`${ids}-file`}>
          <h2 id={`${ids}-file`} className="panel__title">
            {t('designer.fromFile')}
          </h2>
          <p className="hint">{t('designer.fromFileHint')}</p>
          {pieces(fromFile)}
        </section>
      )}
      <section aria-labelledby={`${ids}-lib`}>
        <h2 id={`${ids}-lib`} className="panel__title">
          {t('designer.library')}
        </h2>
        <p className="hint">{t('designer.libraryHint')}</p>
        {pieces(library.filter((m) => !file.has(m.id)))}
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
                    aria-pressed={selected.includes(p.id)}
                    onClick={(e) => onSelect(p.id, e.shiftKey)}
                  >
                    <b>{motif?.name ?? p.motifId}</b>
                    <span className="hint">
                      {(() => {
                        const area = motif ? placementArea(design, p, motif) : null;
                        const wide = area ? area.right - area.left + 1 : 0;
                        return t('designer.placedSummary', {
                          col: p.col,
                          times: area ? Math.floor(area.timesX) : 0,
                          w: motif?.width ?? 0,
                          count: wide,
                        });
                      })()}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={t('designer.remove', { name: motif?.name ?? '' })}
                    onClick={() => {
                      if (selected.includes(p.id)) onSelect(null, false);
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

import type { ProgressSummary, ResolvedPattern } from '@kt/core';
import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CommitNumber } from '../ui/CommitNumber';
import { Icon } from '../ui/Icon';

/**
 * Length of a pattern drawn in the creator, changed while knitting: more rows (its tiles repeat
 * further up) or fewer. Going below rows already worked asks first, because that progress goes.
 */
export function RowsControl({
  grid,
  summary,
  onChange,
}: {
  grid: ResolvedPattern;
  summary: ProgressSummary;
  onChange(rows: number): Promise<void>;
}) {
  const { t } = useTranslation();
  const ids = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const [pending, setPending] = useState<number | null>(null);
  const design = grid.pattern.design;
  if (!design) return null;
  const rows = design.height;
  const round = grid.pattern.construction === 'round';
  // The highest row with any stitch marked.
  const worked = summary.lastDone?.row ?? 0;

  const ask = (next: number) => {
    const target = Math.max(1, Math.min(1000, next));
    if (target === rows) return;
    if (target < worked) {
      setPending(target);
      dialog.current?.showModal();
      return;
    }
    void onChange(target);
  };

  return (
    <div className="rows-control" role="group" aria-label={t('rows.label')}>
      <span className="status__label" aria-hidden="true">
        {t(round ? 'rows.rounds' : 'rows.rows')}
      </span>
      <button
        type="button"
        className="icon-btn"
        aria-label={t(round ? 'rows.lessRounds' : 'rows.lessRows')}
        disabled={rows <= 1}
        onClick={() => ask(rows - 1)}
      >
        <Icon name="minus" size={18} />
      </button>
      <CommitNumber key={rows} label={t('rows.label')} value={rows} max={1000} onCommit={ask} />
      <button
        type="button"
        className="icon-btn"
        aria-label={t(round ? 'rows.moreRounds' : 'rows.moreRows')}
        disabled={rows >= 1000}
        onClick={() => ask(rows + 1)}
      >
        <Icon name="plus" size={18} />
      </button>
      <dialog ref={dialog} className="dialog" aria-labelledby={`${ids}-t`}>
        <h2 id={`${ids}-t`} className="dialog__title">
          {t('rows.warnTitle')}
        </h2>
        <p>
          {t(round ? 'rows.warnRounds' : 'rows.warnRows', {
            count: worked,
            target: pending ?? rows,
          })}
        </p>
        <div className="dialog__actions">
          <button
            type="button"
            className="btn"
            onClick={() => {
              dialog.current?.close();
              setPending(null);
            }}
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="btn btn--danger"
            onClick={() => {
              dialog.current?.close();
              if (pending !== null) void onChange(pending);
              setPending(null);
            }}
          >
            {t(round ? 'rows.shortenRounds' : 'rows.shortenRows', { count: pending ?? rows })}
          </button>
        </div>
      </dialog>
    </div>
  );
}

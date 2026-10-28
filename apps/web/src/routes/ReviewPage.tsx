import {
  createRegistry,
  patternRegistry,
  resolvePattern,
  splitsFrontBack,
  type Pattern,
  type Project,
  type ResolvedPattern,
} from '@kt/core';
import { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DraftGate } from '../editor/DraftGate';
import { PatternPreview } from '../editor/PatternPreview';
import { withDesignFromLayout } from '../import/elements';
import { Link } from '../lib/Link';
import { navigate, paths } from '../lib/router';
import { useDraft } from '../state/draft';
import { RowNotesEditor } from '../editor/RowNotesEditor';
import { Icon } from '../ui/Icon';
import { AppHeader } from './AppHeader';

/**
 * Checking a new project's parts one by one, after one was corrected in the creator: the part on
 * screen ("Zgadza się, następna", the last one "Zgadza się, zaczynam") and "Popraw w kreatorze".
 * A part approved here is ready (its ✓ on the parts page); "Gotowe" in the creator comes back here.
 */
export function ReviewPage({ projectId }: { projectId: string }) {
  return <DraftGate id={projectId}>{(project) => <Review project={project} />}</DraftGate>;
}

function Review({ project }: { project: Project }) {
  const { t } = useTranslation();
  const ids = useId();
  const parts = project.patterns;
  const [current, setCurrent] = useState<string | undefined>(
    () =>
      new URLSearchParams(window.location.search).get('czesc') ??
      parts.find((p) => !p.ready)?.id ??
      parts[0]?.id,
  );
  const [busy, setBusy] = useState(false);
  const part = parts.find((p) => p.id === current) ?? parts[0];
  const stage = useMemo((): ResolvedPattern | null => {
    if (!part) return null;
    try {
      return resolvePattern(project, part.id, { registry: patternRegistry(part) });
    } catch {
      return null;
    }
  }, [project, part]);
  if (!part) return null;
  const at = parts.indexOf(part);
  const others = [...parts.slice(at + 1), ...parts.slice(0, at)];
  const nextToCheck = others.find((p) => !p.ready);
  const round = part.construction === 'round';
  const done = parts.filter((p) => p.ready).length;

  const markReady = () =>
    useDraft.getState().updatePattern(part.id, (p) => ({ ...p, ready: true }));
  /** "Zgadza się": this part is fine; on to the next one still to check. */
  const agree = (next: Pattern) => {
    markReady();
    setCurrent(next.id);
    window.scrollTo?.({ top: 0 });
  };
  /** The last part checked: knitting starts with the first part. */
  const start = async () => {
    markReady();
    await useDraft.getState().flush();
    const first = parts[0];
    if (first) navigate(paths.tracker(project.id, first.id));
  };
  /** Correct the part in the creator: charts from the file become tiles first. */
  const correct = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (!part.design && part.charts.length > 0) {
        const sections = [t('importer.front'), t('importer.back')] as const;
        useDraft
          .getState()
          .update((p) =>
            withDesignFromLayout(
              p,
              part.id,
              createRegistry(),
              splitsFrontBack(p.kind, part.id) ? sections : undefined,
            ),
          );
      }
      await useDraft.getState().flush();
      navigate(paths.designer(project.id, part.id, { review: true }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <AppHeader />
      <main className="page page--wide review-page" id="main">
        <p className="page__back">
          <Link
            to={
              project.kind && project.kind !== 'custom'
                ? paths.parts(project.id)
                : paths.project(project.id)
            }
            className="link-back"
          >
            <Icon name="back" size={18} />
            {project.name}
          </Link>
        </p>
        <h1 className="page__title">{t('review.title')}</h1>
        <p className="lead">{t('review.lead')}</p>

        {parts.length > 1 && (
          <div className="preview-tabs" role="group" aria-label={t('preview.partsLabel')}>
            {parts.map((p, i) => (
              <button
                key={p.id}
                type="button"
                className="preview-tab"
                aria-pressed={p.id === part.id}
                onClick={() => setCurrent(p.id)}
              >
                <span className="part-button__no">{i + 1}</span>
                {p.name}
                {p.ready && (
                  <>
                    <Icon name="check" size={16} />
                    <span className="visually-hidden">{` ${t('preview.checkedPart')}`}</span>
                  </>
                )}
              </button>
            ))}
          </div>
        )}

        <section className="part-preview" aria-labelledby={`${ids}-h`}>
          <h2 id={`${ids}-h`} className="section-title part-panel__title">
            <span className="part-button__no">{at + 1}</span>
            {part.name}
            {part.ready && <span className="badge">{t('review.ready')}</span>}
          </h2>
          {stage && stage.stitchCount > 0 && (
            <ul className="facts-list">
              <li>
                {t(round ? 'preview.stitchesRound' : 'preview.stitchesFlat', {
                  count: stage.stitchCount,
                })}
              </li>
              {stage.plannedRows !== null && (
                <li>{t(round ? 'review.rounds' : 'review.rows', { count: stage.plannedRows })}</li>
              )}
            </ul>
          )}
          {stage && stage.stitchCount > 0 ? (
            <PatternPreview stage={stage} />
          ) : (
            <>
              <p className="hint">{t('review.counter')}</p>
              <h3 className="subsection-title">{t('rowNotes.title')}</h3>
              <RowNotesEditor
                pattern={part}
                update={(f) => useDraft.getState().updatePattern(part.id, f)}
              />
            </>
          )}
        </section>

        <div className="form-actions preview-step__actions">
          <button type="button" className="btn" disabled={busy} onClick={() => void correct()}>
            <Icon name="brush" size={18} />
            {t('review.correct')}
          </button>
          {nextToCheck ? (
            <button type="button" className="btn btn--primary" onClick={() => agree(nextToCheck)}>
              {t('preview.agreeNext')}
            </button>
          ) : (
            <button type="button" className="btn btn--primary" onClick={() => void start()}>
              {t('preview.start')}
            </button>
          )}
          {parts.length > 1 && (
            <p className="hint preview-step__progress">
              {t('preview.progress', { done, count: parts.length })}
              {nextToCheck && ` ${t('preview.nextIs', { part: nextToCheck.name })}`}
            </p>
          )}
        </div>
      </main>
    </>
  );
}

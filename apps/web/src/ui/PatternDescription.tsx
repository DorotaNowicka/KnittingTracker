import type { Pattern, ProjectKind } from '@kt/core';
import { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { paperEntries } from './descriptionEntries';
import { DescriptionPaper, type PaperEntry } from './DescriptionPaper';
import { Foldable } from './Foldable';

/**
 * "Opis wzoru" in the panel beside the grid (tracker and creator): the file's whole text, folded
 * on every page load (not remembered); when opened it is scrolled to the first piece of the part
 * on screen.
 */
export function PatternDescription({
  project,
  patternId,
}: {
  project: {
    readonly description?: string | undefined;
    readonly kind?: ProjectKind | undefined;
    readonly patterns: readonly Pattern[];
  };
  patternId: string;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith('en') ? 'en' : 'pl';
  const entries = useMemo(
    () => paperEntries(project, patternId, lang, t('describeMap.notInProject')),
    [project, patternId, lang, t],
  );
  if (!project.description?.trim()) return null;
  const hasOwn = entries.some((e) => e.current);
  return (
    <Foldable
      id="description"
      title={t('describeMap.panelTitle')}
      defaultOpen={false}
      remember={false}
    >
      {(open) => (
        <>
          <p className="hint">
            {hasOwn ? t('describeMap.panelHint') : t('describeMap.panelNoPart')}
          </p>
          <ScrolledPaper entries={entries} open={open} patternId={patternId} />
        </>
      )}
    </Foldable>
  );
}

/** The paper, scrolled to the current part's first piece whenever it is opened or the part changes. */
function ScrolledPaper({
  entries,
  open,
  patternId,
}: {
  entries: readonly PaperEntry[];
  open: boolean;
  patternId: string;
}) {
  const { t } = useTranslation();
  const paper = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const box = paper.current;
    if (!open || !box) return;
    // Measured from the boxes on screen, so it holds whatever the offset parents are.
    const go = () => {
      const first = box.querySelector<HTMLElement>('.description-paper__block.is-current');
      if (!first) {
        box.scrollTop = 0;
        return;
      }
      const shift = first.getBoundingClientRect().top - box.getBoundingClientRect().top;
      box.scrollTop = Math.max(0, box.scrollTop + shift - 8);
    };
    go();
    // Again once the layout settles (web fonts change where lines wrap).
    let stop = false;
    const frame = requestAnimationFrame(go);
    void document.fonts?.ready.then(() => {
      if (!stop) go();
    });
    return () => {
      stop = true;
      cancelAnimationFrame(frame);
    };
  }, [open, patternId]);
  return (
    <DescriptionPaper entries={entries} label={t('describeMap.paper')} focus paperRef={paper} />
  );
}

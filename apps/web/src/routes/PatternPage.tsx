import {
  addChart,
  addSize,
  addStage,
  chartUsage,
  duplicateChart,
  patternRegistry,
  removeChart,
  removeSize,
  removeStage,
  renameSize,
  resolveStage,
  serializePattern,
  validatePattern,
  type Diagnostic,
  type Pattern,
} from '@kt/core';
import { useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ChartThumb } from '../editor/ChartThumb';
import { DraftGate, SaveState } from '../editor/DraftGate';
import { LegendEditor } from '../editor/LegendEditor';
import { saveFile } from '../lib/files';
import { Link } from '../lib/Link';
import { navigate, paths } from '../lib/router';
import { useDraft } from '../state/draft';
import { useLibrary } from '../state/library';
import { DiagnosticsPanel } from '../ui/Diagnostics';
import { NumberField, TextField } from '../ui/fields';
import { Icon } from '../ui/Icon';
import { AppHeader } from './AppHeader';

export function PatternPage({ patternId }: { patternId: string }) {
  return (
    <DraftGate id={patternId}>
      {(pattern) => <PatternEditor id={patternId} pattern={pattern} />}
    </DraftGate>
  );
}

const update = (f: (p: Pattern) => Pattern) => useDraft.getState().update(f);

function PatternEditor({ id, pattern }: { id: string; pattern: Pattern }) {
  const { t } = useTranslation();
  const ids = useId();
  const report = useMemo(() => validatePattern(pattern), [pattern]);
  const projects = useLibrary((s) => s.projects.filter((p) => p.patternId === id).length);

  const action = (d: Diagnostic) => {
    if (d.stageId)
      return {
        label: t('editor.openStage'),
        run: () => navigate(paths.stage(id, d.stageId ?? '')),
      };
    if (d.chartId && pattern.charts.some((c) => c.id === d.chartId)) {
      return {
        label: t('editor.openChart'),
        run: () => navigate(paths.chart(id, d.chartId ?? '')),
      };
    }
    return null;
  };

  const exportFile = async () => {
    await useDraft.getState().flush();
    await saveFile(`${id}.ktpattern.json`, serializePattern(pattern));
  };

  return (
    <>
      <AppHeader />
      <main className="page page--wide" id="main">
        <p className="page__back">
          <Link to={paths.patterns()} className="link-back">
            <Icon name="back" size={18} />
            {t('nav.patterns')}
          </Link>
          <SaveState />
        </p>
        <h1 className="page__title">{pattern.title}</h1>
        {projects > 0 && (
          <p className="notice notice--info">{t('editor.usedByProjects', { count: projects })}</p>
        )}

        <section className="editor-section" aria-labelledby={`${ids}-about`}>
          <h2 id={`${ids}-about`} className="section-title">
            {t('editor.about')}
          </h2>
          <div className="form-grid">
            <TextField
              label={t('editor.titleLabel')}
              value={pattern.title}
              required
              maxLength={120}
              onCommit={(title) => update((p) => ({ ...p, title }))}
            />
            <TextField
              label={t('editor.designer')}
              value={pattern.designer ?? ''}
              maxLength={120}
              onCommit={(v) =>
                update(({ designer: _d, ...p }) => (v.trim() ? { ...p, designer: v } : p))
              }
            />
          </div>
          <TextField
            label={t('editor.notes')}
            value={pattern.notes ?? ''}
            maxLength={5000}
            multiline
            hint={t('editor.notesHint')}
            onCommit={(v) => update(({ notes: _n, ...p }) => (v.trim() ? { ...p, notes: v } : p))}
          />
        </section>

        <Sizes pattern={pattern} />
        <Charts id={id} pattern={pattern} />
        <Stages id={id} pattern={pattern} />

        <section className="editor-section" aria-labelledby={`${ids}-legend`}>
          <h2 id={`${ids}-legend`} className="section-title">
            {t('editor.legend')}
          </h2>
          <p className="hint">{t('editor.legendHint')}</p>
          <LegendEditor pattern={pattern} />
        </section>

        <section className="editor-section" aria-labelledby={`${ids}-check`}>
          <h2 id={`${ids}-check`} className="section-title">
            {t('editor.check')}
          </h2>
          <DiagnosticsPanel items={report.diagnostics} action={action} />
        </section>

        <div className="form-actions form-actions--sticky">
          <button type="button" className="btn" onClick={() => void exportFile()}>
            <Icon name="download" />
            {t('editor.export')}
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={!report.ok}
            onClick={() => {
              void useDraft
                .getState()
                .flush()
                .then(() => navigate(paths.patternProject(id)));
            }}
          >
            {t('editor.startProject')}
          </button>
        </div>
        {!report.ok && <p className="hint form-actions__hint">{t('editor.fixFirst')}</p>}
      </main>
    </>
  );
}

function Sizes({ pattern }: { pattern: Pattern }) {
  const { t } = useTranslation();
  const ids = useId();
  return (
    <section className="editor-section" aria-labelledby={`${ids}-sizes`}>
      <h2 id={`${ids}-sizes`} className="section-title">
        {t('editor.sizes')}
      </h2>
      <p className="hint">{t('editor.sizesHint')}</p>
      <ol className="size-list">
        {pattern.sizes.map((s, i) => (
          <li key={i} className="size-list__item">
            <TextField
              label={t('editor.sizeLabel', { n: i + 1 })}
              value={s}
              required
              maxLength={20}
              className="field--compact"
              onCommit={(v) => update((p) => renameSize(p, i, v))}
            />
            {pattern.sizes.length > 1 && (
              <button
                type="button"
                className="icon-btn"
                aria-label={t('editor.removeSize', { name: s })}
                onClick={() => update((p) => removeSize(p, i))}
              >
                <Icon name="trash" />
              </button>
            )}
          </li>
        ))}
      </ol>
      <button
        type="button"
        className="btn btn--small"
        onClick={() => update((p) => addSize(p, String(p.sizes.length + 1)))}
      >
        <Icon name="plus" />
        {t('editor.addSize')}
      </button>
    </section>
  );
}

function Charts({ id, pattern }: { id: string; pattern: Pattern }) {
  const { t } = useTranslation();
  const ids = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const usage = useMemo(() => chartUsage(pattern), [pattern]);

  return (
    <section className="editor-section" aria-labelledby={`${ids}-charts`}>
      <h2 id={`${ids}-charts`} className="section-title">
        {t('editor.charts')}
      </h2>
      {pattern.charts.length === 0 ? (
        <p className="hint">{t('editor.noCharts')}</p>
      ) : (
        <ul className="card-list">
          {pattern.charts.map((c) => (
            <li key={c.id} className="card">
              <Link className="card__main" to={paths.chart(id, c.id)}>
                <ChartThumb pattern={pattern} chart={c} />
                <span className="card__title">{c.name}</span>
                <span className="card__meta">
                  <span className="num">{t('editor.chartSize', { w: c.width, h: c.height })}</span>
                  <span>{t('editor.placements', { count: usage.get(c.id) ?? 0 })}</span>
                </span>
              </Link>
              <div className="card__actions">
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={t('editor.duplicateChart', { name: c.name })}
                  onClick={() =>
                    update(
                      (p) =>
                        duplicateChart(p, c.id, t('editor.copyName', { name: c.name }).slice(0, 40))
                          .pattern,
                    )
                  }
                >
                  <Icon name="copy" />
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={t('editor.removeChart', { name: c.name })}
                  onClick={() => update((p) => removeChart(p, c.id))}
                >
                  <Icon name="trash" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="btn" onClick={() => dialog.current?.showModal()}>
        <Icon name="plus" />
        {t('editor.addChart')}
      </button>
      <NewChartDialog
        ref={dialog}
        suggested={`A.${pattern.charts.length + 1}`}
        onCreate={(name, w, h) => {
          let created = '';
          update((p) => {
            const r = addChart(p, name, w, h);
            created = r.chartId;
            return r.pattern;
          });
          if (created) navigate(paths.chart(id, created));
        }}
      />
    </section>
  );
}

function NewChartDialog({
  ref,
  suggested,
  onCreate,
}: {
  ref: React.RefObject<HTMLDialogElement | null>;
  suggested: string;
  onCreate(name: string, width: number, height: number): void;
}) {
  const { t } = useTranslation();
  const ids = useId();
  const [name, setName] = useState('');
  const [w, setW] = useState(8);
  const [h, setH] = useState(8);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    ref.current?.close();
    onCreate((name.trim() || suggested).slice(0, 40), w, h);
    setName('');
  };
  return (
    <dialog ref={ref} className="dialog" aria-labelledby={`${ids}-title`}>
      <form onSubmit={submit}>
        <h2 id={`${ids}-title`} className="dialog__title">
          {t('editor.newChart')}
        </h2>
        <TextField
          label={t('editor.chartName')}
          value={name}
          maxLength={40}
          hint={t('editor.chartNameHint', { name: suggested })}
          onCommit={setName}
        />
        <div className="form-grid form-grid--2">
          <NumberField label={t('editor.width')} value={w} min={1} max={200} onCommit={setW} />
          <NumberField label={t('editor.height')} value={h} min={1} max={200} onCommit={setH} />
        </div>
        <div className="dialog__actions">
          <button type="button" className="btn" onClick={() => ref.current?.close()}>
            {t('common.cancel')}
          </button>
          <button type="submit" className="btn btn--primary">
            {t('editor.createChart')}
          </button>
        </div>
      </form>
    </dialog>
  );
}

function Stages({ id, pattern }: { id: string; pattern: Pattern }) {
  const { t } = useTranslation();
  const ids = useId();
  const counts = useMemo(() => {
    const out = new Map<string, number[]>();
    let registry;
    try {
      registry = patternRegistry(pattern);
    } catch {
      return out;
    }
    for (const s of pattern.stages) {
      try {
        out.set(
          s.id,
          pattern.sizes.map((_, i) => resolveStage(pattern, s.id, i, { registry }).stitchCount),
        );
      } catch {
        /* shown by validation */
      }
    }
    return out;
  }, [pattern]);

  return (
    <section className="editor-section" aria-labelledby={`${ids}-stages`}>
      <h2 id={`${ids}-stages`} className="section-title">
        {t('editor.stages')}
      </h2>
      <p className="hint">{t('editor.stagesHint')}</p>
      <ul className="card-list card-list--rows">
        {pattern.stages.map((s) => (
          <li key={s.id} className="card card--row">
            <Link className="card__main" to={paths.stage(id, s.id)}>
              <span className="card__title">{s.name}</span>
              <span className="card__meta">
                <span>{t(s.construction === 'round' ? 'editor.round' : 'editor.flat')}</span>
                <span className="num">
                  {t('editor.stitchesPerSize', { list: (counts.get(s.id) ?? []).join('-') || '0' })}
                </span>
              </span>
            </Link>
            <div className="card__actions">
              <Link className="btn btn--small" to={paths.stage(id, s.id)}>
                {t('editor.editLayout')}
              </Link>
              {pattern.stages.length > 1 && (
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={t('editor.removeStage', { name: s.name })}
                  onClick={() => update((p) => removeStage(p, s.id))}
                >
                  <Icon name="trash" />
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="btn btn--small"
        onClick={() => {
          let created = '';
          update((p) => {
            const r = addStage(p, t('editor.stageName', { n: p.stages.length + 1 }));
            created = r.stageId;
            return r.pattern;
          });
          if (created) navigate(paths.stage(id, created));
        }}
      >
        <Icon name="plus" />
        {t('editor.addStage')}
      </button>
    </section>
  );
}

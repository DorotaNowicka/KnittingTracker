import {
  applyDesign,
  designAtSize,
  patternRegistry,
  replaceSizes,
  sizeValueAt,
  type Design,
  type DesignSizes,
  type Pattern,
  type Project,
} from '@kt/core';
import type { TFunction } from 'i18next';
import { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { tileProblems } from '../designer/designOps';
import { DraftGate } from '../editor/DraftGate';
import { splitSizes } from '../import/session';
import { Link } from '../lib/Link';
import { navigate, paths } from '../lib/router';
import { useDraft } from '../state/draft';
import { Icon } from '../ui/Icon';
import { AppHeader } from './AppHeader';

/**
 * "Rozmiary projektu": the sizes a hand-made project comes in, and a table per part of everything
 * that changes with the size — the grid's width and height (or length in cm), and the horizontal
 * repeats of the pieces laid with a number of repeats. Columns are the sizes. The parts are drawn
 * in one size: its column shows the values as drawn, the others show them as a placeholder, and
 * an empty field means "as drawn".
 */
export function SizesPage({ projectId }: { projectId: string }) {
  return <DraftGate id={projectId}>{(project) => <SizesForm project={project} />}</DraftGate>;
}

/** One line of a part's table: a number that can differ per size. */
interface Line {
  readonly key: string;
  readonly label: string;
  readonly hint?: string;
  /** The value in the size the part was drawn in (the placeholder of the other sizes). */
  readonly base: number;
  /** Read only in the drawn size: it is the grid in the creator. */
  readonly drawn: boolean;
  /** Centimetres take decimals. */
  readonly cm?: boolean;
}

const WIDTH = 'w';
const HEIGHT = 'h';
const LENGTH = 'cm';
const ROWS = 'rows';
const repeatKey = (placementId: string) => `rep:${placementId}`;
const cellKey = (patternId: string, line: string, size: string) =>
  `${patternId}\u0000${line}\u0000${size}`;

/** The size the parts were drawn in: what a design says, else the knitted size. */
const drawnSizeOf = (project: Project) =>
  project.patterns.find((p) => p.design?.sizes)?.design?.sizes?.base ?? project.sizeIndex;

/** A typed number: whole stitches/rows 1–1000, or cm with decimals; null when empty or wrong. */
function parse(text: string | undefined, cm = false): number | null {
  const v = (text ?? '').trim().replace(',', '.');
  if (v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0 || n > 1000) return null;
  return cm ? Math.round(n * 10) / 10 : Number.isInteger(n) ? n : null;
}
const isValid = (text: string | undefined, cm = false) =>
  (text ?? '').trim() === '' || parse(text, cm) !== null;

function SizesForm({ project }: { project: Project }) {
  const { t } = useTranslation();
  const ids = useId();
  const oneSize = project.sizes.length === 1;
  const drawnAt = drawnSizeOf(project);
  const [sizesText, setSizesText] = useState(oneSize ? '' : project.sizes.join(' - '));
  const typed = splitSizes(sizesText).slice(0, 12);
  // Before any sizes are typed, the table shows the project's one size.
  const labels = typed.length > 0 ? [...new Set(typed)] : project.sizes;
  const [baseLabel, setBaseLabel] = useState(
    oneSize ? '' : (project.sizes[drawnAt] ?? project.sizes[0] ?? ''),
  );
  // With several sizes the knitter says which one the parts were drawn in (no guessing).
  const base = labels.length === 1 ? 0 : labels.indexOf(baseLabel);
  const parts = useMemo(() => partsOf(project, t), [project, t]);
  const [values, setValues] = useState<Record<string, string>>(() => initialValues(project, parts));
  const set = (key: string, v: string) => setValues((x) => ({ ...x, [key]: v }));
  const invalid = parts.some((part) =>
    part.lines.some((line) =>
      labels.some((l) => !isValid(values[cellKey(part.pattern.id, line.key, l)], line.cm)),
    ),
  );
  const back =
    project.kind && project.kind !== 'custom' ? paths.parts(project.id) : paths.project(project.id);

  const sizesOf = (part: Part): DesignSizes | undefined =>
    base < 0 ? undefined : designSizes(part, labels, base, values);

  const save = async () => {
    if (invalid || base < 0) return;
    const knitted = labels.indexOf(project.sizes[project.sizeIndex] ?? '');
    const from = labels.map((l) => {
      const i = project.sizes.indexOf(l);
      return i >= 0 ? i : drawnAt;
    });
    useDraft.getState().update((p) => {
      const sized = replaceSizes(p, labels, from, knitted >= 0 && !oneSize ? knitted : base);
      return {
        ...sized,
        patterns: sized.patterns.map((pattern) => {
          const part = parts.find((x) => x.pattern.id === pattern.id);
          return part ? withSizes(pattern, part, labels, base, values) : pattern;
        }),
        updatedAt: new Date().toISOString(),
      };
    });
    await useDraft.getState().flush();
    navigate(back);
  };

  return (
    <>
      <AppHeader />
      <main className="page page--wide sizes-page" id="main">
        <p className="page__back">
          <Link to={back} className="link-back">
            <Icon name="back" size={18} />
            {project.kind && project.kind !== 'custom' ? t('designer.back') : t('sizes.toProject')}
          </Link>
        </p>
        <h1 className="page__title">{t('sizes.title')}</h1>
        <p className="lead">{t('sizes.lead')}</p>

        <div className="form-grid sizes-page__head">
          <div className="field">
            <label htmlFor={`${ids}-sizes`}>{t('sizes.list')}</label>
            <input
              id={`${ids}-sizes`}
              value={sizesText}
              onChange={(e) => setSizesText(e.target.value)}
              placeholder="S - M - L"
              maxLength={200}
              autoComplete="off"
              aria-describedby={`${ids}-sizes-hint`}
            />
            <p id={`${ids}-sizes-hint`} className="hint">
              {t('sizes.listHint')}
            </p>
          </div>
          <div className="field">
            <label htmlFor={`${ids}-base`}>{t('sizes.drawnIn')}</label>
            <select
              id={`${ids}-base`}
              value={labels[base] ?? ''}
              onChange={(e) => setBaseLabel(e.target.value)}
            >
              {base < 0 && <option value="">{t('sizes.choose')}</option>}
              {labels.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
            <p className="hint">{t('sizes.drawnInHint')}</p>
          </div>
        </div>

        {parts.length === 0 ? (
          <p className="notice">{t('sizes.noParts')}</p>
        ) : (
          parts.map((part) => (
            <PartTable
              key={part.pattern.id}
              part={part}
              labels={labels}
              base={base}
              values={values}
              onChange={set}
              sizes={sizesOf(part)}
            />
          ))
        )}

        {base < 0 && <p className="notice notice--warning">{t('sizes.chooseFirst')}</p>}
        <div className="form-actions form-actions--sticky">
          <Link to={back} className="btn">
            {t('common.cancel')}
          </Link>
          <button
            type="button"
            className="btn btn--done"
            disabled={invalid || base < 0 || parts.length === 0}
            onClick={() => void save()}
          >
            <Icon name="check" size={20} />
            {t('sizes.save')}
          </button>
        </div>
      </main>
    </>
  );
}

interface Part {
  readonly pattern: Pattern;
  readonly lines: readonly Line[];
  /** Pieces that run to the grid's edge: they fit themselves to every width. */
  readonly stretching: readonly string[];
}

/** The parts and what of each can change with the size. */
function partsOf(project: Project, t: TFunction) {
  const at = drawnSizeOf(project);
  return project.patterns.flatMap((pattern): Part[] => {
    const lines: Line[] = [];
    const stretching: string[] = [];
    const cm = sizeValueAt(pattern.targetCm, at);
    const design = pattern.design;
    if (design) {
      lines.push({ key: WIDTH, label: t('sizes.width'), base: design.width, drawn: true });
      if (cm === undefined)
        lines.push({ key: HEIGHT, label: t('sizes.height'), base: design.height, drawn: true });
      for (const p of design.placements) {
        const motif = design.motifs.find((m) => m.id === p.motifId);
        if (!motif) continue;
        if (p.repeatX === 'fill') {
          stretching.push(motif.name);
          continue;
        }
        lines.push({
          key: repeatKey(p.id),
          label: t('sizes.repeats', { name: motif.name }),
          hint: t('sizes.repeatsHint', { count: motif.width }),
          base: p.repeatX,
          drawn: true,
        });
      }
    } else {
      const rows = sizeValueAt(pattern.rows, at);
      if (rows !== undefined)
        lines.push({ key: ROWS, label: t('sizes.rows'), base: rows, drawn: false });
    }
    if (cm !== undefined)
      lines.push({ key: LENGTH, label: t('sizes.length'), base: cm, drawn: false, cm: true });
    return lines.length > 0 ? [{ pattern, lines, stretching }] : [];
  });
}

/** What the fields show at first: the numbers set so far for every size but the drawn one. */
function initialValues(project: Project, parts: readonly Part[]): Record<string, string> {
  const at = drawnSizeOf(project);
  const out: Record<string, string> = {};
  for (const { pattern, lines } of parts) {
    const s = pattern.design?.sizes;
    project.sizes.forEach((label, i) => {
      for (const line of lines) {
        let v: number | null | undefined;
        if (line.key === WIDTH) v = s?.width?.[i];
        else if (line.key === HEIGHT) v = s?.height?.[i];
        else if (line.key === ROWS) v = sizeValueAt(pattern.rows, i);
        else if (line.key === LENGTH) v = sizeValueAt(pattern.targetCm, i);
        else v = s?.repeats?.find((r) => repeatKey(r.placementId) === line.key)?.values[i];
        // Equal to the drawn size: left empty, so the placeholder shows it.
        if (v !== null && v !== undefined && (i === at ? !line.drawn : v !== line.base))
          out[cellKey(pattern.id, line.key, label)] = String(v);
      }
    });
  }
  return out;
}

/** The per-size lists of a part's design from the table (null = as drawn). */
function designSizes(
  part: Part,
  labels: readonly string[],
  base: number,
  values: Record<string, string>,
): DesignSizes | undefined {
  const design = part.pattern.design;
  if (!design) return undefined;
  const column = (key: string) => {
    const list = labels.map((l, i) =>
      i === base ? null : parse(values[cellKey(part.pattern.id, key, l)]),
    );
    return list.some((v) => v !== null) ? list : undefined;
  };
  const width = column(WIDTH);
  const height = part.lines.some((l) => l.key === HEIGHT) ? column(HEIGHT) : undefined;
  const repeats = design.placements.flatMap((p) => {
    const values = p.repeatX === 'fill' ? undefined : column(repeatKey(p.id));
    return values ? [{ placementId: p.id, values }] : [];
  });
  if (!width && !height && repeats.length === 0) return undefined;
  return {
    base,
    ...(width ? { width } : {}),
    ...(height ? { height } : {}),
    ...(repeats.length > 0 ? { repeats } : {}),
  };
}

/** The pattern with the table's numbers: per-size lists, and its design composed again. */
function withSizes(
  pattern: Pattern,
  part: Part,
  labels: readonly string[],
  base: number,
  values: Record<string, string>,
): Pattern {
  const perSize = (line: Line) =>
    labels.map((l) => parse(values[cellKey(pattern.id, line.key, l)], line.cm) ?? line.base);
  let next: Pattern = pattern;
  for (const line of part.lines) {
    if (line.key === ROWS) next = { ...next, rows: perSize(line) };
    if (line.key === LENGTH) next = { ...next, targetCm: perSize(line) };
  }
  if (!next.design) return next;
  const sizes = designSizes(part, labels, base, values);
  const { sizes: _old, ...drawn } = next.design;
  const design: Design = sizes ? { ...drawn, sizes } : drawn;
  return applyDesign({ ...next, design }, patternRegistry(next));
}

function PartTable({
  part,
  labels,
  base,
  values,
  onChange,
  sizes,
}: {
  part: Part;
  labels: readonly string[];
  base: number;
  values: Record<string, string>;
  onChange(key: string, value: string): void;
  sizes: DesignSizes | undefined;
}) {
  const { t } = useTranslation();
  const ids = useId();
  const { pattern, lines, stretching } = part;
  // Tiles that would overlap or fall off the grid in a size.
  const problems = useMemo(() => {
    const design = pattern.design;
    if (!design || !sizes) return [];
    const sized = { ...design, sizes };
    return labels.flatMap((label, i) => {
      if (i === base) return [];
      const d = designAtSize(sized, i);
      const name = (id: string) =>
        d.motifs.find((m) => m.id === d.placements.find((p) => p.id === id)?.motifId)?.name ?? '';
      return tileProblems(d).map((x) =>
        x.kind === 'off'
          ? t('sizes.off', { size: label, name: name(x.tile.id) })
          : t('sizes.overlap', { size: label, name: name(x.tile.id), other: name(x.with.id) }),
      );
    });
  }, [pattern.design, sizes, labels, base, t]);
  return (
    <section className="sizes-part" aria-labelledby={`${ids}-t`}>
      <h2 id={`${ids}-t`} className="section-title">
        {pattern.name}
      </h2>
      <div className="sizes-part__scroll">
        <table className="size-table sizes-table">
          <thead>
            <tr>
              <th scope="col">
                <span className="visually-hidden">{t('sizes.what')}</span>
              </th>
              {labels.map((l, i) => (
                <th key={l} scope="col" className={i === base ? 'is-drawn' : undefined}>
                  {l}
                  {i === base && <span className="sizes-table__drawn">{t('sizes.drawn')}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.key}>
                <th scope="row">
                  {line.label}
                  {line.hint && <span className="sizes-table__hint">{line.hint}</span>}
                </th>
                {labels.map((l, i) => {
                  const key = cellKey(pattern.id, line.key, l);
                  if (i === base && line.drawn)
                    return (
                      <td key={l} className="num is-drawn">
                        {line.base}
                      </td>
                    );
                  const text = values[key] ?? '';
                  const bad = !isValid(text, line.cm);
                  return (
                    <td key={l} className={i === base ? 'is-drawn' : undefined}>
                      <input
                        className="sizes-table__input num"
                        inputMode={line.cm ? 'decimal' : 'numeric'}
                        value={text}
                        placeholder={String(line.base)}
                        aria-label={t('sizes.cell', { what: line.label, size: l })}
                        aria-invalid={bad || undefined}
                        onChange={(e) => onChange(key, e.target.value)}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {stretching.length > 0 && (
        <p className="hint">{t('sizes.stretching', { names: stretching.join(', ') })}</p>
      )}
      {problems.length > 0 && (
        <ul className="notice notice--warning sizes-part__problems">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

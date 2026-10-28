import {
  applySymbolRows,
  blankChart,
  paintCell,
  parseChart,
  repairRows,
  STD,
  withColorRows,
  YARN_COLORS,
  type Chart,
  type SymbolRegistry,
  type SymbolRows,
  type Yarn,
} from '@kt/core';
import { chartSource, editorOverlay, type YarnColors } from '@kt/grid-renderer';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EditorCanvas } from '../editor/EditorCanvas';
import { newId } from '../lib/files';
import { useMotifs } from '../state/motifs';
import { NumberField, TextField } from '../ui/fields';
import { YarnSwatch } from '../ui/YarnSwatch';
import { SymbolPalette } from './SymbolPalette';

const blankRows = (w: number, h: number): string[][] =>
  Array.from({ length: h }, () => Array<string>(w).fill(STD.knit));
const blankColours = (w: number, h: number): (string | null)[][] =>
  Array.from({ length: h }, () => Array<string | null>(w).fill(null));

/**
 * The knitter's own piece of pattern: its size and its stitches, painted with the brush. Saved in
 * the library of every project.
 */
export function MotifDialog({
  registry,
  yarns,
  colors,
  onSaved,
  onClose,
}: {
  registry: SymbolRegistry;
  /** The project's yarns: a piece can be coloured with them (colourwork). */
  yarns: readonly Yarn[];
  colors: YarnColors;
  onSaved(motif: Chart): void;
  onClose(): void;
}) {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDialogElement>(null);
  // Shown while mounted: the parent mounts it to open it.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal?.();
  }, []);
  const ids = useId();
  const [name, setName] = useState(() => t('designer.newPieceName'));
  const [rows, setRows] = useState<SymbolRows>(() => blankRows(4, 4));
  const [symbol, setSymbol] = useState<string>(STD.purl);
  /** Colourwork: paint stitches or colours; the yarn painted with; each cell's yarn. */
  const [mode, setMode] = useState<'stitches' | 'colors'>('stitches');
  // A project without yarns yet still colours a piece: with its first two letters.
  const choices: readonly Yarn[] =
    yarns.length > 0
      ? yarns
      : (['A', 'B'] as const).map((id, i) => ({
          id,
          name: t('yarns.default', { letter: id }),
          color: YARN_COLORS[i] ?? '#808080',
        }));
  const [yarn, setYarn] = useState(() => choices[1]?.id ?? 'A');
  const [colours, setColours] = useState<(string | null)[][]>(() => blankColours(4, 4));
  const last = useRef<string | null>(null);
  const width = rows[0]?.length ?? 1;
  const height = rows.length;

  const chart = useMemo(
    () =>
      withColorRows(
        applySymbolRows(blankChart({ id: 'piece', name: name.slice(0, 40) || 'Wzór' }, 1, 1), rows),
        colours,
      ),
    [rows, colours, name],
  );
  const source = useMemo(
    () => chartSource(parseChart(chart, registry), registry, colors),
    [chart, registry, colors],
  );
  const overlay = useMemo(() => editorOverlay({}), []);

  const resize = (w: number, h: number) => {
    setRows(
      repairRows(
        Array.from({ length: h }, (_, r) =>
          Array.from({ length: w }, (_, c) => rows[r]?.[c] ?? STD.knit),
        ),
        registry,
      ),
    );
    setColours(
      Array.from({ length: h }, (_, r) =>
        Array.from({ length: w }, (_, c) => colours[r]?.[c] ?? null),
      ),
    );
  };
  const paint = (row: number, col: number) => {
    const key = `${row}:${col}`;
    if (last.current === key) return;
    last.current = key;
    if (mode === 'colors') {
      setColours((current) =>
        current.map((r, i) => (i === row - 1 ? r.map((y, j) => (j === col - 1 ? yarn : y)) : r)),
      );
      return;
    }
    setRows((current) => paintCell(current, registry, row, col, symbol));
  };
  const close = () => {
    dialogRef.current?.close();
    onClose();
  };
  const save = async () => {
    const motif = { ...chart, id: `own:${newId()}` };
    await useMotifs.getState().save(motif);
    onSaved(motif);
    close();
  };

  return (
    <dialog
      ref={dialogRef}
      className="dialog dialog--wide piece-dialog"
      aria-labelledby={`${ids}-t`}
    >
      <h2 id={`${ids}-t`} className="dialog__title">
        {t('designer.newPiece')}
      </h2>
      <p className="hint">{t('designer.newPieceHint')}</p>
      <div className="form-grid">
        <TextField
          label={t('designer.pieceName')}
          value={name}
          required
          maxLength={40}
          onCommit={setName}
        />
        <NumberField
          label={t('designer.pieceWidth')}
          value={width}
          min={1}
          max={100}
          onCommit={(w) => resize(w, height)}
        />
        <NumberField
          label={t('designer.pieceHeight')}
          value={height}
          min={1}
          max={100}
          onCommit={(h) => resize(width, h)}
        />
      </div>
      <div className="piece-dialog__body">
        <div className="piece-dialog__canvas">
          <EditorCanvas
            source={source}
            overlay={overlay}
            tool="paint"
            label={t('designer.pieceCanvas')}
            help={t('designer.pieceHelp')}
            fitKey={`${width}x${height}`}
            testId="piece-canvas"
            onStrokeStart={(c) => {
              last.current = null;
              paint(c.row, c.col);
            }}
            onStrokeMove={(c) => paint(c.row, c.col)}
            onStrokeEnd={() => {
              last.current = null;
            }}
          />
        </div>
        <div className="piece-dialog__palette">
          <div className="segmented" role="radiogroup" aria-label={t('designer.pieceMode')}>
            {(['stitches', 'colors'] as const).map((m) => (
              <label key={m} className="segmented__item">
                <input
                  type="radio"
                  name={`${ids}-mode`}
                  checked={mode === m}
                  onChange={() => setMode(m)}
                />
                <span>
                  {t(m === 'stitches' ? 'designer.pieceStitches' : 'designer.pieceColors')}
                </span>
              </label>
            ))}
          </div>
          {mode === 'stitches' ? (
            <SymbolPalette registry={registry} active={symbol} onPick={setSymbol} />
          ) : (
            <ul className="yarns__list yarns__list--pick">
              {choices.map((y) => (
                <li key={y.id}>
                  <button
                    type="button"
                    className={`yarns__pick yarns__pick--wide${yarn === y.id ? ' is-active' : ''}`}
                    aria-pressed={yarn === y.id}
                    onClick={() => setYarn(y.id)}
                  >
                    <YarnSwatch color={colors.get(y.id) ?? y.color} size={26} />
                    <span className="yarns__letter num">{y.id}</span>
                    <span>{y.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className="dialog__actions">
        <button type="button" className="btn" onClick={close}>
          {t('common.cancel')}
        </button>
        <button type="button" className="btn btn--primary" onClick={() => void save()}>
          {t('designer.savePiece')}
        </button>
      </div>
    </dialog>
  );
}

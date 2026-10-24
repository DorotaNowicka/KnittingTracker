import {
  applySymbolRows,
  blankChart,
  paintCell,
  parseChart,
  repairRows,
  STD,
  type Chart,
  type SymbolRegistry,
  type SymbolRows,
} from '@kt/core';
import { chartSource, editorOverlay } from '@kt/grid-renderer';
import { useId, useMemo, useRef, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { EditorCanvas } from '../editor/EditorCanvas';
import { newId } from '../lib/files';
import { useMotifs } from '../state/motifs';
import { NumberField, TextField } from '../ui/fields';
import { SymbolPalette } from './SymbolPalette';

const blankRows = (w: number, h: number): string[][] =>
  Array.from({ length: h }, () => Array<string>(w).fill(STD.knit));

/**
 * The knitter's own piece of pattern: its size and its stitches, painted with the brush. Saved in
 * the library of every project.
 */
export function MotifDialog({
  dialogRef,
  registry,
  onSaved,
}: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  registry: SymbolRegistry;
  onSaved(motif: Chart): void;
}) {
  const { t } = useTranslation();
  const ids = useId();
  const [name, setName] = useState(() => t('designer.newPieceName'));
  const [rows, setRows] = useState<SymbolRows>(() => blankRows(4, 4));
  const [symbol, setSymbol] = useState<string>(STD.purl);
  const last = useRef<string | null>(null);
  const width = rows[0]?.length ?? 1;
  const height = rows.length;

  const chart = useMemo(
    () =>
      applySymbolRows(blankChart({ id: 'piece', name: name.slice(0, 40) || 'Wzór' }, 1, 1), rows),
    [rows, name],
  );
  const source = useMemo(
    () => chartSource(parseChart(chart, registry), registry),
    [chart, registry],
  );
  const overlay = useMemo(() => editorOverlay({}), []);

  const resize = (w: number, h: number) =>
    setRows(
      repairRows(
        Array.from({ length: h }, (_, r) =>
          Array.from({ length: w }, (_, c) => rows[r]?.[c] ?? STD.knit),
        ),
        registry,
      ),
    );
  const paint = (row: number, col: number) => {
    const key = `${row}:${col}`;
    if (last.current === key) return;
    last.current = key;
    setRows((current) => paintCell(current, registry, row, col, symbol));
  };
  const close = () => {
    dialogRef.current?.close();
    setRows(blankRows(4, 4));
    setName(t('designer.newPieceName'));
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
      <SymbolPalette registry={registry} active={symbol} onPick={setSymbol} />
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

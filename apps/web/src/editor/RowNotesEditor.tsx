import {
  addRowNote,
  formatRowList,
  parseRowList,
  removeRowNote,
  updateRowNote,
  type Pattern,
  type RowNote,
} from '@kt/core';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NumberField, TextField } from '../ui/fields';
import { Icon } from '../ui/Icon';

/**
 * "Wyróżnij rzędy" for a part tracked by a row counter: which rows to highlight (a typed list, or
 * every N rows from row M) and what to say there. The tracker colours those rows and shows the
 * message.
 */
export function RowNotesEditor({
  pattern,
  update,
}: {
  pattern: Pattern;
  update(f: (p: Pattern) => Pattern): void;
}) {
  const { t } = useTranslation();
  const notes = pattern.rowNotes ?? [];
  const round = pattern.construction === 'round';
  return (
    <div className="row-notes">
      {notes.length === 0 ? (
        <p className="hint">{t(round ? 'rowNotes.emptyRound' : 'rowNotes.empty')}</p>
      ) : (
        <ol className="row-notes__list">
          {notes.map((note, i) => (
            <RowNoteItem
              key={note.id}
              note={note}
              index={i}
              round={round}
              onChange={(next) => update((p) => updateRowNote(p, next))}
              onRemove={() => update((p) => removeRowNote(p, note.id))}
            />
          ))}
        </ol>
      )}
      {notes.length < 20 && (
        <button
          type="button"
          className="btn btn--small"
          onClick={() => update((p) => addRowNote(p).pattern)}
        >
          <Icon name="plus" size={18} />
          {t('rowNotes.add')}
        </button>
      )}
    </div>
  );
}

function RowNoteItem({
  note,
  index,
  round,
  onChange,
  onRemove,
}: {
  note: RowNote;
  index: number;
  round: boolean;
  onChange(note: RowNote): void;
  onRemove(): void;
}) {
  const { t } = useTranslation();
  const ids = useId();
  const mode = note.every !== undefined ? 'every' : 'rows';
  const [list, setList] = useState(formatRowList(note.rows ?? []));
  const parsed = parseRowList(list);
  const listError = parsed === null ? t('rowNotes.listError') : null;
  const setMode = (next: 'rows' | 'every') => {
    if (next === mode) return;
    const { rows: _r, every: _e, from: _f, ...base } = note;
    onChange(next === 'every' ? { ...base, every: 2 } : { ...base, rows: parsed ?? [] });
  };
  return (
    <li className="row-notes__item">
      <fieldset className="row-notes__when">
        <legend>{t('rowNotes.which', { n: index + 1 })}</legend>
        {(['rows', 'every'] as const).map((m) => (
          <label key={m} className="check">
            <input
              type="radio"
              name={`${ids}-mode`}
              checked={mode === m}
              onChange={() => setMode(m)}
            />
            {t(
              m === 'rows'
                ? 'rowNotes.modeRows'
                : round
                  ? 'rowNotes.modeEveryRound'
                  : 'rowNotes.modeEvery',
            )}
          </label>
        ))}
      </fieldset>
      {mode === 'rows' ? (
        <div className="field field--compact row-notes__rows">
          <label htmlFor={`${ids}-list`}>{t(round ? 'rowNotes.listRound' : 'rowNotes.list')}</label>
          <input
            id={`${ids}-list`}
            type="text"
            inputMode="numeric"
            value={list}
            placeholder={t('rowNotes.listPlaceholder')}
            aria-invalid={listError ? true : undefined}
            aria-describedby={`${ids}-list-msg`}
            onChange={(e) => {
              setList(e.target.value);
              const rows = parseRowList(e.target.value);
              if (rows) {
                const { every: _e, from: _f, ...base } = note;
                onChange({ ...base, rows });
              }
            }}
          />
          {listError ? (
            <p id={`${ids}-list-msg`} className="field__error">
              {listError}
            </p>
          ) : (
            <p id={`${ids}-list-msg`} className="hint">
              {t('rowNotes.listHint')}
            </p>
          )}
        </div>
      ) : (
        <div className="row-notes__every">
          <NumberField
            label={t(round ? 'rowNotes.everyRound' : 'rowNotes.every')}
            value={note.every}
            min={1}
            max={10000}
            compact
            onCommit={(every) => onChange({ ...note, every })}
          />
          <NumberField
            label={t(round ? 'rowNotes.fromRound' : 'rowNotes.from')}
            value={note.from ?? note.every}
            min={1}
            max={100000}
            compact
            onCommit={(from) => onChange({ ...note, from })}
          />
        </div>
      )}
      <TextField
        label={t('rowNotes.message')}
        value={note.message}
        maxLength={200}
        placeholder={t('rowNotes.messagePlaceholder')}
        className="field--compact row-notes__message"
        onCommit={(message) => onChange({ ...note, message })}
      />
      <button type="button" className="btn btn--small row-notes__remove" onClick={onRemove}>
        <Icon name="trash" size={18} />
        {t('rowNotes.remove')}
      </button>
    </li>
  );
}

import { isUniform, setSizeValue, sizeValueAt } from '@kt/core';
import { useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Form fields for the editors. They keep what the user types locally and only hand **valid**
 * values to `onCommit`, so the pattern in storage always passes the file schema; an invalid value
 * shows an inline message next to the field instead.
 */

interface TextProps {
  readonly label: string;
  readonly value: string;
  onCommit(value: string): void;
  readonly required?: boolean;
  readonly maxLength: number;
  readonly multiline?: boolean;
  readonly hint?: ReactNode;
  readonly className?: string;
}

export function TextField({
  label,
  value,
  onCommit,
  required,
  maxLength,
  multiline,
  hint,
  className,
}: TextProps) {
  const { t } = useTranslation();
  const id = useId();
  const [text, setText] = useState(value);
  const [seen, setSeen] = useState(value);
  // Follow outside changes (undo, another screen) unless the field holds an invalid draft.
  if (value !== seen) {
    setSeen(value);
    setText(value);
  }
  // "Required" shows once the user has touched the field, not on an untouched empty form.
  const [touched, setTouched] = useState(false);
  const error = required && touched && text.trim() === '' ? t('field.required') : null;
  const change = (next: string) => {
    setTouched(true);
    setText(next);
    if (!(required && next.trim() === '')) {
      setSeen(next);
      onCommit(next);
    }
  };
  const describedBy = [error ? `${id}-err` : '', hint ? `${id}-hint` : '']
    .filter(Boolean)
    .join(' ');
  const common = {
    id,
    value: text,
    maxLength,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describedBy || undefined,
  } as const;
  return (
    <div className={`field${className ? ` ${className}` : ''}`}>
      <label htmlFor={id}>{label}</label>
      {multiline ? (
        <textarea {...common} rows={4} onChange={(e) => change(e.target.value)} />
      ) : (
        <input {...common} type="text" onChange={(e) => change(e.target.value)} />
      )}
      {hint && (
        <p id={`${id}-hint`} className="hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-err`} className="field__error">
          {error}
        </p>
      )}
    </div>
  );
}

interface NumberProps {
  readonly label: string;
  readonly value: number | undefined;
  onCommit(value: number): void;
  readonly min: number;
  readonly max: number;
  readonly hint?: ReactNode;
  /** Visually compact (inline lists). */
  readonly compact?: boolean;
  readonly id?: string;
}

export function NumberField({
  label,
  value,
  onCommit,
  min,
  max,
  hint,
  compact,
  id: given,
}: NumberProps) {
  const { t } = useTranslation();
  const auto = useId();
  const id = given ?? auto;
  const [text, setText] = useState(value === undefined ? '' : String(value));
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    setText(value === undefined ? '' : String(value));
  }
  const parsed = Number(text);
  const valid = text.trim() !== '' && Number.isInteger(parsed) && parsed >= min && parsed <= max;
  const error = valid ? null : t('field.range', { min, max });
  return (
    <div className={`field${compact ? ' field--compact' : ''}`}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={text}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined}
        onChange={(e) => {
          const next = e.target.value.replace(/[^\d]/g, '');
          setText(next);
          const n = Number(next);
          if (next !== '' && n >= min && n <= max) {
            setSeen(n);
            onCommit(n);
          }
        }}
        className="input--number"
      />
      {hint && !error && (
        <p id={`${id}-hint`} className="hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-err`} className="field__error">
          {error}
        </p>
      )}
    </div>
  );
}

interface SizeProps {
  readonly label: string;
  /** Current value; undefined = not set. */
  readonly value: number | readonly number[] | undefined;
  readonly sizes: readonly string[];
  onCommit(value: number | number[]): void;
  readonly min: number;
  readonly max: number;
  readonly hint?: ReactNode;
  /** Value shown when unset. */
  readonly placeholder?: number;
}

/**
 * A number that may differ per garment size (“19-22-28-34”). One input while all sizes share the
 * value; a switch reveals one input per size.
 */
export function SizeValueField({
  label,
  value,
  sizes,
  onCommit,
  min,
  max,
  hint,
  placeholder,
}: SizeProps) {
  const { t } = useTranslation();
  const id = useId();
  const multi = sizes.length > 1;
  const [perSize, setPerSize] = useState(() => multi && !isUniform(value));
  const first = sizeValueAt(value, 0) ?? placeholder;
  if (!multi) {
    return (
      <NumberField
        label={label}
        value={first}
        min={min}
        max={max}
        hint={hint}
        onCommit={(n) => onCommit(n)}
      />
    );
  }
  return (
    <fieldset className="field size-field">
      <legend>{label}</legend>
      {!perSize || !multi ? (
        <NumberField
          id={`${id}-all`}
          label={multi ? t('field.allSizes') : label}
          value={first}
          min={min}
          max={max}
          compact
          onCommit={(n) => onCommit(n)}
        />
      ) : (
        <div className="size-field__list">
          {sizes.map((s, i) => (
            <NumberField
              key={`${s}-${i}`}
              label={s}
              value={sizeValueAt(value, i) ?? placeholder}
              min={min}
              max={max}
              compact
              onCommit={(n) => onCommit(setSizeValue(value ?? placeholder, i, n, sizes.length))}
            />
          ))}
        </div>
      )}
      {multi && (
        <label className="check check--small">
          <input
            type="checkbox"
            checked={perSize}
            onChange={(e) => {
              setPerSize(e.target.checked);
              if (!e.target.checked && first !== undefined) onCommit(first);
              if (e.target.checked && first !== undefined && typeof value !== 'object') {
                onCommit(Array.from({ length: sizes.length }, () => first));
              }
            }}
          />
          {t('field.perSize')}
        </label>
      )}
      {hint && <p className="hint">{hint}</p>}
    </fieldset>
  );
}

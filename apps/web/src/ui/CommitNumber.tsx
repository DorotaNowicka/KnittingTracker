import { useId, useState, type KeyboardEvent } from 'react';

/**
 * A whole number taken when typing ends (Enter or leaving the field), for numbers whose change
 * does work right away: "6" on the way to "60" must not resize a tile or shorten a pattern.
 */
export function CommitNumber({
  label,
  value,
  unit,
  max = 100_000,
  onCommit,
}: {
  label: string;
  value: number;
  unit?: string;
  max?: number;
  onCommit(value: number): void;
}) {
  const id = useId();
  const [text, setText] = useState(String(value));
  const commit = () => {
    const n = Number(text);
    if (Number.isInteger(n) && n > 0 && n <= max && n !== value) onCommit(n);
    // The field shows the value it is given: an accepted number comes back as the new value
    // (callers key the field by it), a refused or rounded one shows the actual value again.
    setText(String(value));
  };
  return (
    <div className="field field--compact">
      <label htmlFor={id}>{label}</label>
      <span className="commit-number">
        <input
          id={id}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          className="input--number"
          value={text}
          onChange={(e) => setText(e.target.value.replace(/[^\d]/g, ''))}
          onBlur={commit}
          onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
            }
          }}
        />
        {unit}
      </span>
    </div>
  );
}

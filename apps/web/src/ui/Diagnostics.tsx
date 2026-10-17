import type { Diagnostic } from '@kt/core';
import { useTranslation } from 'react-i18next';
import { useDiagnosticText } from './diagnosticText';

interface ListProps {
  readonly items: readonly Diagnostic[];
  /** Optional action per finding, e.g. "show the cell" or "open the chart". */
  readonly action?: ((d: Diagnostic) => { label: string; run: () => void } | null) | undefined;
  readonly limit?: number;
}

/** Errors, warnings and notes, grouped and in the order of their severity. */
export function DiagnosticsPanel({ items, action, limit = 12 }: ListProps) {
  const { t } = useTranslation();
  const errors = items.filter((d) => d.severity === 'error');
  const warnings = items.filter((d) => d.severity === 'warning');
  const notes = items.filter((d) => d.severity === 'info');
  if (items.length === 0) {
    return (
      <p className="check-ok" role="status">
        <span aria-hidden="true">✓</span> {t('diag.allGood')}
      </p>
    );
  }
  return (
    <div className="diagnostics">
      {errors.length > 0 && (
        <Group
          title={t('diag.errors', { count: errors.length })}
          tone="danger"
          items={errors}
          action={action}
          limit={limit}
        />
      )}
      {warnings.length > 0 && (
        <Group
          title={t('diag.warnings', { count: warnings.length })}
          tone="warning"
          items={warnings}
          action={action}
          limit={limit}
        />
      )}
      {notes.length > 0 && (
        <Group
          title={t('diag.notes', { count: notes.length })}
          tone="info"
          items={notes}
          action={action}
          limit={limit}
        />
      )}
    </div>
  );
}

function Group({
  title,
  tone,
  items,
  action,
  limit,
}: ListProps & { title: string; tone: 'danger' | 'warning' | 'info'; limit: number }) {
  const text = useDiagnosticText();
  const shown = items.slice(0, limit);
  const list = (
    <ul>
      {shown.map((d, i) => {
        const a = action?.(d) ?? null;
        return (
          <li key={`${d.code}-${i}`}>
            {text(d)}
            {a && (
              <>
                {' '}
                <button type="button" className="link-btn" onClick={a.run}>
                  {a.label}
                </button>
              </>
            )}
          </li>
        );
      })}
      {items.length > shown.length && <li>… +{items.length - shown.length}</li>}
    </ul>
  );
  // Notes are usually intended (e.g. a knit/purl texture): folded away so they don't shout.
  if (tone === 'info') {
    return (
      <details className="notice notice--info">
        <summary>{title}</summary>
        {list}
      </details>
    );
  }
  return (
    <div className={`notice notice--${tone}`} role={tone === 'danger' ? 'alert' : undefined}>
      <p className="notice__title">{title}</p>
      {list}
    </div>
  );
}

import type { Diagnostic } from '@kt/core';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Validation findings in the UI language. Core diagnostics carry a code and params; the English
 * `message` is only a fallback for codes without a translation.
 */
export function useDiagnosticText(): (d: Diagnostic) => string {
  const { t } = useTranslation();
  return useCallback(
    (d: Diagnostic) => {
      const text = t(`diag.${d.code}`, { ...d.params, defaultValue: d.message });
      const size = d.params?.size;
      return size === undefined ? text : t('diag.inSize', { size, text });
    },
    [t],
  );
}

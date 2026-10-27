import type { ResolvedPattern } from '@kt/core';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { SymbolGlyph } from '../ui/SymbolGlyph';

/**
 * The decreases and increases of the row being knitted, shown as their symbols (×count) with the
 * change in stitches, so a shaping row can't slip by unnoticed. Rows that keep the stitch count
 * (lace) show nothing.
 */
export function ShapingBadge({ grid, row }: { grid: ResolvedPattern; row: number }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith('en') ? 'en' : 'pl';
  const found = useMemo(() => {
    const counts = new Map<string, number>();
    if (row < 1 || (grid.plannedRows !== null && row > grid.plannedRows)) return [];
    // In the order they are worked on the right side: from the right edge.
    for (let col = grid.stitchCount; col >= 1; col--) {
      let id: string;
      try {
        id = grid.cellAtCol(row, col).symbolId;
      } catch {
        continue;
      }
      const s = grid.registry.get(id);
      if (s && (s.family === 'decrease' || s.family === 'increase'))
        counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return [...counts].flatMap(([id, n]) => {
      const s = grid.registry.get(id);
      return s ? [{ symbol: s, n }] : [];
    });
  }, [grid, row]);
  if (found.length === 0) return null;
  // What each symbol does to the count: k2tog takes 2 stitches and makes 1, a yarn over makes 1.
  const change = found.reduce(
    (sum, { symbol, n }) => sum + n * (symbol.produces - symbol.consumes),
    0,
  );
  // Lace (a yarn over for every decrease) keeps the count: not a shaping row.
  if (change === 0) return null;
  const said = found.map(({ symbol, n }) => `${n}× ${symbol.label[lang]}`).join(', ');
  return (
    <span
      className={`status__item shaping-badge shaping-badge--${change < 0 ? 'down' : 'up'}`}
      role="img"
      aria-label={t('status.shaping', { list: said, change: change > 0 ? `+${change}` : change })}
      title={t('status.shaping', { list: said, change: change > 0 ? `+${change}` : change })}
    >
      {found.map(({ symbol, n }) => (
        <span key={symbol.id} className="shaping-badge__item">
          <SymbolGlyph glyph={symbol.glyph} width={symbol.width} cell={24} />
          <span className="num">×{n}</span>
        </span>
      ))}
      <span className="shaping-badge__change num">{change > 0 ? `+${change}` : change}</span>
    </span>
  );
}

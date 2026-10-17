import { BUILTIN_SYMBOLS } from './library';
import type { SymbolDef } from './types';

/** Read-only lookup of symbols available to one pattern: built-ins plus the pattern's own. */
export interface SymbolRegistry {
  get(id: string): SymbolDef | undefined;
  /** Like {@link get} but throws for unknown ids (use after validation). */
  require(id: string): SymbolDef;
  has(id: string): boolean;
  all(): readonly SymbolDef[];
  /** Find a symbol by catalogue number, e.g. `byNumber('drops', '401')`. */
  byNumber(catalogue: string, number: string): SymbolDef | undefined;
}

/**
 * Create a registry. Custom symbols may not reuse a built-in id (to keep files portable); a
 * duplicate throws so callers surface it as a validation error.
 */
export function createRegistry(custom: readonly SymbolDef[] = []): SymbolRegistry {
  const map = new Map<string, SymbolDef>();
  for (const s of BUILTIN_SYMBOLS) map.set(s.id, s);
  for (const s of custom) {
    if (map.has(s.id)) throw new Error(`Duplicate symbol id: ${s.id}`);
    map.set(s.id, s);
  }
  const list = [...map.values()];
  return {
    get: (id) => map.get(id),
    require: (id) => {
      const s = map.get(id);
      if (!s) throw new Error(`Unknown symbol: ${id}`);
      return s;
    },
    has: (id) => map.has(id),
    all: () => list,
    byNumber: (catalogue, number) => list.find((s) => s.numbers?.[catalogue] === number),
  };
}

/** The symbol a cell is worked as on a WS row; `undefined` when the symbol has no WS form. */
export function wsSymbolId(symbol: SymbolDef): string | undefined {
  switch (symbol.ws.mode) {
    case 'invert':
      return symbol.ws.symbolId;
    case 'same':
    case 'explicit':
      return symbol.id;
    case 'unsupported':
      return undefined;
  }
}

import type { LocalizedText } from '../basics';

/** Knit or purl, as seen from the right side (RS) of the work. */
export type StitchKind = 'k' | 'p';

/**
 * Vector glyph primitives in **cell units**: x ∈ [0, width], y ∈ [0, 1], origin top-left.
 * The same primitives draw the grid, the legend, the editor palette and recognizer templates, so
 * the legend can never disagree with the grid (DR-11). No raw SVG, so nothing can be injected.
 */
export type GlyphPoint = readonly [number, number];

export type GlyphPrimitive =
  | { readonly kind: 'line'; readonly from: GlyphPoint; readonly to: GlyphPoint }
  | { readonly kind: 'polyline'; readonly points: readonly GlyphPoint[] }
  | {
      readonly kind: 'polygon';
      readonly points: readonly GlyphPoint[];
      /** `ink` = symbol colour, `muted` = "no stitch" shading. */
      readonly fill: 'ink' | 'muted';
    }
  | {
      readonly kind: 'circle';
      readonly center: GlyphPoint;
      readonly radius: number;
      readonly fill: 'none' | 'ink';
    }
  | {
      readonly kind: 'text';
      readonly at: GlyphPoint;
      readonly text: string;
      /** Font size as a fraction of the cell height. */
      readonly size: number;
    };

export interface Glyph {
  readonly primitives: readonly GlyphPrimitive[];
}

/**
 * How a symbol is worked on a wrong-side (WS) row, where the chart is read left to right.
 * - `invert`: worked as another symbol (knit ↔ purl, k2tog ↔ p2tog).
 * - `same`: worked identically (e.g. a yarn over).
 * - `explicit`: needs its own WS instruction text.
 * - `unsupported`: must not appear on WS rows (most cables); validation reports it.
 */
export type WsBehavior =
  | { readonly mode: 'invert'; readonly symbolId: string }
  | { readonly mode: 'same' }
  | { readonly mode: 'explicit'; readonly text: LocalizedText }
  | { readonly mode: 'unsupported' };

export type SymbolFamily = 'basic' | 'decrease' | 'increase' | 'cable' | 'bind-off' | 'no-stitch';

export interface SymbolDef {
  /** Stable identifier, e.g. `std:k`, `cable:2-2-lc`, `user:…`. Never derived from a number. */
  readonly id: string;
  /** Optional catalogue number (e.g. DROPS chart symbol numbers). Metadata only (DR-10). */
  readonly numbers?: Readonly<Record<string, string>>;
  readonly family: SymbolFamily;
  /** Width in chart cells. */
  readonly width: number;
  /** Stitches taken from the left needle and stitches put on the right needle. */
  readonly consumes: number;
  readonly produces: number;
  /** False only for "no stitch" cells: they are drawn but never worked or tapped. */
  readonly worked: boolean;
  /**
   * Knit/purl kinds of the stitches entering and leaving the symbol, **left to right in RS view**.
   * Used by the stitch-flow lint. Omitted when not meaningful (e.g. decreases).
   */
  readonly flow?: { readonly in: readonly StitchKind[]; readonly out: readonly StitchKind[] };
  readonly ws: WsBehavior;
  readonly glyph: Glyph;
  /** Short name (abbreviation) and a full description in our own words. */
  readonly label: LocalizedText;
  readonly description: LocalizedText;
}

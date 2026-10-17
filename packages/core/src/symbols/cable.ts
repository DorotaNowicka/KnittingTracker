import type { LocalizedText } from '../basics';
import type { Glyph, StitchKind, SymbolDef } from './types';

/**
 * A cable crossing described the way it is knitted on the right side (worked right to left):
 * 1. `held` stitches go to the cable needle in `heldAt` (front or back of the work),
 * 2. the next `worked.length` stitches are knitted/purled as listed,
 * 3. the held stitches are worked from the cable needle as listed in `fromCableNeedle`.
 */
export interface CableSpec {
  readonly id: string;
  readonly heldAt: 'front' | 'back';
  readonly fromCableNeedle: readonly StitchKind[];
  readonly worked: readonly StitchKind[];
  readonly glyph: Glyph;
  readonly label: LocalizedText;
  readonly numbers?: Readonly<Record<string, string>>;
}

const KIND_PL: Record<StitchKind, string> = { k: 'prawe', p: 'lewe' };
const KIND_EN: Record<StitchKind, string> = { k: 'knit', p: 'purl' };

/** "2 prawe", "1 lewe" … all kinds within one group are equal in every standard cable. */
function group(kinds: readonly StitchKind[], locale: 'pl' | 'en'): string {
  const n = kinds.length;
  const kind = kinds[0] ?? 'k';
  if (locale === 'en') return `${KIND_EN[kind]} ${n}`;
  const word = n === 1 ? `oczko ${KIND_PL[kind]}` : `oczka ${KIND_PL[kind]}`;
  return `${n} ${word}`;
}

function describe(spec: CableSpec): LocalizedText {
  const held = spec.fromCableNeedle.length;
  const pos = { front: ['przed robótką', 'in front'], back: ['za robótką', 'at the back'] }[
    spec.heldAt
  ];
  const heldPl = held === 1 ? '1 oczko' : `${held} oczka`;
  const allSame = (ks: readonly StitchKind[]) => ks.every((k) => k === ks[0]);
  const fromPl = allSame(spec.fromCableNeedle)
    ? `przerób je z drutu pomocniczego na ${spec.fromCableNeedle[0] === 'k' ? 'prawo' : 'lewo'}`
    : 'przerób je z drutu pomocniczego';
  return {
    pl: `Przełóż ${heldPl} na drut pomocniczy ${pos[0]}, przerób ${group(spec.worked, 'pl')}, potem ${fromPl}.`,
    en: `Slip ${held} st to the cable needle ${pos[1]}, ${group(spec.worked, 'en')}, then ${group(spec.fromCableNeedle, 'en')} from the cable needle.`,
  };
}

/**
 * Build a cable symbol. Its stitch flow follows from the spec, so it can't be hand-entered wrongly:
 * in RS work order the input is [held…, worked…] and the output is [worked…, held…]. Each stitch
 * keeps its kind. Reversing gives the left-to-right chart order.
 */
export function cable(spec: CableSpec): SymbolDef {
  const width = spec.fromCableNeedle.length + spec.worked.length;
  const inWorkOrder = [...spec.fromCableNeedle, ...spec.worked];
  const outWorkOrder = [...spec.worked, ...spec.fromCableNeedle];
  const def: SymbolDef = {
    id: spec.id,
    family: 'cable',
    width,
    consumes: width,
    produces: width,
    worked: true,
    flow: { in: [...inWorkOrder].reverse(), out: [...outWorkOrder].reverse() },
    ws: { mode: 'unsupported' },
    glyph: spec.glyph,
    label: spec.label,
    description: describe(spec),
  };
  return spec.numbers ? { ...def, numbers: spec.numbers } : def;
}

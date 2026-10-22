import type { ProjectKind } from '@kt/core';

/**
 * Flat drawings of each kind of project, split into regions. A region's id is the id of an item
 * of that kind in `PROJECT_KIND_INFO` (a part or a choice), so the drawing and the list of parts
 * stay in step. Regions with several shapes (two sleeves) share one path. 240 × 220 units.
 */
export interface Diagram {
  readonly regions: readonly { readonly id: string; readonly d: string }[];
  /** Lines that only decorate (ribbing, fringe, a pompom); not interactive. */
  readonly decor: string;
}

export const DIAGRAM_VIEWBOX = '0 0 240 220';

export const DIAGRAMS: Readonly<Record<Exclude<ProjectKind, 'custom'>, Diagram>> = {
  sweater: {
    regions: [
      { id: 'neck', d: 'M96 40 Q120 66 144 40 L134 40 Q120 52 106 40 Z' },
      { id: 'yoke', d: 'M70 48 L96 40 Q120 66 144 40 L170 48 L170 82 L70 82 Z' },
      { id: 'body', d: 'M70 82 H170 V190 H70 Z' },
      { id: 'bottom-rib', d: 'M70 190 H170 V206 H70 Z' },
      {
        id: 'sleeve',
        d: 'M70 48 L46 60 L24 158 L50 162 L70 100 Z M170 48 L194 60 L216 158 L190 162 L170 100 Z',
      },
      {
        id: 'sleeve-cuff',
        d: 'M24 158 L50 162 L47 178 L21 174 Z M216 158 L190 162 L193 178 L219 174 Z',
      },
    ],
    decor:
      'M80 194 V202 M90 194 V202 M100 194 V202 M110 194 V202 M120 194 V202 M130 194 V202 M140 194 V202 M150 194 V202 M160 194 V202',
  },
  cardigan: {
    regions: [
      {
        id: 'neck',
        d: 'M96 40 L112 62.7 L112 70 L120 81 L128 70 L128 62.7 L144 40 L136 40 L120 62 L104 40 Z',
      },
      {
        id: 'yoke',
        d: 'M70 48 L96 40 L112 62.7 L112 82 L70 82 Z M170 48 L144 40 L128 62.7 L128 82 L170 82 Z',
      },
      { id: 'body', d: 'M70 82 H112 V190 H70 Z M128 82 H170 V190 H128 Z' },
      { id: 'bottom-rib', d: 'M70 190 H112 V206 H70 Z M128 190 H170 V206 H128 Z' },
      { id: 'button-band', d: 'M112 70 L120 81 V206 H112 Z' },
      { id: 'buttonhole-band', d: 'M128 70 L120 81 V206 H128 Z' },
      {
        id: 'sleeve',
        d: 'M70 48 L46 60 L24 158 L50 162 L70 100 Z M170 48 L194 60 L216 158 L190 162 L170 100 Z',
      },
      {
        id: 'sleeve-cuff',
        d: 'M24 158 L50 162 L47 178 L21 174 Z M216 158 L190 162 L193 178 L219 174 Z',
      },
    ],
    decor: 'M116 100 h.01 M116 125 h.01 M116 150 h.01 M116 175 h.01',
  },
  vest: {
    regions: [
      { id: 'neck', d: 'M104 40 L120 72 L136 40 L128 40 L120 57 L112 40 Z' },
      {
        id: 'armhole',
        d: 'M84 44 L92 44 Q92 86 78 100 L70 100 Q84 86 84 44 Z M156 44 L148 44 Q148 86 162 100 L170 100 Q156 86 156 44 Z',
      },
      {
        id: 'body',
        d: 'M92 44 L104 40 L120 72 L136 40 L148 44 Q148 86 162 100 L170 100 V190 H70 V100 L78 100 Q92 86 92 44 Z',
      },
      { id: 'bottom-rib', d: 'M70 190 H170 V206 H70 Z' },
    ],
    decor: '',
  },
  hat: {
    regions: [
      { id: 'crown', d: 'M66 100 Q70 40 120 36 Q170 40 174 100 Z' },
      { id: 'body', d: 'M66 100 H174 L178 158 H62 Z' },
      { id: 'brim', d: 'M62 158 H178 V190 H62 Z' },
    ],
    decor:
      'M130 26 A10 10 0 1 1 110 26 A10 10 0 1 1 130 26 M76 162 V186 M92 162 V186 M108 162 V186 M124 162 V186 M140 162 V186 M156 162 V186 M172 162 V186',
  },
  scarf: {
    regions: [
      { id: 'start-border', d: 'M92 14 H148 V40 H92 Z' },
      { id: 'main', d: 'M92 40 H148 V172 H92 Z' },
      { id: 'end-border', d: 'M92 172 H148 V198 H92 Z' },
    ],
    decor:
      'M98 198 V212 M106 198 V212 M114 198 V212 M122 198 V212 M130 198 V212 M138 198 V212 M144 198 V212',
  },
  cowl: {
    regions: [
      { id: 'top-rib', d: 'M60 50 A60 16 0 0 0 180 50 V72 A60 16 0 0 1 60 72 Z' },
      { id: 'main', d: 'M60 72 A60 16 0 0 0 180 72 V150 A60 16 0 0 1 60 150 Z' },
      { id: 'bottom-rib', d: 'M60 150 A60 16 0 0 0 180 150 V172 A60 16 0 0 1 60 172 Z' },
    ],
    decor: 'M60 50 A60 16 0 0 1 180 50',
  },
  mittens: {
    regions: [
      { id: 'top', d: 'M86 92 Q86 30 121 30 Q156 30 156 92 Z' },
      { id: 'hand', d: 'M86 92 H156 V168 H86 Z' },
      { id: 'thumb-gusset', d: 'M86 160 L86 116 L72 122 L74 152 Z' },
      { id: 'thumb', d: 'M72 122 L86 116 L80 84 Q74 72 64 76 Q56 82 58 96 Z' },
      { id: 'cuff', d: 'M84 168 H158 V204 H84 Z' },
    ],
    decor: 'M96 172 V200 M108 172 V200 M120 172 V200 M132 172 V200 M144 172 V200',
  },
  socks: {
    regions: [
      { id: 'cuff', d: 'M70 16 H126 V40 H70 Z' },
      { id: 'leg', d: 'M70 40 H126 V116 H70 Z' },
      { id: 'heel', d: 'M70 116 H100 V172 Q70 172 70 142 Z' },
      { id: 'gusset', d: 'M100 116 H126 L146 128 V172 H100 Z' },
      { id: 'foot', d: 'M146 128 L184 134 V172 H146 Z' },
      { id: 'toe', d: 'M184 134 Q216 138 216 154 Q216 172 184 172 Z' },
    ],
    decor: 'M80 20 V36 M92 20 V36 M104 20 V36 M116 20 V36',
  },
};

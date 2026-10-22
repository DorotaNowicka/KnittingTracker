import type { ProjectKind } from '@kt/core';
import type { IconName } from './Icon';

/** The symbol of each kind of project. */
export const KIND_ICONS: Readonly<Record<ProjectKind, IconName>> = {
  sweater: 'sweater',
  cardigan: 'cardigan',
  vest: 'vest',
  hat: 'hat',
  scarf: 'scarf',
  cowl: 'cowl',
  mittens: 'mittens',
  socks: 'socks',
  custom: 'yarn',
};

/*
 * Per-screen dictionaries merged into `en.ts` / `ru.ts`. One file per screen
 * so screens can be edited in parallel without touching the shared files.
 */
import * as addLot from './addLot';
import * as cranes from './cranes';
import * as discharge from './discharge';
import * as documents from './documents';
import * as layers from './layers';
import * as loadPlan from './loadPlan';
import * as reference from './reference';
import * as shell from './shell';
import * as sof from './sof';
import * as tools from './tools';

export const partsEn = {
  ...shell.en,
  ...loadPlan.en,
  ...addLot.en,
  ...discharge.en,
  ...layers.en,
  ...sof.en,
  ...documents.en,
  ...reference.en,
  ...tools.en,
  ...cranes.en,
} as const;

export const partsRu: { [K in keyof typeof partsEn]: string } = {
  ...shell.ru,
  ...loadPlan.ru,
  ...addLot.ru,
  ...discharge.ru,
  ...layers.ru,
  ...sof.ru,
  ...documents.ru,
  ...reference.ru,
  ...tools.ru,
  ...cranes.ru,
};

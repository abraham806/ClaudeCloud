import { monthRange } from './format';

export interface Period { from: string; to: string }

const year = new Date().getFullYear();
export const PRESETS: { label: string; get: () => Period }[] = [
  { label: 'Ce mois', get: () => monthRange(0) },
  { label: 'Mois dernier', get: () => monthRange(-1) },
  { label: 'Cette année', get: () => ({ from: `${year}-01-01`, to: `${year}-12-31` }) },
  { label: 'Tout', get: () => ({ from: '', to: '' }) },
];

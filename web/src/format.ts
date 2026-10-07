export const money = (value: number, currency = 'XOF') => {
  try {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).format(value || 0);
  } catch {
    return `${(value || 0).toFixed(2)} ${currency}`;
  }
};

export const signedMoney = (value: number, kind: 'purchase' | 'sale', currency?: string) =>
  `${kind === 'sale' ? '+' : '−'} ${money(value, currency)}`;

export const frDate = (iso?: string | null) => (iso ? iso.split('-').reverse().join('/') : '');
export const shortDate = (iso?: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '');

const pad = (n: number) => String(n).padStart(2, '0');
export const isoOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => isoOf(new Date());
export const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return isoOf(d);
};

export function monthRange(offset = 0) {
  const d = new Date();
  return {
    from: isoOf(new Date(d.getFullYear(), d.getMonth() + offset, 1)),
    to: isoOf(new Date(d.getFullYear(), d.getMonth() + offset + 1, 0)),
  };
}

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const MONTHS_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
export const monthName = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
export const monthShort = (ym: string) => MONTHS_SHORT[Number(ym.slice(5, 7)) - 1];

export const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?';

export const KIND_LABEL = { purchase: 'Achat', sale: 'Vente' } as const;
export const TYPE_LABEL = { invoice: 'Facture', receipt: 'Reçu', quote: 'Devis' } as const;
export const PAYMENT_METHODS = ['Espèces', 'Wave', 'Orange Money', 'Free Money', 'Carte bancaire', 'Virement', 'Chèque'];
export const DEFAULT_CATEGORIES = [
  'Marchandises', 'Fournitures', 'Carburant', 'Transport', 'Loyer', 'Électricité / eau',
  'Téléphone / internet', 'Repas', 'Matériel', 'Services', 'Salaires', 'Impôts et taxes', 'Autre',
];
export const CURRENCIES = [
  ['XOF', 'Franc CFA BCEAO (XOF)'],
  ['XAF', 'Franc CFA BEAC (XAF)'],
  ['EUR', 'Euro (EUR)'],
  ['USD', 'Dollar US (USD)'],
  ['GNF', 'Franc guinéen (GNF)'],
  ['MAD', 'Dirham marocain (MAD)'],
] as const;

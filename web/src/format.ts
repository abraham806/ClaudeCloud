export const money = (value: number, currency = 'EUR') =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).format(value || 0);

export const frDate = (iso?: string | null) => (iso ? iso.split('-').reverse().join('/') : '');

export const today = () => new Date().toISOString().slice(0, 10);

export function monthRange(offset = 0) {
  const d = new Date();
  const start = new Date(d.getFullYear(), d.getMonth() + offset, 1);
  const end = new Date(d.getFullYear(), d.getMonth() + offset + 1, 0);
  const iso = (x: Date) =>
    `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  return { from: iso(start), to: iso(end) };
}

export const KIND_LABEL = { purchase: 'Achat', sale: 'Vente' } as const;
export const TYPE_LABEL = { invoice: 'Facture', receipt: 'Reçu' } as const;
export const PAYMENT_METHODS = ['Espèces', 'Carte bancaire', 'Virement', 'Chèque', 'Mobile Money', 'Autre'];
export const DEFAULT_CATEGORIES = [
  'Marchandises', 'Fournitures', 'Carburant', 'Transport', 'Loyer', 'Électricité / eau',
  'Téléphone / internet', 'Repas', 'Matériel', 'Services', 'Salaires', 'Autre',
];

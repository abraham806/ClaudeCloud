// Calculs de montants. Tout est en centimes (entiers).

export function computeLine({ quantity, unit_price, vat_rate }) {
  const total_ht = Math.round(quantity * unit_price);
  const total_tva = Math.round((total_ht * vat_rate) / 100);
  return { total_ht, total_tva };
}

export function computeTotals(lines) {
  let total_ht = 0;
  let total_tva = 0;
  const computed = lines.map((line) => {
    const t = computeLine(line);
    total_ht += t.total_ht;
    total_tva += t.total_tva;
    return { ...line, ...t };
  });
  return { lines: computed, total_ht, total_tva, total_ttc: total_ht + total_tva };
}

export const toCents = (amount) => Math.round(Number(amount) * 100);
export const fromCents = (cents) => cents / 100;

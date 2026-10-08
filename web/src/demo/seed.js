// Données d'exemple pour la démo : quelques mois d'activité d'une boutique à Dakar.
const SUPPLIERS = [
  ['Station Total Plateau', 'Carburant', 'Gasoil', 25000, 'Orange Money', 'receipt'],
  ['Sandaga Grossiste', 'Marchandises', 'Réassort marchandises', 412500, 'Espèces', 'invoice'],
  ['Senelec', 'Électricité / eau', 'Facture électricité', 48600, 'Wave', 'invoice'],
  ['Sonatel Orange', 'Téléphone / internet', 'Abonnement fibre', 29900, 'Wave', 'invoice'],
  ['Librairie Clairafrique', 'Fournitures', 'Papeterie et rouleaux caisse', 17500, 'Espèces', 'receipt'],
  ['SCI Médina', 'Loyer', 'Loyer du local', 250000, 'Virement', 'invoice'],
];
const CLIENTS = [
  ['Hôtel Teranga', 'Rue Abdou Karim Bourgi, Dakar', 'Fourniture de linge', 3, 145000],
  ['Restaurant Le Lagon', 'Route de la Corniche Est, Dakar', 'Vaisselle et ustensiles', 1, 380000],
  ['Clinique du Cap', 'Avenue Pasteur, Dakar', 'Produits d’entretien', 10, 18500],
  ['Client comptoir', null, 'Vente au détail', 1, 42000],
];

const iso = (d) => d.toISOString().slice(0, 10);

export async function seedDemo(db, user, createDocument) {
  let count = 0;
  const now = new Date();
  for (let m = 5; m >= 0; m -= 1) {
    const day = (n) => iso(new Date(now.getFullYear(), now.getMonth() - m, Math.min(n, m === 0 ? now.getDate() : 28)));
    for (const [i, [name, category, label, amount, payment, type]] of SUPPLIERS.entries()) {
      if (m === 0 && i > 3) continue;
      const vat = category === 'Loyer' ? 0 : 18;
      const ttc = Math.round(amount * (1 + (m % 3) * 0.07));
      await createDocument(db, user, {
        kind: 'purchase', doc_type: type, number: type === 'invoice' ? `F-${2000 + m * 10 + i}` : null,
        date: day(3 + i * 4), party_name: name, category, payment_method: payment, status: 'paid',
        lines: [{ description: label, quantity: 1, unit_price: Math.round((ttc / (1 + vat / 100)) * 100) / 100, vat_rate: vat }],
      });
      count += 1;
    }
    for (const [i, [name, address, label, qty, price]] of CLIENTS.entries()) {
      const date = day(5 + i * 6);
      const receipt = name === 'Client comptoir';
      const due = new Date(`${date}T12:00:00`);
      due.setDate(due.getDate() + 30);
      await createDocument(db, user, {
        kind: 'sale', doc_type: receipt ? 'receipt' : 'invoice', date, due_date: receipt ? null : iso(due),
        party_name: name, party_address: address, category: 'Ventes', payment_method: receipt ? 'Espèces' : 'Virement',
        status: m <= 1 && i === 0 ? 'unpaid' : m === 0 && i === 1 ? 'unpaid' : 'paid',
        notes: receipt ? null : 'Merci pour votre confiance.',
        lines: [{ description: label, quantity: qty + (m % 2), unit_price: price, vat_rate: 18 }],
      });
      count += 1;
    }
  }
  await createDocument(db, user, {
    kind: 'sale', doc_type: 'quote', date: iso(now), party_name: 'Restaurant Le Lagon',
    party_address: 'Route de la Corniche Est, Dakar', status: 'unpaid',
    lines: [
      { description: 'Service de table complet (60 couverts)', quantity: 1, unit_price: 950000, vat_rate: 18 },
      { description: 'Livraison et installation', quantity: 1, unit_price: 35000, vat_rate: 18 },
    ],
  });
  return count + 1;
}

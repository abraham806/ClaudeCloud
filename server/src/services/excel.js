import ExcelJS from 'exceljs';

// ---------------------------------------------------------------------------
// Formats d'export Excel.
//
// Chaque format est une fonction (workbook, documents, company) => void.
// ⚠️ Le format exact attendu par le logiciel de comptabilité du client n'est pas
// encore connu : "standard" est un récapitulatif lisible, "ecritures" un journal
// d'écritures débit/crédit générique. Il suffira d'ajouter un format ici quand
// la spécification sera fournie (ordre des colonnes, comptes, codes journaux...).
// ---------------------------------------------------------------------------

const KIND_LABEL = { purchase: 'Achat', sale: 'Vente' };
const TYPE_LABEL = { invoice: 'Facture', receipt: 'Reçu', quote: 'Devis' };
const STATUS_LABEL = { paid: 'Payé', unpaid: 'Non payé' };

// Comptes par défaut selon le plan comptable de l'entreprise.
// SYSCOHADA (Sénégal / zone OHADA) : 601 achats, 4452 TVA récupérable, 401 fournisseurs,
// 701 ventes, 4431 TVA facturée, 411 clients.
export const ACCOUNTS = {
  syscohada: {
    purchase: { journal: 'ACH', expense: '601000', vat: '445200', party: '401000' },
    sale: { journal: 'VTE', revenue: '701000', vat: '443100', party: '411000' },
  },
  pcg: {
    purchase: { journal: 'ACH', expense: '607000', vat: '445660', party: '401000' },
    sale: { journal: 'VTE', revenue: '706000', vat: '445710', party: '411000' },
  },
};

const moneyFmt = '#,##0.00';

function styleHeader(sheet) {
  const row = sheet.getRow(1);
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columnCount } };
}

function customColumns(documents) {
  const cols = new Map();
  for (const d of documents) for (const c of d.custom || []) if (!cols.has(c.id)) cols.set(c.id, c);
  return [...cols.values()];
}

const toDate = (iso) => (iso ? new Date(`${iso}T00:00:00Z`) : null);

function standardFormat(wb, documents, company) {
  const journal = wb.addWorksheet('Pièces');
  journal.columns = [
    { header: 'Date', key: 'date', width: 12, style: { numFmt: 'dd/mm/yyyy' } },
    { header: 'Type', key: 'kind', width: 8 },
    { header: 'Pièce', key: 'doc_type', width: 9 },
    { header: 'N°', key: 'number', width: 16 },
    { header: 'Tiers', key: 'party_name', width: 28 },
    { header: 'Catégorie', key: 'category', width: 18 },
    { header: 'Mode de paiement', key: 'payment_method', width: 16 },
    { header: 'Statut', key: 'status', width: 10 },
    { header: `Total HT (${company.currency})`, key: 'total_ht', width: 15, style: { numFmt: moneyFmt } },
    { header: `TVA (${company.currency})`, key: 'total_tva', width: 13, style: { numFmt: moneyFmt } },
    { header: `Total TTC (${company.currency})`, key: 'total_ttc', width: 15, style: { numFmt: moneyFmt } },
    { header: 'Notes', key: 'notes', width: 30 },
    // Une colonne par variable personnalisée renseignée sur au moins une pièce.
    ...customColumns(documents).map((c) => ({ header: c.label, key: `cf_${c.id}`, width: Math.max(12, Math.min(30, c.label.length + 4)) })),
  ];
  for (const d of documents) {
    journal.addRow({
      ...d,
      ...Object.fromEntries((d.custom || []).map((c) => [`cf_${c.id}`, c.text])),
      date: toDate(d.date),
      kind: KIND_LABEL[d.kind],
      doc_type: TYPE_LABEL[d.doc_type],
      status: STATUS_LABEL[d.status],
    });
  }
  styleHeader(journal);

  const lines = wb.addWorksheet('Détail des lignes');
  lines.columns = [
    { header: 'Date', key: 'date', width: 12, style: { numFmt: 'dd/mm/yyyy' } },
    { header: 'Type', key: 'kind', width: 8 },
    { header: 'N°', key: 'number', width: 16 },
    { header: 'Tiers', key: 'party_name', width: 28 },
    { header: 'Désignation', key: 'description', width: 36 },
    { header: 'Quantité', key: 'quantity', width: 10 },
    { header: 'Prix unitaire HT', key: 'unit_price', width: 15, style: { numFmt: moneyFmt } },
    { header: 'Taux TVA (%)', key: 'vat_rate', width: 12 },
    { header: 'Total HT', key: 'total_ht', width: 14, style: { numFmt: moneyFmt } },
    { header: 'TVA', key: 'total_tva', width: 12, style: { numFmt: moneyFmt } },
  ];
  for (const d of documents) {
    for (const l of d.lines) {
      lines.addRow({ ...l, date: toDate(d.date), kind: KIND_LABEL[d.kind], number: d.number, party_name: d.party_name });
    }
  }
  styleHeader(lines);

  const summary = wb.addWorksheet('Récapitulatif');
  summary.columns = [
    { header: 'Indicateur', key: 'label', width: 30 },
    { header: `Montant (${company.currency})`, key: 'value', width: 18, style: { numFmt: moneyFmt } },
  ];
  const sum = (kind, field) =>
    documents.filter((d) => d.kind === kind).reduce((acc, d) => acc + Math.round(d[field] * 100), 0) / 100;
  summary.addRows([
    { label: 'Ventes HT', value: sum('sale', 'total_ht') },
    { label: 'TVA collectée', value: sum('sale', 'total_tva') },
    { label: 'Ventes TTC', value: sum('sale', 'total_ttc') },
    { label: 'Achats HT', value: sum('purchase', 'total_ht') },
    { label: 'TVA déductible', value: sum('purchase', 'total_tva') },
    { label: 'Achats TTC', value: sum('purchase', 'total_ttc') },
    { label: 'Solde (ventes − achats TTC)', value: sum('sale', 'total_ttc') - sum('purchase', 'total_ttc') },
  ]);
  styleHeader(summary);
}

function ecrituresFormat(wb, documents, company) {
  const plan = ACCOUNTS[company.accounting_plan] || ACCOUNTS.syscohada;
  const sheet = wb.addWorksheet('Ecritures');
  sheet.columns = [
    { header: 'Journal', key: 'journal', width: 9 },
    { header: 'Date', key: 'date', width: 12, style: { numFmt: 'dd/mm/yyyy' } },
    { header: 'N° pièce', key: 'number', width: 16 },
    { header: 'Compte', key: 'account', width: 10 },
    { header: 'Libellé', key: 'label', width: 40 },
    { header: 'Débit', key: 'debit', width: 14, style: { numFmt: moneyFmt } },
    { header: 'Crédit', key: 'credit', width: 14, style: { numFmt: moneyFmt } },
  ];
  for (const d of documents) {
    const acc = plan[d.kind];
    const base = { journal: acc.journal, date: toDate(d.date), number: d.number || `ID${d.id}` };
    const label = `${TYPE_LABEL[d.doc_type]} ${d.party_name}`.slice(0, 60);
    const rows =
      d.kind === 'purchase'
        ? [
            { account: acc.expense, debit: d.total_ht },
            { account: acc.vat, debit: d.total_tva },
            { account: acc.party, credit: d.total_ttc },
          ]
        : [
            { account: acc.party, debit: d.total_ttc },
            { account: acc.revenue, credit: d.total_ht },
            { account: acc.vat, credit: d.total_tva },
          ];
    for (const r of rows) {
      if (!(r.debit || r.credit)) continue; // pas de ligne de TVA à 0
      sheet.addRow({ ...base, label, debit: r.debit ?? null, credit: r.credit ?? null, account: r.account });
    }
  }
  styleHeader(sheet);
}

export const EXPORT_FORMATS = {
  standard: { label: 'Récapitulatif standard', build: standardFormat },
  ecritures: { label: 'Écritures comptables (débit / crédit)', build: ecrituresFormat },
};

export async function buildWorkbook(format, documents, company) {
  const fmt = EXPORT_FORMATS[format];
  if (!fmt) throw Object.assign(new Error(`Format d'export inconnu : ${format}`), { status: 400 });
  const wb = new ExcelJS.Workbook();
  wb.creator = 'LeukFlow';
  wb.created = new Date();
  fmt.build(wb, documents, company);
  return wb.xlsx.writeBuffer();
}

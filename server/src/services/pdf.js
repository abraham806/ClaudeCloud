import PDFDocument from 'pdfkit';

const TITLES = {
  'sale:invoice': 'FACTURE',
  'sale:receipt': 'REÇU',
  'purchase:invoice': "FACTURE D'ACHAT",
  'purchase:receipt': "REÇU D'ACHAT",
  'sale:quote': 'DEVIS',
};

function money(value, currency) {
  // Intl insère des espaces insécables fines que les polices standard PDF n'ont pas.
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency })
    .format(value)
    .replace(/[  ]/g, ' ');
}

const frDate = (iso) => (iso ? iso.split('-').reverse().join('/') : '');

// Génère la facture / le reçu imprimable et l'écrit dans `stream`.
export function renderDocumentPdf(doc, company, stream) {
  const pdf = new PDFDocument({ size: 'A4', margin: 50 });
  pdf.pipe(stream);
  drawDocument(pdf, doc, company);
  pdf.end();
}

// Variante sans flux Node (navigateur) : document dessiné, à terminer par l'appelant.
export function createDocumentPdf(doc, company) {
  const pdf = new PDFDocument({ size: 'A4', margin: 50 });
  drawDocument(pdf, doc, company);
  return pdf;
}

function drawDocument(pdf, doc, company) {
  const cur = company.currency;
  const left = 50;
  const right = pdf.page.width - 50;

  // En-tête : émetteur
  const issuer = doc.kind === 'sale' ? company : { name: doc.party_name, address: doc.party_address, tax_id: doc.party_tax_id };
  const recipient = doc.kind === 'sale' ? { name: doc.party_name, address: doc.party_address, tax_id: doc.party_tax_id } : company;

  const taxLabel = company.accounting_plan === 'pcg' ? 'N° TVA' : 'NINEA';
  pdf.fontSize(18).font('Helvetica-Bold').text(issuer.name || '', left, 50);
  pdf.fontSize(9).font('Helvetica');
  for (const line of [
    issuer.address, issuer.phone, issuer.email,
    issuer.tax_id && `${taxLabel} : ${issuer.tax_id}`, issuer.rccm && `RCCM : ${issuer.rccm}`,
  ]) {
    if (line) pdf.text(line);
  }

  pdf.fontSize(20).font('Helvetica-Bold').text(TITLES[`${doc.kind}:${doc.doc_type}`], 300, 50, { width: right - 300, align: 'right' });
  pdf.fontSize(10).font('Helvetica');
  pdf.text(`N° ${doc.number || '—'}`, 300, pdf.y + 4, { width: right - 300, align: 'right' });
  pdf.text(`Date : ${frDate(doc.date)}`, { width: right - 300, align: 'right' });
  if (doc.due_date) pdf.text(`Échéance : ${frDate(doc.due_date)}`, { width: right - 300, align: 'right' });

  // Destinataire
  const boxTop = 150;
  pdf.roundedRect(300, boxTop, right - 300, 70, 4).stroke('#cccccc');
  pdf.fontSize(8).fillColor('#666666').text(doc.kind === 'sale' ? 'CLIENT' : 'ACHETEUR', 310, boxTop + 8);
  pdf.fontSize(11).fillColor('#000000').font('Helvetica-Bold').text(recipient.name || '', 310, boxTop + 20, { width: right - 320 });
  pdf.fontSize(9).font('Helvetica');
  if (recipient.address) pdf.text(recipient.address, { width: right - 320 });
  if (recipient.tax_id) pdf.text(`${taxLabel} : ${recipient.tax_id}`, { width: right - 320 });

  // Tableau des lignes
  const cols = [
    { label: 'Désignation', x: left, w: 220, align: 'left' },
    { label: 'Qté', x: 270, w: 45, align: 'right' },
    { label: 'P.U. HT', x: 315, w: 80, align: 'right' },
    { label: 'TVA', x: 395, w: 45, align: 'right' },
    { label: 'Total HT', x: 440, w: right - 440, align: 'right' },
  ];
  let y = 250;
  pdf.rect(left, y, right - left, 20).fill('#1f4e79');
  pdf.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9);
  cols.forEach((c) => pdf.text(c.label, c.x + 4, y + 6, { width: c.w - 8, align: c.align }));
  pdf.fillColor('#000000').font('Helvetica');
  y += 26;
  for (const l of doc.lines) {
    const values = [l.description, String(l.quantity), money(l.unit_price, cur), `${l.vat_rate} %`, money(l.total_ht, cur)];
    const h = Math.max(pdf.heightOfString(l.description, { width: cols[0].w - 8 }), 12);
    if (y + h > pdf.page.height - 160) {
      pdf.addPage();
      y = 50;
    }
    cols.forEach((c, i) => pdf.text(values[i], c.x + 4, y, { width: c.w - 8, align: c.align }));
    y += h + 8;
    pdf.moveTo(left, y - 4).lineTo(right, y - 4).stroke('#eeeeee');
  }

  // Totaux
  y += 10;
  const totals = [
    ['Total HT', doc.total_ht],
    ['TVA', doc.total_tva],
    ['Total TTC', doc.total_ttc],
  ];
  totals.forEach(([label, value], i) => {
    const bold = i === totals.length - 1;
    pdf.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 12 : 10);
    pdf.text(label, 330, y, { width: 100, align: 'right' });
    pdf.text(money(value, cur), 430, y, { width: right - 430, align: 'right' });
    y += bold ? 20 : 16;
  });

  pdf.font('Helvetica').fontSize(9);
  y += 10;
  if (doc.payment_method) pdf.text(`Mode de paiement : ${doc.payment_method}`, left, y);
  if (doc.doc_type === 'quote') pdf.text('Devis valable 30 jours.', left);
  else pdf.text(`Statut : ${doc.status === 'paid' ? 'Payé' : 'En attente de paiement'}`, left);
  if (doc.notes) pdf.moveDown().text(doc.notes, left, pdf.y, { width: right - left });

  if (company.invoice_footer) {
    pdf.page.margins.bottom = 0; // évite un saut de page pour le pied de page
    pdf.fontSize(8).fillColor('#666666').text(company.invoice_footer, left, pdf.page.height - 70, {
      width: right - left,
      align: 'center',
    });
  }
}

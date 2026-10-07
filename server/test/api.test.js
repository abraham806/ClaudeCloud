import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ExcelJS from 'exceljs';
import request from 'supertest';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'facturo-test-'));
process.env.UPLOAD_DIR = path.join(tmp, 'uploads');

const { openDatabase } = await import('../src/db.js');
const { createApp } = await import('../src/app.js');

const app = createApp(openDatabase(':memory:'));
let token;
const auth = () => ({ Authorization: `Bearer ${token}` });

const binaryParser = (res, cb) => {
  const chunks = [];
  res.on('data', (c) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

before(async () => {
  const res = await request(app).post('/api/auth/register').send({
    name: 'Awa', email: 'awa@example.com', password: 'motdepasse', company_name: 'Boutique Awa', currency: 'EUR',
  });
  assert.equal(res.status, 201);
  token = res.body.token;
});

test('refuse les requêtes non authentifiées', async () => {
  const res = await request(app).get('/api/documents');
  assert.equal(res.status, 401);
});

test('connexion', async () => {
  const ok = await request(app).post('/api/auth/login').send({ email: 'awa@example.com', password: 'motdepasse' });
  assert.equal(ok.status, 200);
  const ko = await request(app).post('/api/auth/login').send({ email: 'awa@example.com', password: 'mauvais' });
  assert.equal(ko.status, 401);
});

test('crée une vente numérotée avec calcul des totaux', async () => {
  const res = await request(app).post('/api/documents').set(auth()).send({
    kind: 'sale', doc_type: 'invoice', date: '2026-03-15', party_name: 'Client SARL',
    lines: [
      { description: 'Prestation', quantity: 2, unit_price: 100, vat_rate: 20 },
      { description: 'Fourniture', quantity: 3, unit_price: 9.99, vat_rate: 5.5 },
    ],
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.number, 'FAC-2026-0001');
  assert.equal(res.body.total_ht, 229.97);
  assert.equal(res.body.total_tva, 41.65); // 40 + 1.648 arrondi
  assert.equal(res.body.total_ttc, 271.62);

  const second = await request(app).post('/api/documents').set(auth()).send({
    kind: 'sale', doc_type: 'invoice', date: '2026-04-01', party_name: 'Autre client',
    lines: [{ description: 'X', quantity: 1, unit_price: 10, vat_rate: 0 }],
  });
  assert.equal(second.body.number, 'FAC-2026-0002');
});

test('valide les entrées', async () => {
  const res = await request(app).post('/api/documents').set(auth()).send({ kind: 'sale', date: '15/03/2026', lines: [] });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /AAAA-MM-JJ/);
});

test('achat avec justificatif, stats, PDF et export Excel', async () => {
  const created = await request(app).post('/api/documents').set(auth()).send({
    kind: 'purchase', doc_type: 'receipt', number: 'T-889', date: '2026-03-20', party_name: 'Station Total',
    category: 'Carburant', payment_method: 'Carte',
    lines: [{ description: 'Gasoil', quantity: 1, unit_price: 50, vat_rate: 20 }],
  });
  assert.equal(created.status, 201);
  const id = created.body.id;

  const up = await request(app)
    .post(`/api/documents/${id}/attachments`).set(auth())
    .attach('files', Buffer.from('%PDF-1.4 test'), { filename: 'ticket.pdf', contentType: 'application/pdf' });
  assert.equal(up.status, 201);
  assert.equal(up.body.length, 1);

  const bad = await request(app)
    .post(`/api/documents/${id}/attachments`).set(auth())
    .attach('files', Buffer.from('x'), { filename: 'virus.exe', contentType: 'application/x-msdownload' });
  assert.equal(bad.status, 400);

  const file = await request(app).get(`/api/documents/${id}/attachments/${up.body[0].id}`).set(auth());
  assert.equal(file.status, 200);

  const stats = await request(app).get('/api/reports/stats?from=2026-03-01&to=2026-03-31').set(auth());
  assert.equal(stats.status, 200);
  assert.equal(stats.body.purchases.total_ttc, 60);
  assert.equal(stats.body.sales.total_ttc, 271.62);
  assert.equal(stats.body.by_category[0].category, 'Carburant');

  const pdf = await request(app).get(`/api/documents/${id}/pdf`).set(auth()).buffer().parse(binaryParser);
  assert.equal(pdf.status, 200);
  assert.equal(pdf.body.subarray(0, 4).toString(), '%PDF');

  for (const format of ['standard', 'ecritures']) {
    const xlsx = await request(app)
      .get(`/api/reports/export?from=2026-03-01&to=2026-03-31&format=${format}`).set(auth())
      .buffer().parse(binaryParser);
    assert.equal(xlsx.status, 200);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(xlsx.body);
    const sheet = wb.worksheets[0];
    if (format === 'standard') {
      assert.equal(sheet.rowCount, 3); // en-tête + 2 pièces de mars
    } else {
      // Écritures équilibrées : total débit = total crédit
      let debit = 0;
      let credit = 0;
      sheet.eachRow((row, n) => {
        if (n === 1) return;
        debit += Number(row.getCell(6).value || 0);
        credit += Number(row.getCell(7).value || 0);
      });
      assert.equal(Math.round(debit * 100), Math.round(credit * 100));
    }
  }
});

test("isole les données entre entreprises", async () => {
  const other = await request(app).post('/api/auth/register').send({
    name: 'Bob', email: 'bob@example.com', password: 'motdepasse', company_name: 'Bob SAS',
  });
  const list = await request(app).get('/api/documents').set({ Authorization: `Bearer ${other.body.token}` });
  assert.equal(list.body.total, 0);
  const mine = await request(app).get('/api/documents').set(auth());
  const foreign = await request(app)
    .get(`/api/documents/${mine.body.items[0].id}`).set({ Authorization: `Bearer ${other.body.token}` });
  assert.equal(foreign.status, 404);
});

test('devis → facture, statut, actions groupées, tiers, filtres', async () => {
  const quote = await request(app).post('/api/documents').set(auth()).send({
    kind: 'sale', doc_type: 'quote', date: '2026-05-02', party_name: 'Hôtel Teranga', party_address: 'Dakar',
    lines: [{ description: 'Étude', quantity: 1, unit_price: 500, vat_rate: 18 }],
  });
  assert.equal(quote.status, 201);
  assert.match(quote.body.number, /^DEV-2026-/);

  const badQuote = await request(app).post('/api/documents').set(auth()).send({
    kind: 'purchase', doc_type: 'quote', date: '2026-05-02', party_name: 'X',
    lines: [{ description: 'Y', quantity: 1, unit_price: 1 }],
  });
  assert.equal(badQuote.status, 400);

  // Un devis ne compte pas dans les statistiques
  const before = await request(app).get('/api/reports/stats?from=2026-05-01&to=2026-05-31').set(auth());
  assert.equal(before.body.sales.count, 0);

  const invoice = await request(app).post(`/api/documents/${quote.body.id}/convert`).set(auth());
  assert.equal(invoice.status, 201);
  assert.equal(invoice.body.doc_type, 'invoice');
  assert.equal(invoice.body.status, 'unpaid');
  assert.match(invoice.body.number, /^FAC-/);
  assert.equal(invoice.body.total_ttc, 590);

  const paid = await request(app).patch(`/api/documents/${invoice.body.id}/status`).set(auth()).send({ status: 'paid' });
  assert.equal(paid.body.status, 'paid');

  const overdue = await request(app).post('/api/documents').set(auth()).send({
    kind: 'sale', date: '2026-01-02', due_date: '2026-01-31', status: 'unpaid', party_name: 'Retard SA',
    lines: [{ description: 'Z', quantity: 1, unit_price: 100, vat_rate: 0 }],
  });
  assert.equal(overdue.body.overdue, true);
  const late = await request(app).get('/api/documents?overdue=1').set(auth());
  assert.equal(late.body.total, 1);
  const stats = await request(app).get('/api/reports/stats').set(auth());
  assert.equal(stats.body.todo.overdue_count, 1);

  const missing = await request(app).get('/api/documents?missing=1&kind=sale').set(auth());
  assert.ok(missing.body.total >= 1);

  const bulk = await request(app).post('/api/documents/bulk').set(auth())
    .send({ ids: [overdue.body.id, invoice.body.id], action: 'category', category: 'Hôtellerie' });
  assert.equal(bulk.body.count, 2);

  const parties = await request(app).get('/api/company/parties?kind=sale').set(auth());
  const teranga = parties.body.find((p) => p.name === 'Hôtel Teranga');
  assert.equal(teranga.address, 'Dakar');
  assert.equal(teranga.total, 590); // le devis n'est pas compté

  const del = await request(app).post('/api/documents/bulk').set(auth()).send({ ids: [overdue.body.id], action: 'delete' });
  assert.equal(del.body.count, 1);
});

test('équipe : comptable en lecture seule, historique des exports', async () => {
  const add = await request(app).post('/api/users').set(auth())
    .send({ name: 'Moussa', email: 'compta@example.com', password: 'motdepasse', role: 'accountant' });
  assert.equal(add.status, 201);
  const login = await request(app).post('/api/auth/login').send({ email: 'compta@example.com', password: 'motdepasse' });
  const acc = { Authorization: `Bearer ${login.body.token}` };
  const list = await request(app).get('/api/documents').set(acc);
  assert.equal(list.status, 200);
  const write = await request(app).post('/api/documents/bulk').set(acc).send({ ids: [1], action: 'paid' });
  assert.equal(write.status, 403);
  await request(app).get('/api/reports/export?format=ecritures').set(acc);
  const history = await request(app).get('/api/reports/export/history').set(auth());
  assert.ok(history.body.some((h) => h.user_name === 'Moussa'));
});

test('par défaut : FCFA, TVA 18 %, SYSCOHADA', async () => {
  const res = await request(app).post('/api/auth/register').send({
    name: 'Fatou', email: 'fatou@example.sn', password: 'motdepasse', company_name: 'Fatou Couture',
  });
  const me = await request(app).get('/api/auth/me').set({ Authorization: `Bearer ${res.body.token}` });
  assert.equal(me.body.company.currency, 'XOF');
  assert.equal(me.body.company.default_vat, 18);
  assert.equal(me.body.company.accounting_plan, 'syscohada');
});

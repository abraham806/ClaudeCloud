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

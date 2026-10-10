import { computeTotals, toCents, fromCents } from './amounts.js';
import { cleanCustomValues, describeCustomValues, listFields } from './fields.js';

const PREFIXES = { 'sale:invoice': 'FAC', 'sale:receipt': 'REC', 'sale:quote': 'DEV' };

const todayIso = () => new Date().toISOString().slice(0, 10);

async function nextNumber(q, companyId, prefix, date) {
  const year = Number(date.slice(0, 4));
  const { last_value } = await q.one(
    `INSERT INTO sequences (company_id, prefix, year, last_value) VALUES (@companyId, @prefix, @year, 1)
     ON CONFLICT (company_id, prefix, year) DO UPDATE SET last_value = sequences.last_value + 1
     RETURNING last_value`,
    { companyId, prefix, year },
  );
  return `${prefix}-${year}-${String(last_value).padStart(4, '0')}`;
}

// Convertit une ligne de la base (centimes) vers l'API (décimales).
function serializeDocument(doc, lines, attachments, fields) {
  return {
    ...doc,
    custom_values: doc.custom_values || {},
    ...(fields && { custom: describeCustomValues(fields, doc) }),
    overdue: doc.status === 'unpaid' && doc.doc_type !== 'quote' && !!doc.due_date && doc.due_date < todayIso(),
    total_ht: fromCents(doc.total_ht),
    total_tva: fromCents(doc.total_tva),
    total_ttc: fromCents(doc.total_ttc),
    ...(lines && {
      lines: lines.map((l) => ({
        id: l.id,
        description: l.description,
        quantity: l.quantity,
        unit_price: fromCents(l.unit_price),
        vat_rate: l.vat_rate,
        total_ht: fromCents(l.total_ht),
        total_tva: fromCents(l.total_tva),
      })),
    }),
    ...(attachments && { attachments }),
  };
}

async function writeLines(q, documentId, lines) {
  await q.run('DELETE FROM document_lines WHERE document_id = $1', [documentId]);
  for (const [i, l] of lines.entries()) {
    await q.run(
      `INSERT INTO document_lines (document_id, position, description, quantity, unit_price, vat_rate, total_ht, total_tva)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [documentId, i, l.description, l.quantity, l.unit_price, l.vat_rate, l.total_ht, l.total_tva],
    );
  }
}

const prepare = (input) => computeTotals(input.lines.map((l) => ({ ...l, unit_price: toCents(l.unit_price) })));

export async function createDocument(db, user, input) {
  const id = await db.tx(async (q) => {
    const totals = prepare(input);
    const prefix = PREFIXES[`${input.kind}:${input.doc_type}`];
    // Les ventes sont numérotées automatiquement ; pour les achats on garde le n° du fournisseur.
    const number = input.number || (prefix ? await nextNumber(q, user.company_id, prefix, input.date) : null);
    const row = await q.one(
      `INSERT INTO documents (company_id, kind, doc_type, number, date, due_date, party_name, party_address,
         party_tax_id, category, payment_method, status, notes, total_ht, total_tva, total_ttc, created_by, custom_values)
       VALUES (@company_id, @kind, @doc_type, @number, @date, @due_date, @party_name, @party_address,
         @party_tax_id, @category, @payment_method, @status, @notes, @total_ht, @total_tva, @total_ttc, @created_by,
         CAST(CAST(@custom_values AS text) AS jsonb))
       RETURNING id`,
      {
        ...nullify(input),
        number,
        company_id: user.company_id,
        created_by: user.id,
        custom_values: JSON.stringify(await cleanCustomValues(q, user.company_id, input.kind, input.custom_values)),
        total_ht: totals.total_ht,
        total_tva: totals.total_tva,
        total_ttc: totals.total_ttc,
      },
    );
    await writeLines(q, row.id, totals.lines);
    return row.id;
  });
  return getDocument(db, user.company_id, id);
}

export async function updateDocument(db, user, id, input) {
  const found = await db.tx(async (q) => {
    const existing = await q.one('SELECT number FROM documents WHERE id = $1 AND company_id = $2', [id, user.company_id]);
    if (!existing) return false;
    const totals = prepare(input);
    await q.run(
      `UPDATE documents SET kind=@kind, doc_type=@doc_type, number=@number, date=@date, due_date=@due_date,
         party_name=@party_name, party_address=@party_address, party_tax_id=@party_tax_id, category=@category,
         payment_method=@payment_method, status=@status, notes=@notes, total_ht=@total_ht, total_tva=@total_tva,
         total_ttc=@total_ttc, custom_values=CAST(CAST(@custom_values AS text) AS jsonb), updated_at=now()
       WHERE id=@id AND company_id=@company_id`,
      {
        ...nullify(input),
        number: input.number || existing.number,
        custom_values: JSON.stringify(await cleanCustomValues(q, user.company_id, input.kind, input.custom_values)),
        id,
        company_id: user.company_id,
        total_ht: totals.total_ht,
        total_tva: totals.total_tva,
        total_ttc: totals.total_ttc,
      },
    );
    await writeLines(q, id, totals.lines);
    return true;
  });
  return found ? getDocument(db, user.company_id, id) : null;
}

export async function getDocument(db, companyId, id) {
  const doc = await db.one('SELECT * FROM documents WHERE id = $1 AND company_id = $2', [id, companyId]);
  if (!doc) return null;
  const [lines, attachments, fields] = await Promise.all([
    db.query('SELECT * FROM document_lines WHERE document_id = $1 ORDER BY position', [id]),
    db.query(
      'SELECT id, original_name, mime_type, size, created_at FROM attachments WHERE document_id = $1 ORDER BY id',
      [id],
    ),
    listFields(db, companyId),
  ]);
  return serializeDocument(doc, lines, attachments, fields);
}

export async function listDocuments(
  db, companyId, { from, to, kind, q, status, doc_type, missing, overdue, party, limit = 50, offset = 0 } = {},
) {
  const where = ['d.company_id = @companyId'];
  if (from) where.push('d.date >= @from');
  if (to) where.push('d.date <= @to');
  if (kind) where.push('d.kind = @kind');
  if (status) where.push('d.status = @status');
  if (doc_type) where.push('d.doc_type = @doc_type');
  if (party) where.push('d.party_name = @party');
  if (missing) where.push("d.doc_type != 'quote' AND NOT EXISTS (SELECT 1 FROM attachments a WHERE a.document_id = d.id)");
  if (overdue) where.push("d.status = 'unpaid' AND d.doc_type != 'quote' AND d.due_date < @today");
  if (q) {
    where.push(
      '(d.party_name ILIKE @q OR d.number ILIKE @q OR d.category ILIKE @q OR d.notes ILIKE @q OR EXISTS (SELECT 1 FROM jsonb_each_text(d.custom_values) cv WHERE cv.value ILIKE @q))',
    );
  }
  const params = { companyId, from, to, kind, status, doc_type, party, today: todayIso(), q: q && `%${q}%` };
  const sqlWhere = where.join(' AND ');
  const [rows, agg] = await Promise.all([
    db.query(
      `SELECT d.*, (SELECT COUNT(*) FROM attachments a WHERE a.document_id = d.id) AS attachment_count
       FROM documents d WHERE ${sqlWhere} ORDER BY d.date DESC, d.id DESC LIMIT @limit OFFSET @offset`,
      { ...params, limit, offset },
    ),
    db.one(`SELECT COUNT(*) AS total, COALESCE(SUM(total_ttc), 0) AS sum_ttc FROM documents d WHERE ${sqlWhere}`, params),
  ]);
  return { items: rows.map((r) => serializeDocument(r)), total: agg.total, sum_ttc: fromCents(agg.sum_ttc) };
}

// Toutes les pièces d'une période avec leurs lignes (pour l'export Excel).
export async function documentsForExport(db, companyId, { from, to, kind } = {}) {
  const where = ['company_id = @companyId', "doc_type != 'quote'"];
  if (from) where.push('date >= @from');
  if (to) where.push('date <= @to');
  if (kind) where.push('kind = @kind');
  const docs = await db.query(
    `SELECT * FROM documents WHERE ${where.join(' AND ')} ORDER BY date, id`,
    { companyId, from, to, kind },
  );
  if (!docs.length) return [];
  const fields = await listFields(db, companyId);
  const lines = await db.query(
    'SELECT * FROM document_lines WHERE document_id = ANY($1::int[]) ORDER BY document_id, position',
    [docs.map((d) => d.id)],
  );
  const byDoc = new Map();
  for (const l of lines) byDoc.set(l.document_id, [...(byDoc.get(l.document_id) || []), l]);
  return docs.map((d) => serializeDocument(d, byDoc.get(d.id) || [], undefined, fields));
}

// Supprime la pièce ; renvoie les fichiers à effacer du stockage (ou null si introuvable).
export async function deleteDocument(db, companyId, id) {
  const attachments = await db.query(
    'SELECT stored_name FROM attachments WHERE document_id = $1 AND company_id = $2',
    [id, companyId],
  );
  const { count } = await db.run('DELETE FROM documents WHERE id = $1 AND company_id = $2', [id, companyId]);
  return count ? attachments.map((a) => a.stored_name) : null;
}

export async function setStatus(db, companyId, ids, status) {
  const { count } = await db.run(
    'UPDATE documents SET status = $1, updated_at = now() WHERE company_id = $2 AND id = ANY($3::int[])',
    [status, companyId, ids],
  );
  return count;
}

export async function setCategory(db, companyId, ids, category) {
  const { count } = await db.run(
    'UPDATE documents SET category = $1, updated_at = now() WHERE company_id = $2 AND id = ANY($3::int[])',
    [category || null, companyId, ids],
  );
  return count;
}

// Transforme un devis en facture (nouvelle pièce, le devis reste dans l'historique).
export async function convertQuote(db, user, id) {
  const quote = await getDocument(db, user.company_id, id);
  if (!quote || quote.doc_type !== 'quote') return null;
  return createDocument(db, user, {
    ...quote,
    doc_type: 'invoice',
    number: null,
    date: todayIso(),
    status: 'unpaid',
    notes: [quote.notes, `Selon devis ${quote.number}`].filter(Boolean).join('\n'),
  });
}

// Clients et fournisseurs, déduits des pièces saisies.
export async function listParties(db, companyId, kind) {
  const rows = await db.query(
    `SELECT party_name AS name, kind,
       (SELECT d2.party_address FROM documents d2 WHERE d2.company_id = d.company_id AND d2.party_name = d.party_name
          AND d2.party_address IS NOT NULL AND d2.party_address != '' ORDER BY d2.date DESC LIMIT 1) AS address,
       (SELECT d2.party_tax_id FROM documents d2 WHERE d2.company_id = d.company_id AND d2.party_name = d.party_name
          AND d2.party_tax_id IS NOT NULL AND d2.party_tax_id != '' ORDER BY d2.date DESC LIMIT 1) AS tax_id,
       COUNT(*) AS count,
       SUM(CASE WHEN doc_type != 'quote' THEN total_ttc ELSE 0 END) AS total,
       SUM(CASE WHEN status = 'unpaid' AND doc_type != 'quote' THEN total_ttc ELSE 0 END) AS unpaid,
       MAX(date) AS last_date
     FROM documents d WHERE company_id = @companyId ${kind ? 'AND kind = @kind' : ''}
     GROUP BY company_id, party_name, kind ORDER BY last_date DESC`,
    { companyId, kind },
  );
  return rows.map((r) => ({ ...r, total: fromCents(r.total), unpaid: fromCents(r.unpaid) }));
}

// Tous les justificatifs, avec la pièce associée.
export async function listAttachments(db, companyId) {
  const rows = await db.query(
    `SELECT a.id, a.document_id, a.original_name, a.mime_type, a.size, a.created_at,
       d.kind, d.doc_type, d.number, d.date, d.party_name, d.total_ttc
     FROM attachments a JOIN documents d ON d.id = a.document_id
     WHERE a.company_id = $1 ORDER BY d.date DESC, a.id DESC LIMIT 500`,
    [companyId],
  );
  return rows.map((a) => ({ ...a, total_ttc: fromCents(a.total_ttc) }));
}

function nullify(input) {
  const out = {};
  for (const key of [
    'kind', 'doc_type', 'number', 'date', 'due_date', 'party_name', 'party_address', 'party_tax_id',
    'category', 'payment_method', 'status', 'notes',
  ]) {
    out[key] = input[key] === undefined || input[key] === '' ? null : input[key];
  }
  return out;
}

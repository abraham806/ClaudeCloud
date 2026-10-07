import { computeTotals, toCents, fromCents } from './amounts.js';

const PREFIXES = { 'sale:invoice': 'FAC', 'sale:receipt': 'REC', 'sale:quote': 'DEV' };

const todayIso = () => new Date().toISOString().slice(0, 10);

function nextNumber(db, companyId, prefix, date) {
  const year = Number(date.slice(0, 4));
  db.prepare(
    `INSERT INTO sequences (company_id, prefix, year, last_value) VALUES (?, ?, ?, 1)
     ON CONFLICT (company_id, prefix, year) DO UPDATE SET last_value = last_value + 1`,
  ).run(companyId, prefix, year);
  const { last_value } = db
    .prepare('SELECT last_value FROM sequences WHERE company_id = ? AND prefix = ? AND year = ?')
    .get(companyId, prefix, year);
  return `${prefix}-${year}-${String(last_value).padStart(4, '0')}`;
}

// Convertit une ligne de la base (centimes) vers l'API (décimales).
function serializeDocument(doc, lines, attachments) {
  return {
    ...doc,
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

function writeLines(db, documentId, lines) {
  db.prepare('DELETE FROM document_lines WHERE document_id = ?').run(documentId);
  const insert = db.prepare(
    `INSERT INTO document_lines (document_id, position, description, quantity, unit_price, vat_rate, total_ht, total_tva)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  lines.forEach((l, i) =>
    insert.run(documentId, i, l.description, l.quantity, l.unit_price, l.vat_rate, l.total_ht, l.total_tva),
  );
}

function prepare(input) {
  const totals = computeTotals(input.lines.map((l) => ({ ...l, unit_price: toCents(l.unit_price) })));
  return totals;
}

export function createDocument(db, user, input) {
  return db.transaction(() => {
    const totals = prepare(input);
    const prefix = PREFIXES[`${input.kind}:${input.doc_type}`];
    // Les ventes sont numérotées automatiquement ; pour les achats on garde le n° du fournisseur.
    const number = input.number || (prefix ? nextNumber(db, user.company_id, prefix, input.date) : null);
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO documents (company_id, kind, doc_type, number, date, due_date, party_name, party_address,
           party_tax_id, category, payment_method, status, notes, total_ht, total_tva, total_ttc, created_by)
         VALUES (@company_id, @kind, @doc_type, @number, @date, @due_date, @party_name, @party_address,
           @party_tax_id, @category, @payment_method, @status, @notes, @total_ht, @total_tva, @total_ttc, @created_by)`,
      )
      .run({
        ...nullify(input),
        number,
        company_id: user.company_id,
        created_by: user.id,
        total_ht: totals.total_ht,
        total_tva: totals.total_tva,
        total_ttc: totals.total_ttc,
      });
    writeLines(db, lastInsertRowid, totals.lines);
    return getDocument(db, user.company_id, lastInsertRowid);
  })();
}

export function updateDocument(db, user, id, input) {
  return db.transaction(() => {
    const existing = db.prepare('SELECT * FROM documents WHERE id = ? AND company_id = ?').get(id, user.company_id);
    if (!existing) return null;
    const totals = prepare(input);
    db.prepare(
      `UPDATE documents SET kind=@kind, doc_type=@doc_type, number=@number, date=@date, due_date=@due_date,
         party_name=@party_name, party_address=@party_address, party_tax_id=@party_tax_id, category=@category,
         payment_method=@payment_method, status=@status, notes=@notes, total_ht=@total_ht, total_tva=@total_tva,
         total_ttc=@total_ttc, updated_at=datetime('now')
       WHERE id=@id AND company_id=@company_id`,
    ).run({
      ...nullify(input),
      number: input.number || existing.number,
      id,
      company_id: user.company_id,
      total_ht: totals.total_ht,
      total_tva: totals.total_tva,
      total_ttc: totals.total_ttc,
    });
    writeLines(db, id, totals.lines);
    return getDocument(db, user.company_id, id);
  })();
}

export function getDocument(db, companyId, id) {
  const doc = db.prepare('SELECT * FROM documents WHERE id = ? AND company_id = ?').get(id, companyId);
  if (!doc) return null;
  const lines = db.prepare('SELECT * FROM document_lines WHERE document_id = ? ORDER BY position').all(id);
  const attachments = db
    .prepare(
      'SELECT id, original_name, mime_type, size, created_at FROM attachments WHERE document_id = ? ORDER BY id',
    )
    .all(id);
  return serializeDocument(doc, lines, attachments);
}

export function listDocuments(
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
  if (q) where.push("(d.party_name LIKE @q OR d.number LIKE @q OR d.category LIKE @q OR d.notes LIKE @q)");
  const params = { companyId, from, to, kind, status, doc_type, party, today: todayIso(), q: q && `%${q}%`, limit, offset };
  const sqlWhere = where.join(' AND ');
  const rows = db
    .prepare(
      `SELECT d.*, (SELECT COUNT(*) FROM attachments a WHERE a.document_id = d.id) AS attachment_count
       FROM documents d WHERE ${sqlWhere} ORDER BY d.date DESC, d.id DESC LIMIT @limit OFFSET @offset`,
    )
    .all(params);
  const agg = db
    .prepare(`SELECT COUNT(*) AS total, COALESCE(SUM(total_ttc), 0) AS sum_ttc FROM documents d WHERE ${sqlWhere}`)
    .get(params);
  return { items: rows.map((r) => serializeDocument(r)), total: agg.total, sum_ttc: fromCents(agg.sum_ttc) };
}

// Toutes les pièces d'une période avec leurs lignes (pour l'export Excel).
export function documentsForExport(db, companyId, { from, to, kind } = {}) {
  const where = ["company_id = @companyId", "doc_type != 'quote'"];
  if (from) where.push('date >= @from');
  if (to) where.push('date <= @to');
  if (kind) where.push('kind = @kind');
  const docs = db
    .prepare(`SELECT * FROM documents WHERE ${where.join(' AND ')} ORDER BY date, id`)
    .all({ companyId, from, to, kind });
  const linesStmt = db.prepare('SELECT * FROM document_lines WHERE document_id = ? ORDER BY position');
  return docs.map((d) => serializeDocument(d, linesStmt.all(d.id)));
}

export function deleteDocument(db, companyId, id) {
  const attachments = db
    .prepare('SELECT stored_name FROM attachments WHERE document_id = ? AND company_id = ?')
    .all(id, companyId);
  const { changes } = db.prepare('DELETE FROM documents WHERE id = ? AND company_id = ?').run(id, companyId);
  return changes ? attachments.map((a) => a.stored_name) : null;
}

export function setStatus(db, companyId, ids, status) {
  const stmt = db.prepare(
    "UPDATE documents SET status = ?, updated_at = datetime('now') WHERE id = ? AND company_id = ?",
  );
  return db.transaction(() => ids.reduce((n, id) => n + stmt.run(status, id, companyId).changes, 0))();
}

export function setCategory(db, companyId, ids, category) {
  const stmt = db.prepare(
    "UPDATE documents SET category = ?, updated_at = datetime('now') WHERE id = ? AND company_id = ?",
  );
  return db.transaction(() => ids.reduce((n, id) => n + stmt.run(category || null, id, companyId).changes, 0))();
}

// Transforme un devis en facture (nouvelle pièce, le devis reste dans l'historique).
export function convertQuote(db, user, id) {
  const quote = getDocument(db, user.company_id, id);
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
export function listParties(db, companyId, kind) {
  const rows = db
    .prepare(
      `SELECT party_name AS name, kind,
         (SELECT d2.party_address FROM documents d2 WHERE d2.company_id = d.company_id AND d2.party_name = d.party_name
            AND d2.party_address IS NOT NULL ORDER BY d2.date DESC LIMIT 1) AS address,
         (SELECT d2.party_tax_id FROM documents d2 WHERE d2.company_id = d.company_id AND d2.party_name = d.party_name
            AND d2.party_tax_id IS NOT NULL ORDER BY d2.date DESC LIMIT 1) AS tax_id,
         COUNT(*) AS count,
         SUM(CASE WHEN doc_type != 'quote' THEN total_ttc ELSE 0 END) AS total,
         SUM(CASE WHEN status = 'unpaid' AND doc_type != 'quote' THEN total_ttc ELSE 0 END) AS unpaid,
         MAX(date) AS last_date
       FROM documents d WHERE company_id = @companyId ${kind ? 'AND kind = @kind' : ''}
       GROUP BY party_name, kind ORDER BY last_date DESC`,
    )
    .all({ companyId, kind });
  return rows.map((r) => ({ ...r, total: fromCents(r.total), unpaid: fromCents(r.unpaid) }));
}

// Tous les justificatifs, avec la pièce associée.
export function listAttachments(db, companyId) {
  return db
    .prepare(
      `SELECT a.id, a.document_id, a.original_name, a.mime_type, a.size, a.created_at,
         d.kind, d.doc_type, d.number, d.date, d.party_name, d.total_ttc
       FROM attachments a JOIN documents d ON d.id = a.document_id
       WHERE a.company_id = ? ORDER BY d.date DESC, a.id DESC LIMIT 500`,
    )
    .all(companyId)
    .map((a) => ({ ...a, total_ttc: fromCents(a.total_ttc) }));
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

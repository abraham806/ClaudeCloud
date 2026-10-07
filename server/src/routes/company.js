import { Router } from 'express';
import { requireWriter } from '../auth.js';
import { companySchema, parse } from '../validation.js';
import { listParties } from '../services/documents.js';

export function companyRoutes(db) {
  const r = Router();

  r.get('/', (req, res) => {
    res.json(db.prepare('SELECT * FROM companies WHERE id = ?').get(req.user.company_id));
  });

  r.put('/', requireWriter, (req, res) => {
    if (req.user.role !== 'owner') return res.status(403).json({ error: 'Réservé au propriétaire' });
    const input = parse(companySchema, req.body);
    db.prepare(
      `UPDATE companies SET name=@name, address=@address, phone=@phone, email=@email, tax_id=@tax_id, rccm=@rccm,
         currency=@currency, default_vat=@default_vat, accounting_plan=@accounting_plan,
         invoice_footer=@invoice_footer WHERE id=@id`,
    ).run({
      address: null, phone: null, email: null, tax_id: null, rccm: null, invoice_footer: null,
      ...input,
      id: req.user.company_id,
    });
    res.json(db.prepare('SELECT * FROM companies WHERE id = ?').get(req.user.company_id));
  });

  // Catégories déjà utilisées, pour l'auto-complétion.
  r.get('/categories', (req, res) => {
    const rows = db
      .prepare(
        `SELECT DISTINCT category FROM documents WHERE company_id = ? AND category IS NOT NULL AND category != ''
         ORDER BY category`,
      )
      .all(req.user.company_id);
    res.json(rows.map((r) => r.category));
  });

  r.get('/parties', (req, res) => {
    const kind = ['purchase', 'sale'].includes(req.query.kind) ? req.query.kind : undefined;
    res.json(listParties(db, req.user.company_id, kind));
  });

  return r;
}

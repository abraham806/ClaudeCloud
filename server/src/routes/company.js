import { Router } from 'express';
import { requireWriter } from '../auth.js';
import { companySchema, parse } from '../validation.js';

export function companyRoutes(db) {
  const r = Router();

  r.get('/', (req, res) => {
    res.json(db.prepare('SELECT * FROM companies WHERE id = ?').get(req.user.company_id));
  });

  r.put('/', requireWriter, (req, res) => {
    if (req.user.role !== 'owner') return res.status(403).json({ error: 'Réservé au propriétaire' });
    const input = parse(companySchema, req.body);
    db.prepare(
      `UPDATE companies SET name=@name, address=@address, phone=@phone, email=@email, tax_id=@tax_id,
         currency=@currency, invoice_footer=@invoice_footer WHERE id=@id`,
    ).run({
      address: null, phone: null, email: null, tax_id: null, invoice_footer: null,
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

  return r;
}

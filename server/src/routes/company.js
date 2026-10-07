import { Router } from 'express';
import { requireWriter } from '../auth.js';
import { companySchema, parse } from '../validation.js';
import { listParties } from '../services/documents.js';

export function companyRoutes(db) {
  const r = Router();
  const load = (id) => db.one('SELECT * FROM companies WHERE id = $1', [id]);

  r.get('/', async (req, res) => {
    res.json(await load(req.user.company_id));
  });

  r.put('/', requireWriter, async (req, res) => {
    if (req.user.role !== 'owner') return res.status(403).json({ error: 'Réservé au propriétaire' });
    const input = parse(companySchema, req.body);
    await db.run(
      `UPDATE companies SET name=@name, address=@address, phone=@phone, email=@email, tax_id=@tax_id, rccm=@rccm,
         currency=@currency, default_vat=@default_vat, accounting_plan=@accounting_plan,
         invoice_footer=@invoice_footer WHERE id=@id`,
      { ...input, id: req.user.company_id },
    );
    res.json(await load(req.user.company_id));
  });

  // Catégories déjà utilisées, pour l'auto-complétion.
  r.get('/categories', async (req, res) => {
    const rows = await db.query(
      `SELECT DISTINCT category FROM documents WHERE company_id = $1 AND category IS NOT NULL AND category != ''
       ORDER BY category`,
      [req.user.company_id],
    );
    res.json(rows.map((x) => x.category));
  });

  r.get('/parties', async (req, res) => {
    const kind = ['purchase', 'sale'].includes(req.query.kind) ? req.query.kind : undefined;
    res.json(await listParties(db, req.user.company_id, kind));
  });

  return r;
}

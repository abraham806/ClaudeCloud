import { Router } from 'express';
import { periodSchema, parse } from '../validation.js';
import { getStats } from '../services/stats.js';
import { documentsForExport } from '../services/documents.js';
import { buildWorkbook, EXPORT_FORMATS } from '../services/excel.js';

export function reportRoutes(db) {
  const r = Router();

  r.get('/stats', async (req, res) => {
    const period = parse(periodSchema, req.query);
    res.json(await getStats(db, req.user.company_id, period));
  });

  r.get('/export/formats', (_req, res) => {
    res.json(Object.entries(EXPORT_FORMATS).map(([id, f]) => ({ id, label: f.label })));
  });

  r.get('/export/history', async (req, res) => {
    res.json(
      await db.query(
        `SELECT e.*, u.name AS user_name FROM exports e LEFT JOIN users u ON u.id = e.user_id
         WHERE e.company_id = $1 ORDER BY e.id DESC LIMIT 20`,
        [req.user.company_id],
      ),
    );
  });

  // Fichier Excel à transmettre au comptable.
  r.get('/export', async (req, res) => {
    const period = parse(periodSchema, req.query);
    const format = req.query.format || 'standard';
    const company = await db.one('SELECT * FROM companies WHERE id = $1', [req.user.company_id]);
    const docs = await documentsForExport(db, req.user.company_id, period);
    const buffer = await buildWorkbook(format, docs, company);
    await db.run(
      `INSERT INTO exports (company_id, user_id, format, date_from, date_to, kind, doc_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [req.user.company_id, req.user.id, format, period.from || null, period.to || null, period.kind || null, docs.length],
    );
    const name = `export-${format}-${period.from || 'debut'}-${period.to || 'fin'}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    res.send(Buffer.from(buffer));
  });

  return r;
}

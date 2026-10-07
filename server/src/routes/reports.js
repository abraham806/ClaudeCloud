import { Router } from 'express';
import { periodSchema, parse } from '../validation.js';
import { getStats } from '../services/stats.js';
import { documentsForExport } from '../services/documents.js';
import { buildWorkbook, EXPORT_FORMATS } from '../services/excel.js';

export function reportRoutes(db) {
  const r = Router();

  r.get('/stats', (req, res) => {
    const period = parse(periodSchema, req.query);
    res.json(getStats(db, req.user.company_id, period));
  });

  r.get('/export/formats', (_req, res) => {
    res.json(Object.entries(EXPORT_FORMATS).map(([id, f]) => ({ id, label: f.label })));
  });

  r.get('/export/history', (req, res) => {
    res.json(
      db
        .prepare(
          `SELECT e.*, u.name AS user_name FROM exports e LEFT JOIN users u ON u.id = e.user_id
           WHERE e.company_id = ? ORDER BY e.id DESC LIMIT 20`,
        )
        .all(req.user.company_id),
    );
  });

  // Fichier Excel à transmettre au comptable.
  r.get('/export', async (req, res) => {
    const period = parse(periodSchema, req.query);
    const format = req.query.format || 'standard';
    const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(req.user.company_id);
    const docs = documentsForExport(db, req.user.company_id, period);
    const buffer = await buildWorkbook(format, docs, company);
    db.prepare(
      `INSERT INTO exports (company_id, user_id, format, date_from, date_to, kind, doc_count)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(req.user.company_id, req.user.id, format, period.from || null, period.to || null, period.kind || null, docs.length);
    const name = `export-${format}-${period.from || 'debut'}-${period.to || 'fin'}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    res.send(Buffer.from(buffer));
  });

  return r;
}

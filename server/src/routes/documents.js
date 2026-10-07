import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Router } from 'express';
import multer from 'multer';
import { requireWriter } from '../auth.js';
import { config } from '../config.js';
import { bulkSchema, documentSchema, parse, statusSchema } from '../validation.js';
import {
  convertQuote, createDocument, deleteDocument, getDocument, listAttachments, listDocuments, setCategory, setStatus,
  updateDocument,
} from '../services/documents.js';
import { renderDocumentPdf } from '../services/pdf.js';

const ALLOWED_MIME = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);

function notFound(res) {
  return res.status(404).json({ error: 'Document introuvable' });
}

export function documentRoutes(db) {
  const r = Router();
  fs.mkdirSync(config.uploadDir, { recursive: true });

  const upload = multer({
    storage: multer.diskStorage({
      destination: config.uploadDir,
      filename: (_req, file, cb) =>
        cb(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase().slice(0, 10)}`),
    }),
    limits: { fileSize: config.maxUploadBytes, files: 10 },
    fileFilter: (_req, file, cb) => {
      if (ALLOWED_MIME.has(file.mimetype)) return cb(null, true);
      cb(Object.assign(new Error('Format non accepté (PDF, JPG, PNG, WEBP ou HEIC)'), { status: 400 }));
    },
  });

  const id = (req) => Number(req.params.id);

  const removeFiles = (files) => {
    for (const f of files) fs.rm(path.join(config.uploadDir, f), { force: true }, () => {});
  };

  r.get('/', (req, res) => {
    const { from, to, kind, q, status, doc_type, party } = req.query;
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    res.json(
      listDocuments(db, req.user.company_id, {
        from, to, kind, q, status, doc_type, party,
        missing: req.query.missing === '1',
        overdue: req.query.overdue === '1',
        limit, offset,
      }),
    );
  });

  r.get('/attachments', (req, res) => {
    res.json(listAttachments(db, req.user.company_id));
  });

  // Actions groupées : marquer payé / non payé, changer la catégorie, supprimer.
  r.post('/bulk', requireWriter, (req, res) => {
    const { ids, action, category } = parse(bulkSchema, req.body);
    let count = 0;
    if (action === 'paid' || action === 'unpaid') count = setStatus(db, req.user.company_id, ids, action);
    else if (action === 'category') count = setCategory(db, req.user.company_id, ids, category);
    else {
      for (const id of ids) {
        const files = deleteDocument(db, req.user.company_id, id);
        if (files) {
          count += 1;
          removeFiles(files);
        }
      }
    }
    res.json({ count });
  });

  r.post('/', requireWriter, (req, res) => {
    const input = parse(documentSchema, req.body);
    res.status(201).json(createDocument(db, req.user, input));
  });

  r.get('/:id', (req, res) => {
    const doc = getDocument(db, req.user.company_id, id(req));
    return doc ? res.json(doc) : notFound(res);
  });

  r.put('/:id', requireWriter, (req, res) => {
    const input = parse(documentSchema, req.body);
    const doc = updateDocument(db, req.user, id(req), input);
    return doc ? res.json(doc) : notFound(res);
  });

  r.delete('/:id', requireWriter, (req, res) => {
    const files = deleteDocument(db, req.user.company_id, id(req));
    if (!files) return notFound(res);
    removeFiles(files);
    res.status(204).end();
  });

  r.patch('/:id/status', requireWriter, (req, res) => {
    const { status } = parse(statusSchema, req.body);
    if (!setStatus(db, req.user.company_id, [id(req)], status)) return notFound(res);
    res.json(getDocument(db, req.user.company_id, id(req)));
  });

  r.post('/:id/convert', requireWriter, (req, res) => {
    const doc = convertQuote(db, req.user, id(req));
    if (!doc) return res.status(400).json({ error: 'Seul un devis peut être transformé en facture' });
    res.status(201).json(doc);
  });

  // Facture / reçu imprimable.
  r.get('/:id/pdf', (req, res) => {
    const doc = getDocument(db, req.user.company_id, id(req));
    if (!doc) return notFound(res);
    const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(req.user.company_id);
    const filename = `${(doc.number || `document-${doc.id}`).replace(/[^\w.-]/g, '_')}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${req.query.download ? 'attachment' : 'inline'}; filename="${filename}"`);
    renderDocumentPdf(doc, company, res);
  });

  // Justificatifs (photo du ticket, PDF de la facture fournisseur...).
  r.post('/:id/attachments', requireWriter, (req, res, next) => {
    const doc = db.prepare('SELECT id FROM documents WHERE id = ? AND company_id = ?').get(id(req), req.user.company_id);
    if (!doc) return notFound(res);
    upload.array('files', 10)(req, res, (err) => {
      if (err) return next(err.status ? err : Object.assign(err, { status: 400 }));
      const insert = db.prepare(
        `INSERT INTO attachments (company_id, document_id, stored_name, original_name, mime_type, size)
         VALUES (?, ?, ?, ?, ?, ?)`,
      );
      for (const f of req.files || []) {
        insert.run(req.user.company_id, doc.id, f.filename, f.originalname, f.mimetype, f.size);
      }
      res.status(201).json(getDocument(db, req.user.company_id, doc.id).attachments);
    });
  });

  r.get('/:id/attachments/:attachmentId', (req, res) => {
    const att = db
      .prepare('SELECT * FROM attachments WHERE id = ? AND document_id = ? AND company_id = ?')
      .get(Number(req.params.attachmentId), id(req), req.user.company_id);
    if (!att) return res.status(404).json({ error: 'Fichier introuvable' });
    res.setHeader('Content-Type', att.mime_type);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(att.original_name)}"`);
    res.sendFile(path.join(config.uploadDir, att.stored_name));
  });

  r.delete('/:id/attachments/:attachmentId', requireWriter, (req, res) => {
    const att = db
      .prepare('SELECT * FROM attachments WHERE id = ? AND document_id = ? AND company_id = ?')
      .get(Number(req.params.attachmentId), id(req), req.user.company_id);
    if (!att) return res.status(404).json({ error: 'Fichier introuvable' });
    db.prepare('DELETE FROM attachments WHERE id = ?').run(att.id);
    fs.rm(path.join(config.uploadDir, att.stored_name), { force: true }, () => {});
    res.status(204).end();
  });

  return r;
}

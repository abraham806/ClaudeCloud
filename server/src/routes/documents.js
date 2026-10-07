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

export function documentRoutes(db, storage) {
  const r = Router();

  // Fichiers gardés en mémoire puis envoyés au stockage (disque local ou Vercel Blob).
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: config.maxUploadBytes, files: 10 },
    fileFilter: (_req, file, cb) => {
      if (ALLOWED_MIME.has(file.mimetype)) return cb(null, true);
      cb(Object.assign(new Error('Format non accepté (PDF, JPG, PNG, WEBP ou HEIC)'), { status: 400 }));
    },
  });

  // Identifiants numériques uniquement.
  r.param('id', (req, res, next, value) => (/^\d+$/.test(value) ? next() : notFound(res)));
  r.param('attachmentId', (req, res, next, value) => (/^\d+$/.test(value) ? next() : notFound(res)));
  const id = (req) => Number(req.params.id);

  const removeFiles = (files) => Promise.all(files.map((f) => storage.remove(f).catch(() => {})));

  r.get('/', async (req, res) => {
    const { from, to, kind, q, status, doc_type, party } = req.query;
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    res.json(
      await listDocuments(db, req.user.company_id, {
        from, to, kind, q, status, doc_type, party,
        missing: req.query.missing === '1',
        overdue: req.query.overdue === '1',
        limit, offset,
      }),
    );
  });

  r.get('/attachments', async (req, res) => {
    res.json(await listAttachments(db, req.user.company_id));
  });

  // Actions groupées : marquer payé / non payé, changer la catégorie, supprimer.
  r.post('/bulk', requireWriter, async (req, res) => {
    const { ids, action, category } = parse(bulkSchema, req.body);
    let count = 0;
    if (action === 'paid' || action === 'unpaid') count = await setStatus(db, req.user.company_id, ids, action);
    else if (action === 'category') count = await setCategory(db, req.user.company_id, ids, category);
    else {
      for (const docId of ids) {
        const files = await deleteDocument(db, req.user.company_id, docId);
        if (files) {
          count += 1;
          await removeFiles(files);
        }
      }
    }
    res.json({ count });
  });

  r.post('/', requireWriter, async (req, res) => {
    const input = parse(documentSchema, req.body);
    res.status(201).json(await createDocument(db, req.user, input));
  });

  r.get('/:id', async (req, res) => {
    const doc = await getDocument(db, req.user.company_id, id(req));
    return doc ? res.json(doc) : notFound(res);
  });

  r.put('/:id', requireWriter, async (req, res) => {
    const input = parse(documentSchema, req.body);
    const doc = await updateDocument(db, req.user, id(req), input);
    return doc ? res.json(doc) : notFound(res);
  });

  r.delete('/:id', requireWriter, async (req, res) => {
    const files = await deleteDocument(db, req.user.company_id, id(req));
    if (!files) return notFound(res);
    await removeFiles(files);
    res.status(204).end();
  });

  r.patch('/:id/status', requireWriter, async (req, res) => {
    const { status } = parse(statusSchema, req.body);
    if (!(await setStatus(db, req.user.company_id, [id(req)], status))) return notFound(res);
    res.json(await getDocument(db, req.user.company_id, id(req)));
  });

  r.post('/:id/convert', requireWriter, async (req, res) => {
    const doc = await convertQuote(db, req.user, id(req));
    if (!doc) return res.status(400).json({ error: 'Seul un devis peut être transformé en facture' });
    res.status(201).json(doc);
  });

  // Facture / reçu / devis imprimable.
  r.get('/:id/pdf', async (req, res) => {
    const doc = await getDocument(db, req.user.company_id, id(req));
    if (!doc) return notFound(res);
    const company = await db.one('SELECT * FROM companies WHERE id = $1', [req.user.company_id]);
    const filename = `${(doc.number || `document-${doc.id}`).replace(/[^\w.-]/g, '_')}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${req.query.download ? 'attachment' : 'inline'}; filename="${filename}"`);
    renderDocumentPdf(doc, company, res);
  });

  // Justificatifs (photo du ticket, PDF de la facture fournisseur...).
  r.post('/:id/attachments', requireWriter, async (req, res, next) => {
    const doc = await db.one('SELECT id FROM documents WHERE id = $1 AND company_id = $2', [id(req), req.user.company_id]);
    if (!doc) return notFound(res);
    upload.array('files', 10)(req, res, async (err) => {
      if (err) {
        const message = err.code === 'LIMIT_FILE_SIZE'
          ? `Fichier trop lourd (${Math.round(config.maxUploadBytes / 1024 / 1024)} Mo maximum)`
          : err.message;
        return next(Object.assign(new Error(message), { status: err.status || 400 }));
      }
      try {
        for (const f of req.files || []) {
          const key = `${crypto.randomUUID()}${path.extname(f.originalname).toLowerCase().slice(0, 10)}`;
          const stored = await storage.put(key, f.buffer, f.mimetype);
          await db.run(
            `INSERT INTO attachments (company_id, document_id, stored_name, original_name, mime_type, size)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [req.user.company_id, doc.id, stored, f.originalname, f.mimetype, f.size],
          );
        }
        res.status(201).json((await getDocument(db, req.user.company_id, doc.id)).attachments);
      } catch (e) {
        next(e);
      }
    });
  });

  const findAttachment = (req) => db.one(
    'SELECT * FROM attachments WHERE id = $1 AND document_id = $2 AND company_id = $3',
    [Number(req.params.attachmentId), id(req), req.user.company_id],
  );

  r.get('/:id/attachments/:attachmentId', async (req, res) => {
    const att = await findAttachment(req);
    const data = att && (await storage.get(att.stored_name));
    if (!data) return res.status(404).json({ error: 'Fichier introuvable' });
    res.setHeader('Content-Type', att.mime_type);
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(att.original_name)}`);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(data);
  });

  r.delete('/:id/attachments/:attachmentId', requireWriter, async (req, res) => {
    const att = await findAttachment(req);
    if (!att) return res.status(404).json({ error: 'Fichier introuvable' });
    await db.run('DELETE FROM attachments WHERE id = $1', [att.id]);
    await removeFiles([att.stored_name]);
    res.status(204).end();
  });

  return r;
}

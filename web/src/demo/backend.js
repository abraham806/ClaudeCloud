// Version de démonstration (GitHub Pages) : l'API tourne entièrement dans le navigateur.
// On réutilise le schéma, la validation et les services du serveur, sur une base
// PGlite (Postgres en WebAssembly) enregistrée dans l'IndexedDB du navigateur.
// Les données ne quittent pas l'appareil.
import { PGlite } from '@electric-sql/pglite';
import { SCHEMA, toNumber, wrap } from '../../../server/src/sql.js';
import {
  bulkSchema, companySchema, documentSchema, fieldOrderSchema, fieldSchema, loginSchema, memberSchema, parse,
  passwordSchema, periodSchema, registerSchema, statusSchema,
} from '../../../server/src/validation.js';
import { createField, deleteField, listFields, reorderFields, updateField } from '../../../server/src/services/fields.js';
import {
  convertQuote, createDocument, deleteDocument, documentsForExport, getDocument, listAttachments, listDocuments,
  listParties, setCategory, setStatus, updateDocument,
} from '../../../server/src/services/documents.js';
import { getStats } from '../../../server/src/services/stats.js';
import { buildWorkbook, EXPORT_FORMATS } from '../../../server/src/services/excel.js';
import { createDocumentPdf } from '../../../server/src/services/pdf.js';
import { registerStdFonts } from 'pdfkit';
import { toBytes } from 'pdfkit/output';
import Helvetica from 'pdfkit/standard-fonts/Helvetica';
import HelveticaBold from 'pdfkit/standard-fonts/HelveticaBold';
import { seedDemo } from './seed.js';

registerStdFonts(Helvetica, HelveticaBold);

const ALLOWED_MIME = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);

let dbPromise;
function getDb() {
  dbPromise ??= (async () => {
    const lite = new PGlite('idb://facturo-demo', { parsers: { 20: toNumber, 1700: toNumber } });
    await lite.exec(`${SCHEMA}
      CREATE TABLE IF NOT EXISTS demo_files (key TEXT PRIMARY KEY, data BYTEA NOT NULL);`);
    return {
      ...wrap((text, values) => lite.query(text, values)),
      tx: (fn) => lite.transaction((t) => fn(wrap((text, values) => t.query(text, values)))),
      // Force l'écriture dans IndexedDB (sinon une fermeture rapide de l'onglet peut perdre la saisie).
      sync: () => lite.syncToFs(),
    };
  })();
  return dbPromise;
}

const fail = (status, message) => Object.assign(new Error(message), { status });

async function hash(password) {
  const data = new TextEncoder().encode(`facturo-demo:${password}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, company_id: u.company_id });
const token = (u) => `demo.${u.id}`;

async function currentUser(db, headers) {
  const m = /^Bearer demo\.(\d+)$/.exec(headers.get('authorization') || '');
  const user = m && (await db.one('SELECT * FROM users WHERE id = $1', [Number(m[1])]));
  if (!user) throw fail(401, 'Session expirée, veuillez vous reconnecter');
  return { id: user.id, company_id: user.company_id, role: user.role };
}

const owner = (user) => {
  if (user.role !== 'owner') throw fail(403, 'Réservé au propriétaire');
};

const writer = (user) => {
  if (user.role === 'accountant') throw fail(403, 'Accès en lecture seule');
};

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
const file = (data, type) => new Response(new Blob([data].flat(), { type }), { status: 200, headers: { 'content-type': type } });

// [méthode, chemin, besoin d'être connecté, traitement]
const ROUTES = [
  ['GET', '/health', false, async () => json({ ok: true, demo: true })],

  ['POST', '/auth/register', false, async ({ db, body }) => {
    const input = parse(registerSchema, body);
    if (await db.one('SELECT 1 FROM users WHERE email = $1', [input.email])) throw fail(409, 'Un compte existe déjà avec cet email');
    const currency = input.currency || 'XOF';
    const user = await db.tx(async (q) => {
      const company = await q.one(
        'INSERT INTO companies (name, currency, default_vat, accounting_plan, email) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [input.company_name, currency, currency === 'EUR' ? 20 : 18, currency === 'EUR' ? 'pcg' : 'syscohada', input.email],
      );
      return q.one(
        "INSERT INTO users (company_id, email, name, password_hash, role) VALUES ($1, $2, $3, $4, 'owner') RETURNING *",
        [company.id, input.email, input.name, await hash(input.password)],
      );
    });
    return json({ token: token(user), user: publicUser(user) }, 201);
  }],
  ['POST', '/auth/login', false, async ({ db, body }) => {
    const input = parse(loginSchema, body);
    const user = await db.one('SELECT * FROM users WHERE email = $1', [input.email]);
    if (!user || user.password_hash !== (await hash(input.password))) throw fail(401, 'Email ou mot de passe incorrect');
    return json({ token: token(user), user: publicUser(user) });
  }],
  ['GET', '/auth/me', true, async ({ db, user }) => {
    const u = await db.one('SELECT * FROM users WHERE id = $1', [user.id]);
    return json({ user: publicUser(u), company: await db.one('SELECT * FROM companies WHERE id = $1', [u.company_id]) });
  }],
  ['PUT', '/auth/password', true, async ({ db, user, body }) => {
    const input = parse(passwordSchema, body);
    const u = await db.one('SELECT * FROM users WHERE id = $1', [user.id]);
    if (u.password_hash !== (await hash(input.current_password))) throw fail(400, 'Mot de passe actuel incorrect');
    await db.run('UPDATE users SET password_hash = $1 WHERE id = $2', [await hash(input.new_password), user.id]);
    return new Response(null, { status: 204 });
  }],

  ['GET', '/company', true, async ({ db, user }) => json(await db.one('SELECT * FROM companies WHERE id = $1', [user.company_id]))],
  ['PUT', '/company', true, async ({ db, user, body }) => {
    if (user.role !== 'owner') throw fail(403, 'Réservé au propriétaire');
    const input = parse(companySchema, body);
    await db.run(
      `UPDATE companies SET name=@name, address=@address, phone=@phone, email=@email, tax_id=@tax_id, rccm=@rccm,
         currency=@currency, default_vat=@default_vat, accounting_plan=@accounting_plan, invoice_footer=@invoice_footer
       WHERE id=@id`,
      { ...input, id: user.company_id },
    );
    return json(await db.one('SELECT * FROM companies WHERE id = $1', [user.company_id]));
  }],
  ['GET', '/company/categories', true, async ({ db, user }) => {
    const rows = await db.query(
      "SELECT DISTINCT category FROM documents WHERE company_id = $1 AND category IS NOT NULL AND category != '' ORDER BY category",
      [user.company_id],
    );
    return json(rows.map((r) => r.category));
  }],
  ['GET', '/company/parties', true, async ({ db, user, query }) => {
    const kind = ['purchase', 'sale'].includes(query.get('kind')) ? query.get('kind') : undefined;
    return json(await listParties(db, user.company_id, kind));
  }],

  ['GET', '/users', true, async ({ db, user }) =>
    json(await db.query('SELECT id, name, email, role, created_at FROM users WHERE company_id = $1 ORDER BY id', [user.company_id]))],
  ['POST', '/users', true, async ({ db, user, body }) => {
    if (user.role !== 'owner') throw fail(403, 'Réservé au propriétaire');
    const input = parse(memberSchema, body);
    if (await db.one('SELECT 1 FROM users WHERE email = $1', [input.email])) throw fail(409, 'Un compte existe déjà avec cet email');
    return json(await db.one(
      'INSERT INTO users (company_id, email, name, password_hash, role) VALUES ($1, $2, $3, $4, $5) RETURNING id, name, email, role, created_at',
      [user.company_id, input.email, input.name, await hash(input.password), input.role],
    ), 201);
  }],
  ['DELETE', '/users/:id', true, async ({ db, user, params }) => {
    if (user.role !== 'owner') throw fail(403, 'Réservé au propriétaire');
    if (params.id === user.id) throw fail(400, 'Vous ne pouvez pas supprimer votre propre compte');
    const { count } = await db.run("DELETE FROM users WHERE id = $1 AND company_id = $2 AND role != 'owner'", [params.id, user.company_id]);
    if (!count) throw fail(404, 'Utilisateur introuvable');
    return new Response(null, { status: 204 });
  }],

  ['GET', '/fields', true, async ({ db, user }) => json(await listFields(db, user.company_id))],
  ['POST', '/fields', true, async ({ db, user, body }) => {
    owner(user);
    return json(await createField(db, user.company_id, parse(fieldSchema, body)), 201);
  }],
  ['PUT', '/fields/order', true, async ({ db, user, body }) => {
    owner(user);
    return json(await reorderFields(db, user.company_id, parse(fieldOrderSchema, body).ids));
  }],
  ['PUT', '/fields/:id', true, async ({ db, user, params, body }) => {
    owner(user);
    const field = await updateField(db, user.company_id, params.id, parse(fieldSchema, body));
    if (!field) throw fail(404, 'Variable introuvable');
    return json(field);
  }],
  ['DELETE', '/fields/:id', true, async ({ db, user, params }) => {
    owner(user);
    if (!(await deleteField(db, user.company_id, params.id))) throw fail(404, 'Variable introuvable');
    return new Response(null, { status: 204 });
  }],

  ['GET', '/documents', true, async ({ db, user, query }) => json(await listDocuments(db, user.company_id, {
    from: query.get('from') || undefined, to: query.get('to') || undefined, kind: query.get('kind') || undefined,
    q: query.get('q') || undefined, status: query.get('status') || undefined, doc_type: query.get('doc_type') || undefined,
    party: query.get('party') || undefined, missing: query.get('missing') === '1', overdue: query.get('overdue') === '1',
    limit: Math.min(Number(query.get('limit')) || 50, 200), offset: Math.max(Number(query.get('offset')) || 0, 0),
  }))],
  ['GET', '/documents/attachments', true, async ({ db, user }) => json(await listAttachments(db, user.company_id))],
  ['POST', '/documents/bulk', true, async ({ db, user, body }) => {
    writer(user);
    const { ids, action, category } = parse(bulkSchema, body);
    let count = 0;
    if (action === 'paid' || action === 'unpaid') count = await setStatus(db, user.company_id, ids, action);
    else if (action === 'category') count = await setCategory(db, user.company_id, ids, category);
    else {
      for (const id of ids) {
        const files = await deleteDocument(db, user.company_id, id);
        if (files) {
          count += 1;
          await removeFiles(db, files);
        }
      }
    }
    return json({ count });
  }],
  ['POST', '/documents', true, async ({ db, user, body }) => {
    writer(user);
    return json(await createDocument(db, user, parse(documentSchema, body)), 201);
  }],
  ['GET', '/documents/:id', true, async ({ db, user, params }) => {
    const doc = await getDocument(db, user.company_id, params.id);
    if (!doc) throw fail(404, 'Document introuvable');
    return json(doc);
  }],
  ['PUT', '/documents/:id', true, async ({ db, user, params, body }) => {
    writer(user);
    const doc = await updateDocument(db, user, params.id, parse(documentSchema, body));
    if (!doc) throw fail(404, 'Document introuvable');
    return json(doc);
  }],
  ['DELETE', '/documents/:id', true, async ({ db, user, params }) => {
    writer(user);
    const files = await deleteDocument(db, user.company_id, params.id);
    if (!files) throw fail(404, 'Document introuvable');
    await removeFiles(db, files);
    return new Response(null, { status: 204 });
  }],
  ['PATCH', '/documents/:id/status', true, async ({ db, user, params, body }) => {
    writer(user);
    const { status } = parse(statusSchema, body);
    if (!(await setStatus(db, user.company_id, [params.id], status))) throw fail(404, 'Document introuvable');
    return json(await getDocument(db, user.company_id, params.id));
  }],
  ['POST', '/documents/:id/convert', true, async ({ db, user, params }) => {
    writer(user);
    const doc = await convertQuote(db, user, params.id);
    if (!doc) throw fail(400, 'Seul un devis peut être transformé en facture');
    return json(doc, 201);
  }],
  ['GET', '/documents/:id/pdf', true, async ({ db, user, params }) => {
    const doc = await getDocument(db, user.company_id, params.id);
    if (!doc) throw fail(404, 'Document introuvable');
    const company = await db.one('SELECT * FROM companies WHERE id = $1', [user.company_id]);
    const pdf = createDocumentPdf(doc, company);
    const bytes = toBytes(pdf);
    pdf.end();
    return file(await bytes, 'application/pdf');
  }],
  ['POST', '/documents/:id/attachments', true, async ({ db, user, params, form }) => {
    writer(user);
    const doc = await db.one('SELECT id FROM documents WHERE id = $1 AND company_id = $2', [params.id, user.company_id]);
    if (!doc) throw fail(404, 'Document introuvable');
    for (const f of form?.getAll('files') || []) {
      if (!ALLOWED_MIME.has(f.type)) throw fail(400, 'Format non accepté (PDF, JPG, PNG, WEBP ou HEIC)');
      const key = crypto.randomUUID();
      await db.run('INSERT INTO demo_files (key, data) VALUES ($1, $2)', [key, new Uint8Array(await f.arrayBuffer())]);
      await db.run(
        'INSERT INTO attachments (company_id, document_id, stored_name, original_name, mime_type, size) VALUES ($1, $2, $3, $4, $5, $6)',
        [user.company_id, doc.id, key, f.name, f.type, f.size],
      );
    }
    return json((await getDocument(db, user.company_id, doc.id)).attachments, 201);
  }],
  ['GET', '/documents/:id/attachments/:aid', true, async ({ db, user, params }) => {
    const att = await db.one('SELECT * FROM attachments WHERE id = $1 AND document_id = $2 AND company_id = $3', [params.aid, params.id, user.company_id]);
    const data = att && (await db.one('SELECT data FROM demo_files WHERE key = $1', [att.stored_name]));
    if (!data) throw fail(404, 'Fichier introuvable');
    return file(data.data, att.mime_type);
  }],
  ['DELETE', '/documents/:id/attachments/:aid', true, async ({ db, user, params }) => {
    writer(user);
    const att = await db.one('SELECT * FROM attachments WHERE id = $1 AND document_id = $2 AND company_id = $3', [params.aid, params.id, user.company_id]);
    if (!att) throw fail(404, 'Fichier introuvable');
    await db.run('DELETE FROM attachments WHERE id = $1', [att.id]);
    await removeFiles(db, [att.stored_name]);
    return new Response(null, { status: 204 });
  }],

  ['GET', '/reports/stats', true, async ({ db, user, query }) =>
    json(await getStats(db, user.company_id, parse(periodSchema, Object.fromEntries(query))))],
  ['GET', '/reports/export/formats', true, async () =>
    json(Object.entries(EXPORT_FORMATS).map(([id, f]) => ({ id, label: f.label })))],
  ['GET', '/reports/export/history', true, async ({ db, user }) => json(await db.query(
    'SELECT e.*, u.name AS user_name FROM exports e LEFT JOIN users u ON u.id = e.user_id WHERE e.company_id = $1 ORDER BY e.id DESC LIMIT 20',
    [user.company_id],
  ))],
  ['GET', '/reports/export', true, async ({ db, user, query }) => {
    const period = parse(periodSchema, Object.fromEntries(query));
    const format = query.get('format') || 'standard';
    const company = await db.one('SELECT * FROM companies WHERE id = $1', [user.company_id]);
    const docs = await documentsForExport(db, user.company_id, period);
    const buffer = await buildWorkbook(format, docs, company);
    await db.run(
      'INSERT INTO exports (company_id, user_id, format, date_from, date_to, kind, doc_count) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [user.company_id, user.id, format, period.from || null, period.to || null, period.kind || null, docs.length],
    );
    return file(buffer, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  }],

  // Propre à la démo : données d'exemple et remise à zéro.
  ['POST', '/demo/seed', true, async ({ db, user }) => {
    writer(user);
    // Une seule transaction pour tout l'échantillon : beaucoup plus rapide dans le navigateur.
    const count = await db.tx((q) => seedDemo({ ...q, tx: (fn) => fn(q) }, user, createDocument));
    return json({ count });
  }],
  ['POST', '/demo/reset', true, async ({ db, user }) => {
    if (user.role !== 'owner') throw fail(403, 'Réservé au propriétaire');
    const files = await db.query('SELECT stored_name FROM attachments WHERE company_id = $1', [user.company_id]);
    await db.run('DELETE FROM companies WHERE id = $1', [user.company_id]);
    await removeFiles(db, files.map((f) => f.stored_name));
    return new Response(null, { status: 204 });
  }],
].map(([method, path, auth, handler]) => {
  const names = [];
  const pattern = new RegExp(`^${path.replace(/:(\w+)/g, (_, n) => { names.push(n); return '(\\d+)'; })}$`);
  return { method, pattern, names, auth, handler };
});

async function removeFiles(db, keys) {
  if (keys.length) await db.run('DELETE FROM demo_files WHERE key = ANY($1::text[])', [keys]);
}

// Équivalent de fetch() pour l'API de démonstration.
export async function handle(path, init = {}, headers = new Headers()) {
  const url = new URL(path, 'http://demo');
  const method = (init.method || 'GET').toUpperCase();
  let params = null;
  const route = ROUTES.find((r) => {
    if (r.method !== method) return false;
    const m = r.pattern.exec(url.pathname);
    if (m) params = Object.fromEntries(r.names.map((n, i) => [n, Number(m[i + 1])]));
    return Boolean(m);
  });
  try {
    if (!route) throw fail(404, 'Route inconnue');
    const db = await getDb();
    const ctx = {
      db,
      params,
      query: url.searchParams,
      body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
      form: init.body instanceof FormData ? init.body : undefined,
      user: route.auth ? await currentUser(db, headers) : null,
    };
    const res = await route.handler(ctx);
    if (method !== 'GET') await db.sync();
    return res;
  } catch (e) {
    if (!e.status) console.error(e);
    return json({ error: e.status ? e.message : 'Erreur interne' }, e.status || 500);
  }
}

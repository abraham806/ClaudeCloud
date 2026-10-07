import fs from 'node:fs';
import pg from 'pg';

// Base PostgreSQL.
// - En production (Vercel + Neon) : DATABASE_URL pointe vers le serveur Postgres.
// - En local et dans les tests : PGlite, un vrai Postgres embarqué, sans installation.
// Les montants sont stockés en centimes (BIGINT) pour éviter les erreurs d'arrondi.
// Les dates des pièces sont des chaînes 'AAAA-MM-JJ'.

const SCHEMA = `
CREATE TABLE IF NOT EXISTS companies (
  id              SERIAL PRIMARY KEY,
  name            TEXT NOT NULL,
  address         TEXT,
  phone           TEXT,
  email           TEXT,
  tax_id          TEXT,
  rccm            TEXT,
  currency        TEXT NOT NULL DEFAULT 'XOF',
  default_vat     DOUBLE PRECISION NOT NULL DEFAULT 18,
  accounting_plan TEXT NOT NULL DEFAULT 'syscohada' CHECK (accounting_plan IN ('syscohada', 'pcg')),
  invoice_footer  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  company_id    INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'member', 'accountant')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Une pièce : achat ou vente ; facture, reçu ou devis (les devis ne comptent
-- ni dans les statistiques ni dans les exports comptables).
CREATE TABLE IF NOT EXISTS documents (
  id             SERIAL PRIMARY KEY,
  company_id     INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind           TEXT NOT NULL CHECK (kind IN ('purchase', 'sale')),
  doc_type       TEXT NOT NULL CHECK (doc_type IN ('invoice', 'receipt', 'quote')),
  number         TEXT,
  date           TEXT NOT NULL,
  due_date       TEXT,
  party_name     TEXT NOT NULL,
  party_address  TEXT,
  party_tax_id   TEXT,
  category       TEXT,
  payment_method TEXT,
  status         TEXT NOT NULL DEFAULT 'paid' CHECK (status IN ('paid', 'unpaid')),
  notes          TEXT,
  total_ht       BIGINT NOT NULL DEFAULT 0,
  total_tva      BIGINT NOT NULL DEFAULT 0,
  total_ttc      BIGINT NOT NULL DEFAULT 0,
  created_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_documents_company_date ON documents(company_id, date);

CREATE TABLE IF NOT EXISTS document_lines (
  id          SERIAL PRIMARY KEY,
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  position    INTEGER NOT NULL,
  description TEXT NOT NULL,
  quantity    DOUBLE PRECISION NOT NULL,
  unit_price  BIGINT NOT NULL,
  vat_rate    DOUBLE PRECISION NOT NULL DEFAULT 0,
  total_ht    BIGINT NOT NULL,
  total_tva   BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_lines_document ON document_lines(document_id);

CREATE TABLE IF NOT EXISTS attachments (
  id            SERIAL PRIMARY KEY,
  company_id    INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  document_id   INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  stored_name   TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type     TEXT NOT NULL,
  size          INTEGER NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_attachments_document ON attachments(document_id);

-- Historique des exports envoyés au comptable.
CREATE TABLE IF NOT EXISTS exports (
  id         SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  format     TEXT NOT NULL,
  date_from  TEXT,
  date_to    TEXT,
  kind       TEXT,
  doc_count  INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Compteurs de numérotation (FAC-2026-0001...) par entreprise et par année.
CREATE TABLE IF NOT EXISTS sequences (
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  prefix     TEXT NOT NULL,
  year       INTEGER NOT NULL,
  last_value INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (company_id, prefix, year)
);
`;

// BIGINT (20) et NUMERIC (1700, ex. SUM(bigint)) en nombres JavaScript.
const toNumber = (v) => (v === null ? null : Number(v));
pg.types.setTypeParser(20, toNumber);
pg.types.setTypeParser(1700, toNumber);

// Paramètres nommés `@nom` → `$1, $2…` ; un tableau est passé tel quel.
function bind(sql, params) {
  if (!params || Array.isArray(params)) return [sql, params || []];
  const values = [];
  const index = new Map();
  const text = sql.replace(/@([a-zA-Z_]\w*)/g, (_, name) => {
    if (!index.has(name)) {
      index.set(name, values.length + 1);
      values.push(params[name] === undefined ? null : params[name]);
    }
    return `$${index.get(name)}`;
  });
  return [text, values];
}

function wrap(exec) {
  const q = {
    async query(sql, params) {
      const [text, values] = bind(sql, params);
      return (await exec(text, values)).rows;
    },
    async one(sql, params) {
      return (await q.query(sql, params))[0];
    },
    async run(sql, params) {
      const [text, values] = bind(sql, params);
      const res = await exec(text, values);
      return { rows: res.rows, count: res.rowCount ?? res.affectedRows ?? 0 };
    },
  };
  return q;
}

async function openPglite(dir) {
  const { PGlite } = await import('@electric-sql/pglite');
  if (dir !== 'memory://') fs.mkdirSync(dir, { recursive: true });
  return new PGlite(dir, { parsers: { 20: toNumber, 1700: toNumber } });
}

export function createDb({ url, pgliteDir = 'memory://' } = {}) {
  let driver; // { exec, tx, close }
  const ready = (async () => {
    if (url) {
      const pool = new pg.Pool({ connectionString: url, max: 3, idleTimeoutMillis: 10_000 });
      driver = {
        exec: (text, values) => pool.query(text, values),
        async tx(fn) {
          const client = await pool.connect();
          try {
            await client.query('BEGIN');
            const out = await fn(wrap((t, v) => client.query(t, v)));
            await client.query('COMMIT');
            return out;
          } catch (e) {
            await client.query('ROLLBACK');
            throw e;
          } finally {
            client.release();
          }
        },
        close: () => pool.end(),
      };
      await pool.query(SCHEMA);
    } else {
      const lite = await openPglite(pgliteDir);
      driver = {
        exec: (text, values) => lite.query(text, values),
        tx: (fn) => lite.transaction((t) => fn(wrap((text, values) => t.query(text, values)))),
        close: () => lite.close(),
      };
      await lite.exec(SCHEMA);
    }
  })();

  const base = wrap(async (text, values) => {
    await ready;
    return driver.exec(text, values);
  });
  return {
    ...base,
    ready,
    async tx(fn) {
      await ready;
      return driver.tx(fn);
    },
    async close() {
      await ready;
      return driver.close();
    },
  };
}

import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS companies (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  address       TEXT,
  phone         TEXT,
  email         TEXT,
  tax_id        TEXT,
  rccm          TEXT,
  currency      TEXT NOT NULL DEFAULT 'XOF',
  default_vat   REAL NOT NULL DEFAULT 18,
  accounting_plan TEXT NOT NULL DEFAULT 'syscohada' CHECK (accounting_plan IN ('syscohada', 'pcg')),
  invoice_footer TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id    INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'member', 'accountant')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Un "document" est une pièce : achat ou vente ; facture, reçu ou devis (les devis
-- ne comptent ni dans les statistiques ni dans les exports comptables).
-- Les montants sont stockés en centimes (entiers) pour éviter les erreurs d'arrondi.
CREATE TABLE IF NOT EXISTS documents (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
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
  total_ht       INTEGER NOT NULL DEFAULT 0,
  total_tva      INTEGER NOT NULL DEFAULT 0,
  total_ttc      INTEGER NOT NULL DEFAULT 0,
  created_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_documents_company_date ON documents(company_id, date);

CREATE TABLE IF NOT EXISTS document_lines (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  position    INTEGER NOT NULL,
  description TEXT NOT NULL,
  quantity    REAL NOT NULL,
  unit_price  INTEGER NOT NULL,
  vat_rate    REAL NOT NULL DEFAULT 0,
  total_ht    INTEGER NOT NULL,
  total_tva   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS attachments (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id    INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  document_id   INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  stored_name   TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type     TEXT NOT NULL,
  size          INTEGER NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Historique des exports envoyés au comptable.
CREATE TABLE IF NOT EXISTS exports (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  format     TEXT NOT NULL,
  date_from  TEXT,
  date_to    TEXT,
  kind       TEXT,
  doc_count  INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Compteurs de numérotation (FAC-2026-0001, REC-2026-0001...) par entreprise et par année.
CREATE TABLE IF NOT EXISTS sequences (
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  prefix     TEXT NOT NULL,
  year       INTEGER NOT NULL,
  last_value INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (company_id, prefix, year)
);
`;

export function openDatabase(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  return db;
}

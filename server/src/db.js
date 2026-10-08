import fs from 'node:fs';
import pg from 'pg';
import { SCHEMA, toNumber, wrap } from './sql.js';

// Base PostgreSQL.
// - En production (Vercel + Neon) : DATABASE_URL pointe vers le serveur Postgres.
// - En local et dans les tests : PGlite, un vrai Postgres embarqué, sans installation.
// Les montants sont stockés en centimes (BIGINT) pour éviter les erreurs d'arrondi.
// Les dates des pièces sont des chaînes 'AAAA-MM-JJ'.

pg.types.setTypeParser(20, toNumber);
pg.types.setTypeParser(1700, toNumber);

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

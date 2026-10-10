// Sauvegarde complète de la base de démonstration (toutes les tables) en JSON, et restauration.
// Les fichiers joints (BYTEA) passent en hexadécimal, ce que Postgres relit tel quel.

// Ordre d'insertion respectant les clés étrangères.
const TABLES = [
  'companies', 'users', 'custom_fields', 'documents', 'document_lines', 'attachments', 'exports', 'sequences', 'demo_files',
];
const SERIAL = ['companies', 'users', 'custom_fields', 'documents', 'document_lines', 'attachments', 'exports'];

export async function exportDb(db) {
  const tables = {};
  for (const t of TABLES) {
    const row = await db.one(`SELECT COALESCE(json_agg(x), '[]'::json) AS rows FROM ${t} x`);
    tables[t] = typeof row.rows === 'string' ? JSON.parse(row.rows) : row.rows;
  }
  return { app: 'leukflow-demo', version: 1, saved_at: new Date().toISOString(), tables };
}

export function isBackup(data) {
  return Boolean(data && data.app === 'leukflow-demo' && data.tables && Array.isArray(data.tables.companies));
}

// Remplace tout le contenu de la base par la sauvegarde.
export async function importDb(db, data) {
  if (!isBackup(data)) throw Object.assign(new Error('Fichier de sauvegarde non reconnu'), { status: 400 });
  await db.tx(async (q) => {
    await q.run('DELETE FROM companies'); // cascade sur toutes les données de l'entreprise
    await q.run('DELETE FROM demo_files');
    for (const t of TABLES) {
      const rows = data.tables[t] || [];
      if (!rows.length) continue;
      // Seulement les colonnes présentes dans la sauvegarde : une colonne ajoutée depuis garde sa valeur par défaut.
      const cols = Object.keys(rows[0]).filter((c) => /^[a-z_]+$/.test(c)).map((c) => `"${c}"`).join(', ');
      await q.run(
        `INSERT INTO ${t} (${cols}) SELECT ${cols} FROM json_populate_recordset(NULL::${t}, CAST(CAST($1 AS text) AS json))`,
        [JSON.stringify(rows)],
      );
    }
    for (const t of SERIAL) {
      await q.run(
        `SELECT setval(pg_get_serial_sequence('${t}', 'id'), COALESCE((SELECT MAX(id) FROM ${t}), 0) + 1, false)`,
      );
    }
  });
}

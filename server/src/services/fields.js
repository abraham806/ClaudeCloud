// Variables personnalisées : définies par chaque entreprise, renseignées sur ses pièces.

const fail = (status, message) => Object.assign(new Error(message), { status });

export async function listFields(db, companyId) {
  return db.query('SELECT * FROM custom_fields WHERE company_id = $1 ORDER BY position, id', [companyId]);
}

// Champs qui s'appliquent à un type de pièce (vente ou achat).
const forKind = (fields, kind) => fields.filter((f) => f.applies_to === 'all' || f.applies_to === kind);

function uniqueOptions(input) {
  return input.field_type === 'select' ? [...new Set(input.options)] : [];
}

export async function createField(db, companyId, input) {
  const { next } = await db.one(
    'SELECT COALESCE(MAX(position), -1) + 1 AS next FROM custom_fields WHERE company_id = $1',
    [companyId],
  );
  return db.one(
    `INSERT INTO custom_fields (company_id, label, field_type, options, applies_to, required, on_document, position)
     VALUES (@companyId, @label, @field_type, CAST(CAST(@options AS text) AS jsonb), @applies_to, @required, @on_document, @position)
     RETURNING *`,
    { ...input, companyId, options: JSON.stringify(uniqueOptions(input)), position: next },
  );
}

// Le type d'une variable ne change pas après sa création (les valeurs déjà saisies resteraient incohérentes).
export async function updateField(db, companyId, id, input) {
  const existing = await db.one('SELECT * FROM custom_fields WHERE id = $1 AND company_id = $2', [id, companyId]);
  if (!existing) return null;
  if (existing.field_type !== input.field_type) throw fail(400, "Le type d'une variable ne peut pas être modifié");
  return db.one(
    `UPDATE custom_fields SET label=@label, options=CAST(CAST(@options AS text) AS jsonb), applies_to=@applies_to,
       required=@required, on_document=@on_document
     WHERE id=@id AND company_id=@companyId RETURNING *`,
    { ...input, id, companyId, options: JSON.stringify(uniqueOptions(input)) },
  );
}

// Supprime la variable et retire ses valeurs des pièces.
export async function deleteField(db, companyId, id) {
  return db.tx(async (q) => {
    const { count } = await q.run('DELETE FROM custom_fields WHERE id = $1 AND company_id = $2', [id, companyId]);
    if (count) {
      await q.run('UPDATE documents SET custom_values = custom_values - CAST($1 AS text) WHERE company_id = $2', [String(id), companyId]);
    }
    return count > 0;
  });
}

export async function reorderFields(db, companyId, ids) {
  await db.tx(async (q) => {
    for (const [i, id] of ids.entries()) {
      await q.run('UPDATE custom_fields SET position = $1 WHERE id = $2 AND company_id = $3', [i, id, companyId]);
    }
  });
  return listFields(db, companyId);
}

const empty = (v) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

// Vérifie et nettoie les valeurs envoyées pour une pièce. Les clés inconnues sont ignorées.
export async function cleanCustomValues(q, companyId, kind, raw = {}) {
  const fields = forKind(await listFields(q, companyId), kind);
  const out = {};
  const errors = [];
  for (const f of fields) {
    const key = String(f.id);
    const v = raw[key];
    if (f.field_type === 'checkbox') {
      if (!empty(v)) out[key] = v === true || v === 'true';
      continue;
    }
    if (empty(v)) {
      if (f.required) errors.push(`« ${f.label} » est requis`);
      continue;
    }
    if (f.field_type === 'number') {
      const n = typeof v === 'number' ? v : Number(String(v).replace(/\s/g, '').replace(',', '.'));
      if (!Number.isFinite(n)) errors.push(`« ${f.label} » doit être un nombre`);
      else out[key] = n;
    } else if (f.field_type === 'date') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v))) errors.push(`« ${f.label} » : date attendue au format AAAA-MM-JJ`);
      else out[key] = String(v);
    } else if (f.field_type === 'select') {
      if (!f.options.includes(String(v))) errors.push(`« ${f.label} » : choix non valide`);
      else out[key] = String(v);
    } else {
      out[key] = String(v).trim().slice(0, 1000);
    }
  }
  if (errors.length) throw fail(400, errors.join(' · '));
  return out;
}

// Texte affichable d'une valeur (PDF, Excel, fiche de la pièce).
export function formatFieldValue(field, value) {
  if (value === undefined || value === null || value === '') return '';
  if (field.field_type === 'checkbox') return value ? 'Oui' : 'Non';
  if (field.field_type === 'date') return String(value).split('-').reverse().join('/');
  if (field.field_type === 'number') return new Intl.NumberFormat('fr-FR').format(value).replace(/[  ]/g, ' ');
  return String(value);
}

// Variables renseignées d'une pièce, dans l'ordre défini par l'entreprise.
export function describeCustomValues(fields, doc) {
  const values = doc.custom_values || {};
  return forKind(fields, doc.kind)
    .filter((f) => values[String(f.id)] !== undefined)
    .map((f) => ({
      id: f.id,
      label: f.label,
      value: values[String(f.id)],
      text: formatFieldValue(f, values[String(f.id)]),
      on_document: f.on_document,
    }));
}

import { fromCents } from './amounts.js';

// Statistiques du tableau de bord sur une période.
export async function getStats(db, companyId, { from, to }) {
  const where = ["company_id = @companyId", "doc_type != 'quote'"];
  if (from) where.push('date >= @from');
  if (to) where.push('date <= @to');
  const sqlWhere = where.join(' AND ');
  const params = { companyId, from, to };

  const totals = (await db.query(`SELECT kind, COUNT(*) AS count, SUM(total_ht) AS ht, SUM(total_tva) AS tva, SUM(total_ttc) AS ttc,
         SUM(CASE WHEN status = 'unpaid' THEN total_ttc ELSE 0 END) AS unpaid
       FROM documents WHERE ${sqlWhere} GROUP BY kind`, params));
  const byKind = Object.fromEntries(totals.map((t) => [t.kind, t]));
  const pick = (kind) => {
    const t = byKind[kind] || {};
    return {
      count: t.count || 0,
      total_ht: fromCents(t.ht || 0),
      total_tva: fromCents(t.tva || 0),
      total_ttc: fromCents(t.ttc || 0),
      unpaid: fromCents(t.unpaid || 0),
    };
  };
  const purchases = pick('purchase');
  const sales = pick('sale');

  const monthly = (await db.query(`SELECT substr(date, 1, 7) AS month,
         SUM(CASE WHEN kind = 'purchase' THEN total_ttc ELSE 0 END) AS purchases,
         SUM(CASE WHEN kind = 'sale' THEN total_ttc ELSE 0 END) AS sales
       FROM documents WHERE ${sqlWhere} GROUP BY month ORDER BY month`, params))
    .map((m) => ({ month: m.month, purchases: fromCents(m.purchases), sales: fromCents(m.sales) }));

  const byCategory = (await db.query(`SELECT COALESCE(NULLIF(category, ''), 'Sans catégorie') AS category, SUM(total_ttc) AS total, COUNT(*) AS count
       FROM documents WHERE ${sqlWhere} AND kind = 'purchase' GROUP BY 1 ORDER BY total DESC`, params))
    .map((c) => ({ category: c.category, total: fromCents(c.total), count: c.count }));

  const topSuppliers = (await db.query(`SELECT party_name AS name, SUM(total_ttc) AS total, COUNT(*) AS count
       FROM documents WHERE ${sqlWhere} AND kind = 'purchase' GROUP BY party_name ORDER BY total DESC LIMIT 5`, params))
    .map((s) => ({ name: s.name, total: fromCents(s.total), count: s.count }));

  // Points d'attention (indépendants de la période).
  const today = new Date().toISOString().slice(0, 10);
  const todo = (await db.one(`SELECT
         SUM(CASE WHEN kind = 'purchase' AND NOT EXISTS (SELECT 1 FROM attachments a WHERE a.document_id = d.id) THEN 1 ELSE 0 END) AS missing,
         SUM(CASE WHEN kind = 'sale' AND status = 'unpaid' AND due_date < @today THEN 1 ELSE 0 END) AS overdue_count,
         SUM(CASE WHEN kind = 'sale' AND status = 'unpaid' AND due_date < @today THEN total_ttc ELSE 0 END) AS overdue_amount
       FROM documents d WHERE company_id = @companyId AND doc_type != 'quote'`, { companyId, today }));

  return {
    period: { from: from || null, to: to || null },
    todo: {
      missing_attachments: todo.missing || 0,
      overdue_count: todo.overdue_count || 0,
      overdue_amount: fromCents(todo.overdue_amount || 0),
    },
    purchases,
    sales,
    balance: fromCents(Math.round((sales.total_ttc - purchases.total_ttc) * 100)),
    vat_due: fromCents(Math.round((sales.total_tva - purchases.total_tva) * 100)),
    monthly,
    by_category: byCategory,
    top_suppliers: topSuppliers,
  };
}

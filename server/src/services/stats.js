import { fromCents } from './amounts.js';

// Statistiques du tableau de bord sur une période.
export function getStats(db, companyId, { from, to }) {
  const where = ['company_id = @companyId'];
  if (from) where.push('date >= @from');
  if (to) where.push('date <= @to');
  const sqlWhere = where.join(' AND ');
  const params = { companyId, from, to };

  const totals = db
    .prepare(
      `SELECT kind, COUNT(*) AS count, SUM(total_ht) AS ht, SUM(total_tva) AS tva, SUM(total_ttc) AS ttc,
         SUM(CASE WHEN status = 'unpaid' THEN total_ttc ELSE 0 END) AS unpaid
       FROM documents WHERE ${sqlWhere} GROUP BY kind`,
    )
    .all(params);
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

  const monthly = db
    .prepare(
      `SELECT substr(date, 1, 7) AS month,
         SUM(CASE WHEN kind = 'purchase' THEN total_ttc ELSE 0 END) AS purchases,
         SUM(CASE WHEN kind = 'sale' THEN total_ttc ELSE 0 END) AS sales
       FROM documents WHERE ${sqlWhere} GROUP BY month ORDER BY month`,
    )
    .all(params)
    .map((m) => ({ month: m.month, purchases: fromCents(m.purchases), sales: fromCents(m.sales) }));

  const byCategory = db
    .prepare(
      `SELECT COALESCE(NULLIF(category, ''), 'Sans catégorie') AS category, SUM(total_ttc) AS total, COUNT(*) AS count
       FROM documents WHERE ${sqlWhere} AND kind = 'purchase' GROUP BY 1 ORDER BY total DESC`,
    )
    .all(params)
    .map((c) => ({ category: c.category, total: fromCents(c.total), count: c.count }));

  const topSuppliers = db
    .prepare(
      `SELECT party_name AS name, SUM(total_ttc) AS total, COUNT(*) AS count
       FROM documents WHERE ${sqlWhere} AND kind = 'purchase' GROUP BY party_name ORDER BY total DESC LIMIT 5`,
    )
    .all(params)
    .map((s) => ({ name: s.name, total: fromCents(s.total), count: s.count }));

  return {
    period: { from: from || null, to: to || null },
    purchases,
    sales,
    balance: fromCents(Math.round((sales.total_ttc - purchases.total_ttc) * 100)),
    vat_due: fromCents(Math.round((sales.total_tva - purchases.total_tva) * 100)),
    monthly,
    by_category: byCategory,
    top_suppliers: topSuppliers,
  };
}

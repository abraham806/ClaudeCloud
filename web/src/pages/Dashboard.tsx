import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, type Stats } from '../api';
import { useAuth } from '../auth';
import { money } from '../format';
import PeriodPicker from './PeriodPicker';
import { PRESETS, type Period } from '../period';

const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const monthLabel = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`;

export default function Dashboard() {
  const { company } = useAuth();
  const cur = company?.currency || 'EUR';
  const [period, setPeriod] = useState<Period>(PRESETS[2].get());
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.stats(period.from, period.to).then(setStats, (e) => setError(e.message));
  }, [period]);

  const fmt = (v: number) => money(v, cur);
  const maxCat = Math.max(...(stats?.by_category.map((c) => c.total) || [0]), 1);

  return (
    <>
      <header className="page-head">
        <h1>Tableau de bord</h1>
        <div className="actions">
          <Link className="button" to="/documents/nouveau?kind=purchase">+ Achat</Link>
          <Link className="button primary" to="/documents/nouveau?kind=sale">+ Vente</Link>
        </div>
      </header>
      <PeriodPicker value={period} onChange={setPeriod} />
      {error && <p className="error">{error}</p>}
      {stats && (
        <>
          <section className="tiles">
            <div className="tile"><span>Ventes TTC</span><strong>{fmt(stats.sales.total_ttc)}</strong><small>{stats.sales.count} pièce(s)</small></div>
            <div className="tile"><span>Dépenses TTC</span><strong>{fmt(stats.purchases.total_ttc)}</strong><small>{stats.purchases.count} pièce(s)</small></div>
            <div className="tile"><span>Solde</span><strong className={stats.balance < 0 ? 'neg' : 'pos'}>{fmt(stats.balance)}</strong><small>ventes − dépenses</small></div>
            <div className="tile"><span>TVA nette</span><strong>{fmt(stats.vat_due)}</strong><small>collectée − déductible</small></div>
            <div className="tile"><span>Impayés clients</span><strong>{fmt(stats.sales.unpaid)}</strong><small>à encaisser</small></div>
            <div className="tile"><span>Dettes fournisseurs</span><strong>{fmt(stats.purchases.unpaid)}</strong><small>à régler</small></div>
          </section>

          <section className="grid-2">
            <div className="card">
              <h2>Ventes et dépenses par mois</h2>
              {stats.monthly.length === 0 ? <p className="muted">Aucune donnée sur la période.</p> : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={stats.monthly.map((m) => ({ ...m, label: monthLabel(m.month) }))}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} width={70} tickFormatter={(v) => new Intl.NumberFormat('fr-FR', { notation: 'compact' }).format(v)} />
                    <Tooltip formatter={(v) => fmt(Number(v))} />
                    <Legend />
                    <Bar dataKey="sales" name="Ventes" fill="#2f7d5b" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="purchases" name="Dépenses" fill="#c2543a" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
            <div className="card">
              <h2>Dépenses par catégorie</h2>
              {stats.by_category.length === 0 ? <p className="muted">Aucune dépense sur la période.</p> : (
                <ul className="bars">
                  {stats.by_category.map((c) => (
                    <li key={c.category}>
                      <div className="bar-label"><span>{c.category}</span><span>{fmt(c.total)}</span></div>
                      <div className="bar-track"><div className="bar-fill" style={{ width: `${(c.total / maxCat) * 100}%` }} /></div>
                    </li>
                  ))}
                </ul>
              )}
              {stats.top_suppliers.length > 0 && (
                <>
                  <h3>Principaux fournisseurs</h3>
                  <table className="table compact">
                    <tbody>
                      {stats.top_suppliers.map((s) => (
                        <tr key={s.name}><td>{s.name}</td><td className="num">{s.count}</td><td className="num">{fmt(s.total)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </div>
          </section>
        </>
      )}
    </>
  );
}

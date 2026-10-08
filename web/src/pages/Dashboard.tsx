import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, type Doc, type Stats } from '../api';
import { useAuth } from '../auth';
import { StatusPill } from '../components';
import { TYPE_LABEL, KIND_LABEL, initials, isoOf, money, monthShort, shortDate, signedMoney } from '../format';
import { Icon } from '../icons';
import { PRESETS, type Period } from '../period';

const RANGES: { label: string; get: () => Period }[] = [
  { label: 'Mois', get: PRESETS[0].get },
  { label: 'Trimestre', get: () => {
    const d = new Date();
    const q = Math.floor(d.getMonth() / 3) * 3;
    return { from: isoOf(new Date(d.getFullYear(), q, 1)), to: isoOf(new Date(d.getFullYear(), q + 3, 0)) };
  } },
  { label: 'Année', get: PRESETS[2].get },
];

// 12 derniers mois pour le graphique, quelle que soit la période choisie.
const last12 = () => {
  const d = new Date();
  return { from: isoOf(new Date(d.getFullYear(), d.getMonth() - 11, 1)), to: isoOf(new Date(d.getFullYear(), d.getMonth() + 1, 0)) };
};

export default function Dashboard() {
  const { user, company } = useAuth();
  const navigate = useNavigate();
  const cur = company?.currency || 'XOF';
  const [range, setRange] = useState(0);
  const [stats, setStats] = useState<Stats | null>(null);
  const [year, setYear] = useState<Stats | null>(null);
  const [recent, setRecent] = useState<Doc[]>([]);
  const [error, setError] = useState('');
  const [over, setOver] = useState(false);
  const canWrite = user?.role !== 'accountant';

  useEffect(() => {
    const p = RANGES[range].get();
    api.stats(p.from, p.to).then(setStats, (e) => setError(e.message));
  }, [range]);
  useEffect(() => {
    const p = last12();
    api.stats(p.from, p.to).then(setYear, () => {});
    api.listDocuments({ limit: 8 }).then((r) => setRecent(r.items), () => {});
  }, []);

  const fmt = (v: number) => money(v, cur);
  const months = (() => {
    const d = new Date();
    return Array.from({ length: 12 }, (_, i) => {
      const m = isoOf(new Date(d.getFullYear(), d.getMonth() - 11 + i, 1)).slice(0, 7);
      const row = year?.monthly.find((x) => x.month === m);
      return { m, sales: row?.sales || 0, purchases: row?.purchases || 0 };
    });
  })();
  const max = Math.max(1, ...months.flatMap((m) => [m.sales, m.purchases]));
  const maxCat = Math.max(1, ...(stats?.by_category.map((c) => c.total) || [0]));

  const onDrop = (files: File[]) => {
    if (files.length) navigate('/app/pieces/nouvelle?kind=purchase', { state: { files } });
  };

  return (
    <>
      <header className="page-head">
        <div>
          <p className="sub">Bonjour {user?.name.split(' ')[0]}</p>
          <h1>Tableau de bord</h1>
        </div>
        <div className="row">
          <div className="seg" role="group" aria-label="Période">
            {RANGES.map((r, i) => <button key={r.label} className={range === i ? 'on' : ''} onClick={() => setRange(i)}>{r.label}</button>)}
          </div>
          <Link className="btn hide-mobile" to="/app/export"><Icon name="download" />Exporter</Link>
          {canWrite && <Link className="btn dark hide-mobile" to="/app/pieces/nouvelle?kind=sale"><Icon name="plus" />Nouvelle facture</Link>}
        </div>
      </header>

      {error && <p className="error">{error}</p>}

      <section className="kpis">
        <div className="card kpi"><span className="small muted">Ventes TTC</span><strong className="value num">{fmt(stats?.sales.total_ttc || 0)}</strong><span className="xs muted">{stats?.sales.count || 0} facture(s) et reçu(s)</span></div>
        <div className="card kpi"><span className="small muted">Dépenses TTC</span><strong className="value num">{fmt(stats?.purchases.total_ttc || 0)}</strong><span className="xs muted">{stats?.purchases.count || 0} achat(s)</span></div>
        <div className="card kpi hero" style={{ background: 'var(--ink)', color: 'var(--ink-text)', borderColor: 'var(--ink)' }}><span className="small" style={{ color: '#a1a1aa' }}>Solde</span><strong className="value num">{fmt(stats?.balance || 0)}</strong><span className="xs" style={{ color: '#a1a1aa' }}>Ventes − dépenses</span></div>
        <div className="card kpi"><span className="small muted">TVA nette à reverser</span><strong className="value num">{fmt(stats?.vat_due || 0)}</strong><span className="xs muted">Collectée − déductible</span></div>
      </section>

      {canWrite && (
        <section className="show-mobile" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}>
          {[
            { to: '/app/pieces/nouvelle?kind=purchase&type=receipt&photo=1', icon: 'camera' as const, label: 'Scanner un reçu', dark: true },
            { to: '/app/pieces/nouvelle?kind=purchase', icon: 'receipt' as const, label: 'Nouvel achat' },
            { to: '/app/pieces/nouvelle?kind=sale', icon: 'filePlus' as const, label: 'Facturer' },
            { to: '/app/export', icon: 'download' as const, label: 'Export du mois' },
          ].map((a) => (
            <Link key={a.label} to={a.to} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 500, textAlign: 'center', textDecoration: 'none', color: 'inherit' }}>
              <span style={{ width: 56, height: 56, borderRadius: 16, border: '1px solid var(--border)', background: a.dark ? 'var(--ink)' : 'var(--surface)', color: a.dark ? '#fff' : 'inherit', display: 'grid', placeItems: 'center' }}><Icon name={a.icon} size={22} /></span>
              {a.label}
            </Link>
          ))}
        </section>
      )}

      <section className="grid-3">
        <div className="card span-2 stack">
          <div className="between" style={{ alignItems: 'flex-start' }}>
            <div className="stack-sm" style={{ gap: 2 }}><h2>Ventes et dépenses</h2><span className="small muted">12 derniers mois, TTC</span></div>
            <div className="legend"><span><i style={{ background: 'var(--ink)' }} />Ventes</span><span><i style={{ background: '#d4d4d8' }} />Dépenses</span></div>
          </div>
          <div>
            <div className="chart" role="img" aria-label="Graphique des ventes et dépenses par mois">
              {months.map((m) => (
                <div className="col" key={m.m} title={`${monthShort(m.m)} — ventes ${fmt(m.sales)}, dépenses ${fmt(m.purchases)}`}>
                  <div className="bar" style={{ height: `${(m.sales / max) * 100}%`, background: 'var(--ink)' }} />
                  <div className="bar" style={{ height: `${(m.purchases / max) * 100}%`, background: '#d4d4d8' }} />
                </div>
              ))}
            </div>
            <div className="chart-labels" style={{ marginTop: 6 }}>{months.map((m) => <span key={m.m}>{monthShort(m.m)}</span>)}</div>
          </div>
        </div>

        <div className="card stack">
          <div className="stack-sm" style={{ gap: 2 }}><h2>Dépenses par catégorie</h2><span className="small muted">{RANGES[range].label === 'Mois' ? 'Ce mois-ci' : RANGES[range].label === 'Année' ? 'Cette année' : 'Ce trimestre'}</span></div>
          {stats && stats.by_category.length === 0 && <p className="small muted">Aucune dépense sur la période.</p>}
          {stats?.by_category.slice(0, 7).map((c) => (
            <div key={c.category} className="stack-sm" style={{ gap: 6 }}>
              <div className="between small"><span>{c.category}</span><span className="num muted">{fmt(c.total)}</span></div>
              <div className="hbar"><div style={{ width: `${(c.total / maxCat) * 100}%` }} /></div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid-3">
        <div className="card flush span-2">
          <div className="card-head"><h2>Dernières pièces</h2><Link to="/app/pieces" className="small">Tout voir →</Link></div>
          {recent.length === 0 ? (
            <div className="empty">
              <p>Aucune pièce pour l'instant.</p>
              {canWrite && <p className="small" style={{ marginTop: 8 }}><Link to="/app/pieces/nouvelle?kind=purchase">Saisissez votre premier achat</Link> ou <Link to="/app/pieces/nouvelle?kind=sale">votre première facture</Link>.</p>}
            </div>
          ) : (
            <>
              <div className="table-wrap table-desktop">
                <table className="table">
                  <thead><tr><th>Date</th><th>N°</th><th>Tiers</th><th>Type</th><th>Statut</th><th className="r">Montant TTC</th></tr></thead>
                  <tbody>
                    {recent.map((d) => (
                      <tr key={d.id} className="click" onClick={() => navigate(`/app/pieces/${d.id}`)}>
                        <td className="num muted">{shortDate(d.date)}</td>
                        <td className="num">{d.number || '—'}</td>
                        <td><div className="stack-sm" style={{ gap: 0 }}><span style={{ fontWeight: 500 }}>{d.party_name}</span><span className="xs muted">{d.category || ''}</span></div></td>
                        <td className="muted">{KIND_LABEL[d.kind]} · {TYPE_LABEL[d.doc_type]}</td>
                        <td><StatusPill doc={d} /></td>
                        <td className="r num strong">{signedMoney(d.total_ttc, d.kind, cur)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mlist" style={{ padding: '0 16px 8px' }}>
                {recent.slice(0, 5).map((d) => (
                  <Link key={d.id} to={`/app/pieces/${d.id}`} className="mitem">
                    <span className={`avatar square ${d.kind === 'sale' ? 'ink' : ''}`}>{initials(d.party_name)}</span>
                    <span className="t"><span>{d.party_name}</span><span className="xs muted">{d.category || TYPE_LABEL[d.doc_type]} · {shortDate(d.date)}</span></span>
                    <span className={`num small ${d.kind === 'sale' ? 'strong' : ''}`}>{signedMoney(d.total_ttc, d.kind, cur)}</span>
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="stack">
          <div className="card stack-sm" style={{ gap: 10 }}>
            <h2>À traiter</h2>
            <Link className="todo" to="/app/justificatifs">
              <span className={`pill ${stats?.todo.missing_attachments ? 'paid' : 'unpaid'}`} style={{ height: 24 }}>{stats?.todo.missing_attachments ?? 0}</span>
              <span className="stack-sm small" style={{ gap: 2 }}><strong>Achats sans justificatif</strong><span className="muted">Ajoutez la photo ou le PDF</span></span>
            </Link>
            <Link className="todo" to="/app/ventes?overdue=1">
              <span className={`pill ${stats?.todo.overdue_count ? 'paid' : 'unpaid'}`} style={{ height: 24 }}>{stats?.todo.overdue_count ?? 0}</span>
              <span className="stack-sm small" style={{ gap: 2 }}><strong>Factures clients en retard</strong><span className="muted">{fmt(stats?.todo.overdue_amount || 0)} à relancer</span></span>
            </Link>
            <Link className="todo" to="/app/export">
              <span className="pill unpaid" style={{ height: 24 }}><Icon name="sheet" size={13} /></span>
              <span className="stack-sm small" style={{ gap: 2 }}><strong>Export du mois</strong><span className="muted">Fichier Excel pour le comptable</span></span>
            </Link>
          </div>
          {canWrite && (
            <label
              className={`dropzone hide-mobile ${over ? 'over' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setOver(true); }}
              onDragLeave={() => setOver(false)}
              onDrop={(e) => { e.preventDefault(); setOver(false); onDrop(Array.from(e.dataTransfer.files)); }}
            >
              <Icon name="upload" size={22} />
              <strong className="small">Déposez un justificatif</strong>
              <span className="xs muted">PDF ou photo : un nouvel achat est créé avec le fichier joint</span>
              <input type="file" hidden multiple accept="application/pdf,image/*" onChange={(e) => onDrop(Array.from(e.target.files || []))} />
            </label>
          )}
        </div>
      </section>
    </>
  );
}

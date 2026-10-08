import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, type Doc, type Stats } from '../api';
import { useAuth } from '../auth';
import { StatusPill } from '../components';
import { TYPE_LABEL, KIND_LABEL, compactMoney, initials, isoOf, money, monthShort, shortDate, signedMoney } from '../format';
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
  const short = (v: number) => compactMoney(v, cur);
  const CAT_COLORS = ['var(--ink)', 'var(--coral)', 'var(--sun)', 'var(--mint)', 'var(--lavender)', 'var(--border-strong)'];
  const avatarTone = (d: Doc) => (d.kind === 'sale' ? 'ink' : 'mint');
  const periodLabel = ['ce mois-ci', 'ce trimestre', 'cette année'][range];
  const maxSales = Math.max(1, ...months.map((m) => m.sales));

  return (
    <>
      <header className="page-head">
        <div>
          <p className="sub">Bienvenue chez {company?.name}</p>
          <h1>Salut {user?.name.split(' ')[0]}<span style={{ color: 'var(--sun-strong)' }}>.</span></h1>
        </div>
        <div className="seg" role="group" aria-label="Période">
          {RANGES.map((r, i) => <button key={r.label} className={range === i ? 'on' : ''} onClick={() => setRange(i)}>{r.label}</button>)}
        </div>
      </header>

      {error && <p className="error">{error}</p>}

      <section className="bento" aria-label="Indicateurs">
        <div className="tile sun hero">
          <div className="between">
            <span className="strong">Solde {periodLabel}</span>
            <span className="badge-ink">{stats ? `${stats.sales.count + stats.purchases.count} pièces` : '…'}</span>
          </div>
          <strong className="value num-title" title={fmt(stats?.balance || 0)}>{fmt(stats?.balance || 0)}</strong>
          <div>
            <div className="bars" role="img" aria-label="Ventes des 12 derniers mois">
              {months.map((m, i) => (
                <div key={m.m} className={i === months.length - 1 ? '' : 'dim'} style={{ height: `${Math.max(4, (m.sales / maxSales) * 100)}%` }} title={`${monthShort(m.m)} : ${fmt(m.sales)}`} />
              ))}
            </div>
            <div className="chart-labels" style={{ marginTop: 6 }}>{months.map((m) => <span key={m.m}>{monthShort(m.m).slice(0, 1).toUpperCase()}</span>)}</div>
          </div>
        </div>
        <Link className="tile ink" to="/app/ventes">
          <span className="small" style={{ opacity: 0.75 }}>Ventes TTC</span>
          <strong className="value">{short(stats?.sales.total_ttc || 0)}</strong>
          <span className="xs" style={{ color: 'var(--mint)' }}>{stats?.sales.count || 0} factures et reçus</span>
        </Link>
        <Link className="tile mint" to="/app/achats">
          <span className="small">Dépenses TTC</span>
          <strong className="value">{short(stats?.purchases.total_ttc || 0)}</strong>
          <span className="xs">{stats?.purchases.count || 0} achats</span>
        </Link>
        <div className="tile lavender">
          <span className="small">TVA nette</span>
          <strong className="value">{short(stats?.vat_due || 0)}</strong>
          <span className="xs">collectée − déductible</span>
        </div>
        <Link className="tile coral" to="/app/ventes?overdue=1">
          <span className="small">À encaisser</span>
          <strong className="value">{short(stats?.sales.unpaid || 0)}</strong>
          <span className="xs">{stats?.todo.overdue_count ? `${stats.todo.overdue_count} en retard →` : 'aucun retard'}</span>
        </Link>
      </section>

      {canWrite && (
        <section className="quick show-mobile" aria-label="Actions rapides">
          <Link className="primary" to="/app/pieces/nouvelle?kind=purchase&type=receipt&photo=1"><span><Icon name="camera" size={22} /></span>Scanner un reçu</Link>
          <Link to="/app/pieces/nouvelle?kind=purchase"><span><Icon name="receipt" size={22} /></span>Nouvel achat</Link>
          <Link to="/app/pieces/nouvelle?kind=sale"><span><Icon name="filePlus" size={22} /></span>Facturer</Link>
          <Link to="/app/export"><span><Icon name="download" size={22} /></span>Export</Link>
        </section>
      )}

      {stats && stats.todo.missing_attachments > 0 && (
        <Link className="todo" to="/app/justificatifs" style={{ background: 'var(--ink)', color: 'var(--ink-text)' }}>
          <span className="pill" style={{ background: 'var(--sun)', color: 'var(--ink)', height: 28 }}>{stats.todo.missing_attachments}</span>
          <span className="grow small"><strong>achat{stats.todo.missing_attachments > 1 ? 's' : ''} sans justificatif</strong> — ajoutez la photo avant l'export</span>
          <Icon name="arrowRight" />
        </Link>
      )}

      <section className="bento">
        <div className="card flush wide">
          <div className="card-head"><h2 style={{ fontSize: 20 }}>Dernières pièces</h2><Link to="/app/pieces" className="small strong">Tout voir</Link></div>
          {recent.length === 0 ? (
            <div className="empty">
              <p>Aucune pièce pour l'instant.</p>
              {canWrite && <p className="small" style={{ marginTop: 8 }}><Link to="/app/pieces/nouvelle?kind=purchase">Saisissez votre premier achat</Link> ou <Link to="/app/pieces/nouvelle?kind=sale">votre première facture</Link>.</p>}
            </div>
          ) : (
            <>
              <div className="table-wrap table-desktop">
                <table className="table">
                  <thead><tr><th>Date</th><th>Tiers</th><th>Pièce</th><th>Statut</th><th className="r">Montant TTC</th></tr></thead>
                  <tbody>
                    {recent.map((d) => (
                      <tr key={d.id} className="click" onClick={() => navigate(`/app/pieces/${d.id}`)}>
                        <td className="num muted">{shortDate(d.date)}</td>
                        <td>
                          <div className="row" style={{ flexWrap: 'nowrap', gap: 12 }}>
                            <span className={`avatar ${avatarTone(d)}`} style={{ width: 36, height: 36, borderRadius: 12, fontSize: 12 }}>{initials(d.party_name)}</span>
                            <span className="stack-sm" style={{ gap: 0 }}><span style={{ fontWeight: 600 }}>{d.party_name}</span><span className="xs muted">{d.category || ''}</span></span>
                          </div>
                        </td>
                        <td className="muted">{KIND_LABEL[d.kind]} · {TYPE_LABEL[d.doc_type]} <span className="num xs">{d.number || ''}</span></td>
                        <td><StatusPill doc={d} /></td>
                        <td className="r num strong">{signedMoney(d.total_ttc, d.kind, cur)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mlist" style={{ padding: '0 18px 8px' }}>
                {recent.slice(0, 5).map((d) => (
                  <Link key={d.id} to={`/app/pieces/${d.id}`} className="mitem">
                    <span className={`avatar ${avatarTone(d)}`}>{initials(d.party_name)}</span>
                    <span className="t"><span>{d.party_name}</span><span className="xs muted">{d.category || TYPE_LABEL[d.doc_type]} · {shortDate(d.date)}</span></span>
                    <span className={`num small ${d.kind === 'sale' ? 'strong' : ''}`}>{signedMoney(d.total_ttc, d.kind, cur)}</span>
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="card stack wide-1">
          <h2 style={{ fontSize: 20 }}>Où va l'argent</h2>
          {stats && stats.by_category.length === 0 && <p className="small muted">Aucune dépense {periodLabel}.</p>}
          {stats?.by_category.slice(0, 6).map((c, i) => (
            <div key={c.category} className="stack-sm" style={{ gap: 6 }}>
              <div className="between small" style={{ flexWrap: 'nowrap' }}><span className="strong">{c.category}</span><span className="num">{short(c.total)}</span></div>
              <div className="hbar"><div style={{ width: `${(c.total / maxCat) * 100}%`, background: CAT_COLORS[i % CAT_COLORS.length] }} /></div>
            </div>
          ))}
          {canWrite && (
            <label
              className={`dropzone hide-mobile ${over ? 'over' : ''}`}
              style={{ marginTop: 'auto' }}
              onDragOver={(e) => { e.preventDefault(); setOver(true); }}
              onDragLeave={() => setOver(false)}
              onDrop={(e) => { e.preventDefault(); setOver(false); onDrop(Array.from(e.dataTransfer.files)); }}
            >
              <Icon name="upload" size={22} />
              <strong className="small">Déposez un justificatif</strong>
              <span className="xs muted">Un achat est créé avec le fichier joint</span>
              <input type="file" hidden multiple accept="application/pdf,image/*" onChange={(e) => onDrop(Array.from(e.target.files || []))} />
            </label>
          )}
        </div>

        <div className="card stack" style={{ gridColumn: '1 / -1' }}>
          <div className="between" style={{ alignItems: 'flex-start' }}>
            <div className="stack-sm" style={{ gap: 2 }}><h2 style={{ fontSize: 20 }}>Ventes et dépenses</h2><span className="small muted">12 derniers mois, TTC</span></div>
            <div className="legend"><span><i style={{ background: 'var(--ink)' }} />Ventes</span><span><i style={{ background: 'var(--coral)' }} />Dépenses</span></div>
          </div>
          <div>
            <div className="chart" role="img" aria-label="Graphique des ventes et dépenses par mois">
              {months.map((m) => (
                <div className="col" key={m.m} title={`${monthShort(m.m)} — ventes ${fmt(m.sales)}, dépenses ${fmt(m.purchases)}`}>
                  <div className="bar" style={{ height: `${(m.sales / max) * 100}%`, background: 'var(--ink)' }} />
                  <div className="bar" style={{ height: `${(m.purchases / max) * 100}%`, background: 'var(--coral)' }} />
                </div>
              ))}
            </div>
            <div className="chart-labels" style={{ marginTop: 6 }}>{months.map((m) => <span key={m.m}>{monthShort(m.m)}</span>)}</div>
          </div>
        </div>
      </section>
    </>
  );
}

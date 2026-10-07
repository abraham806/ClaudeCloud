import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type Kind, type Party } from '../api';
import { useAuth } from '../auth';
import { frDate, initials, money } from '../format';
import { Icon } from '../icons';

export default function Parties() {
  const { company } = useAuth();
  const navigate = useNavigate();
  const cur = company?.currency || 'XOF';
  const [kind, setKind] = useState<Kind>('sale');
  const [rows, setRows] = useState<Party[] | null>(null);
  const [q, setQ] = useState('');

  useEffect(() => { api.parties(kind).then(setRows, () => setRows([])); }, [kind]);

  const list = (rows || []).filter((p) => p.name.toLowerCase().includes(q.toLowerCase()));
  const open = (p: Party) => navigate(`/app/${p.kind === 'sale' ? 'ventes' : 'achats'}?party=${encodeURIComponent(p.name)}`);

  return (
    <>
      <header className="page-head">
        <div><p className="sub">Retrouvés automatiquement à partir de vos pièces</p><h1>Clients & fournisseurs</h1></div>
      </header>
      <div className="row">
        <div className="seg" role="group" aria-label="Type de tiers">
          <button className={kind === 'sale' ? 'on' : ''} onClick={() => setKind('sale')}>Clients</button>
          <button className={kind === 'purchase' ? 'on' : ''} onClick={() => setKind('purchase')}>Fournisseurs</button>
        </div>
        <label className="search grow" style={{ flex: '1 1 240px' }}>
          <Icon name="search" /><input aria-label="Rechercher" placeholder="Rechercher un nom" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      </div>

      <div className="card flush">
        <div className="table-wrap table-desktop">
          <table className="table">
            <thead><tr><th>Nom</th><th>Adresse</th><th>NINEA</th><th className="r">Pièces</th><th>Dernière</th><th className="r">{kind === 'sale' ? 'Facturé' : 'Dépensé'} TTC</th><th className="r">{kind === 'sale' ? 'Reste à encaisser' : 'Reste à payer'}</th></tr></thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.name} className="click" onClick={() => open(p)}>
                  <td style={{ fontWeight: 500 }}>{p.name}</td>
                  <td className="muted">{p.address || '—'}</td>
                  <td className="num muted">{p.tax_id || '—'}</td>
                  <td className="r num">{p.count}</td>
                  <td className="num muted">{frDate(p.last_date)}</td>
                  <td className="r num strong">{money(p.total, cur)}</td>
                  <td className="r num">{p.unpaid ? <span className="pill unpaid">{money(p.unpaid, cur)}</span> : '—'}</td>
                </tr>
              ))}
              {rows && list.length === 0 && <tr><td colSpan={7} className="empty">Aucun {kind === 'sale' ? 'client' : 'fournisseur'} pour l'instant. Ils apparaissent dès votre première pièce.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="mlist" style={{ padding: '0 16px' }}>
          {list.map((p) => (
            <button key={p.name} className="mitem" onClick={() => open(p)} style={{ background: 'none', border: 0, borderBottom: '1px solid var(--subtle)', textAlign: 'left', font: 'inherit', width: '100%' }}>
              <span className={`avatar square ${kind === 'sale' ? 'ink' : ''}`}>{initials(p.name)}</span>
              <span className="t"><span>{p.name}</span><span className="xs muted">{p.count} pièce(s){p.unpaid ? ` · ${money(p.unpaid, cur)} en attente` : ''}</span></span>
              <span className="num small strong">{money(p.total, cur)}</span>
            </button>
          ))}
          {rows && list.length === 0 && <p className="empty">Aucun résultat.</p>}
        </div>
      </div>
    </>
  );
}

import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, type Doc, type Kind } from '../api';
import { useAuth } from '../auth';
import { TYPE_LABEL, frDate, money } from '../format';
import PeriodPicker from './PeriodPicker';
import { PRESETS } from '../period';

const PAGE = 50;

export default function Documents({ kind }: { kind: Kind }) {
  const { company } = useAuth();
  const navigate = useNavigate();
  const [filters, setFilters] = useState({ period: PRESETS[3].get(), q: '', status: '', offset: 0 });
  const { period, q, status, offset } = filters;
  // Changer un filtre ramène à la première page.
  const setFilter = (patch: Partial<Omit<typeof filters, 'offset'>>) => setFilters((f) => ({ ...f, ...patch, offset: 0 }));
  const setOffset = (o: number) => setFilters((f) => ({ ...f, offset: o }));
  const [data, setData] = useState<{ items: Doc[]; total: number } | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      api.listDocuments({ kind, ...period, q, status, offset }).then(setData);
    }, 200);
    return () => clearTimeout(t);
  }, [kind, period, q, status, offset]);

  const title = kind === 'purchase' ? 'Achats' : 'Ventes';
  const sum = data?.items.reduce((acc, d) => acc + d.total_ttc, 0) || 0;

  return (
    <>
      <header className="page-head">
        <h1>{title}</h1>
        <Link className="button primary" to={`/documents/nouveau?kind=${kind}`}>
          + {kind === 'purchase' ? 'Nouvel achat' : 'Nouvelle vente'}
        </Link>
      </header>
      <PeriodPicker value={period} onChange={(p) => setFilter({ period: p })} />
      <div className="filters">
        <input type="search" placeholder={kind === 'purchase' ? 'Fournisseur, n°, catégorie…' : 'Client, n°…'} value={q} onChange={(e) => setFilter({ q: e.target.value })} />
        <select value={status} onChange={(e) => setFilter({ status: e.target.value })}>
          <option value="">Tous les statuts</option>
          <option value="paid">Payé</option>
          <option value="unpaid">Non payé</option>
        </select>
      </div>
      <div className="card flush">
        <table className="table clickable">
          <thead>
            <tr>
              <th>Date</th><th>N°</th><th>Pièce</th><th>{kind === 'purchase' ? 'Fournisseur' : 'Client'}</th>
              <th className="hide-sm">Catégorie</th><th>Statut</th><th className="num">TTC</th>
            </tr>
          </thead>
          <tbody>
            {data?.items.map((d) => (
              <tr key={d.id} onClick={() => navigate(`/documents/${d.id}`)}>
                <td>{frDate(d.date)}</td>
                <td>{d.number || '—'}</td>
                <td>{TYPE_LABEL[d.doc_type]}{d.attachment_count ? ' 📎' : ''}</td>
                <td>{d.party_name}</td>
                <td className="hide-sm">{d.category || ''}</td>
                <td><span className={`badge ${d.status}`}>{d.status === 'paid' ? 'Payé' : 'Non payé'}</span></td>
                <td className="num">{money(d.total_ttc, company?.currency)}</td>
              </tr>
            ))}
            {data && data.items.length === 0 && (
              <tr><td colSpan={7} className="muted empty">Aucune pièce. Cliquez sur « + {kind === 'purchase' ? 'Nouvel achat' : 'Nouvelle vente'} » pour commencer.</td></tr>
            )}
          </tbody>
          {data && data.items.length > 0 && (
            <tfoot><tr><td colSpan={6}>{data.total} pièce(s) — total de la page</td><td className="num">{money(sum, company?.currency)}</td></tr></tfoot>
          )}
        </table>
      </div>
      {data && data.total > PAGE && (
        <div className="pager">
          <button disabled={offset === 0} onClick={() => setOffset(offset - PAGE)}>← Précédent</button>
          <span className="muted">{offset + 1}–{Math.min(offset + PAGE, data.total)} sur {data.total}</span>
          <button disabled={offset + PAGE >= data.total} onClick={() => setOffset(offset + PAGE)}>Suivant →</button>
        </div>
      )}
    </>
  );
}

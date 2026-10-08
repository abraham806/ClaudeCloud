import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { api, openBlob, type Doc, type DocQuery, type Kind } from '../api';
import { useAuth } from '../auth';
import { StatusPill } from '../components';
import { DEFAULT_CATEGORIES, KIND_LABEL, TYPE_LABEL, frDate, initials, money, signedMoney, today } from '../format';
import { Icon } from '../icons';
import { PRESETS } from '../period';
import PeriodPicker from './PeriodPicker';

const PAGE = 50;

interface Tab { id: string; label: string; query: DocQuery }

const TABS: Record<'purchase' | 'sale' | 'all', Tab[]> = {
  purchase: [
    { id: 'all', label: 'Tous', query: {} },
    { id: 'invoice', label: 'Factures', query: { doc_type: 'invoice' } },
    { id: 'receipt', label: 'Reçus & tickets', query: { doc_type: 'receipt' } },
    { id: 'unpaid', label: 'Non payés', query: { status: 'unpaid' } },
    { id: 'missing', label: 'Sans justificatif', query: { missing: true } },
  ],
  sale: [
    { id: 'all', label: 'Toutes', query: {} },
    { id: 'invoice', label: 'Factures', query: { doc_type: 'invoice' } },
    { id: 'receipt', label: 'Reçus', query: { doc_type: 'receipt' } },
    { id: 'quote', label: 'Devis', query: { doc_type: 'quote' } },
    { id: 'unpaid', label: 'Non payées', query: { status: 'unpaid' } },
    { id: 'overdue', label: 'En retard', query: { overdue: true } },
  ],
  all: [
    { id: 'all', label: 'Tout', query: {} },
    { id: 'purchase', label: 'Achats', query: { kind: 'purchase' } },
    { id: 'sale', label: 'Ventes', query: { kind: 'sale' } },
    { id: 'unpaid', label: 'Non payées', query: { status: 'unpaid' } },
    { id: 'missing', label: 'Sans justif.', query: { missing: true } },
  ],
};

function relativeGroup(iso: string) {
  const t = today();
  if (iso === t) return "Aujourd'hui";
  const diff = (new Date(`${t}T12:00:00`).getTime() - new Date(`${iso}T12:00:00`).getTime()) / 86_400_000;
  if (diff < 7 && diff > 0) return 'Cette semaine';
  if (iso.slice(0, 7) === t.slice(0, 7)) return 'Ce mois-ci';
  return frDate(iso).slice(3);
}

export default function Documents({ kind }: { kind?: Kind }) {
  const { company, user } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const locationKey = useLocation().key;
  const cur = company?.currency || 'XOF';
  const canWrite = user?.role !== 'accountant';
  const tabs = TABS[kind || 'all'];
  const initialTab = params.get('overdue') ? 'overdue' : params.get('missing') ? 'missing' : 'all';

  const [tab, setTab] = useState(initialTab);
  const [period, setPeriod] = useState(PRESETS[3].get());
  const [q, setQ] = useState('');
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<{ items: Doc[]; total: number; sum_ttc: number } | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [focus, setFocus] = useState<Doc | null>(null);
  const [reload, setReload] = useState(0);
  const [error, setError] = useState('');
  const party = params.get('party') || undefined;

  const query = useMemo<DocQuery>(() => ({
    kind, ...period, q, party, offset, limit: PAGE, ...(tabs.find((t) => t.id === tab)?.query || {}),
  }), [kind, period, q, party, offset, tab, tabs]);

  useEffect(() => {
    const t = setTimeout(() => {
      api.listDocuments(query).then((d) => { setData(d); setError(''); }, (e) => setError(e.message));
    }, 150);
    return () => clearTimeout(t);
  }, [query, reload, locationKey]);

  const change = (fn: () => void) => { fn(); setOffset(0); setSelected(new Set()); };
  const toggle = (id: number) => setSelected((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const allChecked = !!data?.items.length && data.items.every((d) => selected.has(d.id));
  const selSum = data?.items.filter((d) => selected.has(d.id)).reduce((a, d) => a + d.total_ttc, 0) || 0;

  async function bulk(action: 'paid' | 'unpaid' | 'category' | 'delete') {
    const ids = [...selected];
    let category: string | undefined;
    if (action === 'category') {
      category = prompt(`Nouvelle catégorie (ex. ${DEFAULT_CATEGORIES.slice(0, 3).join(', ')})`) ?? undefined;
      if (category === undefined) return;
    }
    if (action === 'delete' && !confirm(`Supprimer définitivement ${ids.length} pièce(s) et leurs justificatifs ?`)) return;
    try {
      await api.bulk(ids, action, category);
      setSelected(new Set());
      setFocus(null);
      setReload((r) => r + 1);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function openFocus(d: Doc) {
    if (window.matchMedia('(max-width: 1100px)').matches) return navigate(`/app/pieces/${d.id}`);
    setFocus(await api.getDocument(d.id));
  }

  const title = kind === 'purchase' ? 'Achats' : kind === 'sale' ? 'Ventes et devis' : 'Mes pièces';
  const partyLabel = kind === 'purchase' ? 'Fournisseur' : kind === 'sale' ? 'Client' : 'Tiers';
  const groups = useMemo(() => {
    const g: { label: string; items: Doc[] }[] = [];
    for (const d of data?.items || []) {
      const label = relativeGroup(d.date);
      if (g[g.length - 1]?.label !== label) g.push({ label, items: [] });
      g[g.length - 1].items.push(d);
    }
    return g;
  }, [data]);

  return (
    <>
      <header className="page-head">
        <div>
          <p className="sub">{data ? `${data.total} pièce(s) · ${money(data.sum_ttc, cur)} TTC` : '…'}</p>
          <h1>{title}</h1>
        </div>
        {canWrite && (
          <div className="row hide-mobile">
            {kind !== 'sale' && <Link className="btn" to="/app/pieces/nouvelle?kind=purchase&type=receipt"><Icon name="camera" />Reçu avec photo</Link>}
            <Link className="btn dark" to={`/app/pieces/nouvelle?kind=${kind || 'purchase'}`}>
              <Icon name="plus" />{kind === 'sale' ? 'Nouvelle facture' : 'Nouvel achat'}
            </Link>
          </div>
        )}
      </header>

      {party && (
        <div className="row">
          <span className="chip on">{partyLabel} : {party}</span>
          <button className="link small" onClick={() => { params.delete('party'); setParams(params); }}>Retirer le filtre</button>
        </div>
      )}

      <div className="tabs hide-mobile" role="tablist">
        {tabs.map((t) => <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => change(() => setTab(t.id))}>{t.label}</button>)}
      </div>
      <div className="chips show-mobile" style={{ flexWrap: 'nowrap', overflowX: 'auto' }}>
        {tabs.map((t) => <button key={t.id} className={`chip ${tab === t.id ? 'on' : ''}`} onClick={() => change(() => setTab(t.id))}>{t.label}</button>)}
      </div>

      <div className="row">
        <label className="search grow" style={{ flex: '1 1 260px' }}>
          <Icon name="search" />
          <input aria-label="Rechercher" placeholder={`${partyLabel}, n°, catégorie…`} value={q} onChange={(e) => change(() => setQ(e.target.value))} />
        </label>
      </div>
      <PeriodPicker value={period} onChange={(p) => change(() => setPeriod(p))} />

      {error && <p className="error">{error}</p>}

      <div className="split">
        <div className="grow card flush">
          {selected.size > 0 && canWrite && (
            <div className="bulkbar">
              <strong>{selected.size} sélectionnée(s)</strong><span className="num dim">{money(selSum, cur)}</span>
              <span style={{ marginLeft: 'auto' }} className="row">
                <button onClick={() => bulk('paid')}>Marquer payé</button>
                <button onClick={() => bulk('unpaid')}>Non payé</button>
                <button onClick={() => bulk('category')}>Catégorie</button>
                <button onClick={() => bulk('delete')}>Supprimer</button>
              </span>
            </div>
          )}
          <div className="table-wrap table-desktop">
            <table className="table">
              <thead>
                <tr>
                  {canWrite && <th style={{ width: 20 }}><input type="checkbox" aria-label="Tout sélectionner" checked={allChecked}
                    onChange={() => setSelected(allChecked ? new Set() : new Set(data?.items.map((d) => d.id)))} /></th>}
                  <th>Date</th>{!kind && <th>Type</th>}<th>{partyLabel}</th><th>N°</th><th>Catégorie</th><th>Justif.</th><th>Statut</th>
                  {!focus && <><th className="r">HT</th><th className="r">TVA</th></>}<th className="r">TTC</th>
                </tr>
              </thead>
              <tbody>
                {data?.items.map((d) => (
                  <tr key={d.id} className={`click ${focus?.id === d.id || selected.has(d.id) ? 'sel' : ''}`} onClick={() => openFocus(d)}>
                    {canWrite && <td onClick={(e) => e.stopPropagation()}><input type="checkbox" aria-label="Sélectionner" checked={selected.has(d.id)} onChange={() => toggle(d.id)} /></td>}
                    <td className="num muted">{frDate(d.date)}</td>
                    {!kind && <td className="muted">{KIND_LABEL[d.kind]}</td>}
                    <td style={{ fontWeight: 500 }}>{d.party_name}</td>
                    <td className="num muted">{d.number || '—'} <span className="xs">{TYPE_LABEL[d.doc_type]}</span></td>
                    <td>{d.category ? <span className="pill soft">{d.category}</span> : ''}</td>
                    <td className="muted">{d.attachment_count ? <Icon name="clip" /> : d.doc_type === 'quote' ? '' : '—'}</td>
                    <td><StatusPill doc={d} /></td>
                    {!focus && <><td className="r num muted">{money(d.total_ht, cur)}</td>
                    <td className="r num muted">{money(d.total_tva, cur)}</td></>}
                    <td className="r num strong">{money(d.total_ttc, cur)}</td>
                  </tr>
                ))}
                {data && data.items.length === 0 && <tr><td colSpan={11} className="empty">Aucune pièce ne correspond.</td></tr>}
              </tbody>
            </table>
          </div>

          <div className="mlist" style={{ padding: '0 16px' }}>
            {groups.map((g) => (
              <div key={g.label}>
                <div className="mgroup"><span>{g.label}</span></div>
                {g.items.map((d) => (
                  <Link key={d.id} to={`/app/pieces/${d.id}`} className="mitem">
                    <span className={`avatar square ${d.kind === 'sale' ? 'ink' : ''}`}>{initials(d.party_name)}</span>
                    <span className="t">
                      <span>{d.party_name}</span>
                      <span className="xs muted row" style={{ gap: 6 }}>
                        {d.doc_type === 'quote' ? d.number : (d.category || TYPE_LABEL[d.doc_type])}{d.attachment_count ? ' · photo jointe' : ''}
                        {(d.status === 'unpaid' || d.doc_type === 'quote') && <StatusPill doc={d} />}
                      </span>
                    </span>
                    <span className={`num small ${d.kind === 'sale' ? 'strong' : ''}`}>{signedMoney(d.total_ttc, d.kind, cur)}</span>
                  </Link>
                ))}
              </div>
            ))}
            {data && data.items.length === 0 && <p className="empty">Aucune pièce ne correspond.</p>}
          </div>

          {data && data.total > PAGE && (
            <div className="pager">
              <span>{offset + 1}–{Math.min(offset + PAGE, data.total)} sur {data.total}</span>
              <span className="row">
                <button className="btn sm" disabled={offset === 0} onClick={() => setOffset(offset - PAGE)}>Précédent</button>
                <button className="btn sm" disabled={offset + PAGE >= data.total} onClick={() => setOffset(offset + PAGE)}>Suivant</button>
              </span>
            </div>
          )}
        </div>

        {focus && <FocusPanel doc={focus} cur={cur} onClose={() => setFocus(null)} />}
      </div>
    </>
  );
}

function FocusPanel({ doc, cur, onClose }: { doc: Doc; cur: string; onClose: () => void }) {
  const [preview, setPreview] = useState<{ url: string; pdf: boolean } | null>(null);
  const first = doc.attachments?.[0];

  useEffect(() => {
    let url: string | null = null;
    const load = first ? api.attachment(doc.id, first.id) : api.documentPdf(doc.id);
    load.then((b) => {
      url = URL.createObjectURL(b);
      setPreview({ url, pdf: b.type === 'application/pdf' });
    }, () => setPreview(null));
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [doc.id, first]);

  return (
    <aside className="card side-panel">
      <div className="between" style={{ alignItems: 'flex-start' }}>
        <div className="stack-sm" style={{ gap: 2 }}>
          <span className="xs muted">{KIND_LABEL[doc.kind]} · {TYPE_LABEL[doc.doc_type]} · {doc.number || 'sans n°'}</span>
          <strong style={{ fontSize: 17 }}>{doc.party_name}</strong>
        </div>
        <button className="btn ghost icon" aria-label="Fermer l'aperçu" onClick={onClose}><Icon name="x" /></button>
      </div>
      <div className="preview-box">
        {preview ? (preview.pdf ? <iframe src={preview.url} title="Aperçu" /> : <img src={preview.url} alt="Justificatif" />) : 'Chargement de l’aperçu…'}
      </div>
      <dl className="kv">
        <dt>Date</dt><dd className="num">{frDate(doc.date)}</dd>
        {doc.due_date && <><dt>Échéance</dt><dd className="num">{frDate(doc.due_date)}</dd></>}
        {doc.category && <><dt>Catégorie</dt><dd>{doc.category}</dd></>}
        {doc.payment_method && <><dt>Paiement</dt><dd>{doc.payment_method}</dd></>}
        <dt>Statut</dt><dd><StatusPill doc={doc} /></dd>
        <dt>Total HT</dt><dd className="num">{money(doc.total_ht, cur)}</dd>
        <dt>TVA</dt><dd className="num">{money(doc.total_tva, cur)}</dd>
        <dt className="strong" style={{ color: 'var(--text)' }}>Total TTC</dt><dd className="num strong">{money(doc.total_ttc, cur)}</dd>
      </dl>
      <div className="row">
        <button className="btn grow" onClick={async () => openBlob(await api.documentPdf(doc.id))}><Icon name="printer" />Imprimer</button>
        <Link className="btn dark grow" to={`/app/pieces/${doc.id}`}>Ouvrir</Link>
      </div>
    </aside>
  );
}

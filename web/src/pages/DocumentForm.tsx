import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, type Attachment, type DocInput, type DocType, type Kind, type Line, type Party } from '../api';
import { useAuth } from '../auth';
import { AttachmentThumb, FilePickers, InvoicePreview } from '../components';
import { DEFAULT_CATEGORIES, PAYMENT_METHODS, addDays, money, today } from '../format';
import { Icon } from '../icons';

function lineTotals(l: Line) {
  const ht = Math.round((Number(l.quantity) || 0) * (Number(l.unit_price) || 0) * 100);
  const tva = Math.round((ht * (Number(l.vat_rate) || 0)) / 100);
  return { ht, tva };
}

function defaults(kind: Kind, type: DocType, vat: number): DocInput {
  const sale = kind === 'sale';
  const unpaid = sale && type !== 'receipt';
  return {
    kind, doc_type: type, number: '', date: today(),
    due_date: unpaid ? addDays(today(), 30) : null,
    party_name: '', party_address: '', party_tax_id: '', category: '',
    payment_method: type === 'receipt' ? 'Espèces' : '', status: unpaid ? 'unpaid' : 'paid', notes: '',
    lines: [{ description: '', quantity: 1, unit_price: 0, vat_rate: vat }],
  };
}

export default function DocumentForm() {
  const { id } = useParams();
  const [search] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { company } = useAuth();
  const editing = Boolean(id);
  const vat = company?.default_vat ?? 18;
  const cur = company?.currency || 'XOF';
  const navState = (location.state || {}) as { files?: File[]; copy?: DocInput };

  const initialKind = (search.get('kind') as Kind) || 'purchase';
  const initialType = (search.get('type') as DocType) || 'invoice';
  const [doc, setDoc] = useState<DocInput>(() =>
    navState.copy ? { ...navState.copy, number: '', date: today() } : defaults(initialKind, initialType, vat));
  // Saisie rapide (un seul montant TTC) : pratique pour les tickets et reçus d'achat.
  const [quick, setQuick] = useState(!editing && !navState.copy && initialKind === 'purchase');
  const [quickTtc, setQuickTtc] = useState('');
  const [files, setFiles] = useState<File[]>(navState.files || []);
  const [existing, setExisting] = useState<Attachment[]>([]);
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);
  const [parties, setParties] = useState<Party[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const wantsPhoto = search.get('photo') === '1';

  useEffect(() => {
    api.categories().then((c) => setCategories([...new Set([...c, ...DEFAULT_CATEGORIES])]), () => {});
  }, []);
  useEffect(() => {
    api.parties(doc.kind).then(setParties, () => {});
  }, [doc.kind]);
  useEffect(() => {
    if (!id) return;
    api.getDocument(Number(id)).then((d) => {
      setDoc({
        kind: d.kind, doc_type: d.doc_type, number: d.number, date: d.date, due_date: d.due_date,
        party_name: d.party_name, party_address: d.party_address, party_tax_id: d.party_tax_id,
        category: d.category, payment_method: d.payment_method, status: d.status, notes: d.notes,
        lines: d.lines?.length ? d.lines.map(({ description, quantity, unit_price, vat_rate }) => ({ description, quantity, unit_price, vat_rate })) : [],
      });
      setExisting(d.attachments || []);
    }, (e) => setError(e.message));
  }, [id]);

  const previews = useMemo(() => files.map((f) => ({ f, url: f.type.startsWith('image/') ? URL.createObjectURL(f) : null })), [files]);
  useEffect(() => () => previews.forEach((p) => p.url && URL.revokeObjectURL(p.url)), [previews]);

  const set = <K extends keyof DocInput>(k: K, v: DocInput[K]) => setDoc((d) => ({ ...d, [k]: v }));
  const setLine = (i: number, patch: Partial<Line>) =>
    setDoc((d) => ({ ...d, lines: d.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) }));

  // En saisie rapide, la ligne unique est recalculée à partir du TTC et du taux de TVA.
  const quickRate = doc.lines[0]?.vat_rate ?? vat;
  const applyQuick = (ttc: string, rate: number, description?: string) => {
    setQuickTtc(ttc);
    const ttcNum = Number(ttc.replace(',', '.')) || 0;
    const ht = Math.round((ttcNum / (1 + rate / 100)) * 100) / 100;
    setDoc((d) => ({
      ...d,
      lines: [{ description: description ?? d.lines[0]?.description ?? '', quantity: 1, unit_price: ht, vat_rate: rate }],
    }));
  };

  const totals = doc.lines.reduce((acc, l) => {
    const t = lineTotals(l);
    return { ht: acc.ht + t.ht, tva: acc.tva + t.tva };
  }, { ht: 0, tva: 0 });

  const sale = doc.kind === 'sale';
  const switchKind = (k: Kind) => setDoc((d) => ({
    ...d, kind: k,
    doc_type: k === 'purchase' && d.doc_type === 'quote' ? 'invoice' : d.doc_type,
    status: k === 'sale' && d.doc_type !== 'receipt' ? 'unpaid' : 'paid',
    due_date: k === 'sale' && d.doc_type !== 'receipt' ? d.due_date || addDays(d.date, 30) : null,
  }));
  const switchType = (t: DocType) => setDoc((d) => ({
    ...d, doc_type: t,
    status: d.kind === 'sale' && t !== 'receipt' ? 'unpaid' : 'paid',
    due_date: d.kind === 'sale' && t !== 'receipt' ? d.due_date || addDays(d.date, 30) : d.due_date,
  }));

  function pickParty(name: string) {
    const p = parties.find((x) => x.name === name);
    setDoc((d) => ({
      ...d, party_name: name,
      party_address: p && !d.party_address ? p.address : d.party_address,
      party_tax_id: p && !d.party_tax_id ? p.tax_id : d.party_tax_id,
    }));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (quick && !(Number(quickTtc.replace(',', '.')) > 0)) return setError('Indiquez le montant total payé.');
    setBusy(true);
    setError('');
    try {
      const payload: DocInput = {
        ...doc,
        due_date: doc.due_date || null,
        lines: doc.lines.map((l) => ({
          ...l,
          description: l.description.trim() || doc.category || (sale ? 'Prestation' : 'Achat'),
          quantity: Number(l.quantity), unit_price: Number(l.unit_price), vat_rate: Number(l.vat_rate),
        })),
      };
      const saved = editing ? await api.updateDocument(Number(id), payload) : await api.createDocument(payload);
      if (files.length) await api.uploadAttachments(saved.id, files);
      navigate(`/app/pieces/${saved.id}`, { replace: true });
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const title = editing ? 'Modifier la pièce'
    : sale ? { invoice: 'Nouvelle facture de vente', receipt: 'Nouveau reçu de vente', quote: 'Nouveau devis' }[doc.doc_type]
    : 'Nouvel achat';

  return (
    <>
      <header className="page-head">
        <div className="row" style={{ gap: 14 }}>
          <button className="btn icon" onClick={() => navigate(-1)} aria-label="Retour"><Icon name="arrowLeft" /></button>
          <div>
            <h1 style={{ fontSize: '1.35rem' }}>{title}</h1>
            <p className="small muted">{sale ? 'Le numéro est attribué automatiquement à l’enregistrement.' : 'Photographiez le ticket ou joignez la facture du fournisseur.'}</p>
          </div>
        </div>
      </header>

      <div className="editor">
        <form onSubmit={submit} id="doc-form">
          <section className="card stack">
            {!editing && (
              <div className="seg" role="group" aria-label="Type d'opération">
                <button type="button" className={!sale ? 'on' : ''} onClick={() => switchKind('purchase')}>Achat / dépense</button>
                <button type="button" className={sale ? 'on' : ''} onClick={() => switchKind('sale')}>Vente</button>
              </div>
            )}
            <div className="seg" role="group" aria-label="Type de pièce">
              <button type="button" className={doc.doc_type === 'invoice' ? 'on' : ''} onClick={() => switchType('invoice')}>Facture</button>
              <button type="button" className={doc.doc_type === 'receipt' ? 'on' : ''} onClick={() => switchType('receipt')}>{sale ? 'Reçu' : 'Reçu / ticket'}</button>
              {sale && <button type="button" className={doc.doc_type === 'quote' ? 'on' : ''} onClick={() => switchType('quote')}>Devis</button>}
            </div>

            {!sale && (
              <div className="stack-sm" style={{ padding: 14, border: `1px dashed ${wantsPhoto && !files.length ? 'var(--accent)' : 'var(--border-strong)'}`, borderRadius: 12 }}>
                <strong className="small">Justificatif</strong>
                <span className="xs muted">Photo du ticket, scan ou PDF de la facture (10 Mo max par fichier).</span>
                <FilePickers onFiles={(f) => setFiles((x) => [...x, ...f])} />
                {(previews.length > 0 || existing.length > 0) && (
                  <div className="thumbs">
                    {existing.map((a) => (
                      <AttachmentThumb key={a.id} docId={Number(id)} att={a} onRemove={async () => {
                        if (!confirm('Retirer ce justificatif ?')) return;
                        await api.deleteAttachment(Number(id), a.id);
                        setExisting((x) => x.filter((y) => y.id !== a.id));
                      }} />
                    ))}
                    {previews.map((p, i) => (
                      <div className="thumb" key={i} title={p.f.name}>
                        {p.url ? <img src={p.url} alt={p.f.name} /> : <span><Icon name="file" size={22} /><br />{p.f.name.slice(0, 18)}</span>}
                        <button type="button" aria-label="Retirer" onClick={() => setFiles((x) => x.filter((_, j) => j !== i))}>×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="grid-form">
              <label className="field span-all">{sale ? 'Client' : 'Fournisseur'}
                <input required list="parties" value={doc.party_name} onChange={(e) => pickParty(e.target.value)} placeholder={sale ? 'Nom du client' : 'Nom du fournisseur ou du magasin'} />
                <datalist id="parties">{parties.map((p) => <option key={p.name} value={p.name} />)}</datalist>
              </label>
              <label className="field">Numéro
                <input className="num" value={doc.number || ''} onChange={(e) => set('number', e.target.value)}
                  placeholder={sale ? 'Automatique' : 'N° du ticket / de la facture'} readOnly={sale && !editing} />
              </label>
              <label className="field">Date<input type="date" required value={doc.date} onChange={(e) => set('date', e.target.value)} /></label>
              {(sale ? doc.doc_type !== 'receipt' : doc.doc_type === 'invoice') && (
                <label className="field">{doc.doc_type === 'quote' ? 'Valable jusqu’au' : 'Échéance'}
                  <input type="date" value={doc.due_date || ''} onChange={(e) => set('due_date', e.target.value || null)} />
                </label>
              )}
              {doc.doc_type !== 'quote' && (
                <label className="field">Statut
                  <select value={doc.status} onChange={(e) => set('status', e.target.value as DocInput['status'])}>
                    <option value="paid">Payé</option>
                    <option value="unpaid">Non payé</option>
                  </select>
                </label>
              )}
              <details className="span-all">
                <summary className="small" style={{ cursor: 'pointer', color: 'var(--text-2)' }}>Adresse et NINEA du {sale ? 'client' : 'fournisseur'}</summary>
                <div className="grid-form" style={{ marginTop: 12 }}>
                  <label className="field">Adresse<input value={doc.party_address || ''} onChange={(e) => set('party_address', e.target.value)} /></label>
                  <label className="field">{company?.accounting_plan === 'pcg' ? 'N° TVA' : 'NINEA'}<input value={doc.party_tax_id || ''} onChange={(e) => set('party_tax_id', e.target.value)} /></label>
                </div>
              </details>
            </div>
          </section>

          <section className="card stack">
            <div className="between">
              <h2>{quick ? 'Montant' : 'Lignes'}</h2>
              {!sale && (
                <div className="seg" role="group" aria-label="Mode de saisie">
                  <button type="button" className={quick ? 'on' : ''} onClick={() => { setQuick(true); applyQuick(quickTtc || String((totals.ht + totals.tva) / 100 || ''), quickRate); }}>Montant total</button>
                  <button type="button" className={!quick ? 'on' : ''} onClick={() => setQuick(false)}>Détail</button>
                </div>
              )}
            </div>

            {quick ? (
              <div className="grid-form">
                <label className="field">Montant payé (TTC)
                  <input className="num" inputMode="decimal" required value={quickTtc} placeholder="0" style={{ fontSize: 22, height: 52 }}
                    onChange={(e) => applyQuick(e.target.value, quickRate)} />
                </label>
                <label className="field">TVA comprise
                  <select value={quickRate} onChange={(e) => applyQuick(quickTtc, Number(e.target.value))}>
                    {[...new Set([vat, 18, 10, 0])].map((r) => <option key={r} value={r}>{r} %</option>)}
                  </select>
                </label>
                <label className="field span-all">Description (facultatif)
                  <input value={doc.lines[0]?.description || ''} placeholder="Ex. Gasoil, fournitures, repas…" onChange={(e) => setLine(0, { description: e.target.value })} />
                </label>
              </div>
            ) : (
              <>
                <div className="lines">
                  <div className="line head"><span>Désignation</span><span>Qté</span><span>P.U. HT</span><span>TVA %</span><span className="right">Total HT</span><span /></div>
                  {doc.lines.map((l, i) => (
                    <div className="line" key={i}>
                      <input aria-label="Désignation" placeholder="Désignation" value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} />
                      <input aria-label="Quantité" className="num" type="number" min="0.001" step="any" required value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value as unknown as number })} />
                      <input aria-label="Prix unitaire HT" className="num" type="number" min="0" step="any" required value={l.unit_price} onChange={(e) => setLine(i, { unit_price: e.target.value as unknown as number })} />
                      <input aria-label="Taux de TVA" className="num" type="number" min="0" max="100" step="any" value={l.vat_rate} onChange={(e) => setLine(i, { vat_rate: e.target.value as unknown as number })} />
                      <span className="num right lt">{money(lineTotals(l).ht / 100, cur)}</span>
                      <button type="button" className="btn ghost icon" aria-label="Supprimer la ligne" disabled={doc.lines.length === 1}
                        onClick={() => setDoc((d) => ({ ...d, lines: d.lines.filter((_, j) => j !== i) }))}><Icon name="x" /></button>
                    </div>
                  ))}
                </div>
                <button type="button" className="btn dashed" style={{ alignSelf: 'flex-start' }}
                  onClick={() => setDoc((d) => ({ ...d, lines: [...d.lines, { description: '', quantity: 1, unit_price: 0, vat_rate: vat }] }))}>
                  <Icon name="plus" />Ajouter une ligne
                </button>
              </>
            )}
            <div className="totals">
              <div><span className="muted">Total HT</span><span className="num">{money(totals.ht / 100, cur)}</span></div>
              <div><span className="muted">TVA</span><span className="num">{money(totals.tva / 100, cur)}</span></div>
              <div className="grand"><span>Total TTC</span><span className="num">{money((totals.ht + totals.tva) / 100, cur)}</span></div>
            </div>
          </section>

          <section className="card stack">
            {doc.doc_type !== 'quote' && (
              <div className="stack-sm">
                <span className="small strong">{sale ? 'Mode de paiement' : 'Payé par'}</span>
                <div className="chips">
                  {PAYMENT_METHODS.map((m) => (
                    <button type="button" key={m} className={`chip ${doc.payment_method === m ? 'on' : ''}`}
                      onClick={() => set('payment_method', doc.payment_method === m ? '' : m)}>{m}</button>
                  ))}
                </div>
              </div>
            )}
            <div className="stack-sm">
              <span className="small strong">Catégorie</span>
              <div className="chips">
                {categories.slice(0, 8).map((c) => (
                  <button type="button" key={c} className={`chip ${doc.category === c ? 'on' : ''}`}
                    onClick={() => set('category', doc.category === c ? '' : c)}>{c}</button>
                ))}
              </div>
              <input className="input" list="categories" placeholder="Autre catégorie…" value={doc.category || ''} onChange={(e) => set('category', e.target.value)} aria-label="Catégorie" />
              <datalist id="categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
            </div>
            {sale && (
              <div className="stack-sm">
                <span className="small strong">Pièces jointes (facultatif)</span>
                <FilePickers compact onFiles={(f) => setFiles((x) => [...x, ...f])} />
                {(files.length > 0 || existing.length > 0) && (
                  <div className="thumbs">
                    {existing.map((a) => <AttachmentThumb key={a.id} docId={Number(id)} att={a} />)}
                    {previews.map((p, i) => (
                      <div className="thumb" key={i}>{p.url ? <img src={p.url} alt={p.f.name} /> : p.f.name.slice(0, 18)}
                        <button type="button" aria-label="Retirer" onClick={() => setFiles((x) => x.filter((_, j) => j !== i))}>×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            <label className="field">{sale ? 'Note imprimée sur la pièce' : 'Notes'}
              <textarea rows={2} value={doc.notes || ''} onChange={(e) => set('notes', e.target.value)} placeholder={sale ? 'Ex. Merci pour votre confiance.' : ''} />
            </label>
          </section>

          {error && <p className="error" role="alert">{error}</p>}
          <div className="row sticky-actions" style={{ justifyContent: 'flex-end' }}>
            <Link className="btn lg" to={-1 as unknown as string} onClick={(e) => { e.preventDefault(); navigate(-1); }}>Annuler</Link>
            <button className="btn dark lg grow" style={{ maxWidth: 360 }} disabled={busy}>
              {busy ? 'Enregistrement…' : editing ? 'Enregistrer les modifications' : sale ? 'Enregistrer' : 'Enregistrer l’achat'}
            </button>
          </div>
        </form>

        <aside>
          <span className="eyebrow">Aperçu en direct</span>
          <InvoicePreview doc={doc} company={company} totals={totals} />
        </aside>
      </div>
    </>
  );
}

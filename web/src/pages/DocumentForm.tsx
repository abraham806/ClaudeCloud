import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, type DocInput, type Kind, type Line } from '../api';
import { useAuth } from '../auth';
import { DEFAULT_CATEGORIES, PAYMENT_METHODS, money, today } from '../format';

const emptyLine = (): Line => ({ description: '', quantity: 1, unit_price: 0, vat_rate: 20 });

function lineTotals(l: Line) {
  const ht = Math.round(l.quantity * l.unit_price * 100);
  const tva = Math.round((ht * l.vat_rate) / 100);
  return { ht, tva };
}

export default function DocumentForm() {
  const { id } = useParams();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const { company } = useAuth();
  const editing = Boolean(id);

  const [doc, setDoc] = useState<DocInput>({
    kind: (search.get('kind') as Kind) || 'purchase',
    doc_type: 'invoice', number: '', date: today(), due_date: null, party_name: '', party_address: '',
    party_tax_id: '', category: '', payment_method: '', status: 'paid', notes: '', lines: [emptyLine()],
  });
  const [files, setFiles] = useState<File[]>([]);
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.categories().then((c) => setCategories([...new Set([...c, ...DEFAULT_CATEGORIES])]));
    if (id) {
      api.getDocument(Number(id)).then((d) => setDoc({ ...d, lines: d.lines || [emptyLine()] }));
    }
  }, [id]);

  const set = <K extends keyof DocInput>(k: K, v: DocInput[K]) => setDoc((d) => ({ ...d, [k]: v }));
  const setLine = (i: number, patch: Partial<Line>) =>
    setDoc((d) => ({ ...d, lines: d.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) }));

  const totals = doc.lines.reduce(
    (acc, l) => {
      const t = lineTotals(l);
      return { ht: acc.ht + t.ht, tva: acc.tva + t.tva };
    },
    { ht: 0, tva: 0 },
  );
  const cur = company?.currency || 'EUR';
  const isPurchase = doc.kind === 'purchase';

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const payload = { ...doc, due_date: doc.due_date || null };
      const saved = editing ? await api.updateDocument(Number(id), payload) : await api.createDocument(payload);
      if (files.length) await api.uploadAttachments(saved.id, files);
      navigate(`/documents/${saved.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <header className="page-head">
        <h1>{editing ? 'Modifier la pièce' : isPurchase ? 'Nouvel achat' : 'Nouvelle vente'}</h1>
      </header>

      <div className="card">
        <div className="segmented">
          {(['purchase', 'sale'] as const).map((k) => (
            <button type="button" key={k} className={doc.kind === k ? 'active' : ''} onClick={() => set('kind', k)}>
              {k === 'purchase' ? 'Achat / dépense' : 'Vente'}
            </button>
          ))}
        </div>
        <div className="form-grid">
          <label>Type de pièce
            <select value={doc.doc_type} onChange={(e) => set('doc_type', e.target.value as DocInput['doc_type'])}>
              <option value="invoice">Facture</option>
              <option value="receipt">Reçu / ticket</option>
            </select>
          </label>
          <label>Numéro
            <input value={doc.number || ''} onChange={(e) => set('number', e.target.value)}
              placeholder={isPurchase ? 'N° de la facture fournisseur' : 'Automatique'} />
          </label>
          <label>Date<input type="date" required value={doc.date} onChange={(e) => set('date', e.target.value)} /></label>
          <label>Échéance<input type="date" value={doc.due_date || ''} onChange={(e) => set('due_date', e.target.value)} /></label>
          <label className="span-2">{isPurchase ? 'Fournisseur' : 'Client'}
            <input required value={doc.party_name} onChange={(e) => set('party_name', e.target.value)} />
          </label>
          <label>Adresse<input value={doc.party_address || ''} onChange={(e) => set('party_address', e.target.value)} /></label>
          <label>N° fiscal / TVA<input value={doc.party_tax_id || ''} onChange={(e) => set('party_tax_id', e.target.value)} /></label>
          <label>Catégorie
            <input list="categories" value={doc.category || ''} onChange={(e) => set('category', e.target.value)} />
            <datalist id="categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
          </label>
          <label>Mode de paiement
            <select value={doc.payment_method || ''} onChange={(e) => set('payment_method', e.target.value)}>
              <option value="">—</option>
              {PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}
            </select>
          </label>
          <label>Statut
            <select value={doc.status} onChange={(e) => set('status', e.target.value as DocInput['status'])}>
              <option value="paid">Payé</option>
              <option value="unpaid">Non payé</option>
            </select>
          </label>
        </div>
      </div>

      <div className="card">
        <h2>Détail</h2>
        <div className="lines">
          <div className="line head"><span>Désignation</span><span>Qté</span><span>P.U. HT</span><span>TVA %</span><span className="num">Total HT</span><span /></div>
          {doc.lines.map((l, i) => (
            <div className="line" key={i}>
              <input required placeholder="Désignation" value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} />
              <input type="number" min="0.001" step="any" required value={l.quantity} onChange={(e) => setLine(i, { quantity: Number(e.target.value) })} />
              <input type="number" min="0" step="0.01" required value={l.unit_price} onChange={(e) => setLine(i, { unit_price: Number(e.target.value) })} />
              <input type="number" min="0" max="100" step="any" value={l.vat_rate} onChange={(e) => setLine(i, { vat_rate: Number(e.target.value) })} />
              <span className="num">{money(lineTotals(l).ht / 100, cur)}</span>
              <button type="button" className="icon" title="Supprimer la ligne" disabled={doc.lines.length === 1}
                onClick={() => setDoc((d) => ({ ...d, lines: d.lines.filter((_, j) => j !== i) }))}>✕</button>
            </div>
          ))}
        </div>
        <button type="button" className="link" onClick={() => setDoc((d) => ({ ...d, lines: [...d.lines, emptyLine()] }))}>+ Ajouter une ligne</button>
        <dl className="totals">
          <dt>Total HT</dt><dd>{money(totals.ht / 100, cur)}</dd>
          <dt>TVA</dt><dd>{money(totals.tva / 100, cur)}</dd>
          <dt className="strong">Total TTC</dt><dd className="strong">{money((totals.ht + totals.tva) / 100, cur)}</dd>
        </dl>
      </div>

      <div className="card">
        <h2>Justificatifs</h2>
        <p className="muted small">Photo du ticket, scan ou PDF de la facture (10 Mo max par fichier).</p>
        <input type="file" multiple accept="application/pdf,image/*"
          onChange={(e) => setFiles(Array.from(e.target.files || []))} />
        {files.length > 0 && <ul className="small">{files.map((f) => <li key={f.name}>{f.name}</li>)}</ul>}
        <label>Notes<textarea rows={3} value={doc.notes || ''} onChange={(e) => set('notes', e.target.value)} /></label>
      </div>

      {error && <p className="error">{error}</p>}
      <div className="actions end">
        <button type="button" onClick={() => navigate(-1)}>Annuler</button>
        <button className="primary" disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button>
      </div>
    </form>
  );
}

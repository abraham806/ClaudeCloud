import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, type CustomValue, type DocInput, type DocType, type FieldType, type LineColumn, type Party } from '../api';
import { useAuth } from '../auth';
import { CustomFieldInputs, FIELD_TYPE_LABEL, fieldsFor, useFields } from '../fields';
import { PAYMENT_METHODS, addDays, initials, money, today } from '../format';
import { Icon } from '../icons';

// Création de facture « feuille de travail » (bêta) : la facture se remplit directement,
// ligne par ligne, avec les colonnes que l'entreprise a définies.

interface Row { key: string; description: string; quantity: string; unit_price: string; values: Record<string, CustomValue> }
interface Draft {
  doc_type: DocType; party_name: string; party_address: string; party_tax_id: string; date: string; due_date: string;
  vat: number; payment_method: string; notes: string; custom_values: Record<string, CustomValue>; rows: Row[];
}

const DRAFT_KEY = 'leukflow.invoice-draft';
const uid = () => Math.random().toString(36).slice(2, 10).padEnd(8, '0');
const newRow = (): Row => ({ key: uid(), description: '', quantity: '1', unit_price: '', values: {} });
const num = (v: string) => Number(String(v).replace(/\s/g, '').replace(',', '.')) || 0;
const TITLES: Record<DocType, string> = { invoice: 'Facture', receipt: 'Reçu', quote: 'Devis' };

function freshDraft(vat: number): Draft {
  return {
    doc_type: 'invoice', party_name: '', party_address: '', party_tax_id: '', date: today(), due_date: addDays(today(), 30),
    vat, payment_method: '', notes: '', custom_values: {}, rows: [newRow(), newRow()],
  };
}

function loadDraft(vat: number): Draft {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
    if (d?.rows?.length) return { ...freshDraft(vat), ...d };
  } catch { /* brouillon illisible : on repart de zéro */ }
  return freshDraft(vat);
}

export default function InvoiceBeta() {
  const { company, setCompany, user } = useAuth();
  const navigate = useNavigate();
  const isOwner = user?.role === 'owner';
  const canWrite = user?.role !== 'accountant';
  const cur = company?.currency || 'XOF';
  const columns = company?.line_columns || [];
  const docFields = fieldsFor(useFields(), 'sale');
  const [draft, setDraft] = useState<Draft>(() => loadDraft(company?.default_vat ?? 18));
  const [parties, setParties] = useState<Party[]>([]);
  const [editCols, setEditCols] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const focusRow = useRef<string | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  useEffect(() => { api.parties('sale').then(setParties, () => {}); }, []);
  // Brouillon gardé dans le navigateur : rien n'est perdu en changeant de page.
  useEffect(() => {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch { /* stockage indisponible */ }
  }, [draft]);
  // Après l'ajout d'une ligne au clavier, le curseur va dans sa première case.
  useEffect(() => {
    if (!focusRow.current) return;
    tableRef.current?.querySelector<HTMLInputElement>(`[data-row="${focusRow.current}"] input, [data-row="${focusRow.current}"] select`)?.focus();
    focusRow.current = null;
  }, [draft.rows.length]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const setRow = (key: string, patch: Partial<Row>) =>
    setDraft((d) => ({ ...d, rows: d.rows.map((r) => (r.key === key ? { ...r, ...patch } : r)) }));
  const setCell = (key: string, col: string, v: CustomValue | undefined) =>
    setDraft((d) => ({
      ...d,
      rows: d.rows.map((r) => {
        if (r.key !== key) return r;
        const values = { ...r.values };
        if (v === undefined || v === '') delete values[col];
        else values[col] = v;
        return { ...r, values };
      }),
    }));
  const addRow = (focus = false) => {
    const row = newRow();
    if (focus) focusRow.current = row.key;
    setDraft((d) => ({ ...d, rows: [...d.rows, row] }));
  };
  const removeRow = (key: string) => setDraft((d) => ({ ...d, rows: d.rows.length > 1 ? d.rows.filter((r) => r.key !== key) : [newRow()] }));
  const onCellKey = (e: KeyboardEvent, key: string) => {
    if (e.key !== 'Enter' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;
    e.preventDefault();
    if (draft.rows[draft.rows.length - 1].key === key) addRow(true);
  };

  const pickParty = (name: string) => {
    const p = parties.find((x) => x.name === name);
    setDraft((d) => ({
      ...d, party_name: name,
      party_address: p && !d.party_address ? p.address || '' : d.party_address,
      party_tax_id: p && !d.party_tax_id ? p.tax_id || '' : d.party_tax_id,
    }));
  };

  const filled = draft.rows.filter((r) => r.description.trim() || num(r.unit_price) > 0);
  const totals = useMemo(() => {
    const ht = filled.reduce((s, r) => s + Math.round(num(r.quantity) * num(r.unit_price) * 100), 0);
    const tva = filled.reduce((s, r) => s + Math.round((Math.round(num(r.quantity) * num(r.unit_price) * 100) * draft.vat) / 100), 0);
    return { ht: ht / 100, tva: tva / 100, ttc: (ht + tva) / 100 };
  }, [filled, draft.vat]);

  async function save() {
    setError('');
    if (!draft.party_name.trim()) return setError('Indiquez le client (« Facturé à »).');
    if (!filled.length) return setError('Ajoutez au moins une ligne avec une désignation et un prix.');
    const payload: DocInput = {
      kind: 'sale', doc_type: draft.doc_type, number: '', date: draft.date,
      due_date: draft.doc_type === 'receipt' ? null : draft.due_date || null,
      party_name: draft.party_name.trim(), party_address: draft.party_address, party_tax_id: draft.party_tax_id,
      category: '', payment_method: draft.payment_method, status: draft.doc_type === 'receipt' ? 'paid' : 'unpaid',
      notes: draft.notes, custom_values: draft.custom_values,
      lines: filled.map((r) => ({
        description: r.description.trim() || 'Article', quantity: num(r.quantity) || 1, unit_price: num(r.unit_price),
        vat_rate: draft.vat, custom_values: r.values,
      })),
    };
    setBusy(true);
    try {
      const saved = await api.createDocument(payload);
      localStorage.removeItem(DRAFT_KEY);
      navigate(`/app/pieces/${saved.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  const reset = () => {
    if (filled.length && !confirm('Effacer cette facture en cours ?')) return;
    setDraft(freshDraft(company?.default_vat ?? 18));
    setError('');
  };

  if (!canWrite) {
    return <div className="card empty">La création de factures est réservée au propriétaire et aux collaborateurs.</div>;
  }

  const grid = { gridTemplateColumns: `minmax(180px, 2.2fr) ${columns.map(() => 'minmax(120px, 1fr)').join(' ')} 84px 130px 130px 40px` };

  return (
    <>
      <header className="page-head">
        <div>
          <p className="sub row" style={{ gap: 6 }}>Ventes <span className="pill quote">Bêta</span></p>
          <h1>Création de facture</h1>
        </div>
        <div className="row">
          <button className="btn" onClick={reset}><Icon name="file" />Nouvelle</button>
          {isOwner && <button className={`btn ${editCols ? 'navy' : ''}`} onClick={() => setEditCols((v) => !v)}><Icon name="sliders" />Colonnes</button>}
          <button className="btn dark" disabled={busy} onClick={save}><Icon name="check" />{busy ? 'Enregistrement…' : 'Enregistrer'}</button>
        </div>
      </header>

      {editCols && (
        <ColumnsEditor
          initial={columns}
          onClose={() => setEditCols(false)}
          onSave={async (cols) => { setCompany(await api.saveLineColumns(cols)); setEditCols(false); }}
        />
      )}

      <article className="card inv">
        {/* En-tête : type de pièce et émetteur */}
        <div className="inv-head">
          <div className="stack-sm" style={{ gap: 10 }}>
            <h2 className="inv-title">{TITLES[draft.doc_type]}<span> de vente</span></h2>
            <div className="seg inv-type">
              {(['invoice', 'receipt', 'quote'] as DocType[]).map((t) => (
                <button key={t} type="button" className={draft.doc_type === t ? 'on' : ''} onClick={() => set('doc_type', t)}>{TITLES[t]}</button>
              ))}
            </div>
          </div>
          <div className="inv-brand">
            <span className="inv-logo">{initials(company?.name || '')}</span>
            <strong>{company?.name}</strong>
            {company?.address && <span className="xs muted">{company.address}</span>}
            {company?.tax_id && <span className="xs muted">NINEA {company.tax_id}</span>}
          </div>
        </div>

        {/* Client et détails */}
        <div className="inv-parties">
          <section className="stack-sm">
            <h3 className="inv-label">Facturé à</h3>
            <input className="inv-in strong-in" list="beta-parties" placeholder="Nom du client" value={draft.party_name} onChange={(e) => pickParty(e.target.value)} aria-label="Client" />
            <datalist id="beta-parties">{parties.map((p) => <option key={p.name} value={p.name} />)}</datalist>
            <input className="inv-in" placeholder="Adresse" value={draft.party_address} onChange={(e) => set('party_address', e.target.value)} aria-label="Adresse du client" />
            <input className="inv-in" placeholder={company?.accounting_plan === 'pcg' ? 'N° TVA' : 'NINEA'} value={draft.party_tax_id} onChange={(e) => set('party_tax_id', e.target.value)} aria-label="NINEA du client" />
          </section>
          <section className="stack-sm">
            <h3 className="inv-label">Détails</h3>
            <dl className="inv-details">
              <dt>Date d’émission</dt><dd><input className="inv-in" type="date" value={draft.date} onChange={(e) => set('date', e.target.value)} aria-label="Date d’émission" /></dd>
              {draft.doc_type !== 'receipt' && (
                <><dt>{draft.doc_type === 'quote' ? 'Valable jusqu’au' : 'Échéance'}</dt>
                <dd><input className="inv-in" type="date" value={draft.due_date} onChange={(e) => set('due_date', e.target.value)} aria-label="Échéance" /></dd></>
              )}
              <dt>Numéro</dt><dd className="muted small" style={{ padding: '0 10px' }}>Attribué à l’enregistrement</dd>
            </dl>
          </section>
        </div>
        {docFields.length > 0 && (
          <div className="inv-vars">
            <CustomFieldInputs fields={docFields} values={draft.custom_values}
              onChange={(id, v) => setDraft((d) => {
                const next = { ...d.custom_values };
                if (v === undefined) delete next[String(id)]; else next[String(id)] = v;
                return { ...d, custom_values: next };
              })} />
          </div>
        )}

        {/* Lignes */}
        <div className="inv-table" ref={tableRef}>
          <div className="inv-row inv-th" style={grid}>
            <span>Désignation</span>
            {columns.map((c) => <span key={c.id}>{c.label}</span>)}
            <span className="r">Qté</span><span className="r">Prix unitaire</span><span className="r">Total</span><span />
          </div>
          {draft.rows.map((r, i) => (
            <div key={r.key} className="inv-row" style={grid} data-row={r.key} onKeyDown={(e) => onCellKey(e, r.key)}>
              <label className="cell wide">
                <span className="cell-label">Désignation · ligne {i + 1}</span>
                <input className="inv-in" value={r.description} placeholder="Produit ou service" onChange={(e) => setRow(r.key, { description: e.target.value })} />
              </label>
              {columns.map((c) => (
                <label key={c.id} className="cell">
                  <span className="cell-label">{c.label}</span>
                  <CellInput col={c} value={r.values[c.id]} onChange={(v) => setCell(r.key, c.id, v)} />
                </label>
              ))}
              <label className="cell">
                <span className="cell-label">Qté</span>
                <input className="inv-in num r" inputMode="decimal" value={r.quantity} onChange={(e) => setRow(r.key, { quantity: e.target.value })} />
              </label>
              <label className="cell">
                <span className="cell-label">Prix unitaire HT</span>
                <input className="inv-in num r" inputMode="decimal" placeholder="0" value={r.unit_price} onChange={(e) => setRow(r.key, { unit_price: e.target.value })} />
              </label>
              <span className="cell total num r"><span className="cell-label">Total HT</span>{money(num(r.quantity) * num(r.unit_price), cur)}</span>
              <button type="button" className="btn ghost sm icon row-del" aria-label={`Supprimer la ligne ${i + 1}`} onClick={() => removeRow(r.key)}><Icon name="trash" /></button>
            </div>
          ))}
          <button type="button" className="btn dashed inv-add" onClick={() => addRow(true)}><Icon name="plus" />Ajouter une ligne</button>
        </div>

        {/* Totaux */}
        <div className="inv-totals">
          <div><span>Sous-total HT</span><span className="num">{money(totals.ht, cur)}</span></div>
          <div>
            <span className="row" style={{ gap: 6 }}>TVA
              <select className="inv-in inv-vat" value={draft.vat} onChange={(e) => set('vat', Number(e.target.value))} aria-label="Taux de TVA">
                {[...new Set([company?.default_vat ?? 18, 18, 10, 0])].map((v) => <option key={v} value={v}>{v} %</option>)}
              </select>
            </span>
            <span className="num">{money(totals.tva, cur)}</span>
          </div>
          <div className="due"><span>Total à payer</span><span className="num">{money(totals.ttc, cur)}</span></div>
        </div>

        {/* Paiement et contact */}
        <div className="inv-foot">
          <section className="stack-sm">
            <h3 className="inv-label">Paiement</h3>
            <div className="chips">
              {PAYMENT_METHODS.map((m) => (
                <button type="button" key={m} className={`chip ${draft.payment_method === m ? 'on' : ''}`} onClick={() => set('payment_method', draft.payment_method === m ? '' : m)}>{m}</button>
              ))}
            </div>
            {company?.invoice_footer
              ? <p className="small muted" style={{ whiteSpace: 'pre-line' }}>{company.invoice_footer}</p>
              : isOwner && <Link className="small" to="/app/parametres">Ajouter vos coordonnées de paiement (Wave, banque…)</Link>}
          </section>
          <section className="stack-sm">
            <h3 className="inv-label">Note</h3>
            <textarea className="inv-in" rows={3} placeholder="Ex. Merci pour votre confiance." value={draft.notes} onChange={(e) => set('notes', e.target.value)} aria-label="Note" />
            {(company?.email || company?.phone) && (
              <span className="xs muted">Contact : {[company.email, company.phone].filter(Boolean).join(' · ')}</span>
            )}
          </section>
        </div>
      </article>

      {error && <p className="error" role="alert">{error}</p>}
      <div className="row sticky-actions" style={{ justifyContent: 'flex-end' }}>
        <span className="small muted grow">Brouillon enregistré automatiquement dans ce navigateur.</span>
        <button className="btn dark lg" disabled={busy} onClick={save}>{busy ? 'Enregistrement…' : `Enregistrer · ${money(totals.ttc, cur)}`}</button>
      </div>
    </>
  );
}

// Case d'une colonne personnalisée, selon son type.
function CellInput({ col, value, onChange }: { col: LineColumn; value: CustomValue | undefined; onChange: (v: CustomValue | undefined) => void }) {
  const v = value === undefined ? '' : String(value);
  if (col.field_type === 'select') {
    return (
      <select className="inv-in" value={v} onChange={(e) => onChange(e.target.value || undefined)}>
        <option value="">—</option>
        {col.options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  if (col.field_type === 'checkbox') {
    return <span className="inv-check"><input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked || undefined)} /></span>;
  }
  return (
    <input
      className={`inv-in ${col.field_type === 'number' ? 'num r' : ''}`}
      type={col.field_type === 'date' ? 'date' : 'text'}
      inputMode={col.field_type === 'number' ? 'decimal' : undefined}
      value={v}
      onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value)}
    />
  );
}

// Définition des colonnes des lignes (propre à l'entreprise).
function ColumnsEditor({ initial, onClose, onSave }: { initial: LineColumn[]; onClose: () => void; onSave: (c: LineColumn[]) => Promise<void> }) {
  const [cols, setCols] = useState<LineColumn[]>(initial);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const fresh = new Set(cols.filter((c) => !initial.some((i) => i.id === c.id)).map((c) => c.id));
  const patch = (id: string, p: Partial<LineColumn>) => setCols((x) => x.map((c) => (c.id === id ? { ...c, ...p } : c)));
  const move = (i: number, d: -1 | 1) => setCols((x) => {
    const n = [...x];
    [n[i], n[i + d]] = [n[i + d], n[i]];
    return n;
  });

  async function submit() {
    setError('');
    const clean = cols.map((c) => ({ ...c, label: c.label.trim(), options: c.field_type === 'select' ? c.options : [] }));
    if (clean.some((c) => !c.label)) return setError('Donnez un nom à chaque colonne.');
    if (clean.some((c) => c.field_type === 'select' && !c.options.length)) return setError('Ajoutez au moins un choix aux colonnes « Liste de choix ».');
    setBusy(true);
    try {
      await onSave(clean);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <section className="card stack cols-editor">
      <div className="between">
        <div className="stack-sm" style={{ gap: 2 }}>
          <h2>Colonnes des lignes</h2>
          <span className="small muted">Désignation, quantité, prix et total sont toujours présents. Ajoutez vos colonnes : taille, couleur, référence…</span>
        </div>
        <button type="button" className="btn ghost icon" aria-label="Fermer" onClick={onClose}><Icon name="x" /></button>
      </div>
      {cols.length === 0 && <p className="small muted">Aucune colonne personnalisée pour l’instant.</p>}
      {cols.map((c, i) => (
        <div key={c.id} className="col-edit">
          <input className="input" value={c.label} maxLength={40} placeholder="Nom de la colonne" onChange={(e) => patch(c.id, { label: e.target.value })} aria-label="Nom de la colonne" />
          <select className="input" value={c.field_type} disabled={!fresh.has(c.id)} onChange={(e) => patch(c.id, { field_type: e.target.value as FieldType })} aria-label="Type de valeur">
            {(Object.keys(FIELD_TYPE_LABEL) as FieldType[]).map((t) => <option key={t} value={t}>{FIELD_TYPE_LABEL[t]}</option>)}
          </select>
          <span className="row col-actions" style={{ gap: 2, flexWrap: 'nowrap' }}>
            <button type="button" className="btn ghost sm icon" aria-label="Vers la gauche" disabled={i === 0} onClick={() => move(i, -1)}><Icon name="arrowUp" /></button>
            <button type="button" className="btn ghost sm icon" aria-label="Vers la droite" disabled={i === cols.length - 1} onClick={() => move(i, 1)}><Icon name="arrowDown" /></button>
            <button type="button" className="btn ghost sm icon" aria-label={`Supprimer ${c.label || 'la colonne'}`} onClick={() => setCols((x) => x.filter((y) => y.id !== c.id))}><Icon name="trash" /></button>
          </span>
          {c.field_type === 'select' && (
            <input className="input span-all" placeholder="Choix séparés par des virgules : Petit, Moyen, Grand"
              defaultValue={c.options.join(', ')}
              onChange={(e) => patch(c.id, { options: [...new Set(e.target.value.split(',').map((o) => o.trim()).filter(Boolean))] })} />
          )}
        </div>
      ))}
      <div className="row">
        <button type="button" className="btn dashed" disabled={cols.length >= 10} onClick={() => setCols((x) => [...x, { id: uid(), label: '', field_type: 'text', options: [] }])}>
          <Icon name="plus" />Ajouter une colonne
        </button>
        <span className="grow" />
        <button type="button" className="btn" onClick={onClose}>Annuler</button>
        <button type="button" className="btn dark" disabled={busy} onClick={submit}>{busy ? 'Enregistrement…' : 'Enregistrer les colonnes'}</button>
      </div>
      {error && <p className="error">{error}</p>}
      <span className="xs muted">Supprimer une colonne la retire des prochaines factures ; les valeurs déjà saisies ne s’affichent plus.</span>
    </section>
  );
}

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { api, type CustomField, type FieldInput, type FieldType } from '../api';
import { useAuth } from '../auth';
import { APPLIES_LABEL, FIELD_TYPE_LABEL } from '../fields';
import { Icon } from '../icons';

const EMPTY: FieldInput = { label: '', field_type: 'text', options: [], applies_to: 'all', required: false, on_document: true };

// Exemples proposés au départ : rien n'est créé tant que l'utilisateur ne les valide pas.
const EXAMPLES: (Partial<FieldInput> & { label: string })[] = [
  { label: 'Type de client', field_type: 'select', options: ['Particulier', 'Entreprise', 'Abonné'], applies_to: 'sale' },
  { label: 'Code vendeur', field_type: 'text', applies_to: 'sale', on_document: false },
  { label: 'Référence commande', field_type: 'text' },
  { label: 'Date de livraison', field_type: 'date', applies_to: 'sale' },
  { label: 'Nombre de colis', field_type: 'number' },
  { label: 'Livré', field_type: 'checkbox', applies_to: 'sale', on_document: false },
];

export default function Variables() {
  const { user } = useAuth();
  const isOwner = user?.role === 'owner';
  const [fields, setFields] = useState<CustomField[] | null>(null);
  const [editing, setEditing] = useState<{ id: number | null; data: FieldInput } | null>(null);
  const [error, setError] = useState('');
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => { api.fields().then(setFields, (e) => setError(e.message)); }, []);

  const open = (id: number | null, data: FieldInput) => {
    setError('');
    setEditing({ id, data });
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 0);
  };

  async function move(index: number, dir: -1 | 1) {
    if (!fields) return;
    const next = [...fields];
    [next[index], next[index + dir]] = [next[index + dir], next[index]];
    setFields(next);
    setFields(await api.reorderFields(next.map((f) => f.id)));
  }

  async function remove(f: CustomField) {
    if (!confirm(`Supprimer la variable « ${f.label} » ? Les valeurs déjà saisies sur vos pièces seront effacées.`)) return;
    await api.deleteField(f.id);
    setFields((x) => x?.filter((y) => y.id !== f.id) || null);
    if (editing?.id === f.id) setEditing(null);
  }

  return (
    <>
      <header className="page-head">
        <div>
          <p className="sub">Configuration</p>
          <h1>Variables</h1>
        </div>
        {isOwner && fields && fields.length > 0 && !editing && (
          <button className="btn dark" onClick={() => open(null, EMPTY)}><Icon name="plus" />Nouvelle variable</button>
        )}
      </header>
      <p className="muted" style={{ maxWidth: 720, marginTop: -8 }}>
        Créez les informations propres à votre activité (type de client, code vendeur, référence…). Elles s’ajoutent au
        formulaire de vos ventes et achats, peuvent s’imprimer sur vos factures et apparaissent en colonnes dans l’export Excel.
      </p>

      <div className="vars">
        <div className="stack" style={{ minWidth: 0 }}>
          {fields === null ? (
            <div className="card empty">Chargement…</div>
          ) : fields.length === 0 ? (
            <section className="card stack vars-empty">
              <span className="vars-icon"><Icon name="sliders" size={22} /></span>
              <div className="stack-sm" style={{ gap: 4 }}>
                <h2>Aucune variable pour l’instant</h2>
                <span className="small muted">
                  {isOwner ? 'Commencez par une variable vide, ou partez d’un exemple que vous pourrez modifier.' : 'Le propriétaire du compte n’a pas encore créé de variable.'}
                </span>
              </div>
              {isOwner && (
                <>
                  <button className="btn dark" style={{ alignSelf: 'flex-start' }} onClick={() => open(null, EMPTY)}><Icon name="plus" />Créer une variable</button>
                  <div className="stack-sm">
                    <span className="xs muted">Exemples</span>
                    <div className="chips">
                      {EXAMPLES.map((ex) => (
                        <button key={ex.label} type="button" className="chip" onClick={() => open(null, { ...EMPTY, ...ex })}>
                          <Icon name="plus" size={12} /> {ex.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </section>
          ) : (
            <section className="card flush">
              {fields.map((f, i) => (
                <div key={f.id} className={`var-row ${editing?.id === f.id ? 'on' : ''}`}>
                  <span className="var-type" title={FIELD_TYPE_LABEL[f.field_type]}><Icon name={TYPE_ICON[f.field_type]} size={16} /></span>
                  <span className="grow stack-sm" style={{ gap: 4 }}>
                    <strong>{f.label}</strong>
                    <span className="row" style={{ gap: 6 }}>
                      <span className="pill soft">{FIELD_TYPE_LABEL[f.field_type]}</span>
                      <span className="pill soft">{APPLIES_LABEL[f.applies_to]}</span>
                      {f.required && <span className="pill unpaid">Obligatoire</span>}
                      {f.on_document && <span className="pill mint">Sur la facture</span>}
                    </span>
                    {f.field_type === 'select' && <span className="xs muted">{f.options.join(' · ')}</span>}
                  </span>
                  {isOwner && (
                    <span className="row var-actions" style={{ gap: 2, flexWrap: 'nowrap' }}>
                      <button className="btn ghost sm icon" aria-label="Monter" disabled={i === 0} onClick={() => move(i, -1)}><Icon name="arrowUp" /></button>
                      <button className="btn ghost sm icon" aria-label="Descendre" disabled={i === fields.length - 1} onClick={() => move(i, 1)}><Icon name="arrowDown" /></button>
                      <button className="btn ghost sm icon" aria-label={`Modifier ${f.label}`} onClick={() => open(f.id, {
                        label: f.label, field_type: f.field_type, options: f.options, applies_to: f.applies_to, required: f.required, on_document: f.on_document,
                      })}><Icon name="edit" /></button>
                      <button className="btn ghost sm icon" aria-label={`Supprimer ${f.label}`} onClick={() => remove(f)}><Icon name="trash" /></button>
                    </span>
                  )}
                </div>
              ))}
            </section>
          )}
          {error && !editing && <p className="error">{error}</p>}
        </div>

        {editing && (
          <FieldForm
            ref={formRef}
            initial={editing.data}
            isNew={editing.id === null}
            onCancel={() => setEditing(null)}
            onSave={async (data) => {
              const saved = editing.id === null ? await api.createField(data) : await api.updateField(editing.id, data);
              setFields((x) => (editing.id === null ? [...(x || []), saved] : (x || []).map((y) => (y.id === saved.id ? saved : y))));
              setEditing(null);
            }}
          />
        )}
      </div>
    </>
  );
}

const TYPE_ICON = { text: 'type', number: 'hash', date: 'calendar', select: 'list', checkbox: 'check' } as const;

function FieldForm({ initial, isNew, onCancel, onSave, ref }: {
  initial: FieldInput; isNew: boolean; onCancel: () => void; onSave: (d: FieldInput) => Promise<void>;
  ref: React.Ref<HTMLFormElement>;
}) {
  const [data, setData] = useState<FieldInput>(initial);
  const [option, setOption] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { setData(initial); setError(''); }, [initial]);
  const set = <K extends keyof FieldInput>(k: K, v: FieldInput[K]) => setData((d) => ({ ...d, [k]: v }));

  const addOption = () => {
    const v = option.trim();
    if (v && !data.options.includes(v)) set('options', [...data.options, v]);
    setOption('');
  };
  const onOptionKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addOption(); }
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    const pending = option.trim();
    const payload = { ...data, options: pending && !data.options.includes(pending) ? [...data.options, pending] : data.options };
    if (payload.field_type === 'select' && !payload.options.length) return setError('Ajoutez au moins un choix à la liste.');
    setBusy(true);
    setError('');
    try {
      await onSave(payload);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form ref={ref} className="card stack var-form" onSubmit={submit}>
      <div className="between">
        <h2>{isNew ? 'Nouvelle variable' : 'Modifier la variable'}</h2>
        <button type="button" className="btn ghost icon" aria-label="Fermer" onClick={onCancel}><Icon name="x" /></button>
      </div>
      <label className="field">Nom de la variable
        <input required autoFocus maxLength={80} value={data.label} onChange={(e) => set('label', e.target.value)} placeholder="Ex. Type de client" />
      </label>

      <div className="field">Type de valeur
        <div className="type-grid" role="radiogroup" aria-label="Type de valeur">
          {(Object.keys(FIELD_TYPE_LABEL) as FieldType[]).map((t) => (
            <button key={t} type="button" role="radio" aria-checked={data.field_type === t} disabled={!isNew && data.field_type !== t}
              className={`type-opt ${data.field_type === t ? 'on' : ''}`} onClick={() => set('field_type', t)}>
              <Icon name={TYPE_ICON[t]} size={16} />{FIELD_TYPE_LABEL[t]}
            </button>
          ))}
        </div>
        {!isNew && <span className="xs muted" style={{ fontWeight: 400 }}>Le type ne peut plus être changé après la création.</span>}
      </div>

      {data.field_type === 'select' && (
        <div className="field">Choix proposés
          {data.options.length > 0 && (
            <div className="chips">
              {data.options.map((o) => (
                <span key={o} className="chip tag">{o}
                  <button type="button" aria-label={`Retirer ${o}`} onClick={() => set('options', data.options.filter((x) => x !== o))}><Icon name="x" size={12} /></button>
                </span>
              ))}
            </div>
          )}
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <input className="input" value={option} onChange={(e) => setOption(e.target.value)} onKeyDown={onOptionKey} placeholder="Ex. Entreprise, puis Entrée" maxLength={80} />
            <button type="button" className="btn" onClick={addOption}>Ajouter</button>
          </div>
        </div>
      )}

      <div className="field">S’applique aux
        <div className="seg">
          {(['all', 'sale', 'purchase'] as const).map((a) => (
            <button key={a} type="button" className={data.applies_to === a ? 'on' : ''} onClick={() => set('applies_to', a)}>{APPLIES_LABEL[a]}</button>
          ))}
        </div>
      </div>

      <div className="stack-sm">
        {data.field_type !== 'checkbox' && (
          <label className="check"><input type="checkbox" checked={data.required} onChange={(e) => set('required', e.target.checked)} />
            <span>Obligatoire <span className="xs muted">— la pièce ne peut pas être enregistrée sans cette valeur</span></span></label>
        )}
        <label className="check"><input type="checkbox" checked={data.on_document} onChange={(e) => set('on_document', e.target.checked)} />
          <span>Afficher sur la facture <span className="xs muted">— imprimée sur le PDF</span></span></label>
      </div>

      {error && <p className="error">{error}</p>}
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn" onClick={onCancel}>Annuler</button>
        <button className="btn dark" disabled={busy}>{busy ? 'Enregistrement…' : isNew ? 'Créer la variable' : 'Enregistrer'}</button>
      </div>
    </form>
  );
}

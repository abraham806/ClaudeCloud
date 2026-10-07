import { useEffect, useState, type FormEvent } from 'react';
import { api, type Company, type Role, type User } from '../api';
import { useAuth } from '../auth';
import { CURRENCIES, initials } from '../format';
import { Icon } from '../icons';

const ROLE_LABEL: Record<Role, string> = { owner: 'Propriétaire', member: 'Collaborateur', accountant: 'Comptable (lecture seule)' };

export default function Settings() {
  const { company, setCompany, user, signOut } = useAuth();
  const isOwner = user?.role === 'owner';
  const [form, setForm] = useState<Company>(company!);
  const [msg, setMsg] = useState<{ ok?: string; err?: string }>({});
  const set = (k: keyof Company) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  async function saveCompany(e: FormEvent) {
    e.preventDefault();
    setMsg({});
    try {
      setCompany(await api.updateCompany({ ...form, default_vat: Number(form.default_vat) }));
      setMsg({ ok: 'Paramètres enregistrés.' });
    } catch (err) {
      setMsg({ err: (err as Error).message });
    }
  }

  return (
    <>
      <header className="page-head"><div><p className="sub">{company?.name}</p><h1>Paramètres</h1></div></header>
      <div className="grid-3">
        <form className="card stack span-2" onSubmit={saveCompany}>
          <div className="stack-sm" style={{ gap: 2 }}><h2>Entreprise</h2><span className="small muted">Ces informations apparaissent sur vos factures, reçus et devis.</span></div>
          <fieldset disabled={!isOwner} style={{ border: 0, padding: 0, margin: 0 }} className="stack">
            <div className="grid-form">
              <label className="field span-all">Raison sociale<input required value={form.name} onChange={set('name')} /></label>
              <label className="field span-all">Adresse<input value={form.address || ''} onChange={set('address')} placeholder="Ex. Rue 10, Médina, Dakar" /></label>
              <label className="field">Téléphone<input type="tel" value={form.phone || ''} onChange={set('phone')} placeholder="+221 …" /></label>
              <label className="field">Email<input type="email" value={form.email || ''} onChange={set('email')} /></label>
              <label className="field">{form.accounting_plan === 'pcg' ? 'N° TVA / SIRET' : 'NINEA'}<input value={form.tax_id || ''} onChange={set('tax_id')} /></label>
              <label className="field">RCCM<input value={form.rccm || ''} onChange={set('rccm')} placeholder="SN-DKR-…" /></label>
              <label className="field">Devise
                <select value={form.currency} onChange={set('currency')}>
                  {CURRENCIES.map(([c, l]) => <option key={c} value={c}>{l}</option>)}
                </select>
              </label>
              <label className="field">TVA par défaut (%)<input type="number" min="0" max="100" step="any" value={form.default_vat} onChange={set('default_vat')} /></label>
              <label className="field">Plan comptable (export)
                <select value={form.accounting_plan} onChange={set('accounting_plan')}>
                  <option value="syscohada">SYSCOHADA (Sénégal, zone OHADA)</option>
                  <option value="pcg">Plan comptable général (France)</option>
                </select>
              </label>
              <label className="field span-all">Pied de facture (mentions légales, coordonnées Wave / Orange Money, banque…)
                <textarea rows={3} value={form.invoice_footer || ''} onChange={set('invoice_footer')} />
              </label>
            </div>
            {msg.ok && <p className="success">{msg.ok}</p>}
            {msg.err && <p className="error">{msg.err}</p>}
            {isOwner && <button className="btn dark" style={{ alignSelf: 'flex-start' }}>Enregistrer</button>}
          </fieldset>
        </form>

        <div className="stack">
          <Team isOwner={isOwner} me={user!} />
          <Password />
          <button className="btn block" onClick={signOut}><Icon name="logout" />Se déconnecter</button>
        </div>
      </div>
    </>
  );
}

function Team({ isOwner, me }: { isOwner: boolean; me: User }) {
  const [users, setUsers] = useState<User[]>([]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'accountant' as Role });
  const [error, setError] = useState('');

  useEffect(() => { api.users().then(setUsers, () => {}); }, []);

  async function add(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const u = await api.addUser(form);
      setUsers((x) => [...x, u]);
      setAdding(false);
      setForm({ name: '', email: '', password: '', role: 'accountant' });
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <section className="card stack-sm" style={{ gap: 12 }}>
      <div className="between"><h2>Équipe</h2>{isOwner && !adding && <button className="btn sm" onClick={() => setAdding(true)}><Icon name="plus" />Ajouter</button>}</div>
      {users.map((u) => (
        <div key={u.id} className="row" style={{ flexWrap: 'nowrap' }}>
          <span className="avatar">{initials(u.name)}</span>
          <span className="grow stack-sm" style={{ gap: 0 }}><strong className="small">{u.name}{u.id === me.id ? ' (vous)' : ''}</strong><span className="xs muted">{ROLE_LABEL[u.role]} · {u.email}</span></span>
          {isOwner && u.role !== 'owner' && (
            <button className="btn ghost icon" aria-label={`Retirer ${u.name}`} onClick={async () => {
              if (!confirm(`Retirer l'accès de ${u.name} ?`)) return;
              await api.deleteUser(u.id);
              setUsers((x) => x.filter((y) => y.id !== u.id));
            }}><Icon name="trash" /></button>
          )}
        </div>
      ))}
      {adding && (
        <form className="stack-sm" onSubmit={add} style={{ gap: 10, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          <div className="seg">
            <button type="button" className={form.role === 'accountant' ? 'on' : ''} onClick={() => setForm({ ...form, role: 'accountant' })}>Comptable</button>
            <button type="button" className={form.role === 'member' ? 'on' : ''} onClick={() => setForm({ ...form, role: 'member' })}>Collaborateur</button>
          </div>
          <label className="field">Nom<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label className="field">Email<input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
          <label className="field">Mot de passe provisoire<input type="text" required minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
          <span className="xs muted">{form.role === 'accountant' ? 'Le comptable consulte les pièces et télécharge les exports, sans rien modifier.' : 'Le collaborateur peut saisir et modifier les pièces.'}</span>
          {error && <p className="error">{error}</p>}
          <div className="row"><button type="button" className="btn grow" onClick={() => setAdding(false)}>Annuler</button><button className="btn dark grow">Créer l'accès</button></div>
        </form>
      )}
    </section>
  );
}

function Password() {
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [msg, setMsg] = useState<{ ok?: string; err?: string }>({});
  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await api.changePassword(cur, next);
      setCur(''); setNext('');
      setMsg({ ok: 'Mot de passe modifié.' });
    } catch (err) {
      setMsg({ err: (err as Error).message });
    }
  }
  return (
    <form className="card stack-sm" style={{ gap: 10 }} onSubmit={submit}>
      <h2>Mot de passe</h2>
      <label className="field">Actuel<input type="password" autoComplete="current-password" required value={cur} onChange={(e) => setCur(e.target.value)} /></label>
      <label className="field">Nouveau (8 caractères min.)<input type="password" autoComplete="new-password" required minLength={8} value={next} onChange={(e) => setNext(e.target.value)} /></label>
      {msg.ok && <p className="success">{msg.ok}</p>}
      {msg.err && <p className="error">{msg.err}</p>}
      <button className="btn" style={{ alignSelf: 'flex-start' }}>Modifier</button>
    </form>
  );
}

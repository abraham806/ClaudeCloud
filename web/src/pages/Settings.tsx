import { useState, type FormEvent } from 'react';
import { api, type Company } from '../api';
import { useAuth } from '../auth';

export default function Settings() {
  const { company, setCompany, user } = useAuth();
  const [form, setForm] = useState<Company>(company!);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const set = (k: keyof Company) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });
  const isOwner = user?.role === 'owner';

  async function submit(e: FormEvent) {
    e.preventDefault();
    setMessage('');
    setError('');
    try {
      setCompany(await api.updateCompany(form));
      setMessage('Paramètres enregistrés.');
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <>
      <header className="page-head"><h1>Paramètres de l'entreprise</h1></header>
      <form className="card narrow" onSubmit={submit}>
        <p className="muted small">Ces informations apparaissent sur vos factures et reçus imprimés.</p>
        <fieldset disabled={!isOwner}>
          <div className="form-grid">
            <label className="span-2">Raison sociale<input required value={form.name} onChange={set('name')} /></label>
            <label className="span-2">Adresse<input value={form.address || ''} onChange={set('address')} /></label>
            <label>Téléphone<input value={form.phone || ''} onChange={set('phone')} /></label>
            <label>Email<input type="email" value={form.email || ''} onChange={set('email')} /></label>
            <label>N° fiscal (SIRET, NIF, RCCM…)<input value={form.tax_id || ''} onChange={set('tax_id')} /></label>
            <label>Devise (code ISO)<input required maxLength={3} value={form.currency} onChange={set('currency')} /></label>
            <label className="span-2">Pied de facture (mentions légales, coordonnées bancaires…)
              <textarea rows={3} value={form.invoice_footer || ''} onChange={set('invoice_footer')} />
            </label>
          </div>
          {message && <p className="success">{message}</p>}
          {error && <p className="error">{error}</p>}
          <button className="primary">Enregistrer</button>
        </fieldset>
      </form>
    </>
  );
}

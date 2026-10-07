import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';

export default function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', company_name: '', currency: 'EUR' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = mode === 'login' ? await api.login(form.email, form.password) : await api.register(form);
      await signIn(res.token);
      navigate('/');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <form className="card auth-card" onSubmit={submit}>
        <div className="brand"><span className="logo">F</span><strong>Facturo</strong></div>
        <h1>{mode === 'login' ? 'Connexion' : 'Créer mon compte'}</h1>
        <p className="muted">
          {mode === 'login'
            ? 'Vos factures, achats et ventes au même endroit.'
            : 'Fini les factures papier : saisissez, imprimez, exportez pour votre comptable.'}
        </p>
        {mode === 'register' && (
          <>
            <label>Votre nom<input required value={form.name} onChange={set('name')} /></label>
            <label>Nom de l'entreprise<input required value={form.company_name} onChange={set('company_name')} /></label>
            <label>Devise
              <select value={form.currency} onChange={set('currency')}>
                <option value="EUR">Euro (EUR)</option>
                <option value="XOF">Franc CFA BCEAO (XOF)</option>
                <option value="XAF">Franc CFA BEAC (XAF)</option>
                <option value="MAD">Dirham (MAD)</option>
                <option value="TND">Dinar tunisien (TND)</option>
                <option value="CHF">Franc suisse (CHF)</option>
                <option value="CAD">Dollar canadien (CAD)</option>
                <option value="USD">Dollar US (USD)</option>
              </select>
            </label>
          </>
        )}
        <label>Email<input type="email" required autoComplete="email" value={form.email} onChange={set('email')} /></label>
        <label>Mot de passe
          <input type="password" required minLength={mode === 'register' ? 8 : 1}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            value={form.password} onChange={set('password')} />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="primary" disabled={busy}>{busy ? '…' : mode === 'login' ? 'Se connecter' : 'Créer le compte'}</button>
        <p className="muted small">
          {mode === 'login'
            ? <>Pas encore de compte ? <Link to="/inscription">Inscrivez-vous</Link></>
            : <>Déjà inscrit ? <Link to="/connexion">Connectez-vous</Link></>}
        </p>
      </form>
    </div>
  );
}

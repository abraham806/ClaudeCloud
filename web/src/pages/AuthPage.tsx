import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, DEMO } from '../api';
import { useAuth } from '../auth';
import { CURRENCIES } from '../format';
import { ThemeToggle } from '../theme';

export default function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', company_name: '', currency: 'XOF' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });
  const login = mode === 'login';

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = login ? await api.login(form.email, form.password) : await api.register(form);
      await signIn(res.token);
      navigate('/app');
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <aside className="auth-side">
        <div className="grid-bg" />
        <div className="halo" style={{ left: '-20%', right: '-20%', bottom: -160, height: 360 }} />
        <Link to="/" className="brand" style={{ padding: 0 }}>
          <span className="logo">F</span>
          <span className="brand-text"><strong>Facturo</strong></span>
        </Link>
        <div className="stack" style={{ gap: 16 }}>
          <h2>Fini les carnets de factures et les tickets perdus.</h2>
          <p>Enregistrez vos achats en photo, éditez vos factures en FCFA et envoyez à votre comptable un fichier Excel propre à la fin du mois.</p>
        </div>
        <span className="small muted">Conçu à Dakar, pour les commerçants et les PME.</span>
      </aside>

      <div className="auth-form">
        <ThemeToggle className="auth-theme" />
        <form onSubmit={submit}>
          <Link to="/" className="brand show-mobile" style={{ padding: 0, marginBottom: 8 }}><span className="logo">F</span><span className="brand-text"><strong>Facturo</strong></span></Link>
          <h1>{login ? 'Connexion' : 'Créer mon compte'}</h1>
          <p className="muted small">{login ? 'Content de vous revoir.' : 'Gratuit pour démarrer. Aucune carte bancaire demandée.'}</p>
          {!login && (
            <>
              <label className="field">Votre nom<input required autoComplete="name" value={form.name} onChange={set('name')} /></label>
              <label className="field">Nom de l'entreprise<input required autoComplete="organization" value={form.company_name} onChange={set('company_name')} /></label>
              <label className="field">Devise
                <select value={form.currency} onChange={set('currency')}>
                  {CURRENCIES.map(([c, l]) => <option key={c} value={c}>{l}</option>)}
                </select>
              </label>
            </>
          )}
          <label className="field">Email<input type="email" required autoComplete="email" value={form.email} onChange={set('email')} /></label>
          <label className="field">Mot de passe
            <input type="password" required minLength={login ? 1 : 8} autoComplete={login ? 'current-password' : 'new-password'}
              value={form.password} onChange={set('password')} placeholder={login ? '' : '8 caractères minimum'} />
          </label>
          {DEMO && (
            <p className="xs muted note">
              Démo : le compte et les données sont créés uniquement dans ce navigateur. La première ouverture prend quelques secondes.
            </p>
          )}
          {error && <p className="error" role="alert">{error}</p>}
          <button className="btn dark lg block" disabled={busy}>{busy ? '…' : login ? 'Se connecter' : 'Créer mon compte'}</button>
          <p className="small muted" style={{ textAlign: 'center' }}>
            {login ? <>Pas encore de compte ? <Link to="/inscription">Inscrivez-vous</Link></> : <>Déjà inscrit ? <Link to="/connexion">Connectez-vous</Link></>}
          </p>
        </form>
      </div>
    </div>
  );
}

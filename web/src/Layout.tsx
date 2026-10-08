import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { api, DEMO } from './api';
import { useAuth } from './auth';
import { initials } from './format';
import { Icon } from './icons';

const NAV: { to: string; label: string; end?: boolean; badge?: boolean }[] = [
  { to: '/app', label: 'Aperçu', end: true },
  { to: '/app/ventes', label: 'Ventes' },
  { to: '/app/achats', label: 'Achats' },
  { to: '/app/justificatifs', label: 'Justificatifs', badge: true },
  { to: '/app/tiers', label: 'Tiers' },
  { to: '/app/export', label: 'Export' },
];

export default function Layout() {
  const { user, company } = useAuth();
  const location = useLocation();
  const [missing, setMissing] = useState(0);
  const [sheet, setSheet] = useState(false);
  const canWrite = user?.role !== 'accountant';

  useEffect(() => {
    api.stats().then((s) => setMissing(s.todo.missing_attachments), () => {});
  }, [location.pathname]);

  useEffect(() => { setSheet(false); }, [location.pathname, location.search]);

  return (
    <div className="shell">
      <header className="topbar">
        <div className="row" style={{ gap: 20, flexWrap: 'nowrap', minWidth: 0 }}>
          <Link to="/app" className="brand">
            <span className="brand-text"><strong>facturo<i>.</i></strong><span>{company?.name}</span></span>
          </Link>
          <nav className="topnav" aria-label="Navigation principale">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end}>
                {n.label}
                {n.badge && missing > 0 && <span className="count">{missing}</span>}
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          {canWrite && (
            <div className="top-actions">
              <Link className="btn" to="/app/pieces/nouvelle?kind=purchase&type=receipt&photo=1"><Icon name="camera" />Scanner un reçu</Link>
              <Link className="btn dark" to="/app/pieces/nouvelle?kind=sale"><Icon name="plus" />Facture</Link>
            </div>
          )}
          <Link to="/app/parametres" className="avatar" aria-label="Compte et paramètres">{initials(user?.name || '')}</Link>
        </div>
      </header>

      <main className="main">
        {DEMO && <DemoBanner />}
        <Outlet />
      </main>

      <nav className="tabbar" aria-label="Navigation mobile">
        <NavLink to="/app" end><Icon name="home" size={22} stroke={2.2} />Aperçu</NavLink>
        <NavLink to="/app/pieces"><Icon name="list" size={22} stroke={2.2} />Pièces</NavLink>
        {canWrite ? (
          <button className="fab" aria-label="Ajouter une pièce" onClick={() => setSheet(true)}><Icon name="plus" size={26} stroke={2.6} /></button>
        ) : <span style={{ width: 58 }} />}
        <NavLink to="/app/export"><Icon name="download" size={22} stroke={2.2} />Export</NavLink>
        <NavLink to="/app/parametres"><Icon name="user" size={22} stroke={2.2} />Compte</NavLink>
      </nav>

      {sheet && (
        <div className="sheet-backdrop" onClick={() => setSheet(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Nouvelle pièce">
            <div className="between" style={{ marginBottom: 4, padding: '0 4px' }}>
              <h2 style={{ fontSize: 22 }}>Nouvelle pièce</h2>
              <button className="btn icon" onClick={() => setSheet(false)} aria-label="Fermer"><Icon name="x" /></button>
            </div>
            <Link className="primary" to="/app/pieces/nouvelle?kind=purchase&type=receipt&photo=1">
              <span className="ic"><Icon name="camera" size={20} /></span>
              <span className="stack-sm" style={{ gap: 0 }}>Photographier un reçu<span className="xs" style={{ fontWeight: 500 }}>Achat ou dépense avec justificatif</span></span>
            </Link>
            <Link to="/app/pieces/nouvelle?kind=purchase"><span className="ic"><Icon name="receipt" size={20} /></span>Saisir un achat</Link>
            <Link to="/app/pieces/nouvelle?kind=sale"><span className="ic"><Icon name="filePlus" size={20} /></span>Facturer un client</Link>
            <Link to="/app/pieces/nouvelle?kind=sale&type=receipt"><span className="ic"><Icon name="receipt" size={20} /></span>Faire un reçu de vente</Link>
            <Link to="/app/pieces/nouvelle?kind=sale&type=quote"><span className="ic"><Icon name="file" size={20} /></span>Faire un devis</Link>
          </div>
        </div>
      )}
    </div>
  );
}

// Bandeau de la version de démonstration (GitHub Pages).
function DemoBanner() {
  const { signOut, user } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const seed = async () => {
    setBusy(true);
    setError('');
    try {
      await api.seedDemo();
      setBusy(false);
      navigate('/app/pieces', { state: { seeded: Date.now() } });
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };
  const reset = async () => {
    if (!confirm('Effacer toutes les données de démonstration de ce navigateur ?')) return;
    await api.resetDemo();
    signOut();
  };
  return (
    <div className="between" style={{ padding: '12px 16px', borderRadius: 18, background: 'var(--lavender)' }}>
      <span className="small"><strong>Version de démonstration.</strong> <span className="muted">Vos données restent uniquement dans ce navigateur.</span>
        {error && <span className="demo-error"> — {error}</span>}</span>
      {user?.role !== 'accountant' && (
        <span className="row">
          <button className="btn sm dark" disabled={busy} onClick={seed}>{busy ? 'Ajout…' : 'Ajouter des exemples'}</button>
          {user?.role === 'owner' && <button className="btn sm" onClick={reset}>Tout effacer</button>}
        </span>
      )}
    </div>
  );
}

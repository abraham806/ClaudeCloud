import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { api } from './api';
import { useAuth } from './auth';
import { initials } from './format';
import { Icon, type IconName } from './icons';

const NAV: { section?: string; to: string; label: string; icon: IconName; end?: boolean; badge?: 'missing' }[] = [
  { section: 'Général', to: '/app', label: 'Tableau de bord', icon: 'dashboard', end: true },
  { to: '/app/achats', label: 'Achats', icon: 'receipt' },
  { to: '/app/ventes', label: 'Ventes et devis', icon: 'trending' },
  { to: '/app/justificatifs', label: 'Justificatifs', icon: 'clip', badge: 'missing' },
  { to: '/app/tiers', label: 'Clients & fournisseurs', icon: 'users' },
  { section: 'Comptabilité', to: '/app/export', label: 'Export comptable', icon: 'sheet' },
  { to: '/app/parametres', label: 'Paramètres', icon: 'settings' },
];

export default function Layout() {
  const { user, company, signOut } = useAuth();
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
      <aside className="sidebar">
        <Link to="/app" className="brand">
          <span className="logo">F</span>
          <span className="brand-text"><strong>Facturo</strong><span>{company?.name}</span></span>
        </Link>
        <nav className="nav" aria-label="Navigation principale">
          {NAV.map((n) => (
            <div key={n.to} style={{ display: 'contents' }}>
              {n.section && <span className="eyebrow">{n.section}</span>}
              <NavLink to={n.to} end={n.end}>
                <Icon name={n.icon} />
                {n.label}
                {n.badge === 'missing' && missing > 0 && <span className="pill unpaid count" style={{ height: 20 }}>{missing}</span>}
              </NavLink>
            </div>
          ))}
        </nav>
        {missing > 0 && (
          <Link to="/app/justificatifs" className="closing" style={{ textDecoration: 'none', color: 'inherit' }}>
            <strong className="small">Avant l'envoi au comptable</strong>
            <span className="xs muted">{missing} achat{missing > 1 ? 's' : ''} sans justificatif. Ajoutez la photo ou le PDF.</span>
          </Link>
        )}
        <div className="user" style={missing > 0 ? undefined : { marginTop: 'auto' }}>
          <span className="avatar">{initials(user?.name || '')}</span>
          <span className="grow" style={{ display: 'flex', flexDirection: 'column' }}>
            <strong>{user?.name}</strong>
            <span className="xs muted">{{ owner: 'Propriétaire', member: 'Collaborateur', accountant: 'Comptable' }[user?.role || 'owner']}</span>
          </span>
          <button className="btn ghost icon" onClick={signOut} aria-label="Se déconnecter" title="Se déconnecter"><Icon name="logout" /></button>
        </div>
      </aside>

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <header className="mobile-top">
          <Link to="/app" className="brand" style={{ padding: 0 }}>
            <span className="logo">F</span>
            <span className="brand-text"><strong>Facturo</strong><span>{company?.name}</span></span>
          </Link>
          <Link to="/app/parametres" className="avatar" aria-label="Compte" style={{ textDecoration: 'none', color: 'inherit' }}>
            {initials(user?.name || '')}
          </Link>
        </header>
        <main className="main">
          <Outlet />
        </main>
      </div>

      <nav className="tabbar" aria-label="Navigation mobile">
        <NavLink to="/app" end><Icon name="home" size={22} />Accueil</NavLink>
        <NavLink to="/app/pieces"><Icon name="list" size={22} />Pièces</NavLink>
        {canWrite ? (
          <button className="fab" aria-label="Ajouter une pièce" onClick={() => setSheet(true)}><Icon name="plus" size={26} stroke={2.4} /></button>
        ) : <span style={{ width: 58 }} />}
        <NavLink to="/app/export"><Icon name="sheet" size={22} />Export</NavLink>
        <NavLink to="/app/parametres"><Icon name="user" size={22} />Compte</NavLink>
      </nav>

      {sheet && (
        <div className="sheet-backdrop" onClick={() => setSheet(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Nouvelle pièce">
            <div className="between" style={{ marginBottom: 4 }}>
              <h2>Nouvelle pièce</h2>
              <button className="btn ghost icon" onClick={() => setSheet(false)} aria-label="Fermer"><Icon name="x" /></button>
            </div>
            <Link className="primary" to="/app/pieces/nouvelle?kind=purchase&type=receipt&photo=1">
              <span className="ic"><Icon name="camera" size={20} /></span>
              <span className="stack-sm" style={{ gap: 0 }}>Photographier un reçu<span className="xs muted">Achat ou dépense avec justificatif</span></span>
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

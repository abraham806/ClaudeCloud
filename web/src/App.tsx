import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth';
import AuthPage from './pages/AuthPage';
import Dashboard from './pages/Dashboard';
import Documents from './pages/Documents';
import DocumentForm from './pages/DocumentForm';
import DocumentView from './pages/DocumentView';
import ExportPage from './pages/ExportPage';
import Settings from './pages/Settings';

const NAV = [
  { to: '/', label: 'Tableau de bord', end: true },
  { to: '/achats', label: 'Achats' },
  { to: '/ventes', label: 'Ventes' },
  { to: '/export', label: 'Export comptable' },
  { to: '/parametres', label: 'Paramètres' },
];

export default function App() {
  const { user, company, loading, signOut } = useAuth();

  if (loading) return <div className="center muted">Chargement…</div>;
  if (!user) {
    return (
      <Routes>
        <Route path="/inscription" element={<AuthPage mode="register" />} />
        <Route path="*" element={<AuthPage mode="login" />} />
      </Routes>
    );
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="logo">F</span>
          <div>
            <strong>Facturo</strong>
            <small>{company?.name}</small>
          </div>
        </div>
        <nav>
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}>{n.label}</NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <span className="muted">{user.name}</span>
          <button className="link" onClick={signOut}>Déconnexion</button>
        </div>
      </aside>
      <main className="content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/achats" element={<Documents kind="purchase" />} />
          <Route path="/ventes" element={<Documents kind="sale" />} />
          <Route path="/documents/nouveau" element={<DocumentForm />} />
          <Route path="/documents/:id" element={<DocumentView />} />
          <Route path="/documents/:id/modifier" element={<DocumentForm />} />
          <Route path="/export" element={<ExportPage />} />
          <Route path="/parametres" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

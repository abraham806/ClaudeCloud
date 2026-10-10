import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth';
import Layout from './Layout';
import Landing from './pages/Landing';
import AuthPage from './pages/AuthPage';
import Dashboard from './pages/Dashboard';
import Documents from './pages/Documents';
import DocumentForm from './pages/DocumentForm';
import DocumentView from './pages/DocumentView';
import Attachments from './pages/Attachments';
import Parties from './pages/Parties';
import ExportPage from './pages/ExportPage';
import Settings from './pages/Settings';
import Variables from './pages/Variables';

export default function App() {
  const { user, loading } = useAuth();

  if (loading) return <div className="center-screen muted">Chargement…</div>;

  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/connexion" element={user ? <Navigate to="/app" replace /> : <AuthPage mode="login" />} />
      <Route path="/inscription" element={user ? <Navigate to="/app" replace /> : <AuthPage mode="register" />} />
      <Route path="/app" element={user ? <Layout /> : <Navigate to="/connexion" replace />}>
        <Route index element={<Dashboard />} />
        <Route path="achats" element={<Documents key="purchase" kind="purchase" />} />
        <Route path="ventes" element={<Documents key="sale" kind="sale" />} />
        <Route path="pieces" element={<Documents key="all" />} />
        <Route path="pieces/nouvelle" element={<DocumentForm />} />
        <Route path="pieces/:id" element={<DocumentView />} />
        <Route path="pieces/:id/modifier" element={<DocumentForm />} />
        <Route path="justificatifs" element={<Attachments />} />
        <Route path="tiers" element={<Parties />} />
        <Route path="export" element={<ExportPage />} />
        <Route path="variables" element={<Variables />} />
        <Route path="parametres" element={<Settings />} />
        <Route path="*" element={<Navigate to="/app" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

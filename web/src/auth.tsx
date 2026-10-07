import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, tokenStore, type Company, type User } from './api';

interface AuthState {
  user: User | null;
  company: Company | null;
  loading: boolean;
  signIn: (token: string) => Promise<void>;
  signOut: () => void;
  setCompany: (c: Company) => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(() => Boolean(tokenStore.get()));

  const load = useCallback(async () => {
    if (!tokenStore.get()) return;
    try {
      const me = await api.me();
      setUser(me.user);
      setCompany(me.company);
    } catch {
      tokenStore.set(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const signIn = async (token: string) => {
    tokenStore.set(token);
    await load();
  };
  const signOut = () => {
    tokenStore.set(null);
    setUser(null);
    setCompany(null);
  };

  return (
    <AuthContext.Provider value={{ user, company, loading, signIn, signOut, setCompany }}>
      {children}
    </AuthContext.Provider>
  );
}

// oxlint-disable-next-line react/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth hors de AuthProvider');
  return ctx;
}

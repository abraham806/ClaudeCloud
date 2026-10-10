import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { api, type DemoBackup } from '../api';
import { useAuth } from '../auth';
import { Icon } from '../icons';
import { MIN_SECRET, PATH, REPO, autoSave, configured, fetchRemote, githubToken, passphrase, pushRemote } from './github.js';

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : 'jamais';

let saving: Promise<string> | null = null;

// Envoie toute la base sur GitHub (une seule sauvegarde à la fois).
export async function saveToGithub() {
  saving ??= (async () => {
    try {
      const backup = await api.backupDemo();
      if (!backup.tables.companies?.length) throw new Error('Rien à sauvegarder.');
      const savedAt = await pushRemote(backup);
      await api.markSynced(savedAt);
      window.dispatchEvent(new CustomEvent('leukflow:synced'));
      return savedAt;
    } finally {
      saving = null;
    }
  })();
  return saving;
}

// Sauvegarde automatique : quelques secondes après la dernière modification, et à la fermeture de l'onglet.
export function useGithubAutosave() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = () => {
      clearTimeout(timer);
      if (autoSave.get() && configured()) saveToGithub().catch((e) => console.warn('Sauvegarde GitHub :', e.message));
    };
    const onChange = () => { clearTimeout(timer); timer = setTimeout(run, 8000); };
    const onHide = () => { if (document.visibilityState === 'hidden' && timer) run(); };
    window.addEventListener('leukflow:changed', onChange);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('leukflow:changed', onChange);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, []);
}

// Carte « Sauvegarde » des paramètres (version de démonstration).
export function DemoSyncCard() {
  const { user, signOut } = useAuth();
  const isOwner = user?.role === 'owner';
  const [state, setState] = useState<{ synced_at: string | null; dirty: boolean; remote_newer: string | null } | null>(null);
  const [token, setToken] = useState(githubToken.get() || '');
  const [secret, setSecret] = useState(passphrase.get() || '');
  const [auto, setAuto] = useState(autoSave.get());
  const [msg, setMsg] = useState<{ ok?: string; err?: string }>({});
  const [busy, setBusy] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => { api.syncState().then(setState, () => {}); }, []);
  useEffect(() => {
    refresh();
    const on = () => refresh();
    window.addEventListener('leukflow:synced', on);
    window.addEventListener('leukflow:changed', on);
    return () => { window.removeEventListener('leukflow:synced', on); window.removeEventListener('leukflow:changed', on); };
  }, [refresh]);

  const act = (name: string, fn: () => Promise<string | void>) => async () => {
    setBusy(name);
    setMsg({});
    try {
      const ok = await fn();
      if (ok) setMsg({ ok });
    } catch (e) {
      setMsg({ err: (e as Error).message });
    }
    setBusy('');
    refresh();
  };

  const restore = async (data: DemoBackup) => {
    await api.restoreDemo(data);
    alert('Données restaurées. Reconnectez-vous avec l’email et le mot de passe de ce compte.');
    signOut();
  };

  const download = act('download', async () => {
    const data = await api.backupDemo();
    const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `leukflow-sauvegarde-${data.saved_at.slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f || !confirm('Remplacer toutes les données de ce navigateur par celles du fichier ?')) return;
    act('file', async () => restore(JSON.parse(await f.text())))();
  };

  return (
    <section className="card stack-sm" style={{ gap: 12 }}>
      <div className="stack-sm" style={{ gap: 2 }}>
        <h2>Sauvegarde</h2>
        <span className="small muted">
          Dans la démo, les données vivent dans ce navigateur. Elles sont chiffrées puis enregistrées dans votre dépôt
          GitHub privé « {REPO.split('/')[1]} », pour les retrouver sur un autre appareil.
        </span>
      </div>

      <div className="sync-status">
        <span className={`dot ${state?.dirty ? 'warn' : 'ok'}`} />
        <span className="grow small">
          {state?.dirty ? 'Modifications non envoyées sur GitHub' : 'À jour avec GitHub'}
          <br /><span className="xs muted">Dernière sauvegarde GitHub : {when(state?.synced_at ?? null)}</span>
        </span>
      </div>
      {state?.remote_newer && (
        <p className="xs note">Une sauvegarde plus récente existe sur GitHub ({when(state.remote_newer)}), faite depuis un autre appareil.</p>
      )}

      {isOwner && (
        <>
          <label className="field">Jeton GitHub
            <input type="password" autoComplete="off" value={token} placeholder="github_pat_…"
              onChange={(e) => { setToken(e.target.value); githubToken.set(e.target.value); }} />
            <span className="xs muted" style={{ fontWeight: 400 }}>
              Gardé uniquement dans ce navigateur. <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer">Créer un jeton</a> :
              dépôt « {REPO.split('/')[1]} » seulement, permission « Contents : Read and write ».
            </span>
          </label>
          <label className="field">Phrase secrète de chiffrement
            <input type="password" autoComplete="new-password" value={secret} placeholder={`${MIN_SECRET} caractères minimum`}
              onChange={(e) => { setSecret(e.target.value); passphrase.set(e.target.value); }} />
            <span className="xs muted" style={{ fontWeight: 400 }}>
              Sans elle, la sauvegarde est illisible, même pour GitHub. Notez-la : elle sera demandée sur chaque nouvel appareil,
              et on ne peut pas la récupérer si elle est perdue.
            </span>
          </label>
          <label className="check"><input type="checkbox" checked={auto} onChange={(e) => { setAuto(e.target.checked); autoSave.set(e.target.checked); }} />
            <span>Sauvegarder automatiquement après chaque modification</span></label>
          <div className="row">
            <button className="btn dark" disabled={!token || secret.length < MIN_SECRET || !!busy} onClick={act('push', async () => `Enregistré sur GitHub (${when(await saveToGithub())}).`)}>
              <Icon name="upload" />{busy === 'push' ? 'Envoi…' : 'Sauvegarder sur GitHub'}
            </button>
            <button className="btn" disabled={!!busy} onClick={act('pull', async () => {
              const remote = await fetchRemote();
              if (!remote) return 'Aucune sauvegarde dans le dépôt pour l’instant.';
              if (!confirm(`Remplacer les données de ce navigateur par la sauvegarde GitHub du ${when(remote.saved_at)} ?`)) return;
              await restore(remote);
            })}>
              <Icon name="download" />Charger depuis GitHub
            </button>
          </div>
          <div className="row">
            <button className="btn sm ghost" disabled={!!busy} onClick={download}><Icon name="download" />Télécharger un fichier</button>
            <button className="btn sm ghost" disabled={!!busy} onClick={() => fileRef.current?.click()}><Icon name="upload" />Restaurer un fichier</button>
            <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={onFile} />
          </div>
        </>
      )}
      {msg.ok && <p className="success">{msg.ok}</p>}
      {msg.err && <p className="error">{msg.err}</p>}
      <span className="xs muted">
        Fichier : <code>{PATH}</code> dans le dépôt privé <code>{REPO}</code>, chiffré en AES-256. Seule la date de
        sauvegarde reste lisible.
      </span>
    </section>
  );
}

// Page de connexion (nouvel appareil) : récupérer les données avant de se connecter.
export function RecoverFromGithub() {
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState(githubToken.get() || '');
  const [secret, setSecret] = useState(passphrase.get() || '');
  const [msg, setMsg] = useState<{ ok?: string; err?: string }>({});
  const [busy, setBusy] = useState(false);

  async function pull() {
    githubToken.set(token);
    passphrase.set(secret);
    setBusy(true);
    setMsg({});
    try {
      await api.pullDemo();
      setMsg({ ok: 'Données récupérées. Connectez-vous avec votre email et votre mot de passe habituels.' });
    } catch (e) {
      setMsg({ err: (e as Error).message });
    }
    setBusy(false);
  }

  if (!open) {
    return <button type="button" className="link small" style={{ alignSelf: 'center' }} onClick={() => setOpen(true)}>Récupérer mes données depuis GitHub</button>;
  }
  return (
    <div className="stack-sm note" style={{ gap: 10 }}>
      <strong className="small">Récupérer mes données (nouvel appareil)</strong>
      <label className="field">Jeton GitHub<input type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder="github_pat_…" /></label>
      <label className="field">Phrase secrète<input type="password" autoComplete="off" value={secret} onChange={(e) => setSecret(e.target.value)} /></label>
      <button type="button" className="btn" disabled={!token || !secret || busy} onClick={pull}><Icon name="download" />{busy ? 'Récupération…' : 'Récupérer'}</button>
      {msg.ok && <p className="success">{msg.ok}</p>}
      {msg.err && <p className="error">{msg.err}</p>}
    </div>
  );
}

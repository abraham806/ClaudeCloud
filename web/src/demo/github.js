// Sauvegarde de la démo dans le dépôt GitHub (fichier data/sauvegarde.json).
// - Lecture : publique, sans jeton (le dépôt est public).
// - Écriture : avec un jeton personnel GitHub saisi par l'utilisateur, gardé uniquement dans ce navigateur.

export const REPO = import.meta.env.VITE_GITHUB_REPO || 'abraham806/ClaudeCloud';
export const BRANCH = import.meta.env.VITE_GITHUB_BRANCH || 'claude/saas-web-mobile-app-yayuzo';
export const PATH = 'data/sauvegarde.json';
const API = `https://api.github.com/repos/${REPO}/contents/${PATH}`;
const TOKEN_KEY = 'leukflow.github-token';
const AUTO_KEY = 'leukflow.github-auto';

const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch { /* indisponible */ } },
};
export const githubToken = { get: () => store.get(TOKEN_KEY), set: (t) => store.set(TOKEN_KEY, t && t.trim()) };
export const autoSave = { get: () => store.get(AUTO_KEY) !== '0', set: (on) => store.set(AUTO_KEY, on ? '1' : '0') };

function headers(extra = {}) {
  const h = { 'X-GitHub-Api-Version': '2022-11-28', ...extra };
  const t = githubToken.get();
  if (t) h.Authorization = `Bearer ${t}`;
  return h;
}

function explain(res, body) {
  if (res.status === 401) return 'Jeton GitHub refusé (expiré ou mal copié).';
  if (res.status === 403 || res.status === 404) {
    return body?.message?.includes('rate limit')
      ? 'Trop de requêtes vers GitHub, réessayez dans quelques minutes.'
      : 'Le jeton n’a pas le droit d’écrire dans le dépôt (permission « Contents : Read and write » requise).';
  }
  if (res.status === 409) return 'Le fichier a changé entre-temps sur GitHub, réessayez.';
  if (res.status === 422) return 'GitHub a refusé le fichier (trop volumineux ?).';
  return body?.message || `Erreur GitHub (${res.status})`;
}

// Sauvegarde publiée dans le dépôt, ou null s'il n'y en a pas encore.
export async function fetchRemote({ timeout = 6000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(`${API}?ref=${encodeURIComponent(BRANCH)}`, {
      headers: headers({ Accept: 'application/vnd.github.raw+json' }),
      cache: 'no-store',
      signal: ctrl.signal,
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(explain(res, await res.json().catch(() => null)));
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function toBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

// Écrit la sauvegarde dans le dépôt (un commit par sauvegarde).
export async function pushRemote(backup) {
  if (!githubToken.get()) throw new Error('Ajoutez d’abord votre jeton GitHub.');
  const current = await fetch(`${API}?ref=${encodeURIComponent(BRANCH)}`, { headers: headers({ Accept: 'application/vnd.github+json' }), cache: 'no-store' });
  let sha;
  if (current.ok) sha = (await current.json()).sha;
  else if (current.status !== 404) throw new Error(explain(current, await current.json().catch(() => null)));
  const companies = backup.tables.companies.map((c) => c.name).join(', ');
  const res = await fetch(API, {
    method: 'PUT',
    headers: headers({ Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      message: `Sauvegarde des données de démo (${companies || 'vide'})`,
      content: toBase64(JSON.stringify(backup)),
      branch: BRANCH,
      ...(sha && { sha }),
    }),
  });
  if (!res.ok) throw new Error(explain(res, await res.json().catch(() => null)));
  return backup.saved_at;
}

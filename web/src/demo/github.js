// Sauvegarde de la démo dans un dépôt GitHub PRIVÉ (par défaut abraham806/leukflowbase),
// chiffrée dans le navigateur avant l'envoi (AES-256-GCM, clé dérivée de la phrase secrète).
// Le jeton GitHub et la phrase secrète restent uniquement dans ce navigateur.

export const REPO = import.meta.env.VITE_DATA_REPO || 'abraham806/leukflowbase';
export const PATH = 'sauvegarde.json';
const API = `https://api.github.com/repos/${REPO}/contents/${PATH}`;
const TOKEN_KEY = 'leukflow.github-token';
const SECRET_KEY = 'leukflow.passphrase';
const AUTO_KEY = 'leukflow.github-auto';

const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch { /* indisponible */ } },
};
export const githubToken = { get: () => store.get(TOKEN_KEY), set: (t) => store.set(TOKEN_KEY, t && t.trim()) };
export const passphrase = { get: () => store.get(SECRET_KEY), set: (p) => store.set(SECRET_KEY, p) };
export const autoSave = { get: () => store.get(AUTO_KEY) !== '0', set: (on) => store.set(AUTO_KEY, on ? '1' : '0') };
export const MIN_SECRET = 10;
export const configured = () => Boolean(githubToken.get() && (passphrase.get() || '').length >= MIN_SECRET);

const fail = (message) => Object.assign(new Error(message), { status: 400 });

// --- Chiffrement ----------------------------------------------------------------
const b64 = (bytes) => {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};
const unb64 = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

async function deriveKey(secret, salt) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 310000 },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  );
}

export async function encrypt(backup, secret) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(secret, salt);
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(backup))));
  // Seule la date de sauvegarde reste lisible (elle sert à savoir quelle copie est la plus récente).
  return { app: 'leukflow-demo', encrypted: 'AES-256-GCM/PBKDF2-SHA256-310000', saved_at: backup.saved_at, salt: b64(salt), iv: b64(iv), data: b64(data) };
}

export async function decrypt(file, secret) {
  if (!file?.encrypted) return file; // fichier non chiffré (téléchargement local)
  if (!secret) throw fail('Phrase secrète requise pour lire la sauvegarde.');
  try {
    const key = await deriveKey(secret, unb64(file.salt));
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(file.iv) }, key, unb64(file.data));
    return JSON.parse(new TextDecoder().decode(plain));
  } catch {
    throw fail('Phrase secrète incorrecte : impossible de déchiffrer la sauvegarde.');
  }
}

// --- GitHub ------------------------------------------------------------------------
function headers(accept) {
  const t = githubToken.get();
  return { Accept: accept, 'X-GitHub-Api-Version': '2022-11-28', ...(t && { Authorization: `Bearer ${t}` }) };
}

async function explain(res) {
  const body = await res.json().catch(() => null);
  if (res.status === 401) return 'Jeton GitHub refusé (expiré ou mal copié).';
  if (res.status === 404) return `Dépôt ${REPO} introuvable avec ce jeton (vérifiez que le jeton donne accès à ce dépôt).`;
  if (res.status === 403) {
    return body?.message?.includes('rate limit')
      ? 'Trop de requêtes vers GitHub, réessayez dans quelques minutes.'
      : 'Le jeton n’a pas le droit d’écrire dans le dépôt (permission « Contents : Read and write » requise).';
  }
  if (res.status === 409) return 'La sauvegarde a changé entre-temps sur GitHub, réessayez.';
  if (res.status === 422) return 'GitHub a refusé le fichier (trop volumineux ?).';
  return body?.message || `Erreur GitHub (${res.status})`;
}

// Fichier brut du dépôt (chiffré), ou null s'il n'existe pas encore.
async function readFile({ timeout = 8000 } = {}) {
  if (!githubToken.get()) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(API, { headers: headers('application/vnd.github.raw+json'), cache: 'no-store', signal: ctrl.signal });
    if (res.status === 404) {
      // Fichier absent ou dépôt inaccessible : on distingue les deux.
      const repo = await fetch(`https://api.github.com/repos/${REPO}`, { headers: headers('application/vnd.github+json'), cache: 'no-store' });
      if (repo.ok) return null;
      throw fail(await explain(repo));
    }
    if (!res.ok) throw fail(await explain(res));
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// Sauvegarde déchiffrée, ou null s'il n'y en a pas (ou si ce navigateur n'est pas configuré).
export async function fetchRemote(options) {
  const file = await readFile(options);
  return file && decrypt(file, passphrase.get());
}

// Date de la sauvegarde du dépôt, sans la déchiffrer.
export async function remoteDate() {
  return (await readFile())?.saved_at ?? null;
}

export async function pushRemote(backup) {
  if (!githubToken.get()) throw fail('Ajoutez d’abord votre jeton GitHub.');
  const secret = passphrase.get() || '';
  if (secret.length < MIN_SECRET) throw fail(`Choisissez une phrase secrète d’au moins ${MIN_SECRET} caractères.`);
  const current = await fetch(API, { headers: headers('application/vnd.github+json'), cache: 'no-store' });
  let sha;
  if (current.ok) sha = (await current.json()).sha;
  else if (current.status !== 404) throw fail(await explain(current));
  const file = await encrypt(backup, secret);
  const res = await fetch(API, {
    method: 'PUT',
    headers: { ...headers('application/vnd.github+json'), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: 'Sauvegarde chiffrée de la démo LeukFlow',
      content: b64(new TextEncoder().encode(JSON.stringify(file))),
      ...(sha && { sha }),
    }),
  });
  if (!res.ok) throw fail(await explain(res));
  return backup.saved_at;
}

import { useEffect, useState } from 'react';
import { Icon } from './icons';

// Thème clair / sombre / système. Le choix est gardé dans le navigateur ;
// le script en tête de index.html l'applique avant l'affichage (pas de flash).
export type ThemeChoice = 'light' | 'dark' | 'system';
const KEY = 'facturo.theme';
const media = () => window.matchMedia('(prefers-color-scheme: dark)');

function read(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

function apply(choice: ThemeChoice) {
  const dark = choice === 'dark' || (choice === 'system' && media().matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0a0f1d' : '#f3f4f6');
}

const listeners = new Set<(c: ThemeChoice) => void>();

export function setTheme(choice: ThemeChoice) {
  try {
    if (choice === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, choice);
  } catch { /* stockage indisponible : le choix vaut pour la session */ }
  apply(choice);
  listeners.forEach((l) => l(choice));
}

export function useTheme() {
  const [choice, setChoice] = useState<ThemeChoice>(read);
  const [dark, setDark] = useState(() => document.documentElement.dataset.theme === 'dark');
  useEffect(() => {
    const sync = (c: ThemeChoice) => { setChoice(c); setDark(document.documentElement.dataset.theme === 'dark'); };
    listeners.add(sync);
    const m = media();
    const onSystem = () => { if (read() === 'system') { apply('system'); sync('system'); } };
    m.addEventListener('change', onSystem);
    return () => { listeners.delete(sync); m.removeEventListener('change', onSystem); };
  }, []);
  return { choice, dark, setTheme };
}

// Bouton rond-carré qui bascule entre clair et sombre.
export function ThemeToggle({ className = '' }: { className?: string }) {
  const { dark } = useTheme();
  return (
    <button
      type="button" className={`btn icon ${className}`} onClick={() => setTheme(dark ? 'light' : 'dark')}
      aria-label={dark ? 'Passer en mode clair' : 'Passer en mode sombre'} title={dark ? 'Mode clair' : 'Mode sombre'}
    >
      <Icon name={dark ? 'sun' : 'moon'} />
    </button>
  );
}

// Sélecteur à trois choix (Paramètres et menu latéral).
export function ThemeSwitch() {
  const { choice } = useTheme();
  const opts: [ThemeChoice, string, 'sun' | 'moon' | 'monitor'][] = [['light', 'Clair', 'sun'], ['dark', 'Sombre', 'moon'], ['system', 'Système', 'monitor']];
  return (
    <div className="seg theme-switch" role="radiogroup" aria-label="Thème">
      {opts.map(([v, l, i]) => (
        <button key={v} type="button" role="radio" aria-checked={choice === v} className={choice === v ? 'on' : ''} onClick={() => setTheme(v)} title={l}>
          <Icon name={i} size={14} /><span>{l}</span>
        </button>
      ))}
    </div>
  );
}

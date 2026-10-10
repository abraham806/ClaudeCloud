import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { Icon, type IconName } from '../icons';
import { ThemeToggle } from '../theme';
import { LogoFull, LogoMark } from '../logo';
import './landing.css';

const STEPS: { icon: IconName; title: string; text: string }[] = [
  { icon: 'camera', title: 'Photographiez', text: 'Le ticket de la station, la facture du grossiste : une photo et l’achat est enregistré avec son justificatif.' },
  { icon: 'filePlus', title: 'Facturez', text: 'Créez une facture, un reçu ou un devis en FCFA en quelques secondes. Imprimez-le ou envoyez-le sur WhatsApp.' },
  { icon: 'sheet', title: 'Envoyez au comptable', text: 'En fin de mois, un clic génère le fichier Excel de la période, prêt à importer dans son logiciel.' },
];

const FEATURES: { icon: IconName; title: string; text: string }[] = [
  { icon: 'receipt', title: 'Factures, reçus et devis', text: 'Numérotation automatique, TVA calculée, PDF propre à votre nom avec NINEA et RCCM.' },
  { icon: 'clip', title: 'Justificatifs au bon endroit', text: 'Chaque achat garde sa photo ou son PDF. LeukFlow vous signale ceux qui manquent.' },
  { icon: 'chart', title: 'Tableau de bord clair', text: 'Ventes, dépenses, solde et TVA du mois. Les dépenses par catégorie, d’un coup d’œil.' },
  { icon: 'download', title: 'Export Excel comptable', text: 'Récapitulatif lisible ou écritures débit / crédit selon le plan SYSCOHADA.' },
  { icon: 'users', title: 'Accès pour votre comptable', text: 'Il consulte vos pièces et télécharge ses exports lui-même, sans pouvoir rien modifier.' },
  { icon: 'check', title: 'Suivi des paiements', text: 'Factures payées, en attente ou en retard : vous savez qui relancer et quand.' },
];

const SENEGAL = [
  'Montants en FCFA',
  'TVA à 18 % par défaut',
  'NINEA et RCCM sur vos factures',
  'Wave, Orange Money, Free Money, espèces',
  'Partage direct sur WhatsApp',
  'Plan comptable SYSCOHADA',
];

const FAQ = [
  ['Faut-il installer une application ?', 'Non. LeukFlow s’ouvre dans le navigateur de votre téléphone ou de votre ordinateur. Sur téléphone, vous pouvez l’ajouter à l’écran d’accueil comme une application.'],
  ['Mon comptable utilise déjà un logiciel. Est-ce compatible ?', 'LeukFlow produit un fichier Excel : un récapitulatif lisible ou un journal d’écritures débit / crédit (SYSCOHADA). Si votre comptable a besoin d’un format précis, il peut être ajouté.'],
  ['Puis-je travailler à plusieurs ?', 'Oui. Ajoutez un collaborateur qui saisit les pièces, et votre comptable en lecture seule.'],
  ['Mes données sont-elles en sécurité ?', 'Chaque entreprise ne voit que ses propres données. L’accès est protégé par mot de passe et vos justificatifs sont stockés avec vos pièces.'],
  ['Que se passe-t-il pour mes anciens carnets ?', 'Vous pouvez saisir vos anciennes pièces avec leur date d’origine et joindre la photo de chaque page ou ticket.'],
];

const KPIS = [
  { l: 'Ventes TTC', v: '18 420 000 F', d: '+12 % ce mois', c: 'var(--green)' },
  { l: 'Dépenses TTC', v: '9 315 600 F', d: '+4 % ce mois', c: 'var(--muted)' },
  { l: 'Solde', v: '9 104 400 F', d: '+21 %', c: 'var(--green)' },
  { l: 'À encaisser', v: '1 840 000 F', d: '2 en retard', c: 'var(--amber)' },
];

export default function Landing() {
  const { user } = useAuth();
  const cta = user ? { to: '/app', label: 'Ouvrir mon espace' } : { to: '/inscription', label: 'Commencer gratuitement' };

  return (
    <div className="lp">
      <header className="lp-nav">
        <div className="row" style={{ gap: 32, flexWrap: 'nowrap' }}>
          <Link to="/" className="brand" style={{ padding: 0 }}>
            <span className="hide-mobile"><LogoFull height={26} /></span>
            <span className="show-mobile"><LogoMark size={32} /></span>
          </Link>
          <nav className="lp-links" aria-label="Sections">
            <a href="#fonctionnement">Comment ça marche</a>
            <a href="#fonctionnalites">Fonctionnalités</a>
            <a href="#senegal">Pour le Sénégal</a>
            <a href="#tarifs">Tarifs</a>
            <a href="#faq">Questions</a>
          </nav>
        </div>
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          <ThemeToggle className="ghost" />
          {!user && <Link to="/connexion" className="btn ghost hide-mobile">Se connecter</Link>}
          <Link to={cta.to} className="btn dark">{user ? 'Mon espace' : 'Commencer'}</Link>
        </div>
      </header>

      <section className="lp-hero">
        <div className="grid-bg" />
        <div className="halo lp-hero-halo" />
        <a href="#senegal" className="lp-badge">Nouveau · Export comptable SYSCOHADA <span className="muted">→</span></a>
        <h1>Facturez. Encaissez.<br />Votre comptable s’occupe du reste.</h1>
        <p className="lp-lead">
          Factures, reçus, achats en photo et export Excel pour le comptable. Une plateforme simple,
          pensée pour les commerces et PME du Sénégal.
        </p>
        <div className="row" style={{ gap: 12, justifyContent: 'center' }}>
          <Link to={cta.to} className="btn dark lg">{cta.label}</Link>
          <a href="#fonctionnement" className="btn lg">Voir comment ça marche</a>
        </div>
        <ul className="lp-ticks">
          <li><Icon name="check" size={14} />Sur téléphone et ordinateur</li>
          <li><Icon name="check" size={14} />Sans installation</li>
          <li><Icon name="check" size={14} />Mode clair et sombre</li>
        </ul>
      </section>

      <section className="lp-shot-wrap" aria-hidden="true">
        <div className="lp-shot-glow" />
        <div className="lp-shot">
          <div className="lp-shot-bar"><i /><i /><i /><span>leukflow.app/boutique-awa</span></div>
          <div className="lp-shot-body">
            {KPIS.map((k) => (
              <div key={k.l} className="lp-kpi">
                <span className="small muted">{k.l}</span>
                <strong className="num">{k.v}</strong>
                <span className="xs" style={{ color: k.c }}>{k.d}</span>
              </div>
            ))}
            <div className="lp-kpi lp-area">
              <span className="small muted">Ventes, 12 derniers mois</span>
              <svg viewBox="0 0 1000 160" preserveAspectRatio="none">
                <defs><linearGradient id="lp-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--accent)" stopOpacity="0.35" /><stop offset="1" stopColor="var(--accent)" stopOpacity="0" /></linearGradient></defs>
                <path d="M0 130 C80 120 120 100 180 104 S300 80 360 86 S480 60 540 66 S660 40 720 46 S840 26 900 20 S960 12 1000 10 L1000 160 L0 160 Z" fill="url(#lp-area)" />
                <path d="M0 130 C80 120 120 100 180 104 S300 80 360 86 S480 60 540 66 S660 40 720 46 S840 26 900 20 S960 12 1000 10" fill="none" stroke="var(--accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
              </svg>
            </div>
          </div>
        </div>
      </section>

      <section className="lp-section" id="fonctionnement">
        <div className="lp-head"><span className="lp-eyebrow">Comment ça marche</span><h2>Trois gestes, et votre comptabilité suit.</h2></div>
        <div className="lp-grid three">
          {STEPS.map((s, i) => (
            <div key={s.title} className="lp-cell">
              <span className="lp-step-n num">0{i + 1}</span>
              <span className="lp-icon"><Icon name={s.icon} size={18} /></span>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="lp-section" id="fonctionnalites">
        <div className="lp-head"><span className="lp-eyebrow">Fonctionnalités</span><h2>Tout ce qu’il faut. Rien de plus.</h2><p className="lp-sub">De la photo du ticket à l’export du mois, chaque étape tient en un geste.</p></div>
        <div className="lp-grid three">
          {FEATURES.map((f) => (
            <div key={f.title} className="lp-cell">
              <span className="lp-icon"><Icon name={f.icon} size={18} /></span>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="lp-section" id="senegal">
        <div className="lp-senegal">
          <div className="halo" style={{ left: '-10%', right: '40%', top: -120, height: 320 }} />
          <div className="stack" style={{ maxWidth: 480 }}>
            <span className="lp-eyebrow">Pensé pour le Sénégal</span>
            <h2>Nos réalités, nos monnaies, nos habitudes.</h2>
            <p className="lp-sub">
              Du boutiquier de Sandaga au cabinet de conseil du Plateau, LeukFlow parle votre langue :
              le FCFA, la TVA à 18 %, le NINEA, Wave et Orange Money, et WhatsApp pour tout envoyer.
            </p>
            <Link to={cta.to} className="btn dark lg" style={{ alignSelf: 'flex-start' }}>{cta.label}</Link>
          </div>
          <ul className="lp-sn-list">
            {SENEGAL.map((s) => <li key={s}><Icon name="check" size={16} />{s}</li>)}
          </ul>
        </div>
      </section>

      <section className="lp-section" id="tarifs">
        <div className="lp-head"><span className="lp-eyebrow">Tarifs</span><h2>Commencez gratuitement.</h2><p className="lp-sub">Les tarifs définitifs seront annoncés au lancement.</p></div>
        <div className="lp-plans">
          {[
            { name: 'Découverte', price: 'Gratuit', text: 'Pour essayer avec vos premières pièces.', items: ['Factures, reçus et devis', 'Achats en photo', 'Tableau de bord'] },
            { name: 'Commerce', price: '[PRIX] F / mois', text: 'Pour la boutique ou la PME au quotidien.', items: ['Pièces illimitées', 'Export Excel comptable', 'Accès comptable', '2 collaborateurs'], featured: true },
            { name: 'Cabinet', price: '[PRIX] F / mois', text: 'Pour les comptables qui suivent plusieurs clients.', items: ['Plusieurs entreprises', 'Exports groupés', 'Assistance prioritaire'] },
          ].map((p) => (
            <div key={p.name} className={`lp-plan ${p.featured ? 'card glow' : ''}`}>
              <div className="between"><h3>{p.name}</h3>{p.featured && <span className="pill mint">Conseillé</span>}</div>
              <strong className="lp-price">{p.price}</strong>
              <p>{p.text}</p>
              <ul>{p.items.map((i) => <li key={i}><Icon name="check" size={14} />{i}</li>)}</ul>
              <Link to={cta.to} className={`btn block ${p.featured ? 'dark' : ''}`}>Choisir</Link>
            </div>
          ))}
        </div>
      </section>

      <section className="lp-section" id="faq">
        <div className="lp-head"><span className="lp-eyebrow">Questions fréquentes</span><h2>Vous vous demandez peut-être…</h2></div>
        <div className="lp-faq">
          {FAQ.map(([q, a]) => (
            <details key={q}><summary>{q}</summary><p>{a}</p></details>
          ))}
        </div>
      </section>

      <section className="lp-section">
        <div className="lp-final">
          <div className="halo" style={{ left: 0, right: 0, bottom: -180, height: 320 }} />
          <h2>Prêt à ranger le carnet à souches ?</h2>
          <p className="lp-sub">Créez votre compte en une minute. Votre premier ticket vous attend.</p>
          <div className="row" style={{ gap: 12, justifyContent: 'center' }}>
            <Link to={cta.to} className="btn dark lg">{cta.label}</Link>
            {!user && <Link to="/connexion" className="btn lg">Se connecter</Link>}
          </div>
        </div>
      </section>

      <footer className="lp-footer">
        <span className="brand" style={{ padding: 0, flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}><span className="hide-mobile"><LogoFull height={22} /></span><span className="show-mobile"><LogoMark size={30} /></span><span className="xs muted">Dakar, Sénégal</span></span>
        <span className="small muted">Contact : [EMAIL] · WhatsApp : [NUMÉRO]</span>
        <span className="small muted">© {new Date().getFullYear()} LeukFlow</span>
      </footer>
    </div>
  );
}

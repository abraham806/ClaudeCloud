import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { Icon, type IconName } from '../icons';
import { WovenPattern } from '../pattern';
import './landing.css';

const STEPS: { icon: IconName; title: string; text: string }[] = [
  { icon: 'camera', title: 'Photographiez', text: 'Le ticket de la station, la facture du grossiste : une photo et l’achat est enregistré avec son justificatif.' },
  { icon: 'filePlus', title: 'Facturez', text: 'Créez une facture, un reçu ou un devis en FCFA en quelques secondes. Imprimez-le ou envoyez-le sur WhatsApp.' },
  { icon: 'sheet', title: 'Envoyez au comptable', text: 'En fin de mois, un clic génère le fichier Excel de la période, prêt à importer dans son logiciel.' },
];

const FEATURES: { icon: IconName; title: string; text: string }[] = [
  { icon: 'receipt', title: 'Factures, reçus et devis', text: 'Numérotation automatique, TVA calculée, PDF propre à votre nom avec NINEA et RCCM.' },
  { icon: 'clip', title: 'Justificatifs au bon endroit', text: 'Chaque achat garde sa photo ou son PDF. Facturo vous signale ceux qui manquent.' },
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
  ['Faut-il installer une application ?', 'Non. Facturo s’ouvre dans le navigateur de votre téléphone ou de votre ordinateur. Sur téléphone, vous pouvez l’ajouter à l’écran d’accueil comme une application.'],
  ['Mon comptable utilise déjà un logiciel. Est-ce compatible ?', 'Facturo produit un fichier Excel : un récapitulatif lisible ou un journal d’écritures débit / crédit (SYSCOHADA). Si votre comptable a besoin d’un format précis, il peut être ajouté.'],
  ['Puis-je travailler à plusieurs ?', 'Oui. Ajoutez un collaborateur qui saisit les pièces, et votre comptable en lecture seule.'],
  ['Mes données sont-elles en sécurité ?', 'Chaque entreprise ne voit que ses propres données. L’accès est protégé par mot de passe et vos justificatifs sont stockés avec vos pièces.'],
  ['Que se passe-t-il pour mes anciens carnets ?', 'Vous pouvez saisir vos anciennes pièces avec leur date d’origine et joindre la photo de chaque page ou ticket.'],
];

export default function Landing() {
  const { user } = useAuth();
  const cta = user ? { to: '/app', label: 'Ouvrir mon espace' } : { to: '/inscription', label: 'Commencer gratuitement' };

  return (
    <div className="lp">
      <header className="lp-nav">
        <Link to="/" className="brand" style={{ padding: 0 }}>
          <span className="brand-text"><strong>facturo<i>.</i></strong></span>
        </Link>
        <nav className="lp-links" aria-label="Sections">
          <a href="#fonctionnement">Comment ça marche</a>
          <a href="#fonctionnalites">Fonctionnalités</a>
          <a href="#senegal">Pour le Sénégal</a>
          <a href="#tarifs">Tarifs</a>
          <a href="#faq">Questions</a>
        </nav>
        <div className="row">
          {!user && <Link to="/connexion" className="btn ghost">Se connecter</Link>}
          <Link to={cta.to} className="btn dark">{user ? 'Mon espace' : 'Essayer'}</Link>
        </div>
      </header>

      <section className="lp-hero">
        <div className="lp-hero-text">
          <span className="lp-eyebrow">Dalal ak jàmm · Bienvenue</span>
          <h1>Vos factures et vos dépenses, <mark>enfin en ordre</mark>.</h1>
          <p className="lp-lead">
            Facturo remplace le carnet à souches et la boîte à tickets. Enregistrez vos achats en photo, éditez vos factures en FCFA,
            et donnez à votre comptable un fichier Excel prêt à l’emploi.
          </p>
          <div className="row" style={{ gap: 10 }}>
            <Link to={cta.to} className="btn dark lg">{cta.label}<Icon name="arrowRight" /></Link>
            <a href="#fonctionnement" className="btn lg">Voir comment ça marche</a>
          </div>
          <ul className="lp-ticks">
            <li><Icon name="check" />Sur téléphone et ordinateur</li>
            <li><Icon name="check" />Sans installation</li>
            <li><Icon name="check" />Export SYSCOHADA</li>
          </ul>
        </div>

        <div className="lp-hero-visual" aria-hidden="true">
          <div className="lp-pattern"><WovenPattern id="hero-woven" color="rgba(18,18,18,0.14)" /></div>
          <div className="lp-phone">
            <div className="lp-phone-screen">
              <div className="between"><span className="xs muted">Boutique Ndèye</span><span className="avatar" style={{ width: 26, height: 26, fontSize: 10 }}>NF</span></div>
              <strong className="title-font" style={{ fontSize: 18 }}>Bonjour Ndèye</strong>
              <div className="lp-balance">
                <span className="xs" style={{ fontWeight: 600 }}>Solde du mois</span>
                <strong className="num" style={{ fontSize: 24, fontWeight: 500 }}>1 845 000 F</strong>
                <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                  <span className="lp-mini"><span>↑ Ventes</span><b className="num">3 210 000</b></span>
                  <span className="lp-mini"><span>↓ Dépenses</span><b className="num">1 365 000</b></span>
                </div>
              </div>
              <div className="lp-actions">
                {(['camera', 'receipt', 'filePlus', 'download'] as IconName[]).map((i, n) => (
                  <span key={i} className={n === 0 ? 'on' : ''}><Icon name={i} size={16} /></span>
                ))}
              </div>
              <span className="xs strong">Récent</span>
              {[['Station Total Plateau', 'Carburant', '− 25 000 F'], ['Hôtel Teranga', 'Facture · non payée', '+ 850 000 F'], ['Sandaga Grossiste', 'Marchandises', '− 412 500 F']].map(([n, c, a], i) => (
                <div key={n} className="lp-item">
                  <span className={`avatar square ${i === 1 ? 'ink' : ''}`} style={{ width: 30, height: 30, borderRadius: 9, fontSize: 10 }}>{n.split(' ').map((w) => w[0]).slice(0, 2).join('')}</span>
                  <span className="grow" style={{ display: 'flex', flexDirection: 'column' }}><b style={{ fontSize: 11, fontWeight: 500 }}>{n}</b><span style={{ fontSize: 9, color: '#71717a' }}>{c}</span></span>
                  <span className="num" style={{ fontSize: 10, fontWeight: i === 1 ? 600 : 400 }}>{a}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="lp-ticket">
            <strong>STATION TOTAL</strong>
            <span>Gasoil 30 L</span>
            <span className="num">TOTAL 25 000 F</span>
            <em><Icon name="check" size={12} /> Justificatif enregistré</em>
          </div>
        </div>
      </section>

      <section className="lp-compare">
        <div className="lp-col">
          <span className="lp-eyebrow">Avant</span>
          <ul>
            <li>Des factures écrites à la main, recopiées, parfois illisibles</li>
            <li>Des tickets qui s’effacent au fond d’un tiroir</li>
            <li>Le comptable qui ressaisit tout à la fin du mois</li>
            <li>Aucune idée claire de ce qu’on a dépensé</li>
          </ul>
        </div>
        <div className="lp-col dark">
          <span className="lp-eyebrow" style={{ color: 'var(--sun)' }}>Avec Facturo</span>
          <ul>
            <li>Des factures nettes, numérotées, imprimées ou envoyées en un clic</li>
            <li>Chaque achat avec sa photo, retrouvable en deux secondes</li>
            <li>Un fichier Excel prêt pour le comptable</li>
            <li>Vos chiffres du mois sur un seul écran</li>
          </ul>
        </div>
      </section>

      <section className="lp-section" id="fonctionnement">
        <div className="lp-head"><span className="lp-eyebrow">Comment ça marche</span><h2>Trois gestes, et votre comptabilité suit.</h2></div>
        <div className="lp-steps">
          {STEPS.map((s, i) => (
            <div key={s.title} className={`lp-step tone-${i}`}>
              <span className="lp-step-n">{i + 1}</span>
              <span className="lp-icon"><Icon name={s.icon} size={22} /></span>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="lp-section" id="fonctionnalites">
        <div className="lp-head"><span className="lp-eyebrow">Fonctionnalités</span><h2>Tout ce qu’il faut. Rien de compliqué.</h2></div>
        <div className="lp-features">
          {FEATURES.map((f, i) => (
            <div key={f.title} className="lp-feature">
              <span className={`lp-icon tone-${i % 4}`}><Icon name={f.icon} size={20} /></span>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="lp-senegal" id="senegal">
        <div className="lp-senegal-pattern"><WovenPattern id="sn-woven" color="#2b2b2b" /></div>
        <div className="lp-senegal-inner">
          <div className="stack" style={{ maxWidth: 480 }}>
            <span className="lp-eyebrow" style={{ color: 'var(--sun)' }}>Pensé pour le Sénégal</span>
            <h2>Nos réalités, nos monnaies, nos habitudes.</h2>
            <p style={{ color: '#d6d3cb' }}>
              Du boutiquier de Sandaga au cabinet de conseil du Plateau, Facturo parle votre langue :
              le FCFA, la TVA à 18 %, le NINEA, Wave et Orange Money, et le WhatsApp pour tout envoyer.
            </p>
            <Link to={cta.to} className="btn lg" style={{ alignSelf: 'flex-start' }}>{cta.label}</Link>
          </div>
          <ul className="lp-sn-list">
            {SENEGAL.map((s) => <li key={s}><Icon name="check" />{s}</li>)}
          </ul>
        </div>
      </section>

      <section className="lp-section" id="tarifs">
        <div className="lp-head"><span className="lp-eyebrow">Tarifs</span><h2>Commencez gratuitement.</h2><p className="muted">Les tarifs définitifs seront annoncés au lancement.</p></div>
        <div className="lp-plans">
          {[
            { name: 'Découverte', price: 'Gratuit', text: 'Pour essayer avec vos premières pièces.', items: ['Factures, reçus et devis', 'Achats en photo', 'Tableau de bord'] },
            { name: 'Commerce', price: '[PRIX] F / mois', text: 'Pour la boutique ou la PME au quotidien.', items: ['Pièces illimitées', 'Export Excel comptable', 'Accès comptable', '2 collaborateurs'], dark: true },
            { name: 'Cabinet', price: '[PRIX] F / mois', text: 'Pour les comptables qui suivent plusieurs clients.', items: ['Plusieurs entreprises', 'Exports groupés', 'Assistance prioritaire'] },
          ].map((p) => (
            <div key={p.name} className={`lp-plan ${p.dark ? 'dark' : ''}`}>
              <h3>{p.name}</h3>
              <strong className="lp-price">{p.price}</strong>
              <p>{p.text}</p>
              <ul>{p.items.map((i) => <li key={i}><Icon name="check" size={14} />{i}</li>)}</ul>
              <Link to={cta.to} className={`btn block ${p.dark ? 'sun' : 'dark'}`}>Choisir</Link>
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

      <section className="lp-final">
        <h2>Jëf jël : on s’y met aujourd’hui ?</h2>
        <p>Créez votre compte en une minute et enregistrez votre premier ticket.</p>
        <Link to={cta.to} className="btn dark lg">{cta.label}<Icon name="arrowRight" /></Link>
      </section>

      <footer className="lp-footer">
        <div className="lp-footer-band"><WovenPattern id="foot-woven" color="rgba(18,18,18,0.25)" height={28} /></div>
        <div className="between" style={{ padding: '24px 0' }}>
          <span className="brand" style={{ padding: 0 }}><span className="brand-text"><strong>facturo<i>.</i></strong><span>Dakar, Sénégal</span></span></span>
          <span className="small muted">Contact : [EMAIL] · WhatsApp : [NUMÉRO]</span>
          <span className="small muted">© {new Date().getFullYear()} Facturo</span>
        </div>
      </footer>
    </div>
  );
}

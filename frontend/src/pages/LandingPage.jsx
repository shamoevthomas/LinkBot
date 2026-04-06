import { useNavigate } from 'react-router-dom';
import { useEffect, useRef } from 'react';

const D = "'Instrument Serif', serif";
const MUTED = 'hsl(240, 4%, 66%)';
const NAVY = 'hsl(201, 100%, 13%)';
const VIDEO_SRC = 'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260314_131748_f2ca2a28-fed7-44c8-b9a9-bd9acdd5ec31.mp4';

function useReveal() {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const items = el.querySelectorAll('.reveal');
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target); } });
    }, { threshold: 0.15 });
    items.forEach((i) => obs.observe(i));
    return () => obs.disconnect();
  }, []);
  return ref;
}

function SectionTitle({ sub, children }) {
  return (
    <div className="reveal text-center mb-16 max-w-3xl mx-auto">
      {sub && <span className="text-xs tracking-[0.3em] uppercase mb-4 block" style={{ color: MUTED }}>{sub}</span>}
      <h2 className="text-4xl sm:text-5xl md:text-6xl font-normal" style={{ fontFamily: D, color: 'white', lineHeight: 1.05, letterSpacing: '-1.5px' }}>
        {children}
      </h2>
    </div>
  );
}

function GlassCard({ icon, title, desc, delay = '' }) {
  return (
    <div className={`reveal ${delay} liquid-glass-dark rounded-2xl p-8 hover:scale-[1.02] transition-transform cursor-default`}>
      <div className="text-3xl mb-5">{icon}</div>
      <h3 className="text-lg font-medium text-white mb-3" style={{ fontFamily: "'Inter', sans-serif" }}>{title}</h3>
      <p className="text-sm leading-relaxed" style={{ color: MUTED }}>{desc}</p>
    </div>
  );
}

function Step({ n, title, desc, delay = '' }) {
  return (
    <div className={`reveal ${delay} flex flex-col items-center text-center`}>
      <div className="w-14 h-14 rounded-full liquid-glass flex items-center justify-center text-xl font-normal text-white mb-5" style={{ fontFamily: D }}>{n}</div>
      <h3 className="text-lg font-medium text-white mb-2">{title}</h3>
      <p className="text-sm leading-relaxed max-w-xs" style={{ color: MUTED }}>{desc}</p>
    </div>
  );
}

function Stat({ value, label, delay = '' }) {
  return (
    <div className={`reveal ${delay} text-center`}>
      <div className="text-5xl sm:text-6xl font-normal text-white mb-2" style={{ fontFamily: D }}>{value}</div>
      <p className="text-sm" style={{ color: MUTED }}>{label}</p>
    </div>
  );
}

export default function LandingPage() {
  const navigate = useNavigate();
  const page = useReveal();

  return (
    <div ref={page} style={{ background: NAVY }}>
      {/* ── HERO ── */}
      <div className="relative min-h-screen overflow-hidden">
        <video autoPlay loop muted playsInline className="absolute inset-0 w-full h-full object-cover z-0">
          <source src={VIDEO_SRC} type="video/mp4" />
        </video>

        <nav className="relative z-10 flex items-center justify-between px-8 py-6 max-w-7xl mx-auto">
          <span className="text-3xl tracking-tight text-white" style={{ fontFamily: D }}>
            LinkBot<sup className="text-xs">®</sup>
          </span>
          <div className="hidden md:flex items-center gap-8">
            {[['Fonctionnalités', '#features'], ['Campagnes', '#campaigns'], ['IA', '#ai'], ['Comment ça marche', '#how']].map(([label, href]) => (
              <a key={label} href={href} className="text-sm text-white/50 hover:text-white transition-colors">{label}</a>
            ))}
          </div>
          <button onClick={() => navigate('/login')} className="liquid-glass rounded-full px-6 py-2.5 text-sm text-white cursor-pointer hover:scale-[1.03] transition-transform">
            Se connecter
          </button>
        </nav>

        <section className="relative z-10 flex flex-col items-center text-center px-6 pt-32 pb-40">
          <h1 className="animate-fade-rise text-5xl sm:text-7xl md:text-8xl font-normal max-w-7xl" style={{ fontFamily: D, lineHeight: 0.95, letterSpacing: '-2.46px', color: 'white' }}>
            Automatisez votre{' '}
            <em className="not-italic" style={{ color: MUTED }}>prospection</em>{' '}
            avec{' '}
            <em className="not-italic" style={{ color: MUTED }}>élégance et précision.</em>
          </h1>
          <p className="animate-fade-rise-delay text-base sm:text-lg max-w-2xl mt-8 leading-relaxed" style={{ color: MUTED }}>
            CRM intelligent, campagnes automatiques, messages personnalisés par IA.
            LinkBot transforme votre réseau LinkedIn en machine de croissance,
            pendant que vous vous concentrez sur l'essentiel.
          </p>
          <button onClick={() => navigate('/login')} className="animate-fade-rise-delay-2 liquid-glass rounded-full px-14 py-5 text-base text-white mt-12 cursor-pointer hover:scale-[1.03] transition-transform">
            Commencer maintenant
          </button>
        </section>
      </div>

      {/* ── FEATURES ── */}
      <section id="features" className="relative px-6 py-32 max-w-7xl mx-auto">
        <SectionTitle sub="Fonctionnalités">
          Tout ce qu'il faut pour{' '}
          <em className="not-italic" style={{ color: MUTED }}>dominer LinkedIn.</em>
        </SectionTitle>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          <GlassCard delay="reveal-delay-1" icon="👥" title="CRM intelligent"
            desc="Organisez vos contacts dans des listes segmentées. Recherche en temps réel, filtres par statut de connexion, actions groupées, et historique d'interactions." />
          <GlassCard delay="reveal-delay-2" icon="🚀" title="4 types de campagnes"
            desc="Recherche, Connexion, DM, Connexion + DM. Chaque campagne tourne en arrière-plan avec des limites quotidiennes et un étalement configurable." />
          <GlassCard delay="reveal-delay-3" icon="🤖" title="IA Gemini intégrée"
            desc="Personnalisation complète des messages par l'IA. Chaque contact reçoit un message unique basé sur son profil, son expérience et ses publications." />
          <GlassCard delay="reveal-delay-1" icon="🔄" title="Cycle de relances"
            desc="Jusqu'à 7 relances automatiques avec délais configurables. Détection des réponses en temps réel. Le cycle s'arrête dès qu'un contact répond." />
          <GlassCard delay="reveal-delay-2" icon="📊" title="Suivi en temps réel"
            desc="Tableau de bord live avec statut de chaque contact : envoyé, en relance, répondu, perdu. Logs détaillés de chaque action pour un contrôle total." />
          <GlassCard delay="reveal-delay-3" icon="🔗" title="Sync automatique"
            desc="Importez vos connexions LinkedIn en un clic. Les nouvelles connexions sont synchronisées automatiquement toutes les 6 heures." />
        </div>
      </section>

      {/* ── DIVIDER ── */}
      <div className="max-w-5xl mx-auto px-6">
        <div className="h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.12), transparent)' }} />
      </div>

      {/* ── CAMPAIGNS ── */}
      <section id="campaigns" className="relative px-6 py-32 max-w-7xl mx-auto">
        <SectionTitle sub="Campagnes">
          Quatre moteurs,{' '}
          <em className="not-italic" style={{ color: MUTED }}>une seule interface.</em>
        </SectionTitle>

        <div className="grid sm:grid-cols-2 gap-5">
          {[
            { title: 'Recherche', icon: '🔍', desc: 'Trouvez automatiquement des prospects par mots-clés et importez-les dans votre CRM. Pagination intelligente, dédoublonnage, limites quotidiennes.', tag: 'Collecte' },
            { title: 'Connexion', icon: '🤝', desc: 'Envoyez des demandes de connexion à vos contacts CRM. Notes personnalisées optionnelles, skip des contacts déjà connectés, suivi du statut.', tag: 'Réseau' },
            { title: 'Message direct', icon: '💬', desc: 'Messages personnalisés avec variables dynamiques et relances automatiques. Templates écrits par vous ou générés entièrement par l\'IA.', tag: 'Prospection' },
            { title: 'Connexion + DM', icon: '⚡', desc: 'Le combo ultime. Envoi de connexion → détection d\'acceptation → cycle DM complet avec relances. Tout automatisé, du premier contact à la réponse.', tag: 'Automatisation' },
          ].map((c, i) => (
            <div key={c.title} className={`reveal reveal-delay-${(i % 2) + 1} liquid-glass-dark rounded-2xl p-8 group hover:scale-[1.02] transition-transform`}>
              <div className="flex items-start justify-between mb-5">
                <span className="text-4xl">{c.icon}</span>
                <span className="text-[10px] tracking-[0.2em] uppercase px-3 py-1 rounded-full" style={{ color: MUTED, border: '1px solid rgba(255,255,255,0.1)' }}>{c.tag}</span>
              </div>
              <h3 className="text-xl font-normal text-white mb-3" style={{ fontFamily: D }}>{c.title}</h3>
              <p className="text-sm leading-relaxed" style={{ color: MUTED }}>{c.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── DIVIDER ── */}
      <div className="max-w-5xl mx-auto px-6">
        <div className="h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.12), transparent)' }} />
      </div>

      {/* ── AI SECTION ── */}
      <section id="ai" className="relative px-6 py-32 max-w-6xl mx-auto">
        <SectionTitle sub="Intelligence artificielle">
          Chaque message{' '}
          <em className="not-italic" style={{ color: MUTED }}>est unique.</em>
        </SectionTitle>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Left: explanation */}
          <div className="reveal space-y-8">
            {[
              { title: 'Template + variable {compliment}', desc: 'Vous écrivez le message, l\'IA génère une accroche personnalisée pour chaque contact en analysant son profil, son expérience et ses dernières publications.' },
              { title: 'Message entier par l\'IA', desc: 'L\'IA rédige le message complet de A à Z. Chaque contact reçoit un texte unique adapté à son parcours. Aperçu disponible sur les 3 premiers contacts avant lancement.' },
              { title: 'Relances intelligentes', desc: 'Les messages de relance sont aussi personnalisés. L\'IA adapte le ton et l\'angle à chaque étape du cycle pour maximiser les chances de réponse.' },
            ].map((item, i) => (
              <div key={i} className="flex gap-4">
                <div className="w-8 h-8 shrink-0 rounded-full liquid-glass flex items-center justify-center text-sm text-white mt-0.5" style={{ fontFamily: D }}>{i + 1}</div>
                <div>
                  <h4 className="text-white text-sm font-medium mb-1">{item.title}</h4>
                  <p className="text-sm leading-relaxed" style={{ color: MUTED }}>{item.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Right: mock message */}
          <div className="reveal reveal-delay-2">
            <div className="liquid-glass-dark rounded-2xl overflow-hidden">
              <div className="px-6 py-4 flex items-center gap-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-sm text-white font-medium">TS</div>
                <div>
                  <p className="text-white text-sm font-medium">Thomas Shamoev</p>
                  <p className="text-xs" style={{ color: MUTED }}>Founder / CEO</p>
                </div>
                <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">IA</span>
              </div>
              <div className="p-6 space-y-4">
                <div className="rounded-xl p-4 text-sm leading-relaxed" style={{ background: 'rgba(10, 102, 194, 0.08)', borderLeft: '3px solid rgba(10, 102, 194, 0.4)', color: 'rgba(255,255,255,0.8)' }}>
                  Bonjour Thomas,<br /><br />
                  J'ai vu votre travail sur LinkBot — l'approche d'automatiser la prospection tout en gardant une vraie personnalisation est exactement ce qui manque au marché.<br /><br />
                  J'aimerais échanger avec vous sur une idée complémentaire. Seriez-vous disponible cette semaine ?
                </div>
                <div className="flex items-center gap-3 text-xs" style={{ color: MUTED }}>
                  <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    Basé sur le profil + 3 publications récentes
                  </span>
                </div>
              </div>
              <div className="px-6 py-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="flex gap-2">
                  {['Principal', 'Relance 1 (J+3)', 'Relance 2 (J+7)'].map((label, i) => (
                    <span key={label} className="text-[10px] px-3 py-1 rounded-full" style={{
                      background: i === 0 ? 'rgba(10,102,194,0.15)' : 'rgba(255,255,255,0.04)',
                      color: i === 0 ? 'rgb(100,180,255)' : MUTED,
                      border: '1px solid ' + (i === 0 ? 'rgba(10,102,194,0.3)' : 'rgba(255,255,255,0.06)'),
                    }}>{label}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── DIVIDER ── */}
      <div className="max-w-5xl mx-auto px-6">
        <div className="h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.12), transparent)' }} />
      </div>

      {/* ── HOW IT WORKS ── */}
      <section id="how" className="relative px-6 py-32 max-w-6xl mx-auto">
        <SectionTitle sub="Comment ça marche">
          Trois étapes,{' '}
          <em className="not-italic" style={{ color: MUTED }}>zéro friction.</em>
        </SectionTitle>

        <div className="grid md:grid-cols-3 gap-12 relative">
          {/* Connecting line */}
          <div className="hidden md:block absolute top-7 left-[16.7%] right-[16.7%] h-px" style={{ background: 'linear-gradient(90deg, rgba(255,255,255,0.06), rgba(255,255,255,0.12), rgba(255,255,255,0.06))' }} />

          <Step delay="reveal-delay-1" n="1" title="Connectez LinkedIn" desc="Collez vos cookies li_at et JSESSIONID. Vos identifiants restent stockés localement, jamais envoyés à un serveur externe." />
          <Step delay="reveal-delay-2" n="2" title="Importez ou cherchez" desc="Importez votre réseau existant en un clic, ou lancez une campagne de recherche pour trouver de nouveaux prospects par mots-clés." />
          <Step delay="reveal-delay-3" n="3" title="Automatisez" desc="Créez des campagnes de connexion et de messages. LinkBot s'occupe du reste : envois, relances, détection de réponses, 24h/24." />
        </div>
      </section>

      {/* ── DIVIDER ── */}
      <div className="max-w-5xl mx-auto px-6">
        <div className="h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.12), transparent)' }} />
      </div>

      {/* ── STATS ── */}
      <section className="relative px-6 py-32 max-w-5xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-12">
          <Stat delay="reveal-delay-1" value="4" label="Types de campagnes" />
          <Stat delay="reveal-delay-2" value="7" label="Relances automatiques" />
          <Stat delay="reveal-delay-3" value="6h" label="Sync automatique" />
          <Stat delay="reveal-delay-4" value="∞" label="Messages personnalisés" />
        </div>
      </section>

      {/* ── DIVIDER ── */}
      <div className="max-w-5xl mx-auto px-6">
        <div className="h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.12), transparent)' }} />
      </div>

      {/* ── DETAILS GRID ── */}
      <section className="relative px-6 py-32 max-w-7xl mx-auto">
        <SectionTitle sub="Détails">
          Pensé pour les{' '}
          <em className="not-italic" style={{ color: MUTED }}>professionnels exigeants.</em>
        </SectionTitle>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {[
            { icon: '🔒', title: '100% local', desc: 'Aucune donnée envoyée à un serveur. Tout tourne sur votre machine.' },
            { icon: '📄', title: 'Import PDF', desc: 'Importez un PDF comme contexte pour l\'IA. Plaquette, offre, pitch — tout est exploitable.' },
            { icon: '📋', title: 'Import CSV', desc: 'Importez vos contacts depuis un fichier CSV avec mapping de colonnes flexible.' },
            { icon: '🎯', title: 'Limites smart', desc: 'Max par jour, étalement sur X jours, ou total cible. Vous gardez le contrôle du rythme.' },
            { icon: '👤', title: 'Profil card', desc: 'Fiche détaillée de chaque contact : photo, headline, statut, historique, actions directes.' },
            { icon: '📨', title: 'DM depuis le CRM', desc: 'Envoyez un message à n\'importe quel contact directement depuis sa fiche, avec ou sans IA.' },
            { icon: '🔁', title: 'Connexion + DM', desc: 'Demande de connexion → acceptation détectée → cycle de DM automatique. Le tunnel complet.' },
            { icon: '📈', title: 'Logs d\'activité', desc: 'Journal exhaustif de chaque action exécutée. Filtrable, paginé, avec détails d\'erreurs.' },
          ].map((item, i) => (
            <div key={item.title} className={`reveal reveal-delay-${(i % 4) + 1} liquid-glass-dark rounded-2xl p-6`}>
              <span className="text-2xl block mb-3">{item.icon}</span>
              <h4 className="text-sm font-medium text-white mb-2">{item.title}</h4>
              <p className="text-xs leading-relaxed" style={{ color: MUTED }}>{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA FINAL ── */}
      <section className="relative px-6 py-32">
        <div className="reveal max-w-4xl mx-auto text-center">
          <h2 className="text-4xl sm:text-6xl md:text-7xl font-normal text-white mb-6" style={{ fontFamily: D, lineHeight: 1, letterSpacing: '-2px' }}>
            Prêt à transformer{' '}
            <em className="not-italic" style={{ color: MUTED }}>votre prospection ?</em>
          </h2>
          <p className="text-base max-w-xl mx-auto mb-12 leading-relaxed" style={{ color: MUTED }}>
            Installez LinkBot, connectez votre compte LinkedIn, et lancez votre première campagne en moins de 5 minutes.
          </p>
          <button onClick={() => navigate('/login')} className="liquid-glass rounded-full px-14 py-5 text-base text-white cursor-pointer hover:scale-[1.03] transition-transform">
            Commencer gratuitement
          </button>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="relative px-6 py-8 max-w-7xl mx-auto">
        <div className="h-px mb-8" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent)' }} />
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <span className="text-xl tracking-tight text-white/40" style={{ fontFamily: D }}>
            LinkBot<sup className="text-[8px]">®</sup>
          </span>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.2)' }}>
            Outil local d'automatisation LinkedIn — Vos données restent sur votre machine.
          </p>
        </div>
      </footer>
    </div>
  );
}

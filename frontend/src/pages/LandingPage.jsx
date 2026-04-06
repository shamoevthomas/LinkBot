import { useNavigate } from 'react-router-dom';
import { useEffect, useRef } from 'react';

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
      {sub && <span className="text-xs tracking-[0.3em] uppercase mb-4 block" style={{ color: 'var(--text3)' }}>{sub}</span>}
      <h2 className="f text-4xl sm:text-5xl md:text-6xl font-bold" style={{ color: 'var(--text)', lineHeight: 1.05, letterSpacing: '-1.5px' }}>
        {children}
      </h2>
    </div>
  );
}

function GlassCard({ icon, title, desc, delay = '' }) {
  return (
    <div className={`reveal ${delay} g-card rounded-2xl p-8 hover:scale-[1.02] transition-transform cursor-default`}>
      <div className="text-3xl mb-5">{icon}</div>
      <h3 className="text-lg font-semibold mb-3" style={{ color: 'var(--text)', fontFamily: "'Inter', sans-serif" }}>{title}</h3>
      <p className="text-sm leading-relaxed" style={{ color: 'var(--text2)' }}>{desc}</p>
    </div>
  );
}

function Step({ n, title, desc, delay = '' }) {
  return (
    <div className={`reveal ${delay} flex flex-col items-center text-center`}>
      <div className="w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold mb-5 f" style={{ background: 'rgba(0, 132, 255, 0.08)', color: 'var(--blue)', border: '1px solid rgba(0, 132, 255, 0.15)' }}>{n}</div>
      <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text)' }}>{title}</h3>
      <p className="text-sm leading-relaxed max-w-xs" style={{ color: 'var(--text2)' }}>{desc}</p>
    </div>
  );
}

function Stat({ value, label, delay = '' }) {
  return (
    <div className={`reveal ${delay} text-center`}>
      <div className="f text-5xl sm:text-6xl font-bold mb-2" style={{ color: 'var(--blue)' }}>{value}</div>
      <p className="text-sm" style={{ color: 'var(--text2)' }}>{label}</p>
    </div>
  );
}

export default function LandingPage() {
  const navigate = useNavigate();
  const page = useReveal();

  return (
    <div ref={page} style={{
      '--blue': '#0084FF',
      '--text': '#111827',
      '--text2': '#6b7280',
      '--text3': '#9ca3af',
      background: '#fff',
      color: 'var(--text)',
      fontFamily: "'Inter', sans-serif",
      position: 'relative',
      overflow: 'hidden',
    }}>

      {/* ── Global decorative blobs ── */}
      <div style={{
        position: 'fixed', top: '-20%', left: '-10%', width: '600px', height: '600px',
        background: 'radial-gradient(circle, rgba(0,132,255,0.06) 0%, transparent 70%)',
        filter: 'blur(80px)', pointerEvents: 'none', zIndex: 0,
      }} />
      <div style={{
        position: 'fixed', bottom: '-10%', right: '-10%', width: '500px', height: '500px',
        background: 'radial-gradient(circle, rgba(0,132,255,0.05) 0%, transparent 70%)',
        filter: 'blur(80px)', pointerEvents: 'none', zIndex: 0,
      }} />

      {/* ── HERO ── */}
      <div className="relative overflow-hidden" style={{ background: '#fff', minHeight: '100vh' }}>

        {/* Subtle blue watercolor wash at top */}
        <div style={{
          position: 'absolute', top: -100, left: '50%', transform: 'translateX(-50%)',
          width: 1200, height: 500,
          background: 'radial-gradient(ellipse 70% 60% at 50% 0%, rgba(96,177,255,0.12) 0%, rgba(49,154,255,0.04) 50%, transparent 100%)',
          pointerEvents: 'none', zIndex: 0,
        }} />

        {/* Glass Navbar */}
        <div style={{ position: 'relative', zIndex: 10, maxWidth: 900, margin: '0 auto', padding: '20px 24px 0' }}>
          <nav className="glass-nav" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 28px' }}>
            <span className="f" style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>
              LinkBot<sup style={{ fontSize: 9, color: 'var(--text3)' }}>®</sup>
            </span>
            <div className="hidden md:flex items-center gap-8">
              {[['Fonctionnalités', '#features'], ['Campagnes', '#campaigns'], ['IA', '#ai'], ['Comment ça marche', '#how']].map(([label, href]) => (
                <a key={label} href={href} style={{ fontSize: 13, color: 'var(--text2)', textDecoration: 'none', transition: 'color 0.2s' }}
                  onMouseEnter={e => e.target.style.color = 'var(--text)'}
                  onMouseLeave={e => e.target.style.color = 'var(--text2)'}>{label}</a>
              ))}
            </div>
            <button onClick={() => navigate('/login')} className="cta-btn" style={{ padding: '10px 24px', fontSize: 13, borderRadius: 99 }}>
              Se connecter
            </button>
          </nav>
        </div>

        {/* Hero content: text LEFT, orb RIGHT */}
        <section className="relative z-10" style={{
          maxWidth: 1200, margin: '0 auto', padding: '80px 48px 120px',
          display: 'flex', alignItems: 'center', gap: 48, minHeight: 'calc(100vh - 100px)',
        }}>
          {/* Left: text */}
          <div className="animate-fade-rise" style={{ flex: 1 }}>
            <h1 className="f" style={{
              fontSize: 'clamp(40px, 5.5vw, 72px)', fontWeight: 700,
              lineHeight: 1, letterSpacing: '-2px', color: 'var(--text)',
            }}>
              Automatisez votre{' '}
              <span style={{ color: 'var(--blue)' }}>prospection</span>{' '}
              avec{' '}
              <span style={{ color: 'var(--blue)' }}>élégance et précision.</span>
            </h1>
            <p className="animate-fade-rise-delay" style={{
              fontSize: 16, lineHeight: 1.7, color: 'var(--text2)',
              maxWidth: 480, marginTop: 28,
            }}>
              CRM intelligent, campagnes automatiques, messages personnalisés par IA.
              LinkBot transforme votre réseau LinkedIn en machine de croissance,
              pendant que vous vous concentrez sur l'essentiel.
            </p>
            <button onClick={() => navigate('/login')} className="animate-fade-rise-delay-2 cta-btn" style={{
              padding: '18px 44px', fontSize: 15, borderRadius: 16, marginTop: 36,
            }}>
              Commencer maintenant
            </button>
          </div>

          {/* Right: glass orb */}
          <div className="animate-fade-rise-delay hidden md:flex" style={{ flex: 1, justifyContent: 'center', position: 'relative' }}>
            {/* Glow behind orb */}
            <div style={{
              position: 'absolute', top: '50%', left: '50%',
              transform: 'translate(-50%, -50%)',
              width: 500, height: 500, borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(0,132,255,0.15) 0%, rgba(0,132,255,0.04) 50%, transparent 70%)',
              filter: 'blur(40px)', pointerEvents: 'none',
            }} />
            <div style={{ position: 'relative', width: 400, height: 400 }}>
              <video
                autoPlay loop muted playsInline
                style={{
                  width: 400, height: 400, borderRadius: '50%', objectFit: 'cover',
                  filter: 'hue-rotate(190deg) saturate(3) brightness(0.55) contrast(1.6)',
                }}
              >
                <source src={VIDEO_SRC} type="video/mp4" />
              </video>
              {/* Glass reflection overlay */}
              <div style={{
                position: 'absolute', inset: 0, borderRadius: '50%', pointerEvents: 'none',
                background: 'radial-gradient(ellipse 60% 40% at 35% 30%, rgba(255,255,255,0.35) 0%, transparent 60%)',
              }} />
              {/* Subtle ring */}
              <div style={{
                position: 'absolute', inset: -2, borderRadius: '50%', pointerEvents: 'none',
                border: '1.5px solid rgba(0,132,255,0.12)',
              }} />
            </div>
          </div>
        </section>
      </div>

      {/* ── FEATURES ── */}
      <section id="features" className="relative" style={{ maxWidth: '1200px', margin: '0 auto', padding: '128px 48px' }}>
        <SectionTitle sub="Fonctionnalités">
          Tout ce qu'il faut pour{' '}
          <em className="not-italic" style={{ color: 'var(--blue)' }}>dominer LinkedIn.</em>
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
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '0 48px' }}>
        <div style={{ height: '1px', background: 'linear-gradient(90deg, transparent, rgba(0,0,0,0.08), transparent)' }} />
      </div>

      {/* ── CAMPAIGNS ── */}
      <section id="campaigns" className="relative" style={{ maxWidth: '1200px', margin: '0 auto', padding: '128px 48px' }}>
        <SectionTitle sub="Campagnes">
          Quatre moteurs,{' '}
          <em className="not-italic" style={{ color: 'var(--blue)' }}>une seule interface.</em>
        </SectionTitle>

        <div className="grid sm:grid-cols-2 gap-5">
          {[
            { title: 'Recherche', icon: '🔍', desc: 'Trouvez automatiquement des prospects par mots-clés et importez-les dans votre CRM. Pagination intelligente, dédoublonnage, limites quotidiennes.', tag: 'Collecte' },
            { title: 'Connexion', icon: '🤝', desc: 'Envoyez des demandes de connexion à vos contacts CRM. Notes personnalisées optionnelles, skip des contacts déjà connectés, suivi du statut.', tag: 'Réseau' },
            { title: 'Message direct', icon: '💬', desc: 'Messages personnalisés avec variables dynamiques et relances automatiques. Templates écrits par vous ou générés entièrement par l\'IA.', tag: 'Prospection' },
            { title: 'Connexion + DM', icon: '⚡', desc: 'Le combo ultime. Envoi de connexion → détection d\'acceptation → cycle DM complet avec relances. Tout automatisé, du premier contact à la réponse.', tag: 'Automatisation' },
          ].map((c, i) => (
            <div key={c.title} className={`reveal reveal-delay-${(i % 2) + 1} g-card rounded-2xl p-8 group hover:scale-[1.02] transition-transform`}>
              <div className="flex items-start justify-between mb-5">
                <span className="text-4xl">{c.icon}</span>
                <span className="text-[10px] tracking-[0.2em] uppercase px-3 py-1 rounded-full" style={{ color: 'var(--text3)', border: '1px solid rgba(0,0,0,0.08)' }}>{c.tag}</span>
              </div>
              <h3 className="f text-xl font-bold mb-3" style={{ color: 'var(--text)' }}>{c.title}</h3>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--text2)' }}>{c.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── DIVIDER ── */}
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '0 48px' }}>
        <div style={{ height: '1px', background: 'linear-gradient(90deg, transparent, rgba(0,0,0,0.08), transparent)' }} />
      </div>

      {/* ── AI SECTION ── */}
      <section id="ai" className="relative" style={{ maxWidth: '1100px', margin: '0 auto', padding: '128px 48px' }}>
        <SectionTitle sub="Intelligence artificielle">
          Chaque message{' '}
          <em className="not-italic" style={{ color: 'var(--blue)' }}>est unique.</em>
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
                <div className="w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-sm font-bold f mt-0.5" style={{ background: 'rgba(0,132,255,0.08)', color: 'var(--blue)', border: '1px solid rgba(0,132,255,0.15)' }}>{i + 1}</div>
                <div>
                  <h4 className="text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>{item.title}</h4>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--text2)' }}>{item.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Right: mock message */}
          <div className="reveal reveal-delay-2">
            <div className="g-card rounded-2xl overflow-hidden">
              <div className="px-6 py-4 flex items-center gap-3" style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium" style={{ background: 'rgba(0,132,255,0.08)', color: 'var(--blue)' }}>TS</div>
                <div>
                  <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>Thomas Shamoev</p>
                  <p className="text-xs" style={{ color: 'var(--text3)' }}>Founder / CEO</p>
                </div>
                <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(0,132,255,0.08)', color: 'var(--blue)', border: '1px solid rgba(0,132,255,0.15)' }}>IA</span>
              </div>
              <div className="p-6 space-y-4">
                <div className="rounded-xl p-4 text-sm leading-relaxed" style={{ background: 'rgba(0, 132, 255, 0.04)', borderLeft: '3px solid rgba(0, 132, 255, 0.3)', color: 'var(--text)' }}>
                  Bonjour Thomas,<br /><br />
                  J'ai vu votre travail sur LinkBot — l'approche d'automatiser la prospection tout en gardant une vraie personnalisation est exactement ce qui manque au marché.<br /><br />
                  J'aimerais échanger avec vous sur une idée complémentaire. Seriez-vous disponible cette semaine ?
                </div>
                <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--text3)' }}>
                  <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--blue)' }} />
                    Basé sur le profil + 3 publications récentes
                  </span>
                </div>
              </div>
              <div className="px-6 py-3" style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                <div className="flex gap-2">
                  {['Principal', 'Relance 1 (J+3)', 'Relance 2 (J+7)'].map((label, i) => (
                    <span key={label} className="text-[10px] px-3 py-1 rounded-full" style={{
                      background: i === 0 ? 'rgba(0,132,255,0.08)' : 'rgba(0,0,0,0.03)',
                      color: i === 0 ? 'var(--blue)' : 'var(--text3)',
                      border: '1px solid ' + (i === 0 ? 'rgba(0,132,255,0.2)' : 'rgba(0,0,0,0.06)'),
                    }}>{label}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── DIVIDER ── */}
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '0 48px' }}>
        <div style={{ height: '1px', background: 'linear-gradient(90deg, transparent, rgba(0,0,0,0.08), transparent)' }} />
      </div>

      {/* ── HOW IT WORKS ── */}
      <section id="how" className="relative" style={{ maxWidth: '1100px', margin: '0 auto', padding: '128px 48px' }}>
        <SectionTitle sub="Comment ça marche">
          Trois étapes,{' '}
          <em className="not-italic" style={{ color: 'var(--blue)' }}>zéro friction.</em>
        </SectionTitle>

        <div className="grid md:grid-cols-3 gap-12 relative">
          {/* Connecting line */}
          <div className="hidden md:block absolute top-7 left-[16.7%] right-[16.7%] h-px" style={{ background: 'linear-gradient(90deg, rgba(0,132,255,0.08), rgba(0,132,255,0.15), rgba(0,132,255,0.08))' }} />

          <Step delay="reveal-delay-1" n="1" title="Connectez LinkedIn" desc="Collez vos cookies li_at et JSESSIONID. Vos identifiants restent stockés localement, jamais envoyés à un serveur externe." />
          <Step delay="reveal-delay-2" n="2" title="Importez ou cherchez" desc="Importez votre réseau existant en un clic, ou lancez une campagne de recherche pour trouver de nouveaux prospects par mots-clés." />
          <Step delay="reveal-delay-3" n="3" title="Automatisez" desc="Créez des campagnes de connexion et de messages. LinkBot s'occupe du reste : envois, relances, détection de réponses, 24h/24." />
        </div>
      </section>

      {/* ── DIVIDER ── */}
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '0 48px' }}>
        <div style={{ height: '1px', background: 'linear-gradient(90deg, transparent, rgba(0,0,0,0.08), transparent)' }} />
      </div>

      {/* ── STATS ── */}
      <section className="relative" style={{ maxWidth: '900px', margin: '0 auto', padding: '128px 48px' }}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-12">
          <Stat delay="reveal-delay-1" value="4" label="Types de campagnes" />
          <Stat delay="reveal-delay-2" value="7" label="Relances automatiques" />
          <Stat delay="reveal-delay-3" value="6h" label="Sync automatique" />
          <Stat delay="reveal-delay-4" value="∞" label="Messages personnalisés" />
        </div>
      </section>

      {/* ── DIVIDER ── */}
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '0 48px' }}>
        <div style={{ height: '1px', background: 'linear-gradient(90deg, transparent, rgba(0,0,0,0.08), transparent)' }} />
      </div>

      {/* ── DETAILS GRID ── */}
      <section className="relative" style={{ maxWidth: '1200px', margin: '0 auto', padding: '128px 48px' }}>
        <SectionTitle sub="Détails">
          Pensé pour les{' '}
          <em className="not-italic" style={{ color: 'var(--blue)' }}>professionnels exigeants.</em>
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
            <div key={item.title} className={`reveal reveal-delay-${(i % 4) + 1} g-card rounded-2xl p-6`}>
              <span className="text-2xl block mb-3">{item.icon}</span>
              <h4 className="text-sm font-semibold mb-2" style={{ color: 'var(--text)' }}>{item.title}</h4>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--text2)' }}>{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA FINAL ── */}
      <section className="relative" style={{ padding: '128px 48px' }}>
        <div className="reveal text-center" style={{ maxWidth: '800px', margin: '0 auto' }}>
          <h2 className="f text-4xl sm:text-6xl md:text-7xl font-bold mb-6" style={{ color: 'var(--text)', lineHeight: 1, letterSpacing: '-2px' }}>
            Prêt à transformer{' '}
            <em className="not-italic" style={{ color: 'var(--blue)' }}>votre prospection ?</em>
          </h2>
          <p className="text-base max-w-xl mx-auto mb-12 leading-relaxed" style={{ color: 'var(--text2)' }}>
            Installez LinkBot, connectez votre compte LinkedIn, et lancez votre première campagne en moins de 5 minutes.
          </p>
          <button onClick={() => navigate('/login')} className="cta-btn rounded-full cursor-pointer hover:scale-[1.03] transition-transform" style={{ padding: '20px 56px', fontSize: '16px' }}>
            Commencer gratuitement
          </button>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="relative" style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 48px 32px' }}>
        <div style={{ height: '1px', marginBottom: '32px', background: 'linear-gradient(90deg, transparent, rgba(0,0,0,0.06), transparent)' }} />
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <span className="f text-xl tracking-tight" style={{ color: 'var(--text3)' }}>
            LinkBot<sup className="text-[8px]">®</sup>
          </span>
          <p className="text-xs" style={{ color: 'var(--text3)' }}>
            Outil local d'automatisation LinkedIn — Vos données restent sur votre machine.
          </p>
        </div>
      </footer>
    </div>
  );
}

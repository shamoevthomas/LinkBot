import { useNavigate, Link as RouterLink } from 'react-router-dom';
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Users, Rocket, Sparkles, Repeat, Activity, Link as LinkIcon,
  Search, UserPlus, MessageSquare, Zap, Shield, FileText, FileSpreadsheet,
  Target, UserCircle, Send, Calendar, ArrowRight,
} from 'lucide-react';

const ORB_SRC = 'https://future.co/images/homepage/glassy-orb/orb-purple.webm';

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
    <div className="reveal text-center mb-14 max-w-3xl mx-auto">
      {sub && <div className="eyebrow mb-3">{sub}</div>}
      <h2 className="text-[40px] sm:text-[52px] md:text-[60px] font-semibold tracking-tight"
        style={{ color: 'hsl(var(--text))', lineHeight: 1.05, letterSpacing: '-0.03em' }}>
        {children}
      </h2>
    </div>
  );
}

function FeatureCard({ icon: Ic, title, desc, tone = 'accent', delay = '' }) {
  return (
    <div className={`reveal ${delay} g-card p-6 transition-all cursor-default`}
      style={{ borderRadius: 18 }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'hsl(var(--border-strong))'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'hsl(var(--border))'; e.currentTarget.style.transform = 'translateY(0)'; }}>
      <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
        style={{ background: `hsl(var(--${tone}) / .12)`, color: `hsl(var(--${tone}))` }}>
        <Ic size={18} />
      </div>
      <h3 className="text-[15px] font-semibold mb-2" style={{ color: 'hsl(var(--text))', letterSpacing: '-0.01em' }}>{title}</h3>
      <p className="text-[13px] leading-relaxed" style={{ color: 'hsl(var(--muted))' }}>{desc}</p>
    </div>
  );
}

function Step({ n, title, desc, delay = '' }) {
  return (
    <div className={`reveal ${delay} flex flex-col items-center text-center relative z-10`}>
      <div className="w-14 h-14 rounded-full flex items-center justify-center text-[20px] font-semibold mb-4 mono"
        style={{
          background: 'hsl(var(--accent-soft))',
          color: 'hsl(var(--accent))',
          border: '1px solid hsl(var(--accent) / .2)',
        }}>{n}</div>
      <h3 className="text-[15px] font-semibold mb-2" style={{ color: 'hsl(var(--text))' }}>{title}</h3>
      <p className="text-[13px] leading-relaxed max-w-[280px]" style={{ color: 'hsl(var(--muted))' }}>{desc}</p>
    </div>
  );
}

function Stat({ value, label, delay = '' }) {
  return (
    <div className={`reveal ${delay} text-center`}>
      <div className="text-[48px] sm:text-[56px] font-semibold tracking-tight mb-1 mono"
        style={{ color: 'hsl(var(--accent))', letterSpacing: '-0.03em' }}>{value}</div>
      <p className="text-[12.5px]" style={{ color: 'hsl(var(--muted))' }}>{label}</p>
    </div>
  );
}

export default function LandingPage() {
  const navigate = useNavigate();
  const page = useReveal();
  const [splash, setSplash] = useState(false);
  const [drops, setDrops] = useState([]);
  const splashTimer = useRef(null);

  const triggerSplash = useCallback(() => {
    if (splash) return;
    setSplash(true);
    const newDrops = Array.from({ length: 50 }).map((_, i) => {
      const angle = Math.random() * Math.PI * 2;
      const speed = 300 + Math.random() * 900;
      const size = 6 + Math.random() * 22;
      const duration = 0.8 + Math.random() * 1.2;
      const delay = Math.random() * 0.25;
      return {
        id: i,
        tx: Math.cos(angle) * speed,
        ty: Math.sin(angle) * speed - 100 * Math.random(),
        size, duration, delay,
        opacity: 0.4 + Math.random() * 0.5,
        blur: Math.random() > 0.6 ? 2 : 0,
      };
    });
    setDrops(newDrops);
    splashTimer.current = setTimeout(() => { setSplash(false); setDrops([]); }, 3000);
  }, [splash]);

  useEffect(() => () => clearTimeout(splashTimer.current), []);

  return (
    <div ref={page} style={{
      background: 'hsl(var(--bg))',
      color: 'hsl(var(--text))',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Ambient blobs */}
      <div style={{
        position: 'fixed', top: '-20%', left: '-10%', width: 600, height: 600,
        background: 'radial-gradient(circle, hsl(var(--accent) / .06), transparent 70%)',
        filter: 'blur(80px)', pointerEvents: 'none', zIndex: 0,
      }} />
      <div style={{
        position: 'fixed', bottom: '-10%', right: '-10%', width: 500, height: 500,
        background: 'radial-gradient(circle, hsl(var(--accent) / .05), transparent 70%)',
        filter: 'blur(80px)', pointerEvents: 'none', zIndex: 0,
      }} />

      {/* ── HERO ── */}
      <div className="relative overflow-hidden" style={{ minHeight: '100vh' }}>
        {/* Top wash */}
        <div style={{
          position: 'absolute', top: -100, left: '50%', transform: 'translateX(-50%)',
          width: 1200, height: 500,
          background: 'radial-gradient(ellipse 70% 60% at 50% 0%, hsl(var(--accent) / .12), hsl(var(--accent) / .04) 50%, transparent 100%)',
          pointerEvents: 'none', zIndex: 0,
        }} />

        {/* Topbar */}
        <div style={{ position: 'relative', zIndex: 10, maxWidth: 1160, margin: '0 auto', padding: '18px 20px 0' }}>
          <nav className="flex items-center justify-between"
            style={{
              padding: '10px 18px',
              background: 'hsl(var(--panel) / .75)',
              backdropFilter: 'saturate(180%) blur(14px)',
              border: '1px solid hsl(var(--border))',
              borderRadius: 16,
              boxShadow: '0 1px 2px -1px hsl(220 40% 20% / .04)',
            }}>
            <RouterLink to="/" className="flex items-center gap-2"
              style={{ textDecoration: 'none', color: 'hsl(var(--text))' }}>
              <div className="w-8 h-8 rounded-xl flex items-center justify-center"
                style={{
                  background: 'hsl(var(--accent))', color: 'white',
                  boxShadow: '0 6px 16px -6px hsl(var(--accent) / .6)',
                }}>
                <LinkIcon size={14} />
              </div>
              <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em' }}>LinkBot</span>
            </RouterLink>

            <div className="hidden md:flex items-center gap-7">
              {[
                ['Fonctionnalités', '#features'],
                ['Campagnes', '#campaigns'],
                ['IA', '#ai'],
                ['Comment ça marche', '#how'],
              ].map(([label, href]) => (
                <a key={label} href={href}
                  className="transition-colors"
                  style={{ fontSize: 13, color: 'hsl(var(--muted))', textDecoration: 'none' }}
                  onMouseEnter={(e) => e.currentTarget.style.color = 'hsl(var(--text))'}
                  onMouseLeave={(e) => e.currentTarget.style.color = 'hsl(var(--muted))'}>
                  {label}
                </a>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <button onClick={() => navigate('/login')}
                className="transition-colors"
                style={{
                  fontSize: 13, color: 'hsl(var(--muted))',
                  background: 'none', border: 'none', cursor: 'pointer', padding: '6px 10px',
                }}
                onMouseEnter={(e) => e.currentTarget.style.color = 'hsl(var(--text))'}
                onMouseLeave={(e) => e.currentTarget.style.color = 'hsl(var(--muted))'}>
                Se connecter
              </button>
              <button onClick={() => navigate('/register')} className="cta-btn" style={{ padding: '8px 18px', fontSize: 13 }}>
                S'inscrire
              </button>
            </div>
          </nav>
        </div>

        {/* Hero content */}
        <section className="relative z-10 flex flex-col md:flex-row items-center"
          style={{ maxWidth: 1200, margin: '0 auto', padding: '40px 20px 60px', gap: 48, minHeight: 'calc(100vh - 120px)' }}>
          <div className="animate-fade-rise text-center md:text-left" style={{ flex: 1 }}>
            <div className="chip blue mb-5" style={{ fontSize: 11, padding: '4px 12px' }}>
              <Sparkles size={11} />
              Propulsé par IA
            </div>
            <h1 style={{
              fontSize: 'clamp(40px, 5.5vw, 68px)',
              fontWeight: 600, lineHeight: 1.02,
              letterSpacing: '-0.03em',
              color: 'hsl(var(--text))',
            }}>
              Automatisez votre{' '}
              <span style={{ color: 'hsl(var(--accent))' }}>prospection</span>{' '}
              avec élégance et{' '}
              <span style={{ color: 'hsl(var(--accent))' }}>précision</span>.
            </h1>
            <p className="animate-fade-rise-delay mx-auto md:mx-0"
              style={{
                fontSize: 15.5, lineHeight: 1.65,
                color: 'hsl(var(--muted))',
                maxWidth: 500, marginTop: 24,
              }}>
              CRM intelligent, campagnes automatiques, messages personnalisés par IA.
              LinkBot transforme votre réseau LinkedIn en machine de croissance,
              pendant que vous vous concentrez sur l'essentiel.
            </p>
            <div className="animate-fade-rise-delay-2 flex flex-wrap items-center gap-3" style={{ marginTop: 32 }}>
              <button onClick={() => navigate('/register')} className="cta-btn"
                style={{ padding: '14px 28px', fontSize: 14 }}>
                Commencer gratuitement <ArrowRight size={14} />
              </button>
              <button onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}
                className="ghost-btn" style={{ padding: '13px 22px', fontSize: 13 }}>
                Voir les fonctionnalités
              </button>
            </div>
          </div>

          {/* Orb */}
          <div
            className="animate-fade-rise-delay hidden md:flex"
            onMouseEnter={triggerSplash}
            style={{
              flex: 1, justifyContent: 'center', alignItems: 'center',
              position: 'relative', overflow: 'visible', cursor: 'pointer',
              minHeight: 500,
            }}>
            <video
              autoPlay loop muted playsInline
              style={{
                width: 500, height: 500,
                transform: 'scale(1.25)',
                mixBlendMode: 'screen',
                filter: 'hue-rotate(-55deg) saturate(250%) brightness(1.2) contrast(1.1)',
                pointerEvents: 'none',
                transition: 'opacity 0.3s',
                opacity: splash ? 0 : 1,
              }}>
              <source src={ORB_SRC} type="video/webm" />
            </video>

            {splash && (
              <div style={{
                position: 'absolute', top: '50%', left: '50%',
                transform: 'translate(-50%, -50%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                animation: 'orbLogoIn 0.6s cubic-bezier(0.22,1,0.36,1) forwards',
              }}>
                <div style={{
                  position: 'absolute', width: 600, height: 600, borderRadius: '50%',
                  background: 'radial-gradient(circle, hsl(var(--accent) / .25), hsl(var(--accent) / .08) 50%, transparent 70%)',
                  filter: 'blur(40px)', pointerEvents: 'none',
                }} />
                <div style={{
                  position: 'absolute', width: 480, height: 480, borderRadius: '50%',
                  background: 'radial-gradient(circle at 35% 28%, rgba(120,190,255,0.4) 0%, hsl(var(--accent) / .12) 35%, rgba(0,80,200,0.08) 60%, transparent 80%)',
                  border: '1.5px solid hsl(var(--accent) / .15)',
                  boxShadow: 'inset 0 4px 30px rgba(255,255,255,0.2), inset 0 -15px 30px rgba(0,60,160,0.1), 0 0 60px hsl(var(--accent) / .15)',
                  backdropFilter: 'blur(8px)',
                }} />
                <div style={{
                  position: 'absolute', width: 480, height: 480, borderRadius: '50%',
                  background: 'radial-gradient(ellipse 50% 35% at 35% 25%, rgba(255,255,255,0.45), transparent 60%)',
                  pointerEvents: 'none',
                }} />
                <img src="/linkedin.png" alt="LinkedIn"
                  style={{
                    position: 'relative', zIndex: 2,
                    width: 400, height: 400, objectFit: 'contain',
                    filter: 'drop-shadow(0 4px 20px hsl(var(--accent) / .4))',
                  }} />
              </div>
            )}

            {drops.map((d) => (
              <div key={d.id} style={{
                position: 'absolute', top: '50%', left: '50%',
                width: d.size, height: d.size, borderRadius: '50%',
                background: `radial-gradient(circle at 35% 30%, rgba(120,200,255,${d.opacity}), hsl(var(--accent) / ${d.opacity * 0.8}))`,
                boxShadow: d.blur ? `0 0 ${d.blur * 3}px hsl(var(--accent) / .3)` : 'none',
                filter: d.blur ? `blur(${d.blur}px)` : 'none',
                animation: `dropFly ${d.duration}s ${d.delay}s cubic-bezier(0.2,0.8,0.3,1) forwards`,
                opacity: 0, pointerEvents: 'none', zIndex: 50,
                '--tx': `${d.tx}px`, '--ty': `${d.ty}px`,
              }} />
            ))}
          </div>
        </section>
      </div>

      {/* ── FEATURES ── */}
      <section id="features" className="relative" style={{ maxWidth: 1200, margin: '0 auto', padding: '72px 20px' }}>
        <SectionTitle sub="Fonctionnalités">
          Tout ce qu'il faut pour{' '}
          <span style={{ color: 'hsl(var(--accent))' }}>dominer LinkedIn</span>.
        </SectionTitle>

        {/* Bento grid — 3 rows of 6 cells, cards span 2–4 cells */}
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4 auto-rows-[minmax(0,auto)]">
          {/* CRM intelligent — big card with a mini contact list preview */}
          <div className="reveal reveal-delay-1 g-card overflow-hidden md:col-span-4" style={{ borderRadius: 20 }}>
            <div className="p-7">
              <div className="eyebrow mb-3" style={{ color: 'hsl(var(--accent))' }}>CRM</div>
              <h3 className="text-[22px] font-semibold tracking-tight mb-2" style={{ letterSpacing: '-0.02em' }}>
                Un CRM conçu pour LinkedIn.
              </h3>
              <p className="text-[13.5px] max-w-md leading-relaxed" style={{ color: 'hsl(var(--muted))' }}>
                Listes segmentées, recherche instantanée, actions groupées, historique complet. Vos contacts enfin organisés.
              </p>
            </div>
            {/* Mini contact list mockup */}
            <div className="px-7 pb-7">
              <div className="g-card-soft overflow-hidden"
                style={{ background: 'hsl(220 22% 98%)' }}>
                {[
                  { n: 'Cédric Rasolo',      h: 'Closer · Inbound B2B',     hue: 'accent',  status: 'Répondu', statusTone: 'emerald' },
                  { n: 'Aurélie Ouanessan',  h: 'Growth Marketing',          hue: 'violet',  status: 'Relance 1', statusTone: 'amber' },
                  { n: 'Julien Marchetti',   h: 'Head of Sales · SaaS',      hue: 'emerald', status: 'Envoyé',   statusTone: 'blue' },
                ].map((c, i) => (
                  <div key={i} className={`flex items-center gap-3 px-4 py-3 ${i < 2 ? 'border-b' : ''}`}
                    style={{ borderColor: 'hsl(var(--border))' }}>
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold"
                      style={{
                        background: `linear-gradient(135deg, hsl(var(--${c.hue})), hsl(var(--${c.hue}) / .7))`,
                        color: 'white',
                      }}>
                      {c.n.split(' ').map((p) => p[0]).join('').slice(0, 2)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12.5px] font-medium truncate">{c.n}</div>
                      <div className="text-[11px] truncate" style={{ color: 'hsl(var(--muted))' }}>{c.h}</div>
                    </div>
                    <span className={`chip ${c.statusTone}`} style={{ fontSize: 10 }}>{c.status}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* IA Gemini — tall narrow card with message preview */}
          <div className="reveal reveal-delay-2 g-card overflow-hidden md:col-span-2"
            style={{
              borderRadius: 20,
              background: 'linear-gradient(180deg, hsl(var(--panel)) 0%, hsl(262 60% 98%) 100%)',
            }}>
            <div className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                  style={{ background: 'hsl(var(--violet) / .14)', color: 'hsl(var(--violet))' }}>
                  <Sparkles size={16} />
                </div>
                <span className="chip violet" style={{ fontSize: 10.5 }}>IA</span>
              </div>
              <h3 className="text-[17px] font-semibold mb-2 tracking-tight" style={{ letterSpacing: '-0.01em' }}>
                Chaque message, unique.
              </h3>
              <p className="text-[12.5px] leading-relaxed mb-4" style={{ color: 'hsl(var(--muted))' }}>
                Gemini personnalise chaque message à partir du profil, de l'expérience et des publications.
              </p>
              {/* Fake message bubbles */}
              <div className="space-y-2">
                {[
                  'Bonjour Claire, j\'ai vu votre intervention...',
                  'Salut Paul, votre parcours chez Alan...',
                  'Hello Nora, votre post sur la RSE...',
                ].map((t, i) => (
                  <div key={i} className="rounded-lg px-3 py-2 text-[11px] leading-snug truncate"
                    style={{
                      background: 'hsl(var(--panel))',
                      border: '1px solid hsl(var(--border))',
                      color: 'hsl(var(--muted))',
                    }}>{t}</div>
                ))}
              </div>
            </div>
          </div>

          {/* 4 types de campagnes */}
          <div className="reveal reveal-delay-1 g-card overflow-hidden md:col-span-2" style={{ borderRadius: 20 }}>
            <div className="p-6">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-4"
                style={{ background: 'hsl(var(--accent) / .12)', color: 'hsl(var(--accent))' }}>
                <Rocket size={16} />
              </div>
              <h3 className="text-[17px] font-semibold mb-2 tracking-tight" style={{ letterSpacing: '-0.01em' }}>
                4 types de campagnes.
              </h3>
              <p className="text-[12.5px] leading-relaxed mb-4" style={{ color: 'hsl(var(--muted))' }}>
                Recherche, Connexion, DM, Connexion + DM. Tout tourne en arrière-plan.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {[
                  ['Recherche', 'blue'],
                  ['Connexion', 'blue'],
                  ['Message', 'emerald'],
                  ['Combo', 'violet'],
                ].map(([label, tone]) => (
                  <span key={label} className={`chip ${tone}`} style={{ fontSize: 10.5 }}>{label}</span>
                ))}
              </div>
            </div>
          </div>

          {/* Suivi en temps réel — big card with funnel mini */}
          <div className="reveal reveal-delay-2 g-card overflow-hidden md:col-span-4" style={{ borderRadius: 20 }}>
            <div className="p-7">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="eyebrow mb-2">Suivi</div>
                  <h3 className="text-[20px] font-semibold tracking-tight" style={{ letterSpacing: '-0.02em' }}>
                    Dashboard temps réel.
                  </h3>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="live-dot" />
                  <span className="mono text-[10.5px]" style={{ color: 'hsl(var(--emerald))' }}>LIVE</span>
                </div>
              </div>
              <p className="text-[13px] leading-relaxed mb-5 max-w-md" style={{ color: 'hsl(var(--muted))' }}>
                Statut de chaque contact, taux de réponse, logs d'actions. Vous voyez tout, vous contrôlez tout.
              </p>
              {/* Mini funnel */}
              <div className="space-y-2">
                {[
                  { label: 'Invitations envoyées', value: 648, tone: 'accent',  pct: 100 },
                  { label: 'Acceptées',             value: 412, tone: 'violet',  pct: 64 },
                  { label: 'Réponses',              value: 143, tone: 'emerald', pct: 22 },
                ].map((s) => (
                  <div key={s.label} className="flex items-center gap-3">
                    <div className="w-36 text-[11.5px] shrink-0" style={{ color: 'hsl(var(--muted))' }}>{s.label}</div>
                    <div className="flex-1 h-6 rounded-lg overflow-hidden relative" style={{ background: 'hsl(220 22% 97%)' }}>
                      <div className="absolute inset-y-0 left-0 flex items-center pl-2 rounded-lg"
                        style={{
                          width: `${s.pct}%`,
                          background: `linear-gradient(90deg, hsl(var(--${s.tone}) / .24), hsl(var(--${s.tone}) / .14))`,
                          borderLeft: `3px solid hsl(var(--${s.tone}))`,
                        }}>
                        <span className="mono text-[10.5px] font-semibold" style={{ color: `hsl(var(--${s.tone}))` }}>
                          {s.value}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Cycle de relances */}
          <div className="reveal reveal-delay-1 g-card overflow-hidden md:col-span-2" style={{ borderRadius: 20 }}>
            <div className="p-6">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-4"
                style={{ background: 'hsl(var(--amber) / .14)', color: 'hsl(var(--amber))' }}>
                <Repeat size={16} />
              </div>
              <h3 className="text-[17px] font-semibold mb-2 tracking-tight" style={{ letterSpacing: '-0.01em' }}>
                Cycle de relances.
              </h3>
              <p className="text-[12.5px] leading-relaxed mb-4" style={{ color: 'hsl(var(--muted))' }}>
                Jusqu'à 7 relances, délais configurables, arrêt automatique à la première réponse.
              </p>
              {/* Timeline dots */}
              <div className="flex items-center gap-1">
                {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="flex items-center">
                    <div className="rounded-full"
                      style={{
                        width: 8, height: 8,
                        background: i === 0
                          ? 'hsl(var(--accent))'
                          : i < 4
                            ? 'hsl(var(--amber))'
                            : 'hsl(var(--border-strong))',
                      }} />
                    {i < 6 && <div style={{ width: 16, height: 1, background: 'hsl(var(--border-strong))' }} />}
                  </div>
                ))}
              </div>
              <div className="mono text-[10px] mt-2" style={{ color: 'hsl(var(--muted))' }}>
                J+0 → J+3 → J+7 → J+14 →…
              </div>
            </div>
          </div>

          {/* Sync automatique — wide low card */}
          <div className="reveal reveal-delay-2 g-card overflow-hidden md:col-span-3" style={{ borderRadius: 20 }}>
            <div className="p-6 flex items-center gap-5">
              <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: 'hsl(var(--accent) / .12)', color: 'hsl(var(--accent))' }}>
                <LinkIcon size={18} />
              </div>
              <div className="min-w-0">
                <h3 className="text-[15px] font-semibold mb-1 tracking-tight" style={{ letterSpacing: '-0.01em' }}>
                  Sync automatique toutes les 6h.
                </h3>
                <p className="text-[12.5px] leading-relaxed" style={{ color: 'hsl(var(--muted))' }}>
                  Votre réseau importé en un clic. Les nouvelles connexions rejoignent votre CRM en arrière-plan.
                </p>
              </div>
            </div>
          </div>

          {/* 100% local */}
          <div className="reveal reveal-delay-3 g-card overflow-hidden md:col-span-3" style={{ borderRadius: 20 }}>
            <div className="p-6 flex items-center gap-5">
              <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: 'hsl(var(--emerald) / .14)', color: 'hsl(var(--emerald))' }}>
                <Shield size={18} />
              </div>
              <div className="min-w-0">
                <h3 className="text-[15px] font-semibold mb-1 tracking-tight" style={{ letterSpacing: '-0.01em' }}>
                  Vos données restent chez vous.
                </h3>
                <p className="text-[12.5px] leading-relaxed" style={{ color: 'hsl(var(--muted))' }}>
                  Cookies LinkedIn stockés localement, aucun tiers. Vous gardez la main.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── CAMPAIGNS ── */}
      <section id="campaigns" className="relative" style={{ maxWidth: 1200, margin: '0 auto', padding: '72px 20px' }}>
        <SectionTitle sub="Campagnes">
          Quatre moteurs,{' '}
          <span style={{ color: 'hsl(var(--accent))' }}>une seule interface</span>.
        </SectionTitle>

        <div className="grid grid-cols-1 md:grid-cols-6 gap-4 auto-rows-[minmax(0,auto)]">
          {/* Recherche — card with search bar + result rows */}
          <div className="reveal reveal-delay-1 g-card overflow-hidden md:col-span-3" style={{ borderRadius: 20 }}>
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: 'hsl(var(--accent) / .12)', color: 'hsl(var(--accent))' }}>
                  <Search size={17} />
                </div>
                <span className="chip blue" style={{ fontSize: 10.5 }}>Collecte</span>
              </div>
              <h3 className="text-[18px] font-semibold mb-2 tracking-tight" style={{ letterSpacing: '-0.01em' }}>Recherche</h3>
              <p className="text-[13px] leading-relaxed mb-4" style={{ color: 'hsl(var(--muted))' }}>
                Trouvez des prospects par mots-clés et importez-les automatiquement. Pagination intelligente, dédoublonnage.
              </p>
              <div className="g-card-soft p-3" style={{ background: 'hsl(220 22% 98%)' }}>
                <div className="flex items-center gap-2 mb-2 px-2 py-1.5 rounded-lg"
                  style={{ background: 'hsl(var(--panel))', border: '1px solid hsl(var(--border))' }}>
                  <Search size={11} style={{ color: 'hsl(var(--muted))' }} />
                  <span className="text-[11.5px]" style={{ color: 'hsl(var(--text))' }}>Head of Sales · Paris</span>
                </div>
                <div className="space-y-1 text-[11px]">
                  {[
                    ['Clara Dumont',   'VP Sales · SaaS'],
                    ['Mathieu Lenoir', 'Head of Sales · Fintech'],
                    ['Léa Ferreira',   'Head of Growth'],
                  ].map(([n, h]) => (
                    <div key={n} className="flex items-center justify-between px-2 py-1 rounded">
                      <span className="font-medium">{n}</span>
                      <span style={{ color: 'hsl(var(--muted))' }}>{h}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Connexion — card with invite preview */}
          <div className="reveal reveal-delay-2 g-card overflow-hidden md:col-span-3" style={{ borderRadius: 20 }}>
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: 'hsl(var(--emerald) / .14)', color: 'hsl(var(--emerald))' }}>
                  <UserPlus size={17} />
                </div>
                <span className="chip emerald" style={{ fontSize: 10.5 }}>Réseau</span>
              </div>
              <h3 className="text-[18px] font-semibold mb-2 tracking-tight" style={{ letterSpacing: '-0.01em' }}>Connexion</h3>
              <p className="text-[13px] leading-relaxed mb-4" style={{ color: 'hsl(var(--muted))' }}>
                Envoyez des demandes avec notes personnalisées, skip des contacts déjà connectés, suivi du statut.
              </p>
              <div className="g-card-soft p-3 flex items-center gap-3" style={{ background: 'hsl(220 22% 98%)' }}>
                <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: 'linear-gradient(135deg, hsl(var(--emerald)), hsl(var(--emerald) / .7))', color: 'white', fontSize: 11, fontWeight: 600 }}>
                  CD
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-medium truncate">Clara Dumont</div>
                  <div className="text-[10.5px]" style={{ color: 'hsl(var(--muted))' }}>« Salut Clara, ravi de découvrir… »</div>
                </div>
                <span className="chip emerald" style={{ fontSize: 10 }} dot>Acceptée</span>
              </div>
            </div>
          </div>

          {/* Message direct — card with DM bubble + relance chips */}
          <div className="reveal reveal-delay-1 g-card overflow-hidden md:col-span-3"
            style={{
              borderRadius: 20,
              background: 'linear-gradient(180deg, hsl(var(--panel)) 0%, hsl(262 60% 98%) 100%)',
            }}>
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: 'hsl(var(--violet) / .14)', color: 'hsl(var(--violet))' }}>
                  <MessageSquare size={17} />
                </div>
                <span className="chip violet" style={{ fontSize: 10.5 }}>Prospection</span>
              </div>
              <h3 className="text-[18px] font-semibold mb-2 tracking-tight" style={{ letterSpacing: '-0.01em' }}>Message direct</h3>
              <p className="text-[13px] leading-relaxed mb-4" style={{ color: 'hsl(var(--muted))' }}>
                Messages personnalisés avec variables et relances. Templates écrits par vous ou générés par l'IA.
              </p>
              <div className="rounded-xl p-3 text-[11.5px] leading-snug mb-3"
                style={{
                  background: 'hsl(var(--panel))',
                  borderLeft: '2.5px solid hsl(var(--violet) / .4)',
                  border: '1px solid hsl(var(--border))',
                  color: 'hsl(var(--text))',
                }}>
                « Bonjour Clara, votre post sur le pricing SaaS m'a interpellé… »
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[
                  ['Principal',     'blue'],
                  ['Relance J+3',   'slate'],
                  ['Relance J+7',   'slate'],
                  ['Relance J+14',  'slate'],
                ].map(([label, tone]) => (
                  <span key={label} className={`chip ${tone}`} style={{ fontSize: 10 }}>{label}</span>
                ))}
              </div>
            </div>
          </div>

          {/* Connexion + DM — card with mini flow diagram */}
          <div className="reveal reveal-delay-2 g-card overflow-hidden md:col-span-3"
            style={{
              borderRadius: 20,
              background: 'linear-gradient(180deg, hsl(var(--panel)) 0%, hsl(38 100% 97%) 100%)',
            }}>
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: 'hsl(var(--amber) / .16)', color: 'hsl(var(--amber))' }}>
                  <Zap size={17} />
                </div>
                <span className="chip amber" style={{ fontSize: 10.5 }}>Automatisation</span>
              </div>
              <h3 className="text-[18px] font-semibold mb-2 tracking-tight" style={{ letterSpacing: '-0.01em' }}>Connexion + DM</h3>
              <p className="text-[13px] leading-relaxed mb-4" style={{ color: 'hsl(var(--muted))' }}>
                Le combo ultime. Envoi d'invitation, détection d'acceptation, puis cycle DM complet avec relances.
              </p>
              {/* Mini flow */}
              <div className="flex items-center gap-2">
                {[
                  { label: 'Invitation',  tone: 'accent',  icon: UserPlus },
                  { label: 'Acceptation', tone: 'emerald', icon: ArrowRight, isArrow: true },
                  { label: 'DM + relances', tone: 'violet', icon: MessageSquare },
                ].map((s, i, arr) => {
                  const Ic = s.icon;
                  if (s.isArrow) {
                    return (
                      <div key={s.label} className="flex flex-col items-center shrink-0" style={{ minWidth: 20 }}>
                        <ArrowRight size={14} style={{ color: 'hsl(var(--muted))' }} />
                      </div>
                    );
                  }
                  return (
                    <div key={s.label} className="flex-1">
                      <div className="rounded-lg px-2.5 py-2 text-center"
                        style={{
                          background: `hsl(var(--${s.tone}) / .1)`,
                          border: `1px solid hsl(var(--${s.tone}) / .25)`,
                        }}>
                        <Ic size={13} style={{ color: `hsl(var(--${s.tone}))`, margin: '0 auto', display: 'block', marginBottom: 2 }} />
                        <div className="text-[10.5px] font-medium" style={{ color: `hsl(var(--${s.tone}))` }}>{s.label}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── AI SECTION ── */}
      <section id="ai" className="relative" style={{ maxWidth: 1100, margin: '0 auto', padding: '72px 20px' }}>
        <SectionTitle sub="Intelligence artificielle">
          Chaque message{' '}
          <span style={{ color: 'hsl(var(--accent))' }}>est unique</span>.
        </SectionTitle>

        <div className="grid lg:grid-cols-2 gap-8 items-start">
          <div className="reveal space-y-6">
            {[
              { title: 'Template + variable {compliment}', desc: "Vous écrivez la trame, l'IA génère une accroche personnalisée pour chaque contact en analysant son profil, son expérience et ses publications." },
              { title: 'Message entier par l\'IA',          desc: "L'IA rédige le message complet de A à Z. Chaque contact reçoit un texte unique adapté à son parcours. Aperçu sur les 3 premiers avant lancement." },
              { title: 'Relances intelligentes',            desc: "Les relances sont aussi personnalisées. L'IA adapte le ton et l'angle à chaque étape du cycle pour maximiser les réponses." },
            ].map((item, i) => (
              <div key={i} className="flex gap-4">
                <div className="w-8 h-8 shrink-0 rounded-lg flex items-center justify-center mono text-[13px] font-semibold mt-0.5"
                  style={{
                    background: 'hsl(var(--accent-soft))',
                    color: 'hsl(var(--accent))',
                    border: '1px solid hsl(var(--accent) / .2)',
                  }}>{i + 1}</div>
                <div>
                  <h4 className="text-[14px] font-semibold mb-1" style={{ color: 'hsl(var(--text))' }}>{item.title}</h4>
                  <p className="text-[13px] leading-relaxed" style={{ color: 'hsl(var(--muted))' }}>{item.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="reveal reveal-delay-2">
            <div className="g-card overflow-hidden">
              <div className="flex items-center gap-3 px-5 py-4"
                style={{ borderBottom: '1px solid hsl(var(--border))' }}>
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-[12px] font-semibold"
                  style={{ background: 'hsl(var(--accent-soft))', color: 'hsl(var(--accent))' }}>TS</div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium" style={{ color: 'hsl(var(--text))' }}>Thomas Shamoev</div>
                  <div className="text-[11.5px]" style={{ color: 'hsl(var(--muted))' }}>Founder / CEO</div>
                </div>
                <span className="chip violet" style={{ fontSize: 10 }}>
                  <Sparkles size={10} /> IA
                </span>
              </div>
              <div className="p-5 space-y-3">
                <div className="rounded-xl p-4 text-[13px] leading-relaxed"
                  style={{
                    background: 'hsl(var(--accent-soft))',
                    borderLeft: '3px solid hsl(var(--accent) / .4)',
                    color: 'hsl(var(--text))',
                  }}>
                  Bonjour Thomas,<br /><br />
                  J'ai vu votre travail sur LinkBot — automatiser la prospection tout en gardant une vraie personnalisation est exactement ce qui manque au marché.<br /><br />
                  J'aimerais échanger avec vous sur une idée complémentaire. Seriez-vous disponible cette semaine ?
                </div>
                <div className="flex items-center gap-2 text-[11px]" style={{ color: 'hsl(var(--muted))' }}>
                  <span className="live-dot" style={{ width: 5, height: 5 }} />
                  Basé sur le profil + 3 publications récentes
                </div>
              </div>
              <div className="px-5 py-3 flex gap-1.5" style={{ borderTop: '1px solid hsl(var(--border))' }}>
                {['Principal', 'Relance 1 (J+3)', 'Relance 2 (J+7)'].map((label, i) => (
                  <span key={label} className={`chip ${i === 0 ? 'blue' : 'slate'}`} style={{ fontSize: 10.5 }}>
                    {label}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section id="how" className="relative" style={{ maxWidth: 1100, margin: '0 auto', padding: '72px 20px' }}>
        <SectionTitle sub="Comment ça marche">
          Trois étapes,{' '}
          <span style={{ color: 'hsl(var(--accent))' }}>zéro friction</span>.
        </SectionTitle>

        <div className="grid md:grid-cols-3 gap-8 relative">
          <div className="hidden md:block absolute top-7 left-[16.7%] right-[16.7%] h-px"
            style={{ background: 'linear-gradient(90deg, hsl(var(--accent) / .1), hsl(var(--accent) / .25), hsl(var(--accent) / .1))' }} />
          <Step delay="reveal-delay-1" n="1" title="Connectez LinkedIn"
            desc="Collez vos cookies li_at et JSESSIONID. Stockés localement, jamais envoyés à un serveur externe." />
          <Step delay="reveal-delay-2" n="2" title="Importez ou cherchez"
            desc="Importez votre réseau existant en un clic, ou lancez une campagne de recherche par mots-clés." />
          <Step delay="reveal-delay-3" n="3" title="Automatisez"
            desc="Créez vos campagnes. LinkBot gère envois, relances et détection de réponses, 24h/24." />
        </div>
      </section>

      {/* ── STATS ── */}
      <section className="relative" style={{ maxWidth: 900, margin: '0 auto', padding: '56px 20px' }}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-10">
          <Stat delay="reveal-delay-1" value="4"  label="Types de campagnes" />
          <Stat delay="reveal-delay-2" value="7"  label="Relances automatiques" />
          <Stat delay="reveal-delay-3" value="6h" label="Sync automatique" />
          <Stat delay="reveal-delay-4" value="∞"  label="Messages personnalisés" />
        </div>
      </section>

      {/* ── DETAILS ── editorial two-column list, not a cards grid */}
      <section className="relative" style={{ maxWidth: 1100, margin: '0 auto', padding: '72px 20px' }}>
        <SectionTitle sub="Détails">
          Pensé pour les{' '}
          <span style={{ color: 'hsl(var(--accent))' }}>professionnels exigeants</span>.
        </SectionTitle>

        <div className="grid md:grid-cols-2 gap-x-14 gap-y-7">
          {[
            { icon: Shield,          tone: 'emerald', title: '100% local',       desc: 'Vos cookies LinkedIn restent sur votre serveur. Aucun tiers, aucun relais externe.' },
            { icon: FileText,        tone: 'violet',  title: 'Import PDF',       desc: "Fournissez un PDF comme contexte IA — plaquette, offre, pitch — et nourrissez la génération de messages." },
            { icon: FileSpreadsheet, tone: 'emerald', title: 'Import CSV',       desc: 'Chargez vos contacts depuis un fichier existant avec un mapping de colonnes flexible.' },
            { icon: Target,          tone: 'amber',   title: 'Limites intelligentes', desc: 'Max par jour, étalement sur N jours, total cible. Le rythme reste sous votre contrôle.' },
            { icon: UserCircle,      tone: 'accent',  title: 'Fiche contact complète', desc: 'Photo, headline, historique d\'envois, statut live, actions directes depuis le panel.' },
            { icon: Send,            tone: 'accent',  title: 'Message depuis le CRM', desc: 'Envoyez un DM à n\'importe quel contact depuis sa fiche, avec ou sans IA.' },
            { icon: Zap,             tone: 'amber',   title: 'Connexion + DM',   desc: 'Demande envoyée, acceptation détectée, puis cycle de DM déclenché automatiquement.' },
            { icon: Calendar,        tone: 'slate',   title: "Journal d'activité", desc: 'Journal exhaustif de chaque action, filtrable et paginé, avec détails d\'erreurs.' },
          ].map((item, i) => {
            const Ic = item.icon;
            return (
              <div key={item.title} className={`reveal reveal-delay-${(i % 4) + 1} flex gap-4 group`}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors"
                  style={{ background: `hsl(var(--${item.tone}) / .1)`, color: `hsl(var(--${item.tone}))` }}>
                  <Ic size={16} />
                </div>
                <div className="pt-0.5">
                  <h4 className="text-[14.5px] font-semibold mb-1" style={{ color: 'hsl(var(--text))', letterSpacing: '-0.01em' }}>
                    {item.title}
                  </h4>
                  <p className="text-[13px] leading-relaxed" style={{ color: 'hsl(var(--muted))' }}>{item.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── CTA FINAL ── */}
      <section className="relative" style={{ padding: '80px 20px' }}>
        <div className="reveal text-center g-card"
          style={{
            maxWidth: 860, margin: '0 auto', padding: '56px 32px',
            background: 'linear-gradient(135deg, hsl(var(--panel)) 0%, hsl(var(--accent-soft)) 100%)',
            border: '1px solid hsl(var(--accent) / .2)',
          }}>
          <h2 className="text-[38px] sm:text-[52px] font-semibold tracking-tight mb-5"
            style={{ color: 'hsl(var(--text))', lineHeight: 1.05, letterSpacing: '-0.03em' }}>
            Prêt à transformer{' '}
            <span style={{ color: 'hsl(var(--accent))' }}>votre prospection</span> ?
          </h2>
          <p className="mx-auto mb-8 text-[14.5px] leading-relaxed" style={{ color: 'hsl(var(--muted))', maxWidth: 520 }}>
            Installez LinkBot, connectez votre compte, et lancez votre première campagne en moins de 5 minutes.
          </p>
          <button onClick={() => navigate('/register')} className="cta-btn"
            style={{ padding: '16px 40px', fontSize: 15 }}>
            Commencer gratuitement <ArrowRight size={14} />
          </button>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="relative" style={{ maxWidth: 1200, margin: '0 auto', padding: '0 20px 40px' }}>
        <div style={{ height: 1, marginBottom: 32, background: 'linear-gradient(90deg, transparent, hsl(var(--border-strong)), transparent)' }} />
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md flex items-center justify-center"
              style={{ background: 'hsl(var(--accent))', color: 'white' }}>
              <LinkIcon size={11} />
            </div>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'hsl(var(--muted))' }}>LinkBot</span>
          </div>
          <p className="text-[11.5px]" style={{ color: 'hsl(var(--muted))' }}>
            Outil local d'automatisation LinkedIn · Vos données restent sur votre machine.
          </p>
        </div>
      </footer>

      <style>{`
        @keyframes orbLogoIn {
          0%   { opacity: 0; transform: translate(-50%,-50%) scale(0.3); }
          50%  { opacity: 1; transform: translate(-50%,-50%) scale(1.1); }
          100% { opacity: 1; transform: translate(-50%,-50%) scale(1); }
        }
        @keyframes dropFly {
          0%   { opacity: 1; transform: translate(-50%,-50%) scale(1); }
          70%  { opacity: 0.8; }
          100% { opacity: 0; transform: translate(calc(-50% + var(--tx)), calc(-50% + var(--ty))) scale(0.2); }
        }
      `}</style>
    </div>
  );
}

import { useNavigate, Link as RouterLink } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import {
  Users, Rocket, Sparkles, Repeat, Activity, Link as LinkIcon,
  Search, UserPlus, MessageSquare, Zap, Shield, FileText, FileSpreadsheet,
  Target, UserCircle, Send, Calendar, ArrowRight, ArrowUp,
  Eye, Mail, MessageCircle, TrendingUp, Lock, Clock, CheckCircle2,
} from 'lucide-react';

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

/**
 * Hero illustration: floating cards diagramming Linky's lead magnet flow.
 * Post detected → commenter scored → bot replies publicly + DMs the lead magnet
 * → conversion. Connectors are an SVG layer behind the cards.
 */
function HeroCards() {
  return (
    <div className="relative mx-auto" style={{ width: '100%', maxWidth: 560, aspectRatio: '1 / 1.05' }}>
      {/* Dotted connectors layer */}
      <svg
        viewBox="0 0 560 588"
        preserveAspectRatio="none"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 0 }}
      >
        <defs>
          <linearGradient id="lc" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="hsl(220 14% 70%)" stopOpacity="0.25" />
            <stop offset="50%" stopColor="hsl(220 14% 60%)" stopOpacity="0.55" />
            <stop offset="100%" stopColor="hsl(220 14% 70%)" stopOpacity="0.25" />
          </linearGradient>
        </defs>
        {/* Profile → Composer */}
        <path d="M 280 230 L 280 310" stroke="url(#lc)" strokeWidth="1.4" strokeDasharray="3 5" fill="none" />
        {/* Composer → LinkedIn channel */}
        <path d="M 200 470 C 160 510, 130 510, 110 530" stroke="url(#lc)" strokeWidth="1.4" strokeDasharray="3 5" fill="none" />
        {/* Composer → Email channel */}
        <path d="M 360 470 C 400 510, 430 510, 450 530" stroke="url(#lc)" strokeWidth="1.4" strokeDasharray="3 5" fill="none" />
        {/* LinkedIn → conv */}
        <path d="M 130 580 C 170 595, 220 595, 260 588" stroke="url(#lc)" strokeWidth="1.4" strokeDasharray="3 5" fill="none" />
        {/* Email → conv */}
        <path d="M 430 580 C 390 595, 340 595, 300 588" stroke="url(#lc)" strokeWidth="1.4" strokeDasharray="3 5" fill="none" />
      </svg>

      {/* Card 1: Post detected (top-left) */}
      <div className="absolute float-1" style={{ top: '4%', left: '2%', zIndex: 2 }}>
       <div
        className="g-card hero-card"
        style={{
          padding: '14px 16px', borderRadius: 14,
          minWidth: 195,
          boxShadow: '0 24px 50px -22px hsl(220 40% 20% / .18), 0 6px 14px -8px hsl(220 40% 20% / .08)',
        }}
      >
        <div className="flex items-center gap-2 mb-1.5">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: 'hsl(var(--accent) / .12)', color: 'hsl(var(--accent))' }}>
            <Eye size={13} />
          </div>
          <span className="eyebrow" style={{ fontSize: 9.5 }}>POST DÉTECTÉ</span>
        </div>
        <div className="text-[18px] font-semibold tracking-tight" style={{ letterSpacing: '-0.02em' }}>47 commentaires</div>
        <div className="text-[10.5px]" style={{ color: 'hsl(var(--muted))' }}>Linky surveille en continu</div>
       </div>
      </div>

      {/* Card 2: RDV qualifiés (top-right) */}
      <div className="absolute float-2" style={{ top: '0%', right: '0%', zIndex: 2 }}>
       <div
        className="g-card hero-card"
        style={{
          padding: '14px 18px', borderRadius: 14,
          minWidth: 165, textAlign: 'center',
          boxShadow: '0 24px 50px -22px hsl(var(--accent) / .25), 0 6px 14px -8px hsl(220 40% 20% / .08)',
        }}
      >
        <div className="eyebrow mb-1" style={{ fontSize: 9.5 }}>RDV QUALIFIÉS</div>
        <div className="text-[24px] font-semibold tracking-tight mono" style={{ color: 'hsl(var(--accent))', letterSpacing: '-0.03em' }}>
          +28
        </div>
        <div className="text-[10px]" style={{ color: 'hsl(var(--muted))' }}>par mois en moyenne</div>
       </div>
      </div>

      {/* Card 3: Commenter profile (center) */}
      <div className="absolute float-3" style={{ top: '20%', left: '50%', zIndex: 3 }}>
       <div
        className="g-card hero-card"
        style={{
          padding: '14px 18px', borderRadius: 14,
          width: 280,
          boxShadow: '0 24px 50px -22px hsl(220 40% 20% / .22), 0 6px 14px -8px hsl(220 40% 20% / .1)',
        }}
      >
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full flex items-center justify-center text-[12px] font-semibold shrink-0"
            style={{
              background: 'linear-gradient(135deg, hsl(var(--violet)), hsl(var(--violet) / .7))',
              color: 'white',
            }}>ML</div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <div className="text-[13.5px] font-semibold leading-tight">Marie Laurent</div>
              <span className="text-[9.5px]" style={{ color: 'hsl(var(--muted))' }}>· il y a 2 min</span>
            </div>
            <div className="flex items-center gap-1 text-[10.5px]" style={{ color: 'hsl(var(--muted))' }}>
              <span style={{ color: 'hsl(var(--accent))', fontWeight: 600 }}>in</span>
              Founder · Studio Acme
            </div>
          </div>
        </div>
        <div className="rounded-lg px-2.5 py-1.5 text-[10.5px] leading-snug mb-2"
          style={{
            background: 'hsl(220 22% 98%)',
            borderLeft: '2px solid hsl(var(--accent) / .4)',
            color: 'hsl(var(--text))',
          }}>
          « Hyper intéressée, je veux bien le guide 🙏 »
        </div>
        <div className="flex items-center justify-between text-[10.5px]">
          <span className="flex items-center gap-1" style={{ color: 'hsl(var(--muted))' }}>
            <span className="live-dot" style={{ width: 5, height: 5 }} />
            Déjà connectée
          </span>
          <span className="chip emerald" style={{ fontSize: 9.5, padding: '2px 7px' }}>
            DM direct
          </span>
        </div>
       </div>
      </div>

      {/* Card 4: Composer / Reply (center-bottom) */}
      <div className="absolute float-4" style={{ top: '53%', left: '50%', zIndex: 3, width: '88%', maxWidth: 460 }}>
       <div
        className="g-card hero-card"
        style={{
          padding: '14px 16px', borderRadius: 14,
          boxShadow: '0 30px 60px -28px hsl(220 40% 20% / .25), 0 8px 18px -10px hsl(220 40% 20% / .1)',
        }}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md flex items-center justify-center"
              style={{ background: 'hsl(var(--violet) / .14)', color: 'hsl(var(--violet))' }}>
              <Sparkles size={11} />
            </div>
            <span className="text-[12px] font-semibold">Réponse IA</span>
          </div>
          <span className="text-[10.5px]" style={{ color: 'hsl(var(--muted))' }}>→ Marie</span>
        </div>
        <div className="rounded-lg px-3 py-2.5 text-[11.5px] leading-snug"
          style={{
            background: 'hsl(220 22% 98%)',
            border: '1px solid hsl(var(--border))',
            color: 'hsl(var(--text))',
          }}>
          Merci Marie 👋 <span style={{ color: 'hsl(var(--muted))' }}>Je t'envoie ça en DM tout de suite — un guide qui devrait coller pile avec ce que tu cherches…</span>
        </div>
        <div className="flex items-center gap-1.5 mt-2 text-[10px]" style={{ color: 'hsl(var(--muted))' }}>
          <Activity size={10} />
          Reply public + DM privé
          <span className="ml-auto flex items-center gap-1" style={{ color: 'hsl(var(--emerald))', fontWeight: 600 }}>
            <CheckCircle2 size={10} /> Envoyé
          </span>
        </div>
       </div>
      </div>

      {/* Card 5: Reply channel (bottom-left) */}
      <div className="absolute float-5" style={{ bottom: '6%', left: '0%', zIndex: 2 }}>
       <div
        className="g-card hero-card"
        style={{
          padding: '10px 14px', borderRadius: 12,
          minWidth: 165,
          boxShadow: '0 18px 36px -18px hsl(220 40% 20% / .18)',
        }}
      >
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'hsl(var(--accent))', color: 'white' }}>
            <MessageCircle size={15} />
          </div>
          <div className="min-w-0">
            <div className="text-[12px] font-semibold leading-tight">Commentaire</div>
            <div className="flex items-center gap-1 text-[10px]" style={{ color: 'hsl(var(--muted))' }}>
              Posté sous le post
              <CheckCircle2 size={10} style={{ color: 'hsl(var(--emerald))' }} />
            </div>
          </div>
        </div>
       </div>
      </div>

      {/* Card 6: DM channel (bottom-right) */}
      <div className="absolute float-6" style={{ bottom: '6%', right: '0%', zIndex: 2 }}>
       <div
        className="g-card hero-card"
        style={{
          padding: '10px 14px', borderRadius: 12,
          minWidth: 165,
          boxShadow: '0 18px 36px -18px hsl(220 40% 20% / .18)',
        }}
      >
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'hsl(var(--violet))', color: 'white' }}>
            <Send size={15} />
          </div>
          <div className="min-w-0">
            <div className="text-[12px] font-semibold leading-tight">DM privé</div>
            <div className="flex items-center gap-1 text-[10px]" style={{ color: 'hsl(var(--muted))' }}>
              Lead magnet livré
              <CheckCircle2 size={10} style={{ color: 'hsl(var(--emerald))' }} />
            </div>
          </div>
        </div>
       </div>
      </div>

      {/* Card 7: Heures récupérées (very bottom center) */}
      <div className="absolute float-7" style={{ bottom: '-2%', left: '50%', zIndex: 2 }}>
       <div
        className="g-card hero-card"
        style={{
          padding: '8px 16px', borderRadius: 12,
          boxShadow: '0 18px 36px -16px hsl(var(--amber) / .35)',
        }}
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'hsl(var(--amber) / .14)', color: 'hsl(var(--amber))' }}>
            <Clock size={15} />
          </div>
          <div>
            <div className="eyebrow" style={{ fontSize: 9, color: 'hsl(var(--muted))' }}>TEMPS GAGNÉ</div>
            <div className="text-[18px] font-semibold mono" style={{ color: 'hsl(var(--amber))', letterSpacing: '-0.02em', lineHeight: 1 }}>+20 h / sem</div>
          </div>
        </div>
       </div>
      </div>

      {/* Card 8: Connexions stat (mid-left, floating) */}
      <div className="absolute float-8" style={{ top: '32%', left: '-3%', zIndex: 2 }}>
       <div
        className="g-card hero-card"
        style={{
          padding: '10px 14px', borderRadius: 12,
          minWidth: 150,
          boxShadow: '0 18px 36px -18px hsl(var(--emerald) / .25)',
        }}
      >
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'hsl(var(--emerald) / .14)', color: 'hsl(var(--emerald))' }}>
            <UserPlus size={15} />
          </div>
          <div>
            <div className="text-[16px] font-semibold mono" style={{ color: 'hsl(var(--emerald))', letterSpacing: '-0.02em', lineHeight: 1 }}>
              +544
            </div>
            <div className="text-[10px]" style={{ color: 'hsl(var(--muted))', marginTop: 2 }}>
              connexions · 14 j
            </div>
          </div>
        </div>
       </div>
      </div>

      {/* Card 9: Taux de réponse (mid-right, floating) */}
      <div className="absolute float-9" style={{ top: '34%', right: '-3%', zIndex: 2 }}>
       <div
        className="g-card hero-card"
        style={{
          padding: '10px 14px', borderRadius: 12,
          minWidth: 150,
          boxShadow: '0 18px 36px -18px hsl(var(--violet) / .25)',
        }}
      >
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'hsl(var(--violet) / .14)', color: 'hsl(var(--violet))' }}>
            <MessageSquare size={15} />
          </div>
          <div>
            <div className="text-[16px] font-semibold mono" style={{ color: 'hsl(var(--violet))', letterSpacing: '-0.02em', lineHeight: 1 }}>
              42 %
            </div>
            <div className="text-[10px]" style={{ color: 'hsl(var(--muted))', marginTop: 2 }}>
              taux de réponse
            </div>
          </div>
        </div>
       </div>
      </div>

    </div>
  );
}

export default function LandingPage() {
  const navigate = useNavigate();
  const page = useReveal();
  const [showTop, setShowTop] = useState(false);

  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 600);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div ref={page} style={{
      background: 'hsl(var(--bg))',
      color: 'hsl(var(--text))',
      position: 'relative',
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

      {/* Sticky topbar — always visible */}
      <div style={{ position: 'sticky', top: 0, zIndex: 50, padding: '18px 20px 0' }}>
        <nav className="flex items-center justify-between"
          style={{
            maxWidth: 1160, margin: '0 auto',
            padding: '10px 18px',
            background: 'hsl(var(--panel) / .85)',
            backdropFilter: 'saturate(180%) blur(14px)',
            WebkitBackdropFilter: 'saturate(180%) blur(14px)',
            border: '1px solid hsl(var(--border))',
            borderRadius: 16,
            boxShadow: '0 1px 2px -1px hsl(220 40% 20% / .04)',
          }}>
          <RouterLink to="/" className="flex items-center gap-2"
            style={{ textDecoration: 'none', color: 'hsl(var(--text))' }}>
            <img src="/Linky.png" alt="Linky"
              style={{
                width: 32, height: 32, objectFit: 'contain',
                filter: 'drop-shadow(0 6px 16px hsl(var(--accent) / .35))',
              }} />
            <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em' }}>Linky</span>
          </RouterLink>

          <div className="hidden md:flex items-center gap-7">
            {[
              ['Fonctionnalités', '#features'],
              ['Campagnes', '#campaigns'],
              ['IA', '#ai'],
              ['FAQ', '#faq'],
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

      {/* ── HERO ── */}
      <div className="relative overflow-hidden">
        {/* Top wash */}
        <div style={{
          position: 'absolute', top: -100, left: '50%', transform: 'translateX(-50%)',
          width: 1200, height: 500,
          background: 'radial-gradient(ellipse 70% 60% at 50% 0%, hsl(var(--accent) / .12), hsl(var(--accent) / .04) 50%, transparent 100%)',
          pointerEvents: 'none', zIndex: 0,
        }} />

        {/* Hero content */}
        <section className="relative z-10 flex flex-col md:flex-row items-center"
          style={{ maxWidth: 1200, margin: '0 auto', padding: '40px 20px 60px', gap: 48, minHeight: 'calc(100vh - 120px)' }}>
          <div className="animate-fade-rise text-center md:text-left" style={{ flex: 1 }}>
            <div className="chip blue mb-5" style={{ fontSize: 11, padding: '4px 12px' }}>
              <Sparkles size={11} />
              Lead magnets · Connexion · DM · CRM
            </div>
            <h1 style={{
              fontSize: 'clamp(40px, 5.5vw, 64px)',
              fontWeight: 600, lineHeight: 1.02,
              letterSpacing: '-0.03em',
              color: 'hsl(var(--text))',
            }}>
              Votre prospection LinkedIn,{' '}
              <span style={{ color: 'hsl(var(--accent))' }}>en pilote automatique</span>.
            </h1>
            <p className="animate-fade-rise-delay mx-auto md:mx-0"
              style={{
                fontSize: 15.5, lineHeight: 1.65,
                color: 'hsl(var(--muted))',
                maxWidth: 500, marginTop: 24,
              }}>
              Transformez les commentaires de vos posts en leads, lancez des campagnes
              de connexion à grande échelle, gérez tous vos DM depuis un CRM unique.
              Linky orchestre tout, 24h/24, avec des messages personnalisés par IA.
            </p>
            {/* Use-case chips: equal weight to inbound + outbound */}
            <div className="animate-fade-rise-delay flex flex-wrap items-center gap-1.5 mt-5">
              {[
                ['Lead magnet', 'blue'],
                ['Connexion', 'emerald'],
                ['DM + relances', 'violet'],
                ['Combo connexion → DM', 'amber'],
              ].map(([label, tone]) => (
                <span key={label} className={`chip ${tone}`} style={{ fontSize: 10.5, padding: '3px 9px' }}>
                  {label}
                </span>
              ))}
            </div>
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
            <div className="animate-fade-rise-delay-2 flex flex-wrap items-center gap-x-5 gap-y-2 mt-7 text-[11.5px]"
              style={{ color: 'hsl(var(--muted))' }}>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 size={13} style={{ color: 'hsl(var(--emerald))' }} />
                Setup en 3 min
              </span>
              <span className="flex items-center gap-1.5">
                <Lock size={13} style={{ color: 'hsl(var(--emerald))' }} />
                Cookies stockés chez vous
              </span>
              <span className="flex items-center gap-1.5">
                <Shield size={13} style={{ color: 'hsl(var(--emerald))' }} />
                Patterns humains
              </span>
            </div>
          </div>

          {/* Hero illustration: floating cards (Linky lead-magnet flow) */}
          <div
            className="animate-fade-rise-delay flex"
            style={{
              flex: 1, justifyContent: 'center', alignItems: 'center',
              position: 'relative', overflow: 'visible',
              minHeight: 560, padding: '20px 0',
            }}>
            <HeroCards />
          </div>
        </section>
      </div>

      {/* ── FEATURES ── */}
      <section id="features" className="relative" style={{ maxWidth: 1200, margin: '0 auto', padding: '72px 20px' }}>
        <SectionTitle sub="Fonctionnalités">
          Tout-en-un, sans{' '}
          <span style={{ color: 'hsl(var(--accent))' }}>stack à bricoler</span>.
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

          {/* 5 types de campagnes (incluant Lead Magnet, le différenciateur) */}
          <div className="reveal reveal-delay-1 g-card overflow-hidden md:col-span-2" style={{ borderRadius: 20 }}>
            <div className="p-6">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-4"
                style={{ background: 'hsl(var(--accent) / .12)', color: 'hsl(var(--accent))' }}>
                <Rocket size={16} />
              </div>
              <h3 className="text-[17px] font-semibold mb-2 tracking-tight" style={{ letterSpacing: '-0.01em' }}>
                5 moteurs de campagne.
              </h3>
              <p className="text-[12.5px] leading-relaxed mb-4" style={{ color: 'hsl(var(--muted))' }}>
                Lead Magnet, Recherche, Connexion, DM, Combo. Tout tourne en arrière-plan, 24h/24.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {[
                  ['Lead Magnet', 'accent'],
                  ['Recherche', 'blue'],
                  ['Connexion', 'emerald'],
                  ['DM', 'violet'],
                  ['Combo', 'amber'],
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
          Cinq moteurs,{' '}
          <span style={{ color: 'hsl(var(--accent))' }}>une seule interface</span>.
        </SectionTitle>

        <div className="grid grid-cols-1 md:grid-cols-6 gap-4 auto-rows-[minmax(0,auto)]">
          {/* ── LEAD MAGNET — the killer feature, spans full width on top ── */}
          <div className="reveal reveal-delay-1 g-card overflow-hidden md:col-span-6"
            style={{
              borderRadius: 20,
              background: 'linear-gradient(135deg, hsl(var(--panel)) 0%, hsl(var(--accent-soft)) 100%)',
              border: '1px solid hsl(var(--accent) / .25)',
            }}>
            <div className="grid md:grid-cols-[1.1fr,1fr] gap-6 p-7 items-center">
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ background: 'hsl(var(--accent))', color: 'white' }}>
                    <Sparkles size={17} />
                  </div>
                  <span className="chip blue" style={{ fontSize: 10.5 }}>Lead Magnet</span>
                  <span className="chip emerald" style={{ fontSize: 10.5 }}>Inbound</span>
                </div>
                <h3 className="text-[22px] font-semibold mb-3 tracking-tight" style={{ letterSpacing: '-0.02em' }}>
                  Vos commentaires deviennent des leads, en pilote auto.
                </h3>
                <p className="text-[13.5px] leading-relaxed mb-4" style={{ color: 'hsl(var(--muted))', maxWidth: 460 }}>
                  Linky surveille vos posts en continu. Quand quelqu'un commente,
                  le bot répond publiquement (« Merci, je t'envoie ça en DM »)
                  et envoie automatiquement votre ressource (PDF, lien, code promo)
                  dans la foulée — avec un message personnalisé pour chaque profil.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    ['Détection en continu', 'blue'],
                    ['Réponse publique', 'accent'],
                    ['DM auto-personnalisé', 'violet'],
                    ['Connecté ou non', 'emerald'],
                  ].map(([label, tone]) => (
                    <span key={label} className={`chip ${tone}`} style={{ fontSize: 10.5 }}>{label}</span>
                  ))}
                </div>
              </div>

              {/* Mini-flow illustration: post → comment → reply + DM */}
              <div className="flex flex-col gap-2">
                {[
                  { tone: 'accent', icon: Eye,        label: 'Post détecté',          sub: '47 commentaires en cours' },
                  { tone: 'violet', icon: MessageCircle, label: 'Marie commente',     sub: '« Je veux bien le guide 🙏 »' },
                  { tone: 'emerald', icon: Send,      label: 'Reply + DM envoyés',    sub: 'Lead magnet livré · 28 s' },
                ].map((step, i) => {
                  const Ic = step.icon;
                  return (
                    <div key={i} className="g-card-soft flex items-center gap-3 px-3 py-2.5 rounded-xl"
                      style={{ background: 'hsl(var(--panel))', border: '1px solid hsl(var(--border))' }}>
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                        style={{ background: `hsl(var(--${step.tone}) / .14)`, color: `hsl(var(--${step.tone}))` }}>
                        <Ic size={15} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[12.5px] font-semibold leading-tight">{step.label}</div>
                        <div className="text-[11px]" style={{ color: 'hsl(var(--muted))' }}>{step.sub}</div>
                      </div>
                      <CheckCircle2 size={14} style={{ color: 'hsl(var(--emerald))' }} />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

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
                  J'ai vu votre travail sur Linky — automatiser la prospection tout en gardant une vraie personnalisation est exactement ce qui manque au marché.<br /><br />
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
            desc="Créez vos campagnes. Linky gère envois, relances et détection de réponses, 24h/24." />
        </div>
      </section>

      {/* ── RESULTS ── replaces the old generic stats with KPIs that match
          the hero illustration (so the promise is reinforced, not abstract). */}
      <section className="relative" style={{ maxWidth: 1100, margin: '0 auto', padding: '64px 20px' }}>
        <SectionTitle sub="Pourquoi Linky">
          Des résultats{' '}
          <span style={{ color: 'hsl(var(--accent))' }}>concrets</span>, pas des promesses.
        </SectionTitle>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {[
            {
              tone: 'emerald', icon: UserPlus,
              value: '+544', unit: '',
              label: 'connexions LinkedIn générées en 14 jours',
              sub: 'Campagne combo connexion + DM',
            },
            {
              tone: 'accent', icon: Calendar,
              value: '+28', unit: '',
              label: 'RDV qualifiés par mois en moyenne',
              sub: 'Lead magnets + relances IA',
            },
            {
              tone: 'amber', icon: Clock,
              value: '+20', unit: 'h',
              label: 'récupérées chaque semaine',
              sub: 'Plus de copié-collé, plus d\'oubli',
            },
          ].map((s, i) => {
            const Ic = s.icon;
            return (
              <div key={i} className={`reveal reveal-delay-${i + 1} g-card p-7`}
                style={{ borderRadius: 20 }}>
                <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-5"
                  style={{ background: `hsl(var(--${s.tone}) / .12)`, color: `hsl(var(--${s.tone}))` }}>
                  <Ic size={18} />
                </div>
                <div className="flex items-baseline gap-1 mb-2 mono"
                  style={{ color: `hsl(var(--${s.tone}))`, letterSpacing: '-0.03em' }}>
                  <span className="text-[44px] font-semibold leading-none">{s.value}</span>
                  {s.unit && <span className="text-[24px] font-semibold leading-none">{s.unit}</span>}
                </div>
                <p className="text-[14px] font-medium mb-1" style={{ color: 'hsl(var(--text))' }}>
                  {s.label}
                </p>
                <p className="text-[12px]" style={{ color: 'hsl(var(--muted))' }}>{s.sub}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── BEFORE / AFTER ── */}
      <section className="relative" style={{ maxWidth: 1100, margin: '0 auto', padding: '72px 20px' }}>
        <SectionTitle sub="Avant / Après">
          Votre semaine,{' '}
          <span style={{ color: 'hsl(var(--accent))' }}>libérée</span>.
        </SectionTitle>

        {(() => {
          const rows = [
            { task: 'Détecter les commentaires',          before: '2 h',     beforeNote: 'check manuel',        after: 'Live',     afterNote: 'auto' },
            { task: 'Répondre + envoyer le lead magnet',  before: '5 min × N', beforeNote: 'jamais à temps',    after: '< 30 s',   afterNote: 'auto' },
            { task: 'Trouver 500 prospects qualifiés',    before: '10 h',    beforeNote: 'Sales Nav',           after: '30 min',   afterNote: 'IA ciblée' },
            { task: 'Campagne Connexion + DM',            before: '5 h',     beforeNote: 'scripts à la main',   after: '0 min',    afterNote: '100 % auto' },
            { task: 'Suivre les leads & relancer',        before: '2 h',     beforeNote: 'Excel',               after: 'Temps réel', afterNote: 'CRM' },
          ];
          return (
            <div className="reveal" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
              {/* Sans Linky */}
              <div className="g-card" style={{ borderRadius: 20, padding: 28, position: 'relative', overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'hsl(0 70% 55% / .1)', color: 'hsl(0 70% 55%)' }}>
                    <Clock size={18} />
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'hsl(var(--muted))' }}>Sans Linky</div>
                    <div style={{ fontSize: 17, fontWeight: 600, color: 'hsl(var(--text))' }}>Vos semaines actuelles</div>
                  </div>
                </div>
                <ul style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {rows.map((r) => (
                    <li key={r.task} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, paddingBottom: 14, borderBottom: '1px solid hsl(var(--border))' }}>
                      <div style={{ fontSize: 14, color: 'hsl(var(--text))', flex: 1 }}>{r.task}</div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div className="mono" style={{ fontSize: 14, fontWeight: 600, color: 'hsl(0 70% 50%)', textDecoration: 'line-through', textDecorationColor: 'hsl(0 70% 50% / .5)' }}>{r.before}</div>
                        <div style={{ fontSize: 11, color: 'hsl(var(--muted))', marginTop: 2 }}>{r.beforeNote}</div>
                      </div>
                    </li>
                  ))}
                </ul>
                <div style={{ marginTop: 22, padding: '14px 16px', borderRadius: 12, background: 'hsl(0 70% 55% / .08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'hsl(var(--text))' }}>Total perdu</span>
                  <span className="mono" style={{ fontSize: 20, fontWeight: 700, color: 'hsl(0 70% 50%)' }}>~ 20 h / sem.</span>
                </div>
              </div>

              {/* Avec Linky */}
              <div className="g-card" style={{ borderRadius: 20, padding: 28, position: 'relative', overflow: 'hidden', border: '1px solid hsl(var(--accent) / .35)', boxShadow: '0 12px 40px -16px hsl(var(--accent) / .35)' }}>
                <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'radial-gradient(120% 80% at 100% 0%, hsl(var(--accent) / .08), transparent 60%)', pointerEvents: 'none' }} />
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'hsl(var(--accent) / .12)', color: 'hsl(var(--accent))' }}>
                    <Sparkles size={18} />
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'hsl(var(--accent))' }}>Avec Linky</div>
                    <div style={{ fontSize: 17, fontWeight: 600, color: 'hsl(var(--text))' }}>En pilote automatique</div>
                  </div>
                </div>
                <ul style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {rows.map((r) => (
                    <li key={r.task} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, paddingBottom: 14, borderBottom: '1px solid hsl(var(--border))' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flex: 1 }}>
                        <CheckCircle2 size={16} style={{ color: 'hsl(var(--emerald))', marginTop: 2, flexShrink: 0 }} />
                        <div style={{ fontSize: 14, color: 'hsl(var(--text))' }}>{r.task}</div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div className="mono" style={{ fontSize: 14, fontWeight: 700, color: 'hsl(var(--emerald))' }}>{r.after}</div>
                        <div style={{ fontSize: 11, color: 'hsl(var(--muted))', marginTop: 2 }}>{r.afterNote}</div>
                      </div>
                    </li>
                  ))}
                </ul>
                <div style={{ position: 'relative', marginTop: 22, padding: '14px 16px', borderRadius: 12, background: 'hsl(var(--accent) / .1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'hsl(var(--text))' }}>Total économisé</span>
                  <span className="mono" style={{ fontSize: 20, fontWeight: 700, color: 'hsl(var(--accent))' }}>~ 20 h / sem.</span>
                </div>
              </div>
            </div>
          );
        })()}
      </section>

      {/* ── SECURITY / TRUST ── */}
      <section className="relative" style={{ maxWidth: 1100, margin: '0 auto', padding: '72px 20px' }}>
        <SectionTitle sub="Sécurité">
          Votre compte LinkedIn,{' '}
          <span style={{ color: 'hsl(var(--accent))' }}>protégé</span>.
        </SectionTitle>

        <div className="grid md:grid-cols-3 gap-5">
          {[
            {
              icon: Lock, tone: 'emerald',
              title: 'Cookies stockés chez vous',
              desc: 'Vos cookies li_at et JSESSIONID restent sur votre serveur. Aucun tiers, aucun relais externe, aucun stockage cloud.',
            },
            {
              icon: Activity, tone: 'accent',
              title: 'Patterns humains',
              desc: 'Délais randomisés entre chaque action, plages horaires respectées, batch intelligent. LinkedIn ne voit aucune différence avec un humain.',
            },
            {
              icon: Target, tone: 'amber',
              title: 'Limites automatiques',
              desc: 'Quotas quotidiens respectés, étalement sur N jours, arrêt automatique en cas d\'anomalie. Le rythme reste sous votre contrôle.',
            },
          ].map((item, i) => {
            const Ic = item.icon;
            return (
              <div key={item.title} className={`reveal reveal-delay-${i + 1} g-card p-6`}
                style={{ borderRadius: 18 }}>
                <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-4"
                  style={{ background: `hsl(var(--${item.tone}) / .12)`, color: `hsl(var(--${item.tone}))` }}>
                  <Ic size={18} />
                </div>
                <h3 className="text-[15px] font-semibold mb-2" style={{ letterSpacing: '-0.01em' }}>{item.title}</h3>
                <p className="text-[13px] leading-relaxed" style={{ color: 'hsl(var(--muted))' }}>{item.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── DETAILS ── editorial two-column list, not a cards grid */}
      <section className="relative" style={{ maxWidth: 1100, margin: '0 auto', padding: '72px 20px' }}>
        <SectionTitle sub="Le détail qui compte">
          Tout ce que vous{' '}
          <span style={{ color: 'hsl(var(--accent))' }}>cherchiez ailleurs</span>.
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

      {/* ── FAQ ── */}
      <section id="faq" className="relative" style={{ maxWidth: 860, margin: '0 auto', padding: '80px 20px' }}>
        <SectionTitle sub="FAQ">
          Les questions{' '}
          <span style={{ color: 'hsl(var(--accent))' }}>qu'on nous pose</span>.
        </SectionTitle>

        <div className="reveal space-y-3">
          {[
            {
              q: 'Linky est-il safe pour mon compte LinkedIn ?',
              a: "Oui. Tous les délais sont randomisés, les quotas LinkedIn respectés (max ~80 invitations/semaine, batch intelligent), et les actions étalées sur des plages horaires réalistes. Linky se comporte comme un humain — aucune action en rafale, aucun pattern détectable. Vos cookies restent stockés sur votre serveur, jamais envoyés ailleurs.",
            },
            {
              q: 'Combien de temps avant de voir des résultats ?',
              a: "Une campagne de connexion donne ses premiers acceptations sous 24-72h. Pour les lead magnets, les premiers DM partent dès qu'un commentaire est détecté (en quelques minutes). Comptez 2 semaines pour avoir un volume statistique exploitable.",
            },
            {
              q: 'Faut-il que mon ordinateur reste allumé ?',
              a: "Non. Linky tourne sur un serveur 24h/24. Vous pouvez fermer votre PC, partir en weekend, dormir : les campagnes continuent, les commentaires sont détectés, les DM sont envoyés.",
            },
            {
              q: 'Comment Linky personnalise les messages ?',
              a: "Chaque message peut être généré par IA (Gemini) à partir du profil du contact, de son expérience et de ses publications récentes. Vous pouvez aussi écrire vos propres templates avec variables ({first_name}, {company}, etc.). Vous gardez le contrôle, même sur les générations IA — un aperçu des 3 premiers messages est toujours proposé avant lancement.",
            },
            {
              q: 'Puis-je annuler à tout moment ?',
              a: "Oui, sans engagement. Vos données restent exportables (CSV, journal d'activité complet). Aucune carte bancaire requise pour l'inscription gratuite.",
            },
            {
              q: 'Linky remplace mon Sales Navigator ?',
              a: "Linky est complémentaire. Il s'appuie sur LinkedIn (Sales Nav inclus si vous l'avez) pour rechercher des prospects, mais automatise tout le reste : envoi, relances, suivi, CRM, lead magnets. Vous pouvez aussi importer vos contacts depuis un CSV existant.",
            },
          ].map((item, i) => (
            <details key={i} className={`g-card`}
              style={{
                borderRadius: 14,
                background: 'hsl(var(--panel))',
                cursor: 'pointer',
              }}>
              <summary className="px-5 py-4 flex items-center justify-between gap-4 list-none"
                style={{
                  fontSize: 14.5, fontWeight: 600, color: 'hsl(var(--text))',
                  letterSpacing: '-0.005em',
                }}>
                {item.q}
                <span className="shrink-0 transition-transform faq-chev"
                  style={{ color: 'hsl(var(--muted))' }}>
                  <ArrowRight size={16} />
                </span>
              </summary>
              <div className="px-5 pb-5 text-[13.5px] leading-relaxed"
                style={{ color: 'hsl(var(--muted))' }}>
                {item.a}
              </div>
            </details>
          ))}
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
            Installez Linky, connectez votre compte, et lancez votre première campagne en moins de 5 minutes.
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
            <img src="/Linky.png" alt="Linky"
              style={{ width: 24, height: 24, objectFit: 'contain' }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: 'hsl(var(--muted))' }}>Linky</span>
          </div>
          <p className="text-[11.5px]" style={{ color: 'hsl(var(--muted))' }}>
            Outil local d'automatisation LinkedIn · Vos données restent sur votre machine.
          </p>
        </div>
      </footer>

      {/* Scroll-to-top floating bubble */}
      <button
        aria-label="Retour en haut"
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        style={{
          position: 'fixed',
          bottom: 24,
          left: 24,
          width: 44,
          height: 44,
          borderRadius: '50%',
          background: 'hsl(var(--panel) / .9)',
          backdropFilter: 'saturate(180%) blur(10px)',
          WebkitBackdropFilter: 'saturate(180%) blur(10px)',
          border: '1px solid hsl(var(--border))',
          color: 'hsl(var(--text))',
          boxShadow: '0 8px 24px -8px hsl(220 40% 20% / .18)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          zIndex: 60,
          opacity: showTop ? 1 : 0,
          transform: showTop ? 'translateY(0) scale(1)' : 'translateY(12px) scale(0.85)',
          pointerEvents: showTop ? 'auto' : 'none',
          transition: 'opacity .25s ease, transform .25s cubic-bezier(0.22,1,0.36,1), background .2s, color .2s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'hsl(var(--accent))';
          e.currentTarget.style.color = 'white';
          e.currentTarget.style.borderColor = 'hsl(var(--accent))';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'hsl(var(--panel) / .9)';
          e.currentTarget.style.color = 'hsl(var(--text))';
          e.currentTarget.style.borderColor = 'hsl(var(--border))';
        }}
      >
        <ArrowUp size={17} strokeWidth={2.2} />
      </button>

      <style>{`
        /* FAQ chevron rotates when <details> is open */
        details[open] .faq-chev { transform: rotate(90deg); }
        details summary::-webkit-details-marker { display: none; }
        .faq-chev { transition: transform 0.25s cubic-bezier(0.22,1,0.36,1); }

        /* Inner card: hover scale only (transform owned by inner div) */
        .hero-card {
          transition: transform 0.35s cubic-bezier(0.22, 1, 0.36, 1),
                      box-shadow 0.35s cubic-bezier(0.22, 1, 0.36, 1);
          transform-origin: center center;
          will-change: transform;
        }
        .hero-card:hover {
          transform: scale(1.07);
        }
        .hero-card:hover { z-index: 50; }

        /* Outer wrapper: floating animation (transform owned by outer div) */
        @keyframes float-y {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-7px); }
        }
        @keyframes float-cx {
          0%, 100% { transform: translateX(-50%) translateY(0); }
          50% { transform: translateX(-50%) translateY(-7px); }
        }
        /* fill-mode backwards: apply the 0% keyframe during the delay so
           centered cards keep their translateX(-50%) before the animation
           starts (otherwise they sit at left:50% un-translated for 0.6-3s). */
        .float-1 { animation: float-y 6s ease-in-out 0s infinite both; }
        .float-2 { animation: float-y 7s ease-in-out 1.2s infinite both; }
        .float-3 { animation: float-cx 6.5s ease-in-out 0.6s infinite both; }
        .float-4 { animation: float-cx 7.5s ease-in-out 1.8s infinite both; }
        .float-5 { animation: float-y 6.8s ease-in-out 2.4s infinite both; }
        .float-6 { animation: float-y 7.2s ease-in-out 0.4s infinite both; }
        .float-7 { animation: float-cx 6s ease-in-out 3s infinite both; }
        .float-8 { animation: float-y 7.4s ease-in-out 0.8s infinite both; }
        .float-9 { animation: float-y 6.6s ease-in-out 2s infinite both; }
      `}</style>
    </div>
  );
}

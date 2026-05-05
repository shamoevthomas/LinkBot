import { ShieldAlert, ArrowRight } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';

/**
 * Full-screen blocking modal shown when the user's LinkedIn cookies are
 * invalid. Prevents access to anything that depends on LinkedIn (campaigns,
 * lead magnets, contacts) until cookies are recolled. The Configuration
 * page itself is the one route allowed through, so the user can fix it.
 */
export default function CookiesBlockerModal({ show }) {
  const navigate = useNavigate();
  const location = useLocation();
  if (!show) return null;
  // Don't block the Configuration page itself — that's where the fix lives.
  if (location.pathname.startsWith('/dashboard/config')) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'rgba(15, 23, 42, 0.45)',
      backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16,
    }}>
      <div className="g-card" style={{
        maxWidth: 480, width: '100%',
        padding: '32px 28px', borderRadius: 22,
        boxShadow: '0 30px 80px -30px hsl(220 40% 20% / .35)',
        textAlign: 'center',
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: 16, margin: '0 auto 18px',
          background: 'hsl(0 70% 95%)', color: 'hsl(0 70% 50%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <ShieldAlert size={26} />
        </div>
        <h2 style={{
          fontSize: 22, fontWeight: 600,
          color: 'hsl(var(--text))', letterSpacing: '-0.02em',
          marginBottom: 10,
        }}>
          Cookies LinkedIn invalides
        </h2>
        <p style={{
          fontSize: 14, color: 'hsl(var(--muted))', lineHeight: 1.55,
          marginBottom: 22,
        }}>
          Linky a besoin de cookies LinkedIn valides pour orchestrer vos
          campagnes. Les vôtres sont expirés ou révoqués — recollez-les
          pour reprendre l'activité de votre compte.
        </p>
        <button onClick={() => navigate('/dashboard/config')}
          className="cta-btn"
          style={{ padding: '12px 22px', fontSize: 14, borderRadius: 14, gap: 6 }}>
          Recoller mes cookies <ArrowRight size={14} />
        </button>
        <p style={{ fontSize: 11.5, color: 'hsl(var(--muted))', marginTop: 16 }}>
          Tutoriel : F12 → Application → Cookies → linkedin.com → li_at + JSESSIONID
        </p>
      </div>
    </div>
  );
}

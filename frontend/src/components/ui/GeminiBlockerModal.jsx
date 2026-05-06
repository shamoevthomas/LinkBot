import { Sparkles, ArrowRight } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';

/**
 * Full-screen blocking modal shown when Google rejected the user's Gemini API
 * key (3 strikes detection). Blocks navigation until the user goes to
 * Configuration and submits a fresh key — the Configuration page itself is
 * allowed through so the fix is reachable.
 */
export default function GeminiBlockerModal({ show }) {
  const navigate = useNavigate();
  const location = useLocation();
  if (!show) return null;
  // Don't block on Configuration — that's where the user fixes the key.
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
          background: 'hsl(262 90% 95%)', color: 'hsl(262 60% 50%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Sparkles size={26} />
        </div>
        <h2 style={{
          fontSize: 22, fontWeight: 600,
          color: 'hsl(var(--text))', letterSpacing: '-0.02em',
          marginBottom: 10,
        }}>
          Clé Gemini invalide
        </h2>
        <p style={{
          fontSize: 14, color: 'hsl(var(--muted))', lineHeight: 1.55,
          marginBottom: 22,
        }}>
          Google a rejeté votre clé API Gemini. Vos campagnes avec IA sont
          en pause jusqu'à ce que vous en saisissiez une nouvelle.
        </p>
        <button onClick={() => navigate('/dashboard/config')}
          className="cta-btn"
          style={{ padding: '12px 22px', fontSize: 14, borderRadius: 14, gap: 6 }}>
          Mettre à jour ma clé Gemini <ArrowRight size={14} />
        </button>
        <p style={{ fontSize: 11.5, color: 'hsl(var(--muted))', marginTop: 16 }}>
          Récupérer une clé : <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer"
            style={{ color: 'hsl(var(--accent))', textDecoration: 'none' }}>
            aistudio.google.com/apikey
          </a>
        </p>
      </div>
    </div>
  );
}

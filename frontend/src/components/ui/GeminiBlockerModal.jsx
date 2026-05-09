import { Sparkles, ArrowRight, X } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';

/**
 * Modal shown when Google rejected the user's Gemini API key.
 *
 * Unlike the cookies blocker, this is dismissible — Gemini is only needed
 * for AI campaigns, so we let the user keep using Linky (CRM, template
 * campaigns, dashboard…) while their key is broken. Dismissal is stored
 * in sessionStorage so it doesn't reappear on every navigation, but a
 * fresh login or a new "invalid" event re-shows it.
 */
export default function GeminiBlockerModal({ show }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem('gemini_modal_dismissed') === '1'; }
    catch { return false; }
  });

  // Reset dismissal when the flag flips off (user fixed key) so the next
  // invalidation will show the modal again.
  useEffect(() => {
    if (!show && dismissed) {
      try { sessionStorage.removeItem('gemini_modal_dismissed'); } catch {}
      setDismissed(false);
    }
  }, [show, dismissed]);

  const dismiss = () => {
    try { sessionStorage.setItem('gemini_modal_dismissed', '1'); } catch {}
    setDismissed(true);
  };

  if (!show || dismissed) return null;
  // Don't show on Configuration — that's where the user fixes the key.
  if (location.pathname.startsWith('/dashboard/config')) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'rgba(15, 23, 42, 0.45)',
      backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16,
    }}
      onClick={dismiss}
    >
      <div className="g-card" style={{
        maxWidth: 480, width: '100%',
        padding: '32px 28px', borderRadius: 22,
        boxShadow: '0 30px 80px -30px hsl(220 40% 20% / .35)',
        textAlign: 'center',
        position: 'relative',
      }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={dismiss}
          aria-label="Fermer"
          style={{
            position: 'absolute', top: 14, right: 14,
            width: 30, height: 30, borderRadius: 8, border: 'none',
            background: 'transparent', color: 'hsl(var(--muted))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <X size={16} />
        </button>

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
          en pause jusqu'à ce que vous en saisissiez une nouvelle. Le reste
          de Linky (CRM, campagnes sans IA, dashboard…) reste utilisable.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button onClick={() => navigate('/dashboard/config')}
            className="cta-btn"
            style={{ padding: '12px 22px', fontSize: 14, borderRadius: 14, gap: 6 }}>
            Mettre à jour ma clé <ArrowRight size={14} />
          </button>
          <button onClick={dismiss}
            className="ghost-btn"
            style={{ padding: '12px 22px', fontSize: 14, borderRadius: 14 }}>
            Plus tard
          </button>
        </div>
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

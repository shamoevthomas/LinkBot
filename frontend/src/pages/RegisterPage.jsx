import { useState } from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import { Loader2, AlertCircle, Check } from 'lucide-react';
import { register } from '../api/auth';
import { useAuth } from '../context/AuthContext';

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { refreshUser } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (password !== confirm) {
      setError('Les mots de passe ne correspondent pas');
      return;
    }
    if (password.length < 6) {
      setError('Le mot de passe doit faire au moins 6 caractères');
      return;
    }

    setLoading(true);
    try {
      const data = await register(email, password);
      localStorage.setItem('linkbot_token', data.access_token);
      await refreshUser();
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.detail || "Erreur lors de l'inscription");
    } finally {
      setLoading(false);
    }
  };

  const perks = [
    'Connectez votre LinkedIn en 30 secondes',
    'Campagnes personnalisées par IA',
    'Dashboard temps réel, sans friction',
  ];

  return (
    <div className="min-h-screen flex items-center justify-center p-4"
      style={{
        background: 'hsl(var(--bg))',
        position: 'relative',
        overflow: 'hidden',
      }}>
      <div style={{
        position: 'absolute', top: '-20%', right: '-10%',
        width: 560, height: 560, borderRadius: '50%',
        background: 'radial-gradient(circle, hsl(var(--accent) / .12), hsl(var(--accent) / .03) 55%, transparent 70%)',
        pointerEvents: 'none', zIndex: 0,
      }} />
      <div style={{
        position: 'absolute', bottom: '-15%', left: '-10%',
        width: 480, height: 480, borderRadius: '50%',
        background: 'radial-gradient(circle, hsl(var(--accent) / .08), hsl(var(--accent) / .02) 55%, transparent 70%)',
        pointerEvents: 'none', zIndex: 0,
      }} />

      <div className="w-full max-w-[420px]" style={{ position: 'relative', zIndex: 1 }}>
        <div className="text-center mb-7">
          <RouterLink to="/" className="inline-flex items-center gap-2 mb-6"
            style={{ textDecoration: 'none' }}>
            <img src="/Linky.png" alt="Linky"
              style={{
                width: 40, height: 40, objectFit: 'contain',
                filter: 'drop-shadow(0 8px 20px hsl(var(--accent) / .4))',
              }} />
            <span style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em', color: 'hsl(var(--text))' }}>
              LinkBot
            </span>
          </RouterLink>
          <h1 className="text-[26px] font-semibold tracking-tight" style={{ letterSpacing: '-0.02em' }}>
            Créez votre compte.
          </h1>
          <p className="text-[13.5px] mt-1.5" style={{ color: 'hsl(var(--muted))' }}>
            Commencez à automatiser votre prospection LinkedIn.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="g-card" style={{ padding: 24 }}>
          {error && (
            <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-lg"
              style={{
                background: 'hsl(352 90% 97%)',
                border: '1px solid hsl(352 85% 88%)',
                color: 'hsl(352 72% 48%)',
              }}>
              <AlertCircle size={14} />
              <span className="text-[12.5px]">{error}</span>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="form-label">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-sm"
                placeholder="votre@email.com"
                autoFocus
                required
              />
            </div>
            <div>
              <label className="form-label">Mot de passe</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-sm"
                placeholder="Minimum 6 caractères"
                required
              />
            </div>
            <div>
              <label className="form-label">Confirmer le mot de passe</label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="input-sm"
                placeholder="Retapez votre mot de passe"
                required
              />
            </div>
          </div>

          <button type="submit" disabled={loading} className="cta-btn w-full mt-5">
            {loading ? <Loader2 size={15} className="spin" /> : null}
            {loading ? 'Création…' : 'Créer mon compte'}
          </button>

          <div className="mt-5 pt-4 border-t space-y-2" style={{ borderColor: 'hsl(var(--border))' }}>
            {perks.map((p) => (
              <div key={p} className="flex items-center gap-2 text-[12px]" style={{ color: 'hsl(var(--muted))' }}>
                <div className="w-4 h-4 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: 'hsl(var(--emerald) / .15)', color: 'hsl(var(--emerald))' }}>
                  <Check size={10} strokeWidth={3} />
                </div>
                {p}
              </div>
            ))}
          </div>

          <p className="text-center text-[12.5px] mt-5" style={{ color: 'hsl(var(--muted))' }}>
            Déjà un compte ?{' '}
            <RouterLink to="/login"
              style={{ color: 'hsl(var(--accent))', fontWeight: 500, textDecoration: 'none' }}
              onMouseEnter={(e) => e.currentTarget.style.textDecoration = 'underline'}
              onMouseLeave={(e) => e.currentTarget.style.textDecoration = 'none'}>
              Se connecter
            </RouterLink>
          </p>
        </form>
      </div>
    </div>
  );
}

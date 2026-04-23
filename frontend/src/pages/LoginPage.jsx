import { useState } from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import { Loader2, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch {
      setError('Identifiants incorrects');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4"
      style={{
        background: 'hsl(var(--bg))',
        position: 'relative',
        overflow: 'hidden',
      }}>
      {/* Ambient accent blobs */}
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
            Bon retour.
          </h1>
          <p className="text-[13.5px] mt-1.5" style={{ color: 'hsl(var(--muted))' }}>
            Connectez-vous pour accéder à votre dashboard.
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
                placeholder="••••••••"
                required
              />
            </div>
          </div>

          <button type="submit" disabled={loading} className="cta-btn w-full mt-5">
            {loading ? <Loader2 size={15} className="spin" /> : null}
            {loading ? 'Connexion…' : 'Se connecter'}
          </button>

          <p className="text-center text-[12.5px] mt-4" style={{ color: 'hsl(var(--muted))' }}>
            Pas encore de compte ?{' '}
            <RouterLink to="/register"
              style={{ color: 'hsl(var(--accent))', fontWeight: 500, textDecoration: 'none' }}
              onMouseEnter={(e) => e.currentTarget.style.textDecoration = 'underline'}
              onMouseLeave={(e) => e.currentTarget.style.textDecoration = 'none'}>
              Créer un compte
            </RouterLink>
          </p>
        </form>
      </div>
    </div>
  );
}

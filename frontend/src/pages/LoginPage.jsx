import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Link, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const [username, setUsername] = useState('');
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
      const user = await login(username, password);
      navigate(user.onboarding_completed ? '/dashboard' : '/dashboard');
    } catch {
      setError('Identifiants incorrects');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#fff', position: 'relative', overflow: 'hidden' }}>
      {/* Decorative blue gradient blob */}
      <div style={{
        position: 'absolute',
        top: '-20%',
        right: '-10%',
        width: '600px',
        height: '600px',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(0,132,255,0.12) 0%, rgba(0,132,255,0.03) 50%, transparent 70%)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute',
        bottom: '-15%',
        left: '-10%',
        width: '500px',
        height: '500px',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(0,132,255,0.08) 0%, rgba(0,132,255,0.02) 50%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <div className="w-full max-w-md" style={{ position: 'relative', zIndex: 1 }}>
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'var(--blue)', boxShadow: '0 8px 24px rgba(0,132,255,0.25)' }}>
            <Link size={32} className="text-white" />
          </div>
          <h1 className="f" style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text)' }}>LinkBot</h1>
          <p style={{ color: 'var(--text3)', marginTop: '4px' }}>Connectez-vous pour continuer</p>
        </div>

        <form onSubmit={handleSubmit} className="g-card" style={{ padding: '2rem', borderRadius: '20px' }}>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 mb-4">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text2)' }}>Identifiant</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="input-glass"
                placeholder="Entrez votre identifiant"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text2)' }}>Mot de passe</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-glass"
                placeholder="Entrez votre mot de passe"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="cta-btn w-full mt-6 flex items-center justify-center gap-2 disabled:opacity-50"
            style={{ padding: '12px 16px', fontSize: '14px' }}
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : null}
            {loading ? 'Connexion...' : 'Se connecter'}
          </button>
        </form>
      </div>
    </div>
  );
}

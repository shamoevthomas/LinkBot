import { AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function AlertBanner({ show }) {
  const navigate = useNavigate();
  if (!show) return null;
  return (
    <div style={{
      background: '#fef2f2', border: '1px solid #fecaca',
      borderRadius: 12, padding: '12px 16px', marginBottom: 16,
      display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <AlertTriangle size={20} color="#ef4444" style={{ flexShrink: 0 }} />
      <p style={{ fontSize: 13, color: '#b91c1c', flex: 1, margin: 0 }}>
        Vos cookies LinkedIn ont expiré. Mettez-les à jour pour continuer à utiliser les campagnes.
      </p>
      <button
        onClick={() => navigate('/dashboard/config')}
        style={{
          fontSize: 13, fontWeight: 600, color: '#b91c1c',
          background: 'none', border: 'none', cursor: 'pointer',
          textDecoration: 'underline', whiteSpace: 'nowrap',
        }}
      >
        Mettre à jour
      </button>
    </div>
  );
}

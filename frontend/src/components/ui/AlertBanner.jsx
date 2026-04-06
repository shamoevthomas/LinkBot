import { AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function AlertBanner({ show }) {
  const navigate = useNavigate();
  if (!show) return null;
  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 flex items-center gap-3">
      <AlertTriangle size={20} className="text-red-500 shrink-0" />
      <p className="text-sm text-red-700 flex-1">
        Vos cookies LinkedIn ont expiré. Mettez-les à jour pour continuer à utiliser les campagnes.
      </p>
      <button
        onClick={() => navigate('/dashboard/config')}
        className="text-sm font-medium text-red-700 hover:text-red-800 underline whitespace-nowrap"
      >
        Mettre à jour
      </button>
    </div>
  );
}

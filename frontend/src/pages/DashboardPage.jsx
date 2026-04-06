import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Rocket, Activity, Zap, Plus, ArrowRight, Loader2, MessageSquare, UserPlus } from 'lucide-react';
import { getDashboardStats } from '../api/dashboard';
import PageWrapper from '../components/layout/PageWrapper';
import Badge from '../components/ui/Badge';

export default function DashboardPage() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    getDashboardStats()
      .then(setStats)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <PageWrapper>
        <div className="flex justify-center py-20">
          <Loader2 size={28} className="animate-spin" style={{ color: 'var(--blue)' }} />
        </div>
      </PageWrapper>
    );
  }

  const cards = [
    { label: 'Contacts', value: stats?.total_contacts || 0, icon: Users, color: 'bg-blue-100 text-blue-600' },
    { label: 'Campagnes actives', value: stats?.active_campaigns || 0, icon: Rocket, color: 'bg-emerald-100 text-emerald-600' },
    { label: 'Taux de reponse', value: `${stats?.global_reply_rate || 0}%`, icon: MessageSquare, color: 'bg-purple-100 text-purple-600' },
    { label: 'Taux de connexion', value: `${stats?.global_connection_rate || 0}%`, icon: UserPlus, color: 'bg-amber-100 text-amber-600' },
  ];

  return (
    <PageWrapper>
      <div className="flex items-center justify-between mb-6">
        <h1 className="f" style={{ fontWeight: 700, fontSize: 24, color: 'var(--text)' }}>Tableau de bord</h1>
        <div className="flex gap-2">
          <button onClick={() => navigate('/dashboard/crms')}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-2">
            <Plus size={16} /> Nouveau CRM
          </button>
          <button onClick={() => navigate('/dashboard/campaigns')}
            className="cta-btn flex items-center gap-2" style={{ padding: '8px 16px', fontSize: 14 }}>
            <Rocket size={16} /> Nouvelle campagne
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {cards.map((card) => (
          <div key={card.label} className="g-card p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-gray-500">{card.label}</span>
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${card.color}`}>
                <card.icon size={18} />
              </div>
            </div>
            <p className="text-3xl font-bold" style={{ color: 'var(--text)' }}>{card.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent campaigns */}
        <div className="g-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold" style={{ color: 'var(--text)' }}>Campagnes recentes</h2>
            <button onClick={() => navigate('/dashboard/campaigns')} className="text-xs hover:underline flex items-center gap-1" style={{ color: 'var(--blue)' }}>
              Tout voir <ArrowRight size={12} />
            </button>
          </div>
          {(stats?.recent_campaigns || []).length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">Aucune campagne</p>
          ) : (
            <div className="space-y-3">
              {stats.recent_campaigns.map((c) => (
                <div key={c.id} onClick={() => navigate(`/dashboard/campaigns/${c.id}`)}
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 cursor-pointer border border-gray-100">
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>{c.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{c.type}</p>
                  </div>
                  <Badge status={c.status} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent actions */}
        <div className="g-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold" style={{ color: 'var(--text)' }}>Actions recentes</h2>
            <button onClick={() => navigate('/dashboard/config')} className="text-xs hover:underline flex items-center gap-1" style={{ color: 'var(--blue)' }}>
              Activite <ArrowRight size={12} />
            </button>
          </div>
          {(stats?.recent_actions || []).length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">Aucune action recente</p>
          ) : (
            <div className="space-y-2">
              {stats.recent_actions.map((a, i) => (
                <div key={i} className="flex items-center justify-between py-2 px-3 rounded-lg border border-gray-100">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${a.status === 'success' ? 'bg-emerald-500' : a.status === 'skipped' ? 'bg-amber-500' : 'bg-red-500'}`} />
                    <div className="min-w-0">
                      <p className="text-sm text-gray-700 truncate">{a.contact_name || 'Contact inconnu'}</p>
                      <p className="text-xs text-gray-400">{a.action_type}</p>
                    </div>
                  </div>
                  <span className="text-xs text-gray-400 shrink-0 ml-2">
                    {new Date(a.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </PageWrapper>
  );
}

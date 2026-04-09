import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Play, Pause, Square, MessageSquare, UserPlus, ThumbsUp, Reply, Check, X, Clock, Zap } from 'lucide-react';
import toast from 'react-hot-toast';
import PageWrapper from '../components/layout/PageWrapper';
import {
  getLeadMagnet, getLeadMagnetContacts,
  startLeadMagnet, pauseLeadMagnet, resumeLeadMagnet, cancelLeadMagnet, triggerLeadMagnet,
} from '../api/leadMagnets';

const STATUS_COLORS = {
  pending: 'bg-gray-100 text-gray-600',
  running: 'bg-green-100 text-green-700',
  paused: 'bg-yellow-100 text-yellow-700',
  cancelled: 'bg-red-100 text-red-600',
  failed: 'bg-red-100 text-red-600',
};
const STATUS_LABELS = {
  pending: 'En attente',
  running: 'Actif',
  paused: 'En pause',
  cancelled: 'Arrete',
  failed: 'Echoue',
};
const CONTACT_STATUS_LABELS = {
  pending_actions: 'En attente',
  connection_sent: 'Connexion envoyee',
  dm_pending: 'DM en attente',
  completed: 'Termine',
  failed: 'Echoue',
};
const CONTACT_STATUS_COLORS = {
  pending_actions: 'bg-blue-50 text-blue-600',
  connection_sent: 'bg-yellow-50 text-yellow-600',
  dm_pending: 'bg-purple-50 text-purple-600',
  completed: 'bg-green-50 text-green-700',
  failed: 'bg-red-50 text-red-600',
};

export default function LeadMagnetDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [lm, setLm] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const [data, contactsData] = await Promise.all([
        getLeadMagnet(id),
        getLeadMagnetContacts(id),
      ]);
      setLm(data);
      setContacts(contactsData);
    } catch {
      toast.error('Erreur de chargement');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, [id]);

  const handleAction = async (action) => {
    try {
      if (action === 'start') await startLeadMagnet(id);
      else if (action === 'pause') await pauseLeadMagnet(id);
      else if (action === 'resume') await resumeLeadMagnet(id);
      else if (action === 'cancel') await cancelLeadMagnet(id);
      else if (action === 'trigger') { await triggerLeadMagnet(id); toast.success('Tick lance !'); }
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erreur');
    }
  };

  if (loading) return (
    <PageWrapper>
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-4 border-linkedin border-t-transparent rounded-full animate-spin" />
      </div>
    </PageWrapper>
  );

  if (!lm) return (
    <PageWrapper>
      <p className="text-center text-gray-500 py-20">Lead magnet introuvable</p>
    </PageWrapper>
  );

  const stats = [
    { label: 'Detectes', value: lm.total_processed, icon: MessageSquare, color: 'text-blue-500' },
    { label: 'DMs envoyes', value: lm.total_dm_sent, icon: MessageSquare, color: 'text-green-500' },
    { label: 'Connexions', value: lm.total_connections_sent, icon: UserPlus, color: 'text-purple-500' },
    { label: 'Likes', value: lm.total_likes, icon: ThumbsUp, color: 'text-pink-500' },
    { label: 'Reponses', value: lm.total_replies_sent, icon: Reply, color: 'text-orange-500' },
  ];

  return (
    <PageWrapper>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/dashboard/lead-magnets')} className="p-2 rounded-xl hover:bg-gray-100">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="f text-xl font-bold text-gray-900">{lm.name}</h1>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[lm.status]}`}>
              {STATUS_LABELS[lm.status]}
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-1 truncate max-w-lg">{lm.post_url}</p>
        </div>
        <div className="flex items-center gap-2">
          {lm.status === 'pending' && (
            <button onClick={() => handleAction('start')} className="cta-btn flex items-center gap-2 text-sm">
              <Play size={14} /> Demarrer
            </button>
          )}
          {lm.status === 'running' && (
            <>
              <button onClick={() => handleAction('trigger')} className="px-4 py-2 rounded-xl border border-blue-300 text-blue-700 hover:bg-blue-50 text-sm flex items-center gap-2">
                <Zap size={14} /> Lancer maintenant
              </button>
              <button onClick={() => handleAction('pause')} className="px-4 py-2 rounded-xl border border-yellow-300 text-yellow-700 hover:bg-yellow-50 text-sm flex items-center gap-2">
                <Pause size={14} /> Pause
              </button>
              <button onClick={() => handleAction('cancel')} className="px-4 py-2 rounded-xl border border-red-300 text-red-600 hover:bg-red-50 text-sm flex items-center gap-2">
                <Square size={14} /> Arreter
              </button>
            </>
          )}
          {lm.status === 'paused' && (
            <>
              <button onClick={() => handleAction('resume')} className="cta-btn flex items-center gap-2 text-sm">
                <Play size={14} /> Reprendre
              </button>
              <button onClick={() => handleAction('cancel')} className="px-4 py-2 rounded-xl border border-red-300 text-red-600 hover:bg-red-50 text-sm flex items-center gap-2">
                <Square size={14} /> Arreter
              </button>
            </>
          )}
          {['cancelled', 'failed'].includes(lm.status) && (
            <button onClick={() => handleAction('start')} className="cta-btn flex items-center gap-2 text-sm">
              <Play size={14} /> Relancer
            </button>
          )}
        </div>
      </div>

      {/* Error */}
      {lm.error_message && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          {lm.error_message}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-5 gap-3 mb-6">
        {stats.map((s) => (
          <div key={s.label} className="border border-gray-200 rounded-xl p-4 text-center">
            <s.icon size={20} className={`mx-auto mb-2 ${s.color}`} />
            <div className="text-2xl font-bold text-gray-900">{s.value}</div>
            <div className="text-xs text-gray-500 mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Config recap */}
      <div className="border border-gray-200 rounded-xl p-4 mb-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Configuration</h3>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <span className="text-gray-400">Mot-cle:</span>
            <span className="ml-2 px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-xs font-medium">{lm.keyword}</span>
          </div>
          <div>
            <span className="text-gray-400">Verification:</span>
            <span className="ml-2 text-gray-700">{lm.check_interval_seconds < 60 ? `${lm.check_interval_seconds}s` : `${lm.check_interval_seconds / 60} min`}</span>
          </div>
          <div>
            <span className="text-gray-400">Intervalle actions:</span>
            <span className="ml-2 text-gray-700">{lm.action_interval_seconds < 60 ? `${lm.action_interval_seconds}s` : `${lm.action_interval_seconds / 60} min`}</span>
          </div>
        </div>
      </div>

      {/* Contacts table */}
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-700">Commentateurs detectes ({contacts.length})</h3>
        </div>
        {contacts.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">
            Aucun commentateur detecte pour le moment
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {contacts.map((c) => (
              <div key={c.id} className="px-4 py-3 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 text-sm">{c.commenter_name || c.commenter_urn_id}</div>
                  {c.comment_text && (
                    <div className="text-xs text-gray-400 mt-0.5 truncate max-w-md">"{c.comment_text}"</div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {c.liked_comment && <ThumbsUp size={14} className="text-pink-400" title="Like" />}
                  {c.replied_to_comment && <Reply size={14} className="text-orange-400" title="Repondu" />}
                  {c.dm_sent && <MessageSquare size={14} className="text-green-500" title="DM envoye" />}
                  {c.status === 'connection_sent' && <Clock size={14} className="text-yellow-500" title="Connexion en attente" />}
                </div>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${CONTACT_STATUS_COLORS[c.status] || 'bg-gray-100 text-gray-600'}`}>
                  {CONTACT_STATUS_LABELS[c.status] || c.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </PageWrapper>
  );
}

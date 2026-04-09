import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Magnet, Plus, Play, Pause, Square, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import PageWrapper from '../components/layout/PageWrapper';
import Modal from '../components/ui/Modal';
import {
  getLeadMagnets, createLeadMagnet, startLeadMagnet,
  pauseLeadMagnet, cancelLeadMagnet, deleteLeadMagnet,
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

const CHECK_INTERVALS = [
  { value: 60, label: '1 minute' },
  { value: 120, label: '2 minutes' },
  { value: 300, label: '5 minutes' },
  { value: 600, label: '10 minutes' },
  { value: 1800, label: '30 minutes' },
  { value: 3600, label: '1 heure' },
];

const ACTION_INTERVALS = [
  { value: 30, label: '30 secondes' },
  { value: 60, label: '1 minute' },
  { value: 120, label: '2 minutes' },
  { value: 300, label: '5 minutes' },
];

const DEFAULT_FORM = {
  name: '',
  post_url: '',
  keyword: '',
  check_interval_seconds: 300,
  action_interval_seconds: 60,
  dm_template: '',
  reply_template_connected: '',
  reply_template_not_connected: '',
  connection_message: '',
};

export default function LeadMagnetsPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ ...DEFAULT_FORM });
  const [creating, setCreating] = useState(false);

  const load = () => getLeadMagnets().then(setItems).catch(() => toast.error('Erreur de chargement')).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.name || !form.post_url || !form.keyword || !form.dm_template) {
      toast.error('Remplissez les champs obligatoires');
      return;
    }
    setCreating(true);
    try {
      await createLeadMagnet(form);
      toast.success('Lead magnet cree');
      setShowCreate(false);
      setForm({ ...DEFAULT_FORM });
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erreur');
    } finally {
      setCreating(false);
    }
  };

  const handleAction = async (id, action) => {
    try {
      if (action === 'start') await startLeadMagnet(id);
      else if (action === 'pause') await pauseLeadMagnet(id);
      else if (action === 'cancel') await cancelLeadMagnet(id);
      else if (action === 'delete') {
        if (!confirm('Supprimer ce lead magnet ?')) return;
        await deleteLeadMagnet(id);
      }
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erreur');
    }
  };

  return (
    <PageWrapper>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="f text-2xl font-bold text-gray-900">Lead Magnets</h1>
          <p className="text-sm text-gray-500 mt-1">Automatisez l'envoi de vos lead magnets aux commentateurs</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="cta-btn flex items-center gap-2">
          <Plus size={16} /> Nouveau
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-linkedin border-t-transparent rounded-full animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-20">
          <Magnet size={48} className="mx-auto mb-4 text-gray-300" />
          <p className="text-gray-500">Aucun lead magnet</p>
          <button onClick={() => setShowCreate(true)} className="cta-btn mt-4">Creer mon premier lead magnet</button>
        </div>
      ) : (
        <div className="grid gap-4">
          {items.map((lm) => (
            <div
              key={lm.id}
              className="border border-gray-200 rounded-2xl p-5 hover:shadow-md transition cursor-pointer"
              onClick={() => navigate(`/dashboard/lead-magnets/${lm.id}`)}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <Magnet size={20} className="text-blue-500" />
                  <span className="font-semibold text-gray-900">{lm.name}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[lm.status] || 'bg-gray-100 text-gray-600'}`}>
                    {STATUS_LABELS[lm.status] || lm.status}
                  </span>
                </div>
                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  {lm.status === 'pending' && (
                    <button onClick={() => handleAction(lm.id, 'start')} className="p-2 rounded-lg hover:bg-green-50" title="Demarrer">
                      <Play size={16} className="text-green-600" />
                    </button>
                  )}
                  {lm.status === 'running' && (
                    <button onClick={() => handleAction(lm.id, 'pause')} className="p-2 rounded-lg hover:bg-yellow-50" title="Pause">
                      <Pause size={16} className="text-yellow-600" />
                    </button>
                  )}
                  {lm.status === 'paused' && (
                    <button onClick={() => handleAction(lm.id, 'start')} className="p-2 rounded-lg hover:bg-green-50" title="Reprendre">
                      <Play size={16} className="text-green-600" />
                    </button>
                  )}
                  {['running', 'paused'].includes(lm.status) && (
                    <button onClick={() => handleAction(lm.id, 'cancel')} className="p-2 rounded-lg hover:bg-red-50" title="Arreter">
                      <Square size={16} className="text-red-500" />
                    </button>
                  )}
                  {['pending', 'cancelled', 'failed'].includes(lm.status) && (
                    <button onClick={() => handleAction(lm.id, 'delete')} className="p-2 rounded-lg hover:bg-red-50" title="Supprimer">
                      <Trash2 size={16} className="text-red-400" />
                    </button>
                  )}
                </div>
              </div>

              <div className="text-xs text-gray-400 mb-3 truncate">{lm.post_url}</div>

              <div className="flex items-center gap-4 text-sm">
                <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-xs font-medium">
                  Mot-cle: {lm.keyword}
                </span>
                <span className="text-gray-500">{lm.total_dm_sent} DMs</span>
                <span className="text-gray-500">{lm.total_connections_sent} connexions</span>
                <span className="text-gray-500">{lm.total_processed} detectes</span>
              </div>
              {lm.error_message && (
                <div className="mt-2 text-xs text-red-500 truncate">{lm.error_message}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Creation modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Nouveau Lead Magnet" wide>
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nom *</label>
            <input className="input-glass" placeholder="Mon lead magnet" value={form.name} onChange={(e) => set('name', e.target.value)} />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">URL du post LinkedIn *</label>
            <input className="input-glass" placeholder="https://www.linkedin.com/posts/..." value={form.post_url} onChange={(e) => set('post_url', e.target.value)} />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Mot-cle declencheur *</label>
            <input className="input-glass" placeholder="interesse" value={form.keyword} onChange={(e) => set('keyword', e.target.value)} />
            <p className="text-xs text-gray-400 mt-1">Le mot-cle doit etre present dans le commentaire (meme si la phrase est plus longue)</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Verification</label>
              <select className="input-glass" value={form.check_interval_seconds} onChange={(e) => set('check_interval_seconds', Number(e.target.value))}>
                {CHECK_INTERVALS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Intervalle actions</label>
              <select className="input-glass" value={form.action_interval_seconds} onChange={(e) => set('action_interval_seconds', Number(e.target.value))}>
                {ACTION_INTERVALS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Message DM * <span className="text-gray-400 font-normal">(envoye a tout le monde)</span></label>
            <textarea className="input-glass" rows={3} placeholder="Salut {first_name}, voici le lien..." value={form.dm_template} onChange={(e) => set('dm_template', e.target.value)} />
            <p className="text-xs text-gray-400 mt-1">Variables: {'{first_name}'}, {'{last_name}'}, {'{name}'}</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reponse commentaire (connecte)</label>
            <textarea className="input-glass" rows={2} placeholder="Merci {first_name} ! Je t'envoie ca en DM" value={form.reply_template_connected} onChange={(e) => set('reply_template_connected', e.target.value)} />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reponse commentaire (non connecte)</label>
            <textarea className="input-glass" rows={2} placeholder="Connectons-nous pour que je puisse te l'envoyer !" value={form.reply_template_not_connected} onChange={(e) => set('reply_template_not_connected', e.target.value)} />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Message de connexion <span className="text-gray-400 font-normal">(optionnel, 300 car. max)</span></label>
            <textarea className="input-glass" rows={2} maxLength={300} placeholder="Salut {first_name}, je t'envoie le document des qu'on est connectes !" value={form.connection_message} onChange={(e) => set('connection_message', e.target.value)} />
          </div>

          <button type="submit" className="cta-btn w-full" disabled={creating}>
            {creating ? 'Creation...' : 'Creer le lead magnet'}
          </button>
        </form>
      </Modal>
    </PageWrapper>
  );
}

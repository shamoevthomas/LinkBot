import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, MessageSquare, UserPlus, ChevronDown, Sparkles, MessageCircle } from 'lucide-react';
import { getCampaigns, createCampaign } from '../api/campaigns';
import { getCRMs } from '../api/crm';
import client from '../api/client';
import PageWrapper from '../components/layout/PageWrapper';
import Badge from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import toast from 'react-hot-toast';

const TABS = [
  { key: '', label: 'Tout' },
  { key: 'search', label: 'Recherche' },
  { key: 'dm', label: 'Messages' },
  { key: 'connection', label: 'Connexions' },
];

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('');
  const [showNew, setShowNew] = useState(null); // 'search' | 'dm' | 'connection' | null
  const [showDropdown, setShowDropdown] = useState(false);
  const [crms, setCrms] = useState([]);
  const [form, setForm] = useState({ name: '', crm_id: '', keywords: '', message_template: '', use_ai: false, total_target: 100, max_per_day: 25, spread_over_days: 5, targetMode: 'spread', withDM: false });
  const [creating, setCreating] = useState(false);
  const [aiAvailable, setAiAvailable] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    client.get('/ai/status').then((r) => setAiAvailable(r.data.available)).catch(() => {});
  }, []);

  const load = async () => {
    try {
      const data = await getCampaigns({ type: tab || undefined });
      setCampaigns(data);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [tab]);

  const openNew = async (type) => {
    setCrms(await getCRMs());
    setForm({ name: '', crm_id: '', keywords: '', message_template: '', use_ai: false, total_target: 100, max_per_day: type === 'dm' ? 50 : 25, spread_over_days: 5, targetMode: 'spread' });
    setShowNew(type);
    setShowDropdown(false);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setCreating(true);
    try {
      const maxDay = parseInt(form.max_per_day) || 25;
      const spreadDays = parseInt(form.spread_over_days) || 5;
      const totalTarget = form.targetMode === 'spread'
        ? maxDay * spreadDays
        : parseInt(form.total_target) || 100;
      const computedSpread = form.targetMode === 'total'
        ? Math.ceil(totalTarget / maxDay)
        : spreadDays;

      await createCampaign({
        ...form,
        type: showNew,
        crm_id: form.crm_id ? parseInt(form.crm_id) : null,
        total_target: totalTarget,
        max_per_day: maxDay,
        spread_over_days: computedSpread,
        use_ai: form.use_ai,
      });
      toast.success('Campagne créée et lancée');
      setShowNew(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erreur');
    } finally { setCreating(false); }
  };

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const progress = (c) => c.total_target ? Math.round((c.total_processed / c.total_target) * 100) : 0;

  return (
    <PageWrapper>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="f text-2xl font-bold text-gray-900">Campagnes</h1>
          <p className="text-gray-500 text-sm mt-1">Automatisez vos actions LinkedIn</p>
        </div>
        <div className="relative">
          <button onClick={() => setShowDropdown(!showDropdown)}
            className="cta-btn flex items-center gap-2">
            <Plus size={18} /> Nouvelle campagne <ChevronDown size={16} />
          </button>
          {showDropdown && (
            <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-lg border border-gray-200 py-1 z-10">
              <button onClick={() => openNew('search')}
                className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3">
                <Search size={16} className="text-gray-400" /> Campagne Recherche
              </button>
              <button onClick={() => { setShowDropdown(false); navigate('/dashboard/campaigns/new-dm'); }}
                className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3">
                <MessageSquare size={16} className="text-gray-400" /> Campagne Message
              </button>
              <button onClick={() => openNew('connection')}
                className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3">
                <UserPlus size={16} className="text-gray-400" /> Campagne Connexion
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 w-fit">
        {TABS.map(({ key, label }) => (
          <button key={key} onClick={() => { setTab(key); setLoading(true); }}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              tab === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--blue)', borderTopColor: 'transparent' }} />
        </div>
      ) : campaigns.length === 0 ? (
        <div className="g-card text-center py-20">
          <p className="text-gray-500">Aucune campagne</p>
        </div>
      ) : (
        <div className="space-y-3">
          {campaigns.map((c) => (
            <div key={c.id} onClick={() => navigate(`/dashboard/campaigns/${c.id}`)}
              className="g-card cursor-pointer p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <h3 className="font-semibold text-gray-900">{c.name}</h3>
                  <Badge status={c.type} />
                  <Badge status={c.status} />
                </div>
                <span className="text-sm text-gray-500">{new Date(c.created_at).toLocaleDateString('fr-FR')}</span>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex-1 bg-gray-100 rounded-full h-2">
                  <div className="h-2 rounded-full transition-all" style={{ background: 'var(--blue)', width: `${progress(c)}%` }} />
                </div>
                <span className="text-sm font-medium text-gray-600 whitespace-nowrap">
                  {c.total_processed} / {c.total_target || '?'}
                </span>
              </div>
              <div className="flex gap-6 mt-3 text-xs text-gray-500">
                <span>Reussis: {c.total_succeeded}</span>
                <span>Echoues: {c.total_failed}</span>
                <span>Ignores: {c.total_skipped}</span>
                {c.connection_rate != null && <span className="text-sky-600 font-medium">Connexion: {c.connection_rate}%</span>}
                {c.reply_rate != null && <span className="text-emerald-600 font-medium">Reponse: {c.reply_rate}%</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Campaign creation modals */}
      <Modal open={!!showNew} onClose={() => setShowNew(null)} title={
        showNew === 'search' ? 'Nouvelle campagne Recherche' :
        showNew === 'dm' ? 'Nouvelle campagne Message' :
        'Nouvelle campagne Connexion'
      } wide>
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nom de la campagne</label>
            <input value={form.name} onChange={(e) => set('name', e.target.value)} required
              className="input-glass"
              placeholder="Ex: Prospection Marketing Managers" />
          </div>

          {(showNew === 'search' || showNew === 'connection') && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Mots-clés de recherche</label>
              <input value={form.keywords} onChange={(e) => set('keywords', e.target.value)}
                className="input-glass"
                placeholder="Ex: Marketing Manager Paris" />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">CRM de destination</label>
            <select value={form.crm_id} onChange={(e) => set('crm_id', e.target.value)}
              className="input-glass"
              required={showNew === 'search' || showNew === 'dm'}>
              <option value="">Sélectionner un CRM...</option>
              {crms.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.contact_count} contacts)</option>)}
            </select>
          </div>

          {showNew === 'dm' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Template de message</label>
              <textarea value={form.message_template} onChange={(e) => set('message_template', e.target.value)}
                rows={3} className="input-glass"
                placeholder="Bonjour {first_name}, ..." />
              <p className="text-xs text-gray-400 mt-1">
                {form.use_ai
                  ? 'Décrivez le ton et le but du message. L\'IA personnalisera pour chaque contact.'
                  : <>Variables : {'{first_name}'}, {'{last_name}'}, {'{headline}'}</>}
              </p>

              {/* AI Toggle */}
              {aiAvailable && (
                <label className="flex items-center gap-3 mt-3 p-3 bg-purple-50 border border-purple-200 rounded-lg cursor-pointer">
                  <input type="checkbox" checked={form.use_ai} onChange={(e) => set('use_ai', e.target.checked)}
                    className="w-4 h-4 text-purple-600 rounded" />
                  <Sparkles size={16} className="text-purple-500" />
                  <div>
                    <span className="text-sm font-medium text-purple-700">Personnalisation IA</span>
                    <p className="text-xs text-purple-500">Chaque message sera unique, adapté au profil du contact (gratuit, local)</p>
                  </div>
                </label>
              )}
            </div>
          )}

          {showNew === 'search' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre de contacts à collecter</label>
              <input type="number" value={form.total_target} onChange={(e) => set('total_target', e.target.value)}
                className="input-glass" min={1} />
            </div>
          )}

          {/* Connexion + DM toggle */}
          {showNew === 'connection' && (
            <label className="flex items-center gap-3 p-3 border border-blue-200 rounded-lg cursor-pointer" style={{ background: 'rgba(0,132,255,0.08)' }}>
              <input type="checkbox" checked={form.withDM} onChange={(e) => set('withDM', e.target.checked)}
                className="w-4 h-4 rounded" style={{ accentColor: 'var(--blue)' }} />
              <MessageCircle size={16} style={{ color: 'var(--blue)' }} />
              <div>
                <span className="text-sm font-medium text-blue-700">Connexion + DM</span>
                <p className="text-xs text-blue-500">Envoyer un message automatiquement après acceptation de la connexion</p>
              </div>
            </label>
          )}

          {/* Target mode switch */}
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 w-fit">
            <button type="button" onClick={() => set('targetMode', 'spread')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                form.targetMode === 'spread' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>Étalement</button>
            <button type="button" onClick={() => set('targetMode', 'total')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                form.targetMode === 'total' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>Total</button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Max par jour</label>
              <input type="number" value={form.max_per_day} onChange={(e) => set('max_per_day', e.target.value)}
                className="input-glass" min={1} />
            </div>
            {form.targetMode === 'spread' ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Étaler sur (jours)</label>
                <input type="number" value={form.spread_over_days} onChange={(e) => set('spread_over_days', e.target.value)}
                  className="input-glass" min={1} />
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Total à envoyer</label>
                <input type="number" value={form.total_target} onChange={(e) => set('total_target', e.target.value)}
                  className="input-glass" min={1} />
              </div>
            )}
          </div>

          {/* Computed summary */}
          <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
            {form.targetMode === 'spread'
              ? <>Total : <strong>{(parseInt(form.max_per_day) || 0) * (parseInt(form.spread_over_days) || 0)}</strong> actions ({form.max_per_day}/j pendant {form.spread_over_days} jours)</>
              : <>Durée : <strong>{Math.ceil((parseInt(form.total_target) || 0) / (parseInt(form.max_per_day) || 1))}</strong> jours ({form.total_target} actions à {form.max_per_day}/j)</>
            }
          </p>

          {showNew === 'connection' && form.withDM ? (
            <button type="button" onClick={() => {
              if (!form.name.trim()) return toast.error('Donne un nom à la campagne');
              if (!form.crm_id) return toast.error('Sélectionne un CRM');
              const maxDay = parseInt(form.max_per_day) || 25;
              const spreadDays = parseInt(form.spread_over_days) || 5;
              const totalTarget = form.targetMode === 'spread'
                ? maxDay * spreadDays
                : parseInt(form.total_target) || 100;
              setShowNew(null);
              navigate('/dashboard/campaigns/new-dm', {
                state: {
                  connectionConfig: {
                    name: form.name,
                    keywords: form.keywords,
                    crm_id: parseInt(form.crm_id),
                    total_target: totalTarget,
                    max_per_day: maxDay,
                    spread_over_days: form.targetMode === 'total' ? Math.ceil(totalTarget / maxDay) : spreadDays,
                  },
                },
              });
            }}
              className="cta-btn w-full flex items-center justify-center gap-2">
              <MessageCircle size={16} /> Configurer les DMs
            </button>
          ) : (
            <button type="submit" disabled={creating}
              className="cta-btn w-full disabled:opacity-50">
              {creating ? 'Lancement...' : 'Lancer la campagne'}
            </button>
          )}
        </form>
      </Modal>
    </PageWrapper>
  );
}

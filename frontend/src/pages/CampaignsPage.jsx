import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { Plus, Search, MessageSquare, UserPlus, ChevronDown, Sparkles, MessageCircle, Trash2 } from 'lucide-react';
import { getCampaigns, createCampaign, deleteCampaign } from '../api/campaigns';
import { getCRMs } from '../api/crm';
import client from '../api/client';
import PageWrapper from '../components/layout/PageWrapper';
import Badge from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import toast from 'react-hot-toast';

const COUNTRIES = [
  { id: '105015875', name: 'France' },
  { id: '100565514', name: 'Belgique' },
  { id: '106693272', name: 'Suisse' },
  { id: '101174742', name: 'Canada' },
  { id: '104042105', name: 'Luxembourg' },
  { id: '100459367', name: 'Monaco' },
  { id: '102787409', name: 'Maroc' },
  { id: '102134353', name: 'Tunisie' },
  { id: '104476498', name: 'Algerie' },
  { id: '103644278', name: 'Etats-Unis' },
  { id: '101165590', name: 'Royaume-Uni' },
  { id: '101282230', name: 'Allemagne' },
  { id: '105646813', name: 'Espagne' },
  { id: '103350119', name: 'Italie' },
  { id: '102890719', name: 'Pays-Bas' },
  { id: '100364837', name: 'Portugal' },
];

const TABS = [
  { key: '', label: 'Tout' },
  { key: 'search', label: 'Recherche' },
  { key: 'dm', label: 'Messages' },
  { key: 'connection', label: 'Connexions' },
];

export default function CampaignsPage() {
  const [tab, setTab] = useState('');
  const [showNew, setShowNew] = useState(null); // 'search' | 'dm' | 'connection' | null
  const [showDropdown, setShowDropdown] = useState(false);
  const [crms, setCrms] = useState([]);
  const [form, setForm] = useState({ name: '', crm_id: '', keywords: '', message_template: '', use_ai: false, total_target: 100, withDM: false, autoConnect: false, autoConnectDM: false, search_regions: [] });
  const [creating, setCreating] = useState(false);
  const [aiAvailable, setAiAvailable] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    client.get('/ai/status').then((r) => setAiAvailable(r.data.available)).catch(() => {});
  }, []);

  const { data: campaigns = [], isFetching } = useQuery({
    queryKey: ['campaigns', { type: tab || undefined }],
    queryFn: () => getCampaigns({ type: tab || undefined }),
    placeholderData: keepPreviousData,
    refetchInterval: 20_000,
  });
  const loading = isFetching && campaigns.length === 0;
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['campaigns'] });

  const openNew = async (type) => {
    setCrms(await getCRMs());
    setForm({ name: '', crm_id: '', keywords: '', message_template: '', use_ai: false, total_target: 100, withDM: false, autoConnect: false, autoConnectDM: false, search_regions: [] });
    setShowNew(type);
    setShowDropdown(false);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setCreating(true);
    try {
      await createCampaign({
        ...form,
        type: showNew,
        crm_id: form.crm_id ? parseInt(form.crm_id) : null,
        total_target: parseInt(form.total_target) || 100,
        use_ai: form.use_ai,
        auto_connect: form.autoConnect,
      });
      toast.success('Campagne créée et lancée');
      setShowNew(null);
      invalidate();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erreur');
    } finally { setCreating(false); }
  };

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const progress = (c) => c.status === 'completed' ? 100 : (c.total_target ? Math.round((c.total_processed / c.total_target) * 100) : 0);

  return (
    <PageWrapper>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="f text-2xl font-bold text-gray-900">Campagnes</h1>
          <p className="text-gray-500 text-sm mt-1">Automatisez vos actions LinkedIn</p>
        </div>
        <div className="relative">
          <button onClick={() => setShowDropdown(!showDropdown)}
            className="cta-btn flex items-center gap-1.5" style={{ padding: '8px 16px', fontSize: 13 }}>
            <Plus size={15} /> Nouvelle campagne <ChevronDown size={14} />
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
          <button key={key} onClick={() => setTab(key)}
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
          {[...campaigns].sort((a, b) => {
            const finished = ['completed', 'cancelled', 'failed'];
            const aFinished = finished.includes(a.status) ? 1 : 0;
            const bFinished = finished.includes(b.status) ? 1 : 0;
            return aFinished - bFinished;
          }).map((c) => {
            const isFinished = ['completed', 'cancelled', 'failed'].includes(c.status);
            return (
            <div key={c.id} onClick={() => navigate(`/dashboard/campaigns/${c.id}`)}
              className="g-card cursor-pointer p-5"
              style={isFinished ? { opacity: 0.5, filter: 'grayscale(0.6)' } : undefined}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <h3 className="font-semibold text-gray-900">{c.name}</h3>
                  <Badge status={c.type} />
                  <Badge status={c.status} />
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-500">{new Date(c.created_at).toLocaleDateString('fr-FR')}</span>
                  <button onClick={(e) => {
                    e.stopPropagation();
                    if (!confirm('Supprimer cette campagne ?')) return;
                    deleteCampaign(c.id).then(() => { toast.success('Campagne supprimee'); invalidate(); }).catch(() => toast.error('Erreur'));
                  }} className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                    <Trash2 size={15} />
                  </button>
                </div>
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
                {(c.type === 'dm' || c.type === 'connection_dm' || c.type === 'search_connection_dm') ? (
                  <>
                    <span>Envoyes: {c.total_sent}</span>
                    <span>Relances: {c.total_relance}</span>
                    <span className="text-emerald-600 font-medium">Repondu: {c.total_succeeded}</span>
                    <span>Perdu: {c.total_failed}</span>
                  </>
                ) : c.type === 'connection' ? (
                  <>
                    <span className="text-sky-600 font-medium">Envoyees: {c.total_succeeded}</span>
                    <span className="text-emerald-600 font-medium">Acceptees: {c.total_sent}</span>
                    <span>Echouees: {c.total_failed}</span>
                  </>
                ) : (
                  <>
                    <span>Trouves: {c.total_succeeded}</span>
                    <span>Ignores: {c.total_skipped}</span>
                  </>
                )}
                {c.connection_rate != null && <span className="text-sky-600 font-medium">Connexion: {c.connection_rate}%</span>}
                {c.reply_rate != null && <span className="text-emerald-600 font-medium">Reponse: {c.reply_rate}%</span>}
              </div>
            </div>
            );
          })}
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

          {showNew === 'search' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mots-cles de recherche</label>
                <input value={form.keywords} onChange={(e) => set('keywords', e.target.value)}
                  className="input-glass"
                  placeholder="Ex: Marketing Manager Paris" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Pays (optionnel)</label>
                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value && !form.search_regions.includes(e.target.value)) {
                      set('search_regions', [...form.search_regions, e.target.value]);
                    }
                  }}
                  className="input-glass">
                  <option value="">Tous les pays</option>
                  {COUNTRIES.filter(c => !form.search_regions.includes(c.id)).map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                {form.search_regions.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {form.search_regions.map(id => {
                      const country = COUNTRIES.find(c => c.id === id);
                      return (
                        <span key={id} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                          {country?.name || id}
                          <button type="button" onClick={() => set('search_regions', form.search_regions.filter(r => r !== id))}
                            className="hover:text-red-500 ml-0.5">&times;</button>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}

          {showNew === 'connection' && (
            <p className="text-sm text-gray-500 bg-gray-50 rounded-lg p-3">
              Les demandes de connexion seront envoyees aux contacts du CRM selectionne ci-dessous.
            </p>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">CRM de destination</label>
            <select value={form.crm_id} onChange={(e) => set('crm_id', e.target.value)}
              className="input-glass"
              required={showNew === 'search' || showNew === 'dm' || showNew === 'connection'}>
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

          {/* Recherche + Connexion toggle */}
          {showNew === 'search' && (
            <label className="flex items-center gap-3 p-3 border border-blue-200 rounded-lg cursor-pointer" style={{ background: form.autoConnectDM ? 'rgba(0,0,0,0.02)' : 'rgba(0,132,255,0.08)' }}>
              <input type="checkbox" checked={form.autoConnect} onChange={(e) => { set('autoConnect', e.target.checked); if (e.target.checked) set('autoConnectDM', false); }}
                className="w-4 h-4 rounded" style={{ accentColor: 'var(--blue)' }} disabled={form.autoConnectDM} />
              <UserPlus size={16} style={{ color: form.autoConnectDM ? '#9ca3af' : 'var(--blue)' }} />
              <div>
                <span className={`text-sm font-medium ${form.autoConnectDM ? 'text-gray-400' : 'text-blue-700'}`}>Recherche + Connexion</span>
                <p className={`text-xs ${form.autoConnectDM ? 'text-gray-400' : 'text-blue-500'}`}>Envoyer automatiquement une demande de connexion aux contacts trouvés</p>
              </div>
            </label>
          )}

          {/* Recherche + Connexion + DM toggle */}
          {showNew === 'search' && (
            <label className="flex items-center gap-3 p-3 border border-cyan-200 rounded-lg cursor-pointer" style={{ background: 'rgba(0,180,216,0.08)' }}>
              <input type="checkbox" checked={form.autoConnectDM} onChange={(e) => { set('autoConnectDM', e.target.checked); if (e.target.checked) set('autoConnect', false); }}
                className="w-4 h-4 rounded" style={{ accentColor: '#0891b2' }} />
              <MessageCircle size={16} className="text-cyan-600" />
              <div>
                <span className="text-sm font-medium text-cyan-700">Recherche + Connexion + DM</span>
                <p className="text-xs text-cyan-500">Rechercher, connecter, puis envoyer un DM après acceptation</p>
              </div>
            </label>
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

          {(showNew === 'connection' && form.withDM) || (showNew === 'search' && form.autoConnectDM) ? (
            <button type="button" onClick={() => {
              if (!form.name.trim()) return toast.error('Donne un nom à la campagne');
              if (!form.crm_id) return toast.error('Sélectionne un CRM');
              if (showNew === 'search' && !form.keywords?.trim()) return toast.error('Ajoute des mots-clés');
              setShowNew(null);
              if (showNew === 'search' && form.autoConnectDM) {
                navigate('/dashboard/campaigns/new-dm', {
                  state: {
                    searchConnectionDMConfig: {
                      name: form.name,
                      keywords: form.keywords,
                      crm_id: parseInt(form.crm_id),
                      total_target: parseInt(form.total_target) || 100,
                      search_regions: form.search_regions,
                    },
                  },
                });
              } else {
                navigate('/dashboard/campaigns/new-dm', {
                  state: {
                    connectionConfig: {
                      name: form.name,
                      keywords: form.keywords,
                      crm_id: parseInt(form.crm_id),
                    },
                  },
                });
              }
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

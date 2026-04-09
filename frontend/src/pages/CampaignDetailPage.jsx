import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Pause, Play, XCircle, CheckCircle, AlertCircle, Clock, Zap, X, MapPin, Briefcase, ExternalLink, MessageSquare, UserX, UserCheck, Copy, Timer, List, Columns3, Pencil, Check, RotateCcw, Settings } from 'lucide-react';
import { getCampaign, updateCampaign, startCampaign, pauseCampaign, resumeCampaign, cancelCampaign, duplicateCampaign, runCampaignNow, getCampaignActions, getCampaignContacts, updateContactStatus, retryFromAction } from '../api/campaigns';
import PageWrapper from '../components/layout/PageWrapper';
import Badge from '../components/ui/Badge';
import toast from 'react-hot-toast';

const STATUS_CONFIG = {
  pending: { label: 'En attente', color: 'bg-gray-100 text-gray-600' },
  en_attente: { label: 'Connexion en attente', color: 'bg-yellow-100 text-yellow-700' },
  demande_envoyee: { label: 'Demande envoyee', color: 'bg-sky-100 text-sky-700' },
  envoye: { label: 'Envoye', color: 'bg-blue-100 text-blue-700' },
  relance_1: { label: 'Relance 1', color: 'bg-amber-100 text-amber-700' },
  relance_2: { label: 'Relance 2', color: 'bg-amber-100 text-amber-700' },
  relance_3: { label: 'Relance 3', color: 'bg-orange-100 text-orange-700' },
  relance_4: { label: 'Relance 4', color: 'bg-orange-100 text-orange-700' },
  relance_5: { label: 'Relance 5', color: 'bg-red-100 text-red-600' },
  relance_6: { label: 'Relance 6', color: 'bg-red-100 text-red-600' },
  relance_7: { label: 'Relance 7', color: 'bg-red-100 text-red-600' },
  reussi: { label: 'Repondu', color: 'bg-emerald-100 text-emerald-700' },
  perdu: { label: 'Perdu', color: 'bg-gray-200 text-gray-500' },
};

function ContactStatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || { label: status, color: 'bg-gray-100 text-gray-600' };
  return <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${cfg.color}`}>{cfg.label}</span>;
}

function CountdownTimer({ nextActionAt, status }) {
  const [countdown, setCountdown] = useState(null);
  useEffect(() => {
    if (!nextActionAt || status !== 'running') { setCountdown(null); return; }
    const update = () => {
      const target = new Date(nextActionAt);
      const diff = Math.max(0, Math.floor((target - new Date()) / 1000));
      setCountdown(diff);
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [nextActionAt, status]);
  if (countdown === null || countdown === undefined) return null;
  if (countdown <= 0) return <span>Imminent...</span>;
  const m = Math.floor(countdown / 60);
  const s = countdown % 60;
  return <span>{m > 0 ? `${m} min ${s.toString().padStart(2, '0')} sec` : `${s} sec`}</span>;
}

function initials(c) {
  return ((c.contact_first_name?.[0] || '') + (c.contact_last_name?.[0] || '')).toUpperCase() || '?';
}

function fmtDate(d) {
  if (!d) return '-';
  const s = typeof d === 'string' && !d.endsWith('Z') && !d.includes('+') ? d + 'Z' : d;
  return new Date(s).toLocaleString('fr-FR');
}

export default function CampaignDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState(null);
  const [actions, setActions] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('contacts'); // 'contacts' | 'actions'
  const [viewMode, setViewMode] = useState('table'); // 'table' | 'kanban'
  const [selectedContact, setSelectedContact] = useState(null);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState('');

  const abortRef = useRef(null);
  const load = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const [c, a, cc] = await Promise.all([
        getCampaign(id),
        getCampaignActions(id, { page: 1, per_page: 50 }),
        getCampaignContacts(id),
      ]);
      if (controller.signal.aborted) return;
      setCampaign(c);
      setActions(a.actions || a || []);
      const statusOrder = { reussi: 0, envoye: 1, demande_envoyee: 1, perdu: 2, en_attente: 3, pending: 4 };
      const sorted = (cc || []).sort((a, b) => {
        const oa = a.status?.startsWith('relance_') ? 1 : (statusOrder[a.status] ?? 2);
        const ob = b.status?.startsWith('relance_') ? 1 : (statusOrder[b.status] ?? 2);
        return oa - ob;
      });
      setContacts(sorted);
    } catch (err) {
      if (err?.name === 'CanceledError' || controller.signal.aborted) return;
      toast.error('Erreur chargement campagne');
    } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); return () => { if (abortRef.current) abortRef.current.abort(); }; }, [load]);

  useEffect(() => {
    if (campaign?.status !== 'running') return;
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, [campaign?.status, load]);

  const handleStart = async () => { await startCampaign(id); toast.success('Campagne lancee'); load(); };
  const handleRunNow = async () => {
    try {
      toast.loading('Execution manuelle...', { id: 'run-now' });
      const result = await runCampaignNow(id);
      toast.dismiss('run-now');
      if (result.ok) {
        toast.success(`Tick execute — traites: ${result.total_processed}, erreur: ${result.error_message || 'aucune'}`);
      } else {
        toast.error(`Erreur: ${result.error}`);
      }
      load();
    } catch (err) {
      toast.dismiss('run-now');
      toast.error(err.response?.data?.detail || 'Erreur execution');
    }
  };
  const handlePause = async () => { await pauseCampaign(id); toast.success('Campagne en pause'); load(); };
  const handleResume = async () => { await resumeCampaign(id); toast.success('Campagne relancee'); load(); };
  const handleCancel = async () => {
    if (!confirm('Annuler cette campagne ?')) return;
    await cancelCampaign(id); toast.success('Campagne annulee'); load();
  };
  const handleDuplicate = async () => {
    try {
      const dup = await duplicateCampaign(id);
      toast.success('Campagne dupliquee');
      navigate(`/dashboard/campaigns/${dup.id}`);
    } catch (err) { toast.error(err.response?.data?.detail || 'Erreur'); }
  };
  const handleReconfigure = async () => {
    try {
      if (campaign.status === 'running') {
        await pauseCampaign(id);
      }
      navigate(`/dashboard/campaigns/new-dm`, {
        state: { reconfigure: { id: campaign.id, name: campaign.name, crm_id: campaign.crm_id, ai_prompt: campaign.ai_prompt, context_text: campaign.context_text, fallback_message: campaign.fallback_message, message_template: campaign.message_template } },
      });
    } catch (err) { toast.error(err.response?.data?.detail || 'Erreur'); }
  };

  // Countdown extracted to <CountdownTimer /> component

  const progress = campaign?.status === 'completed' ? 100 : (campaign?.total_target ? Math.round((campaign.total_processed / campaign.total_target) * 100) : 0);

  const showReplyRate = campaign?.type && ['dm', 'connection_dm', 'search_connection_dm'].includes(campaign.type);
  const showConnectionRate = campaign?.type && ['connection', 'connection_dm', 'search_connection_dm'].includes(campaign.type);

  // Stats from contacts
  const isSearch = campaign?.type === 'search';
  const isConnection = campaign?.type === 'connection';
  const isConnectionDM = campaign?.type === 'connection_dm' || campaign?.type === 'search_connection_dm';
  const statsFromContacts = {
    en_attente: contacts.filter(c => c.status === 'en_attente').length,
    envoye: contacts.filter(c => c.main_sent_at && !(c.status === 'perdu' && c.last_sequence_sent === 0)).length,
    relance: contacts.filter(c => c.status.startsWith('relance_')).length,
    reussi: contacts.filter(c => c.status === 'reussi').length,
    perdu: contacts.filter(c => c.status === 'perdu').length,
  };

  if (loading) return <PageWrapper><div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--blue)', borderTopColor: 'transparent' }} /></div></PageWrapper>;

  return (
    <PageWrapper>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/dashboard/campaigns')} className="p-2 hover:bg-gray-200 rounded-lg">
          <ArrowLeft size={20} className="text-gray-600" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            {editingName ? (
              <form onSubmit={async (e) => { e.preventDefault(); if (nameValue.trim() && nameValue !== campaign.name) { await updateCampaign(id, { name: nameValue.trim() }); load(); } setEditingName(false); }} className="flex items-center gap-2">
                <input autoFocus value={nameValue} onChange={e => setNameValue(e.target.value)}
                  onKeyDown={e => e.key === 'Escape' && setEditingName(false)}
                  className="text-2xl font-bold text-gray-900 border-b-2 border-blue-400 outline-none bg-transparent px-0 py-0" />
                <button type="submit" className="p-1 hover:bg-emerald-50 rounded"><Check size={18} className="text-emerald-600" /></button>
                <button type="button" onClick={() => setEditingName(false)} className="p-1 hover:bg-red-50 rounded"><X size={18} className="text-red-400" /></button>
              </form>
            ) : (
              <h1 className="f text-2xl font-bold text-gray-900 cursor-pointer group flex items-center gap-2"
                onClick={() => { setNameValue(campaign.name); setEditingName(true); }}>
                {campaign.name}
                <Pencil size={14} className="text-gray-300 group-hover:text-gray-500 transition-colors" />
              </h1>
            )}
            <Badge status={campaign.type} />
            <Badge status={campaign.status} />
          </div>
        </div>
        <div className="flex gap-2">
          {campaign.status === 'pending' && (
            <button onClick={handleStart} className="px-4 py-2 text-white font-medium rounded-lg text-sm hover:opacity-90 flex items-center gap-2" style={{ background: 'var(--blue)' }}>
              <Play size={16} /> Lancer
            </button>
          )}
          {campaign.status === 'running' && (
            <button onClick={handlePause} className="px-4 py-2 bg-amber-100 text-amber-700 font-medium rounded-lg text-sm hover:bg-amber-200 flex items-center gap-2">
              <Pause size={16} /> Pause
            </button>
          )}
          {campaign.status === 'paused' && (
            <button onClick={handleResume} className="px-4 py-2 bg-emerald-100 text-emerald-700 font-medium rounded-lg text-sm hover:bg-emerald-200 flex items-center gap-2">
              <Play size={16} /> Reprendre
            </button>
          )}
          {['running', 'paused'].includes(campaign.status) && (campaign.type === 'dm' || campaign.type === 'connection_dm' || campaign.type === 'search_connection_dm') && (
            <button onClick={handleReconfigure} className="px-4 py-2 bg-purple-100 text-purple-700 font-medium rounded-lg text-sm hover:bg-purple-200 flex items-center gap-2">
              <Settings size={16} /> Reconfigurer
            </button>
          )}
          {['running', 'paused'].includes(campaign.status) && (
            <button onClick={handleCancel} className="px-4 py-2 bg-red-100 text-red-700 font-medium rounded-lg text-sm hover:bg-red-200 flex items-center gap-2">
              <XCircle size={16} /> Annuler
            </button>
          )}
          <button onClick={handleDuplicate} className="px-4 py-2 border border-gray-300 text-gray-700 font-medium rounded-lg text-sm hover:bg-gray-50 flex items-center gap-2">
            <Copy size={16} /> Dupliquer
          </button>
        </div>
      </div>

      {/* Progress */}
      <div className="g-card p-6 mb-6">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-gray-600">Progression</span>
          <span className="text-2xl font-bold text-gray-900">{progress}%</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-3 mb-4">
          <div className={`h-3 rounded-full transition-all ${
            campaign.status === 'completed' ? 'bg-emerald-500' :
            campaign.status === 'failed' ? 'bg-red-500' : ''
          }`} style={campaign.status !== 'completed' && campaign.status !== 'failed' ? { background: 'var(--blue)', width: `${progress}%` } : { width: `${progress}%` }} />
        </div>

        {/* Next action countdown or paused reason */}
        {campaign.status === 'running' && !isSearch && campaign.paused_reason && (
          <div className="flex items-center gap-2 mb-4 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-lg w-fit">
            <AlertCircle size={16} className="text-amber-500" />
            <span className="text-sm text-amber-700">{campaign.paused_reason}</span>
          </div>
        )}
        {campaign.status === 'running' && !isSearch && !campaign.paused_reason && campaign.next_action_at && (
          <div className="flex items-center gap-2 mb-4">
            <div className="flex items-center gap-2 px-4 py-2.5 bg-indigo-50 border border-indigo-200 rounded-lg">
              <Timer size={16} className="text-indigo-500" />
              <span className="text-sm text-indigo-700">
                Prochaine action dans <span className="font-bold"><CountdownTimer nextActionAt={campaign.next_action_at} status={campaign.status} /></span>
              </span>
            </div>
            <button onClick={handleRunNow} className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-white rounded-lg transition-colors" style={{ background: 'var(--blue)' }}
              onMouseOver={e => e.currentTarget.style.opacity = '0.85'} onMouseOut={e => e.currentTarget.style.opacity = '1'}>
              <Zap size={14} />
              Faire l'action maintenant
            </button>
          </div>
        )}

        {/* Error message from backend */}
        {campaign.error_message && (
          <div className="flex items-center gap-2 mb-4 px-4 py-2.5 bg-red-50 border border-red-200 rounded-lg">
            <AlertCircle size={16} className="text-red-500 shrink-0" />
            <span className="text-sm text-red-700 font-mono flex-1">{campaign.error_message}</span>
            <button
              onClick={async () => {
                try {
                  await updateCampaign(id, { error_message: null });
                  load();
                } catch { toast.error('Erreur'); }
              }}
              className="p-1 hover:bg-red-100 rounded-full transition-colors shrink-0"
              title="Retirer l'erreur"
            >
              <X size={16} className="text-red-400 hover:text-red-600" />
            </button>
          </div>
        )}


        {/* Rates — only show when there's actual data */}
        {((showConnectionRate && campaign.connection_rate != null) || (showReplyRate && campaign.reply_rate != null)) && (
          <div className="flex gap-4 mb-6">
            {showConnectionRate && campaign.connection_rate != null && (
              <div className="flex items-center gap-2 bg-sky-50 border border-sky-200 rounded-lg px-4 py-2.5">
                <UserCheck size={18} className="text-sky-600" />
                <div>
                  <p className="text-xs text-sky-600 font-medium">Taux de connexion</p>
                  <p className="text-xl font-bold text-sky-700">{campaign.connection_rate}%</p>
                </div>
              </div>
            )}
            {showReplyRate && campaign.reply_rate != null && (
              <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2.5">
                <MessageSquare size={18} className="text-emerald-600" />
                <div>
                  <p className="text-xs text-emerald-600 font-medium">Taux de reponse</p>
                  <p className="text-xl font-bold text-emerald-700">{campaign.reply_rate}%</p>
                </div>
              </div>
            )}
          </div>
        )}

        {isSearch ? (
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-lg border border-gray-100 p-4">
              <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center mb-2"><CheckCircle size={20} /></div>
              <div className="text-2xl font-bold text-gray-900">{campaign.total_succeeded}</div>
              <div className="text-xs text-gray-500">Contacts trouves</div>
            </div>
            <div className="bg-white rounded-lg border border-gray-100 p-4">
              <div className="w-10 h-10 rounded-lg bg-gray-50 text-gray-500 flex items-center justify-center mb-2"><Clock size={20} /></div>
              <div className="text-2xl font-bold text-gray-900">{campaign.total_skipped}</div>
              <div className="text-xs text-gray-500">Ignores</div>
            </div>
            <div className="bg-white rounded-lg border border-gray-100 p-4">
              <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center mb-2"><Zap size={20} /></div>
              <div className="text-2xl font-bold text-gray-900">{campaign.total_target || '-'}</div>
              <div className="text-xs text-gray-500">Objectif</div>
            </div>
          </div>
        ) : isConnection ? (
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-white rounded-lg border border-gray-100 p-4">
              <div className="w-10 h-10 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center mb-2"><UserCheck size={20} /></div>
              <div className="text-2xl font-bold text-gray-900">{contacts.filter(c => c.status === 'demande_envoyee').length}</div>
              <div className="text-xs text-gray-500">Demandes envoyees</div>
            </div>
            <div className="bg-white rounded-lg border border-gray-100 p-4">
              <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center mb-2"><CheckCircle size={20} /></div>
              <div className="text-2xl font-bold text-gray-900">{contacts.filter(c => c.status === 'reussi').length}</div>
              <div className="text-xs text-gray-500">Acceptees</div>
            </div>
            <div className="bg-white rounded-lg border border-gray-100 p-4">
              <div className="w-10 h-10 rounded-lg bg-red-50 text-red-500 flex items-center justify-center mb-2"><AlertCircle size={20} /></div>
              <div className="text-2xl font-bold text-gray-900">{contacts.filter(c => c.status === 'perdu').length}</div>
              <div className="text-xs text-gray-500">Echouees</div>
            </div>
            <div className="bg-white rounded-lg border border-gray-100 p-4">
              <div className="w-10 h-10 rounded-lg bg-gray-50 text-gray-500 flex items-center justify-center mb-2"><Clock size={20} /></div>
              <div className="text-2xl font-bold text-gray-900">{contacts.filter(c => c.status === 'pending').length}</div>
              <div className="text-xs text-gray-500">En attente</div>
            </div>
          </div>
        ) : contacts.length > 0 ? (
          <div className={`grid gap-4 ${isConnectionDM ? 'grid-cols-5' : 'grid-cols-4'}`}>
            {isConnectionDM && (
              <div className="bg-white rounded-lg border border-gray-100 p-4">
                <div className="w-10 h-10 rounded-lg bg-yellow-50 text-yellow-600 flex items-center justify-center mb-2">
                  <Clock size={20} />
                </div>
                <div className="text-2xl font-bold text-gray-900">{statsFromContacts.en_attente}</div>
                <div className="text-xs text-gray-500">En attente</div>
              </div>
            )}
            <div className="bg-white rounded-lg border border-gray-100 p-4">
              <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center mb-2">
                <MessageSquare size={20} />
              </div>
              <div className="text-2xl font-bold text-gray-900">{statsFromContacts.envoye}</div>
              <div className="text-xs text-gray-500">Envoyes</div>
            </div>
            <div className="bg-white rounded-lg border border-gray-100 p-4">
              <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center mb-2">
                <Clock size={20} />
              </div>
              <div className="text-2xl font-bold text-gray-900">{statsFromContacts.relance}</div>
              <div className="text-xs text-gray-500">En relance</div>
            </div>
            <div className="bg-white rounded-lg border border-gray-100 p-4">
              <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center mb-2">
                <UserCheck size={20} />
              </div>
              <div className="text-2xl font-bold text-gray-900">{statsFromContacts.reussi}</div>
              <div className="text-xs text-gray-500">Repondu</div>
            </div>
            <div className="bg-white rounded-lg border border-gray-100 p-4">
              <div className="w-10 h-10 rounded-lg bg-gray-50 text-gray-500 flex items-center justify-center mb-2">
                <UserX size={20} />
              </div>
              <div className="text-2xl font-bold text-gray-900">{statsFromContacts.perdu}</div>
              <div className="text-xs text-gray-500">Perdu</div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-4">
            {[
              { icon: Zap, label: 'Traites', value: campaign.total_processed, color: 'text-blue-600 bg-blue-50' },
              { icon: CheckCircle, label: 'Reussis', value: campaign.total_succeeded, color: 'text-emerald-600 bg-emerald-50' },
              { icon: AlertCircle, label: 'Echoues', value: campaign.total_failed, color: 'text-red-600 bg-red-50' },
              { icon: Clock, label: 'Ignores', value: campaign.total_skipped, color: 'text-gray-600 bg-gray-50' },
            ].map(({ icon: Icon, label, value, color }) => (
              <div key={label} className="bg-white rounded-lg border border-gray-100 p-4">
                <div className={`w-10 h-10 rounded-lg ${color} flex items-center justify-center mb-2`}><Icon size={20} /></div>
                <div className="text-2xl font-bold text-gray-900">{value}</div>
                <div className="text-xs text-gray-500">{label}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tabs */}
      {(contacts.length > 0 || isSearch || isConnection) && (
        <div className="flex items-center justify-between mb-4">
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
            <button onClick={() => setTab('contacts')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${tab === 'contacts' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              Contacts ({contacts.length})
            </button>
            <button onClick={() => setTab('actions')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${tab === 'actions' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              Journal
            </button>
          </div>
          {tab === 'contacts' && !isSearch && !isConnection && (
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
              <button onClick={() => setViewMode('table')}
                className={`p-1.5 rounded-md ${viewMode === 'table' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400'}`}>
                <List size={16} />
              </button>
              <button onClick={() => setViewMode('kanban')}
                className={`p-1.5 rounded-md ${viewMode === 'kanban' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400'}`}>
                <Columns3 size={16} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Kanban view */}
      {tab === 'contacts' && viewMode === 'kanban' && contacts.length > 0 && (() => {
        const columns = [
          { key: 'en_attente', label: 'En attente', color: '#eab308', bg: '#fefce8', filter: c => c.status === 'en_attente' || c.status === 'pending' },
          { key: 'envoye', label: 'Envoye', color: '#3b82f6', bg: '#eff6ff', filter: c => c.status === 'envoye' },
          { key: 'relance', label: 'En relance', color: '#f59e0b', bg: '#fffbeb', filter: c => c.status?.startsWith('relance_') },
          { key: 'reussi', label: 'Repondu', color: '#10b981', bg: '#ecfdf5', filter: c => c.status === 'reussi' },
          { key: 'perdu', label: 'Perdu', color: '#6b7280', bg: '#f9fafb', filter: c => c.status === 'perdu' },
        ];
        return (
          <div className="flex gap-3 overflow-x-auto pb-4" style={{ minHeight: 300 }}>
            {columns.map(col => {
              const items = contacts.filter(col.filter);
              return (
                <div key={col.key} className="flex-1 min-w-[200px] max-w-[260px]">
                  <div className="flex items-center gap-2 mb-2 px-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: col.color }} />
                    <span className="text-xs font-semibold text-gray-700">{col.label}</span>
                    <span className="text-xs text-gray-400 ml-auto">{items.length}</span>
                  </div>
                  <div className="space-y-2" style={{ maxHeight: 500, overflowY: 'auto' }}>
                    {items.map(cc => (
                      <div key={cc.id} onClick={() => setSelectedContact(cc)}
                        className="p-3 rounded-xl border border-gray-200 bg-white hover:shadow-sm cursor-pointer transition-shadow">
                        <div className="flex items-center gap-2 mb-1">
                          {cc.contact_profile_picture_url ? (
                            <img src={cc.contact_profile_picture_url} alt="" className="w-7 h-7 rounded-full object-cover" />
                          ) : (
                            <div className="w-7 h-7 rounded-full text-[10px] font-bold flex items-center justify-center" style={{ background: 'rgba(0,132,255,0.08)', color: 'var(--blue)' }}>
                              {initials(cc)}
                            </div>
                          )}
                          <span className="text-xs font-medium text-gray-900 truncate">{cc.contact_first_name} {cc.contact_last_name}</span>
                        </div>
                        {cc.contact_headline && <p className="text-[10px] text-gray-400 truncate">{cc.contact_headline}</p>}
                        <div className="mt-1.5"><ContactStatusBadge status={cc.status} /></div>
                      </div>
                    ))}
                    {items.length === 0 && <p className="text-xs text-gray-300 text-center py-4">Aucun contact</p>}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* Contacts table */}
      {tab === 'contacts' && viewMode === 'table' && contacts.length > 0 && (
        <div className="g-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Contact</th>
                {isSearch ? (
                  <>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Titre</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">LinkedIn</th>
                  </>
                ) : isConnection ? (
                  <>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Statut</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Demande envoyee le</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">LinkedIn</th>
                  </>
                ) : (
                  <>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Statut</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Envoye le</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Dernier envoi</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Repondu le</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {contacts.map((cc) => (
                <tr key={cc.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setSelectedContact(cc)}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {cc.contact_profile_picture_url ? (
                        <img src={cc.contact_profile_picture_url} alt="" className="w-9 h-9 rounded-full object-cover border border-gray-200" />
                      ) : (
                        <div className="w-9 h-9 rounded-full text-xs font-bold flex items-center justify-center" style={{ background: 'rgba(0,132,255,0.08)', color: 'var(--blue)' }}>
                          {initials(cc)}
                        </div>
                      )}
                      <div>
                        <p className="font-medium text-gray-900 text-sm">{cc.contact_first_name} {cc.contact_last_name}</p>
                        {!isSearch && cc.contact_headline && <p className="text-xs text-gray-400 truncate max-w-[200px]">{cc.contact_headline}</p>}
                      </div>
                    </div>
                  </td>
                  {isSearch ? (
                    <>
                      <td className="px-4 py-3 text-xs text-gray-500 max-w-[250px] truncate">{cc.contact_headline || '-'}</td>
                      <td className="px-4 py-3">
                        {cc.contact_linkedin_url ? (
                          <a href={cc.contact_linkedin_url} target="_blank" rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors"
                            style={{ background: 'rgba(0,132,255,0.08)', color: 'var(--blue)' }}
                            onMouseOver={e => e.currentTarget.style.background = 'rgba(0,132,255,0.15)'}
                            onMouseOut={e => e.currentTarget.style.background = 'rgba(0,132,255,0.08)'}>
                            <ExternalLink size={13} /> Profil
                          </a>
                        ) : '-'}
                      </td>
                    </>
                  ) : isConnection ? (
                    <>
                      <td className="px-4 py-3"><ContactStatusBadge status={cc.status} /></td>
                      <td className="px-4 py-3 text-xs text-gray-500">{fmtDate(cc.main_sent_at)}</td>
                      <td className="px-4 py-3">
                        {cc.contact_linkedin_url ? (
                          <a href={cc.contact_linkedin_url} target="_blank" rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors"
                            style={{ background: 'rgba(0,132,255,0.08)', color: 'var(--blue)' }}
                            onMouseOver={e => e.currentTarget.style.background = 'rgba(0,132,255,0.15)'}
                            onMouseOut={e => e.currentTarget.style.background = 'rgba(0,132,255,0.08)'}>
                            <ExternalLink size={13} /> Profil
                          </a>
                        ) : '-'}
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-3"><ContactStatusBadge status={cc.status} /></td>
                      <td className="px-4 py-3 text-xs text-gray-500">{fmtDate(cc.main_sent_at)}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">{fmtDate(cc.last_sent_at)}</td>
                      <td className="px-4 py-3 text-xs">
                        {cc.replied_at ? (
                          <span className="text-emerald-600 font-medium">{fmtDate(cc.replied_at)}</span>
                        ) : '-'}
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Actions tab (or default for non-DM campaigns) */}
      {(tab === 'actions' || (!isSearch && !isConnection && contacts.length === 0)) && (
        <div className="g-card overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200">
            <h3 className="font-semibold text-gray-900">Journal d'actions</h3>
          </div>
          {actions.length === 0 ? (
            <div className="text-center py-12 text-gray-500 text-sm">Aucune action enregistree</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Contact</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Action</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Statut</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Details</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {actions.map((a) => (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      {a.contact_first_name ? (
                        <div className="flex items-center gap-3 cursor-pointer" onClick={() => {
                          const cc = contacts.find(c => c.contact_id === a.contact_id);
                          if (cc) setSelectedContact(cc);
                        }}>
                          {a.contact_profile_picture_url ? (
                            <img src={a.contact_profile_picture_url} alt="" className="w-8 h-8 rounded-full object-cover border border-gray-200" />
                          ) : (
                            <div className="w-8 h-8 rounded-full text-xs font-bold flex items-center justify-center" style={{ background: 'rgba(0,132,255,0.08)', color: 'var(--blue)' }}>
                              {(a.contact_first_name?.[0] || '')}{(a.contact_last_name?.[0] || '')}
                            </div>
                          )}
                          <span className="text-sm text-gray-900 hover:underline">{a.contact_first_name} {a.contact_last_name}</span>
                        </div>
                      ) : <span className="text-xs text-gray-400">-</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{fmtDate(a.created_at)}</td>
                    <td className="px-4 py-3 text-gray-700">{a.action_type}</td>
                    <td className="px-4 py-3"><Badge status={a.status} /></td>
                    <td className="px-4 py-3 text-xs text-gray-500 max-w-xs whitespace-normal break-words">{a.error_message || '-'}</td>
                    <td className="px-4 py-3">
                      {a.status === 'failed' && (
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            try {
                              const res = await retryFromAction(id, a.id);
                              toast.success(`${res.reset} contact(s) remis en file d'attente`);
                              load();
                            } catch { toast.error('Erreur'); }
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap"
                          style={{ background: 'rgba(0,132,255,0.08)', color: 'var(--blue)' }}
                          onMouseOver={e => e.currentTarget.style.background = 'rgba(0,132,255,0.15)'}
                          onMouseOut={e => e.currentTarget.style.background = 'rgba(0,132,255,0.08)'}
                          title="Reprendre la campagne a partir de ce contact"
                        >
                          <RotateCcw size={12} /> Reprendre d'ici
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Contact Profile Card Modal */}
      {selectedContact && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelectedContact(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="relative rounded-t-2xl p-4 pb-14">
              <button onClick={() => setSelectedContact(null)}
                className="absolute top-4 right-4 p-1 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors">
                <X size={18} className="text-gray-500" />
              </button>
            </div>
            <div className="flex justify-center -mt-12">
              {selectedContact.contact_profile_picture_url ? (
                <img src={selectedContact.contact_profile_picture_url} alt=""
                  className="w-24 h-24 rounded-full border-4 border-white object-cover shadow-lg" />
              ) : (
                <div className="w-24 h-24 rounded-full border-4 border-white text-2xl font-bold flex items-center justify-center shadow-lg" style={{ background: 'rgba(0,132,255,0.08)', color: 'var(--blue)' }}>
                  {initials(selectedContact)}
                </div>
              )}
            </div>
            <div className="px-6 pt-3 pb-6">
              <div className="text-center mb-4">
                <h2 className="text-xl font-bold text-gray-900">
                  {selectedContact.contact_first_name} {selectedContact.contact_last_name}
                </h2>
                {selectedContact.contact_headline && (
                  <p className="text-sm text-gray-500 mt-1">{selectedContact.contact_headline}</p>
                )}
                <div className="mt-2 flex items-center justify-center gap-2">
                  <ContactStatusBadge status={selectedContact.status} />
                  {selectedContact.contact_linkedin_url && (
                    <a href={selectedContact.contact_linkedin_url} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full transition-colors"
                      style={{ background: 'rgba(0,132,255,0.08)', color: 'var(--blue)' }}>
                      <ExternalLink size={12} /> LinkedIn
                    </a>
                  )}
                </div>
                {selectedContact.status !== 'pending' && !isSearch && !isConnection && (
                  <div className="mt-3 flex items-center justify-center gap-2">
                    <select
                      value={selectedContact.status}
                      onChange={async (e) => {
                        const newStatus = e.target.value;
                        try {
                          await updateContactStatus(id, selectedContact.contact_id, newStatus);
                          setSelectedContact({ ...selectedContact, status: newStatus, replied_at: newStatus === 'reussi' ? (selectedContact.replied_at || new Date().toISOString()) : selectedContact.replied_at });
                          load();
                          toast.success('Statut mis a jour');
                        } catch { toast.error('Erreur lors du changement de statut'); }
                      }}
                      className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-200"
                    >
                      <option value="envoye">Envoye</option>
                      <option value="relance_1">Relance 1</option>
                      <option value="relance_2">Relance 2</option>
                      <option value="relance_3">Relance 3</option>
                      <option value="reussi">Repondu</option>
                      <option value="perdu">Perdu</option>
                    </select>
                  </div>
                )}
              </div>

              <div className="space-y-3">
                {isConnection ? (
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="bg-gray-50 rounded-lg p-3">
                      <span className="text-gray-400">Demande envoyee le</span>
                      <p className="font-medium text-gray-700 mt-0.5">
                        {fmtDate(selectedContact.main_sent_at)}
                      </p>
                    </div>
                    <div className={`rounded-lg p-3 ${selectedContact.status === 'reussi' ? 'bg-emerald-50' : 'bg-gray-50'}`}>
                      <span className={selectedContact.status === 'reussi' ? 'text-emerald-500' : 'text-gray-400'}>Acceptee</span>
                      <p className={`font-medium mt-0.5 ${selectedContact.status === 'reussi' ? 'text-emerald-700' : 'text-gray-700'}`}>
                        {selectedContact.status === 'reussi' ? 'Oui' : 'Pas encore'}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="bg-gray-50 rounded-lg p-3">
                      <span className="text-gray-400">Message envoye</span>
                      <p className="font-medium text-gray-700 mt-0.5">
                        {fmtDate(selectedContact.main_sent_at)}
                      </p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <span className="text-gray-400">Dernier envoi</span>
                      <p className="font-medium text-gray-700 mt-0.5">
                        {fmtDate(selectedContact.last_sent_at)}
                      </p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <span className="text-gray-400">Relances envoyees</span>
                      <p className="font-medium text-gray-700 mt-0.5">
                        {selectedContact.last_sequence_sent > 0 ? selectedContact.last_sequence_sent : '0'}
                      </p>
                    </div>
                    <div className={`rounded-lg p-3 ${selectedContact.replied_at ? 'bg-emerald-50' : 'bg-gray-50'}`}>
                      <span className={selectedContact.replied_at ? 'text-emerald-500' : 'text-gray-400'}>Repondu le</span>
                      <p className={`font-medium mt-0.5 ${selectedContact.replied_at ? 'text-emerald-700' : 'text-gray-700'}`}>
                        {selectedContact.replied_at ? fmtDate(selectedContact.replied_at) : 'Pas encore'}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </PageWrapper>
  );
}

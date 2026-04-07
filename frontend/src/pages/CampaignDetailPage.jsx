import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Pause, Play, XCircle, CheckCircle, AlertCircle, Clock, Zap, X, MapPin, Briefcase, ExternalLink, MessageSquare, UserX, UserCheck, Copy, Timer, List, Columns3 } from 'lucide-react';
import { getCampaign, startCampaign, pauseCampaign, resumeCampaign, cancelCampaign, duplicateCampaign, diagnoseCampaign, runCampaignNow, getCampaignActions, getCampaignContacts } from '../api/campaigns';
import PageWrapper from '../components/layout/PageWrapper';
import Badge from '../components/ui/Badge';
import toast from 'react-hot-toast';

const STATUS_CONFIG = {
  pending: { label: 'En attente', color: 'bg-gray-100 text-gray-600' },
  en_attente: { label: 'Connexion en attente', color: 'bg-yellow-100 text-yellow-700' },
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

function initials(c) {
  return ((c.contact_first_name?.[0] || '') + (c.contact_last_name?.[0] || '')).toUpperCase() || '?';
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
  const [diagnosis, setDiagnosis] = useState(null);

  const load = useCallback(async () => {
    try {
      const [c, a, cc] = await Promise.all([
        getCampaign(id),
        getCampaignActions(id, { page: 1, per_page: 50 }),
        getCampaignContacts(id).catch(() => []),
      ]);
      setCampaign(c);
      setActions(a.actions || a || []);
      setContacts(cc || []);
    } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (campaign?.status !== 'running') return;
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [campaign?.status, load]);

  const handleStart = async () => { await startCampaign(id); toast.success('Campagne lancee'); load(); };
  const handleDiagnose = async () => {
    try {
      const d = await diagnoseCampaign(id);
      setDiagnosis(d);
    } catch { toast.error('Erreur diagnostic'); }
  };
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

  // Countdown to next action
  const [countdown, setCountdown] = useState(null);
  useEffect(() => {
    if (!campaign?.next_action_at || campaign.status !== 'running') {
      setCountdown(null);
      return;
    }
    const update = () => {
      const now = new Date();
      const target = new Date(campaign.next_action_at);
      const diff = Math.max(0, Math.floor((target - now) / 1000));
      setCountdown(diff);
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [campaign?.next_action_at, campaign?.status]);

  const formatCountdown = (secs) => {
    if (secs === null || secs === undefined) return null;
    if (secs <= 0) return 'Imminent...';
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    if (m > 0) return `${m} min ${s.toString().padStart(2, '0')} sec`;
    return `${s} sec`;
  };

  const progress = campaign?.total_target ? Math.round((campaign.total_processed / campaign.total_target) * 100) : 0;

  const showReplyRate = campaign?.type && ['dm', 'connection_dm'].includes(campaign.type);
  const showConnectionRate = campaign?.type && ['connection', 'connection_dm'].includes(campaign.type);

  // Stats from contacts
  const isConnectionDM = campaign?.type === 'connection_dm';
  const statsFromContacts = {
    en_attente: contacts.filter(c => c.status === 'en_attente').length,
    envoye: contacts.filter(c => c.status === 'envoye').length,
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
            <h1 className="f text-2xl font-bold text-gray-900">{campaign.name}</h1>
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
        {campaign.status === 'running' && campaign.paused_reason && (
          <div className="flex items-center gap-2 mb-4 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-lg w-fit">
            <AlertCircle size={16} className="text-amber-500" />
            <span className="text-sm text-amber-700">{campaign.paused_reason}</span>
          </div>
        )}
        {campaign.status === 'running' && !campaign.paused_reason && countdown !== null && (
          <div className="flex items-center gap-2 mb-4 px-4 py-2.5 bg-indigo-50 border border-indigo-200 rounded-lg w-fit">
            <Timer size={16} className="text-indigo-500" />
            <span className="text-sm text-indigo-700">
              Prochaine action dans <span className="font-bold">{formatCountdown(countdown)}</span>
            </span>
          </div>
        )}

        {/* Error message from backend */}
        {campaign.error_message && (
          <div className="flex items-center gap-2 mb-4 px-4 py-2.5 bg-red-50 border border-red-200 rounded-lg">
            <AlertCircle size={16} className="text-red-500 shrink-0" />
            <span className="text-sm text-red-700 font-mono">{campaign.error_message}</span>
          </div>
        )}

        {/* Diagnose button when stuck at 0% */}
        {campaign.status === 'running' && campaign.total_processed === 0 && (
          <div className="mb-4">
            <div className="flex gap-4">
              <button onClick={handleDiagnose} className="text-sm text-indigo-600 hover:text-indigo-800 underline">
                Diagnostiquer
              </button>
              <button onClick={handleRunNow} className="text-sm text-orange-600 hover:text-orange-800 underline font-medium">
                Forcer une execution maintenant
              </button>
            </div>
            {diagnosis && (
              <div className="mt-2 p-4 bg-gray-50 border border-gray-200 rounded-lg text-sm space-y-1">
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  <span className="text-gray-500">Job scheduler</span>
                  <span className={diagnosis.has_scheduler_job ? 'text-emerald-600' : 'text-red-600'}>{diagnosis.has_scheduler_job ? 'Actif' : 'Absent'}</span>
                  <span className="text-gray-500">Cookies LinkedIn</span>
                  <span className={diagnosis.cookies_valid ? 'text-emerald-600' : 'text-red-600'}>{diagnosis.cookies_valid ? 'Valides' : 'Invalides'}</span>
                  <span className="text-gray-500">Fenetre horaire</span>
                  <span className={diagnosis.within_schedule ? 'text-emerald-600' : 'text-amber-600'}>{diagnosis.within_schedule ? 'OK' : 'Hors fenetre'}</span>
                  <span className="text-gray-500">Limite DMs</span>
                  <span>{diagnosis.dm_limit}</span>
                  <span className="text-gray-500">Limite connexions</span>
                  <span>{diagnosis.conn_limit}</span>
                  <span className="text-gray-500">Contacts CRM</span>
                  <span>{diagnosis.crm_contacts}</span>
                  <span className="text-gray-500">Non traites</span>
                  <span>{diagnosis.unprocessed_contacts}</span>
                  <span className="text-gray-500">Messages configures</span>
                  <span>{diagnosis.messages_configured}</span>
                </div>
                {diagnosis.last_error && (
                  <div className="mt-2 p-2 bg-red-50 rounded text-red-700 font-mono text-xs">{diagnosis.last_error}</div>
                )}
                {diagnosis.issues.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {diagnosis.issues.map((issue, i) => (
                      <div key={i} className="flex items-center gap-2 text-red-600">
                        <XCircle size={14} /> {issue}
                      </div>
                    ))}
                  </div>
                )}
                {diagnosis.ok && (
                  <div className="mt-2 text-emerald-600 flex items-center gap-2">
                    <CheckCircle size={14} /> Tout semble OK — verifiez les logs backend
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Rates */}
        {(showReplyRate || showConnectionRate) && (
          <div className="flex gap-4 mb-6">
            {showConnectionRate && (
              <div className="flex items-center gap-2 bg-sky-50 border border-sky-200 rounded-lg px-4 py-2.5">
                <UserCheck size={18} className="text-sky-600" />
                <div>
                  <p className="text-xs text-sky-600 font-medium">Taux de connexion</p>
                  <p className="text-xl font-bold text-sky-700">{campaign.connection_rate ?? 0}%</p>
                </div>
              </div>
            )}
            {showReplyRate && (
              <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2.5">
                <MessageSquare size={18} className="text-emerald-600" />
                <div>
                  <p className="text-xs text-emerald-600 font-medium">Taux de reponse</p>
                  <p className="text-xl font-bold text-emerald-700">{campaign.reply_rate ?? 0}%</p>
                </div>
              </div>
            )}
          </div>
        )}

        {contacts.length > 0 ? (
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
      {contacts.length > 0 && (
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
          {tab === 'contacts' && (
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
                <th className="text-left px-4 py-3 font-medium text-gray-600">Statut</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Envoye le</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Dernier envoi</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Repondu le</th>
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
                        {cc.contact_headline && <p className="text-xs text-gray-400 truncate max-w-[200px]">{cc.contact_headline}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3"><ContactStatusBadge status={cc.status} /></td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {cc.main_sent_at ? new Date(cc.main_sent_at).toLocaleString('fr-FR') : '-'}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {cc.last_sent_at ? new Date(cc.last_sent_at).toLocaleString('fr-FR') : '-'}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {cc.replied_at ? (
                      <span className="text-emerald-600 font-medium">{new Date(cc.replied_at).toLocaleString('fr-FR')}</span>
                    ) : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Actions tab (or default for non-DM campaigns) */}
      {(tab === 'actions' || contacts.length === 0) && (
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
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {actions.map((a) => (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      {a.contact_first_name ? (
                        <div className="flex items-center gap-3">
                          {a.contact_profile_picture_url ? (
                            <img src={a.contact_profile_picture_url} alt="" className="w-8 h-8 rounded-full object-cover border border-gray-200" />
                          ) : (
                            <div className="w-8 h-8 rounded-full text-xs font-bold flex items-center justify-center" style={{ background: 'rgba(0,132,255,0.08)', color: 'var(--blue)' }}>
                              {(a.contact_first_name?.[0] || '')}{(a.contact_last_name?.[0] || '')}
                            </div>
                          )}
                          <span className="text-sm text-gray-900">{a.contact_first_name} {a.contact_last_name}</span>
                        </div>
                      ) : <span className="text-xs text-gray-400">-</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{new Date(a.created_at).toLocaleString('fr-FR')}</td>
                    <td className="px-4 py-3 text-gray-700">{a.action_type}</td>
                    <td className="px-4 py-3"><Badge status={a.status} /></td>
                    <td className="px-4 py-3 text-xs text-gray-500 max-w-xs truncate">{a.error_message || '-'}</td>
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
                <div className="mt-2"><ContactStatusBadge status={selectedContact.status} /></div>
              </div>

              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="bg-gray-50 rounded-lg p-3">
                    <span className="text-gray-400">Message envoye</span>
                    <p className="font-medium text-gray-700 mt-0.5">
                      {selectedContact.main_sent_at ? new Date(selectedContact.main_sent_at).toLocaleString('fr-FR') : '-'}
                    </p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <span className="text-gray-400">Dernier envoi</span>
                    <p className="font-medium text-gray-700 mt-0.5">
                      {selectedContact.last_sent_at ? new Date(selectedContact.last_sent_at).toLocaleString('fr-FR') : '-'}
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
                      {selectedContact.replied_at ? new Date(selectedContact.replied_at).toLocaleString('fr-FR') : 'Pas encore'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </PageWrapper>
  );
}

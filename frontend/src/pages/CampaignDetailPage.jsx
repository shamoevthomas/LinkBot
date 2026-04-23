import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Pause, Play, XCircle, CheckCircle, AlertCircle, Clock, Zap,
  X, ExternalLink, MessageSquare, UserX, UserCheck, Copy, Timer, List,
  Columns3, Pencil, Check, RotateCcw, Settings, Eye, Send, Loader2,
} from 'lucide-react';
import {
  getCampaign, getCampaignMessages, updateCampaign, startCampaign,
  pauseCampaign, resumeCampaign, cancelCampaign, duplicateCampaign,
  runCampaignNow, getCampaignActions, getCampaignContacts, updateContactStatus,
  retryFromAction,
} from '../api/campaigns';
import PageWrapper from '../components/layout/PageWrapper';
import { StatusChip, TypeTag, Avatar, Progress, Chip, getInitials, hueFromString } from '../components/ui/atoms';
import { parseServerDate, formatServerDateTime } from '../utils/date';
import toast from 'react-hot-toast';

function CountdownTimer({ nextActionAt, status }) {
  const [countdown, setCountdown] = useState(null);
  useEffect(() => {
    if (!nextActionAt || status !== 'running') { setCountdown(null); return; }
    const update = () => {
      const target = parseServerDate(nextActionAt);
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
  return <span className="mono">{m > 0 ? `${m} min ${s.toString().padStart(2, '0')} sec` : `${s} sec`}</span>;
}

function fmtDate(d) {
  return formatServerDateTime(d) || '—';
}

function StatTile({ icon: Ic, label, value, tone }) {
  return (
    <div className="g-card p-4">
      <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-3"
        style={{ background: `hsl(var(--${tone}) / .12)`, color: `hsl(var(--${tone}))` }}>
        <Ic size={15} />
      </div>
      <div className="text-[24px] font-semibold tracking-tight" style={{ letterSpacing: '-0.02em' }}>{value}</div>
      <div className="text-[11.5px] mt-0.5" style={{ color: 'hsl(var(--muted))' }}>{label}</div>
    </div>
  );
}

export default function CampaignDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState(null);
  const [actions, setActions] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('contacts');
  const [viewMode, setViewMode] = useState('table');
  const [filter, setFilter] = useState('all');
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

  const handleStart = async () => { await startCampaign(id); toast.success('Campagne lancée'); load(); };
  const handleRunNow = async () => {
    try {
      toast.loading('Exécution manuelle...', { id: 'run-now' });
      const result = await runCampaignNow(id);
      toast.dismiss('run-now');
      if (result.ok) toast.success(`Tick exécuté — traités: ${result.total_processed}`);
      else toast.error(`Erreur: ${result.error}`);
      load();
    } catch (err) {
      toast.dismiss('run-now');
      toast.error(err.response?.data?.detail || 'Erreur');
    }
  };
  const handlePause = async () => { await pauseCampaign(id); toast.success('Campagne en pause'); load(); };
  const handleResume = async () => { await resumeCampaign(id); toast.success('Campagne relancée'); load(); };
  const handleCancel = async () => {
    if (!confirm('Annuler cette campagne ?')) return;
    await cancelCampaign(id); toast.success('Campagne annulée'); load();
  };
  const handleDuplicate = async () => {
    try {
      const dup = await duplicateCampaign(id);
      toast.success('Campagne dupliquée');
      navigate(`/dashboard/campaigns/${dup.id}`);
    } catch (err) { toast.error(err.response?.data?.detail || 'Erreur'); }
  };
  const handleReconfigure = async () => {
    try {
      if (campaign.status === 'running') await pauseCampaign(id);
      const msgs = await getCampaignMessages(id);
      navigate('/dashboard/campaigns/new-dm', {
        state: { reconfigure: {
          id: campaign.id, name: campaign.name, crm_id: campaign.crm_id,
          ai_prompt: campaign.ai_prompt, context_text: campaign.context_text,
          fallback_message: campaign.fallback_message, message_template: campaign.message_template,
          messages: msgs,
        } },
      });
    } catch (err) { toast.error(err.response?.data?.detail || 'Erreur'); }
  };

  if (loading || !campaign) {
    return (
      <PageWrapper>
        <div className="flex justify-center py-20">
          <Loader2 size={28} className="spin" style={{ color: 'hsl(var(--accent))' }} />
        </div>
      </PageWrapper>
    );
  }

  const pct = campaign.status === 'completed' ? 100 : (campaign.total_target ? Math.round((campaign.total_processed / campaign.total_target) * 100) : 0);

  const isSearch = campaign.type === 'search';
  const isConnection = campaign.type === 'connection';
  const isConnectionDM = campaign.type === 'connection_dm' || campaign.type === 'search_connection_dm';
  const showReplyRate = ['dm', 'connection_dm', 'search_connection_dm'].includes(campaign.type);
  const showConnectionRate = ['connection', 'connection_dm', 'search_connection_dm'].includes(campaign.type);

  const counts = {
    en_attente: contacts.filter((c) => c.status === 'en_attente' || c.status === 'pending').length,
    envoye: contacts.filter((c) => c.status === 'envoye' || c.status === 'demande_envoyee').length,
    relance: contacts.filter((c) => c.status?.startsWith('relance_')).length,
    reussi: contacts.filter((c) => c.status === 'reussi').length,
    perdu: contacts.filter((c) => c.status === 'perdu').length,
  };

  const filteredContacts = filter === 'all' ? contacts :
    filter === 'relance' ? contacts.filter((c) => c.status?.startsWith('relance_')) :
    filter === 'envoye' ? contacts.filter((c) => c.status === 'envoye' || c.status === 'demande_envoyee') :
    filter === 'en_attente' ? contacts.filter((c) => c.status === 'en_attente' || c.status === 'pending') :
    contacts.filter((c) => c.status === filter);

  // Dynamic stats
  let STATS = [];
  if (isSearch) {
    STATS = [
      { label: 'Contacts trouvés', value: campaign.total_succeeded ?? 0, icon: CheckCircle, tone: 'accent' },
      { label: 'Ignorés', value: campaign.total_skipped ?? 0, icon: Clock, tone: 'slate' },
      { label: 'Objectif', value: campaign.total_target ?? '—', icon: Zap, tone: 'emerald' },
    ];
  } else if (isConnection) {
    STATS = [
      { label: 'Demandes envoyées', value: contacts.filter((c) => c.status === 'demande_envoyee').length, icon: UserCheck, tone: 'accent' },
      { label: 'Acceptées', value: contacts.filter((c) => c.status === 'reussi').length, icon: CheckCircle, tone: 'emerald' },
      { label: 'Échouées', value: contacts.filter((c) => c.status === 'perdu').length, icon: AlertCircle, tone: 'rose' },
      { label: 'En attente', value: contacts.filter((c) => c.status === 'pending').length, icon: Clock, tone: 'amber' },
    ];
  } else if (contacts.length > 0) {
    STATS = [
      ...(isConnectionDM ? [{ label: 'En attente', value: counts.en_attente, icon: Clock, tone: 'amber' }] : []),
      { label: 'Envoyés', value: counts.envoye, icon: Send, tone: 'accent' },
      { label: 'En relance', value: counts.relance, icon: Clock, tone: 'amber' },
      { label: 'Répondu', value: counts.reussi, icon: UserCheck, tone: 'emerald' },
      { label: 'Perdu', value: counts.perdu, icon: UserX, tone: 'slate' },
    ];
  } else {
    STATS = [
      { label: 'Traités', value: campaign.total_processed ?? 0, icon: Zap, tone: 'accent' },
      { label: 'Réussis', value: campaign.total_succeeded ?? 0, icon: CheckCircle, tone: 'emerald' },
      { label: 'Échoués', value: campaign.total_failed ?? 0, icon: AlertCircle, tone: 'rose' },
      { label: 'Ignorés', value: campaign.total_skipped ?? 0, icon: Clock, tone: 'slate' },
    ];
  }

  const contactFilters = [
    { k: 'all', l: 'Tous', n: contacts.length },
    { k: 'envoye', l: 'Envoyés', n: counts.envoye },
    { k: 'relance', l: 'Relance', n: counts.relance },
    { k: 'reussi', l: 'Répondu', n: counts.reussi },
    { k: 'perdu', l: 'Perdu', n: counts.perdu },
  ].filter((f) => f.k === 'all' || f.n > 0);

  return (
    <PageWrapper>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <button onClick={() => navigate('/dashboard/campaigns')}
          className="p-2 rounded-lg transition-colors"
          style={{ color: 'hsl(var(--muted))', background: 'transparent', border: 'none', cursor: 'pointer' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'hsl(220 20% 95%)'; e.currentTarget.style.color = 'hsl(var(--text))'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'hsl(var(--muted))'; }}>
          <ArrowLeft size={16} />
        </button>

        {editingName ? (
          <form onSubmit={async (e) => {
            e.preventDefault();
            if (nameValue.trim() && nameValue !== campaign.name) {
              await updateCampaign(id, { name: nameValue.trim() });
              load();
            }
            setEditingName(false);
          }} className="flex items-center gap-2">
            <input autoFocus value={nameValue} onChange={(e) => setNameValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setEditingName(false)}
              className="text-[22px] font-semibold tracking-tight outline-none bg-transparent"
              style={{ letterSpacing: '-0.02em', borderBottom: '2px solid hsl(var(--accent))' }} />
            <button type="submit" className="p-1 rounded" style={{ color: 'hsl(var(--emerald))', background: 'transparent', border: 'none', cursor: 'pointer' }}>
              <Check size={18} />
            </button>
            <button type="button" onClick={() => setEditingName(false)}
              className="p-1 rounded" style={{ color: 'hsl(var(--rose))', background: 'transparent', border: 'none', cursor: 'pointer' }}>
              <X size={18} />
            </button>
          </form>
        ) : (
          <h1 className="text-[22px] font-semibold tracking-tight cursor-pointer group flex items-center gap-2"
            style={{ letterSpacing: '-0.02em' }}
            onClick={() => { setNameValue(campaign.name); setEditingName(true); }}>
            {campaign.name}
            <Pencil size={14} className="opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: 'hsl(var(--muted))' }} />
          </h1>
        )}

        <TypeTag type={campaign.type} />
        <StatusChip status={campaign.status} />

        <div className="ml-auto flex items-center gap-2 flex-wrap">
          {campaign.status === 'pending' && (
            <button onClick={handleStart} className="cta-btn"><Play size={14} /> Lancer</button>
          )}
          {campaign.status === 'running' && (
            <button onClick={handlePause} className="ghost-btn"
              style={{ color: 'hsl(28 80% 38%)', background: 'hsl(38 100% 96%)', borderColor: 'hsl(38 85% 85%)' }}>
              <Pause size={14} /> Pause
            </button>
          )}
          {campaign.status === 'paused' && (
            <button onClick={handleResume} className="ghost-btn"
              style={{ color: 'hsl(158 60% 30%)', background: 'hsl(158 70% 95%)', borderColor: 'hsl(158 60% 80%)' }}>
              <Play size={14} /> Reprendre
            </button>
          )}
          {['running', 'paused'].includes(campaign.status) &&
            ['dm', 'connection_dm', 'search_connection_dm'].includes(campaign.type) && (
              <button onClick={handleReconfigure} className="ghost-btn"
                style={{ color: 'hsl(262 60% 50%)', background: 'hsl(262 90% 97%)', borderColor: 'hsl(262 70% 88%)' }}>
                <Settings size={14} /> Reconfigurer
              </button>
          )}
          {['running', 'paused'].includes(campaign.status) && (
            <button onClick={handleCancel} className="ghost-btn"
              style={{ color: 'hsl(352 72% 48%)', background: 'hsl(352 90% 97%)', borderColor: 'hsl(352 85% 88%)' }}>
              <XCircle size={14} /> Annuler
            </button>
          )}
          <button onClick={handleDuplicate} className="ghost-btn">
            <Copy size={14} /> Dupliquer
          </button>
        </div>
      </div>

      {/* Progress card */}
      <div className="g-card p-5 mb-5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[12.5px] font-medium" style={{ color: 'hsl(var(--muted))' }}>Progression</span>
          <div className="flex items-baseline gap-2">
            <span className="text-[26px] font-semibold tracking-tight" style={{ letterSpacing: '-0.02em' }}>{pct}%</span>
            <span className="mono text-[11.5px]" style={{ color: 'hsl(var(--muted))' }}>
              {campaign.total_processed ?? 0} / {campaign.total_target || '—'}
            </span>
          </div>
        </div>
        <Progress value={pct} tone={campaign.status === 'completed' ? 'emerald' : ''} />

        {campaign.paused_reason && (
          <div className="flex items-center gap-2 mt-4 px-3 py-2 rounded-lg w-fit"
            style={{ background: 'hsl(38 100% 94%)', border: '1px solid hsl(38 85% 78%)', color: 'hsl(28 80% 38%)' }}>
            <AlertCircle size={14} />
            <span className="text-[12.5px]">{campaign.paused_reason}</span>
          </div>
        )}
        {campaign.error_message && (
          <div className="flex items-center gap-2 mt-4 px-3 py-2 rounded-lg"
            style={{ background: 'hsl(352 90% 97%)', border: '1px solid hsl(352 85% 88%)', color: 'hsl(352 72% 48%)' }}>
            <AlertCircle size={14} />
            <span className="text-[12.5px] mono flex-1">{campaign.error_message}</span>
            <button onClick={async () => { try { await updateCampaign(id, { error_message: null }); load(); } catch { toast.error('Erreur'); } }}
              style={{ color: 'inherit', background: 'transparent', border: 'none', cursor: 'pointer', padding: 2 }}>
              <X size={14} />
            </button>
          </div>
        )}

        <div className="flex items-center gap-2 mt-4 flex-wrap">
          {campaign.status === 'running' && !isSearch && !campaign.paused_reason && campaign.next_action_at && (
            <>
              <div className="chip blue" style={{ padding: '7px 12px' }}>
                <Timer size={12} />
                Prochaine action dans <CountdownTimer nextActionAt={campaign.next_action_at} status={campaign.status} />
              </div>
              <button onClick={handleRunNow} className="cta-btn" style={{ padding: '7px 12px', fontSize: 12 }}>
                <Zap size={12} /> Faire l'action maintenant
              </button>
            </>
          )}
          <div className="flex items-center gap-2 ml-auto flex-wrap">
            {showConnectionRate && campaign.connection_rate != null && (
              <div className="chip blue" style={{ padding: '6px 12px' }}>
                <UserCheck size={12} />
                <span style={{ fontWeight: 500 }}>Taux connexion</span>
                <span className="mono" style={{ fontWeight: 700 }}>{campaign.connection_rate}%</span>
              </div>
            )}
            {showReplyRate && campaign.reply_rate != null && (
              <div className="chip emerald" style={{ padding: '6px 12px' }}>
                <MessageSquare size={12} />
                <span style={{ fontWeight: 500 }}>Taux réponse</span>
                <span className="mono" style={{ fontWeight: 700 }}>{campaign.reply_rate}%</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 mb-5" style={{ gridTemplateColumns: `repeat(${STATS.length}, minmax(0, 1fr))` }}>
        {STATS.map((s) => <StatTile key={s.label} {...s} />)}
      </div>

      {/* Tabs */}
      {(contacts.length > 0 || isSearch || isConnection) && (
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div className="flex items-center gap-1 p-0.5 rounded-lg" style={{ background: 'hsl(220 20% 95%)' }}>
            <button onClick={() => setTab('contacts')}
              style={{
                padding: '6px 12px', borderRadius: 8, fontSize: 12.5, fontWeight: 500,
                background: tab === 'contacts' ? 'white' : 'transparent',
                color: tab === 'contacts' ? 'hsl(var(--text))' : 'hsl(var(--muted))',
                boxShadow: tab === 'contacts' ? '0 1px 2px hsl(220 40% 20% / .08)' : 'none',
                border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
              }}>
              Contacts <span className="mono" style={{ fontSize: 10.5, opacity: 0.7 }}>{contacts.length}</span>
            </button>
            <button onClick={() => setTab('actions')}
              style={{
                padding: '6px 12px', borderRadius: 8, fontSize: 12.5, fontWeight: 500,
                background: tab === 'actions' ? 'white' : 'transparent',
                color: tab === 'actions' ? 'hsl(var(--text))' : 'hsl(var(--muted))',
                boxShadow: tab === 'actions' ? '0 1px 2px hsl(220 40% 20% / .08)' : 'none',
                border: 'none', cursor: 'pointer',
              }}>
              Journal
            </button>
          </div>

          {tab === 'contacts' && !isSearch && !isConnection && contacts.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1 p-0.5 rounded-lg" style={{ background: 'hsl(220 20% 95%)' }}>
                {contactFilters.map((f) => (
                  <button key={f.k} onClick={() => setFilter(f.k)}
                    style={{
                      padding: '5px 10px', borderRadius: 6, fontSize: 11.5, fontWeight: 500,
                      background: filter === f.k ? 'white' : 'transparent',
                      color: filter === f.k ? 'hsl(var(--text))' : 'hsl(var(--muted))',
                      boxShadow: filter === f.k ? '0 1px 2px hsl(220 40% 20% / .08)' : 'none',
                      border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
                    }}>
                    {f.l} <span className="mono" style={{ fontSize: 10, opacity: 0.7 }}>{f.n}</span>
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-0.5 p-0.5 rounded-lg" style={{ background: 'hsl(220 20% 95%)' }}>
                <button onClick={() => setViewMode('table')}
                  style={{
                    padding: 6, borderRadius: 6,
                    background: viewMode === 'table' ? 'white' : 'transparent',
                    color: viewMode === 'table' ? 'hsl(var(--text))' : 'hsl(var(--muted))',
                    boxShadow: viewMode === 'table' ? '0 1px 2px hsl(220 40% 20% / .08)' : 'none',
                    border: 'none', cursor: 'pointer',
                  }}>
                  <List size={13} />
                </button>
                <button onClick={() => setViewMode('kanban')}
                  style={{
                    padding: 6, borderRadius: 6,
                    background: viewMode === 'kanban' ? 'white' : 'transparent',
                    color: viewMode === 'kanban' ? 'hsl(var(--text))' : 'hsl(var(--muted))',
                    boxShadow: viewMode === 'kanban' ? '0 1px 2px hsl(220 40% 20% / .08)' : 'none',
                    border: 'none', cursor: 'pointer',
                  }}>
                  <Columns3 size={13} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Kanban */}
      {tab === 'contacts' && viewMode === 'kanban' && contacts.length > 0 && (() => {
        const columns = [
          { key: 'en_attente', label: 'En attente', tone: 'amber', filter: (c) => c.status === 'en_attente' || c.status === 'pending' },
          { key: 'envoye', label: 'Envoyé', tone: 'accent', filter: (c) => c.status === 'envoye' || c.status === 'demande_envoyee' },
          { key: 'relance', label: 'En relance', tone: 'amber', filter: (c) => c.status?.startsWith('relance_') },
          { key: 'reussi', label: 'Répondu', tone: 'emerald', filter: (c) => c.status === 'reussi' },
          { key: 'perdu', label: 'Perdu', tone: 'slate', filter: (c) => c.status === 'perdu' },
        ];
        return (
          <div className="grid grid-cols-5 gap-3">
            {columns.map((col) => {
              const items = contacts.filter(col.filter);
              return (
                <div key={col.key} className="g-card p-3">
                  <div className="flex items-center gap-2 mb-3">
                    <span style={{ width: 6, height: 6, borderRadius: 999, background: `hsl(var(--${col.tone}))` }} />
                    <span className="text-[12px] font-semibold">{col.label}</span>
                    <span className="mono text-[10.5px] ml-auto" style={{ color: 'hsl(var(--muted))' }}>{items.length}</span>
                  </div>
                  <div className="space-y-2" style={{ maxHeight: 500, overflowY: 'auto' }}>
                    {items.map((cc) => {
                      const name = `${cc.contact_first_name || ''} ${cc.contact_last_name || ''}`.trim();
                      return (
                        <div key={cc.id} onClick={() => setSelectedContact(cc)}
                          className="p-2.5 rounded-lg cursor-pointer transition-all"
                          style={{ border: '1px solid hsl(var(--border))', background: 'hsl(var(--panel))' }}
                          onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'hsl(var(--border-strong))'; e.currentTarget.style.boxShadow = '0 2px 8px -2px hsl(220 40% 20% / .08)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'hsl(var(--border))'; e.currentTarget.style.boxShadow = 'none'; }}>
                          <div className="flex items-center gap-2 mb-1.5">
                            <Avatar src={cc.contact_profile_picture_url}
                              initials={getInitials(cc.contact_first_name, cc.contact_last_name)}
                              hue={hueFromString(name)} size={22} />
                            <span className="text-[12px] font-medium truncate">{name || 'Sans nom'}</span>
                          </div>
                          {cc.contact_headline && <div className="text-[10.5px] truncate" style={{ color: 'hsl(var(--muted))' }}>{cc.contact_headline}</div>}
                        </div>
                      );
                    })}
                    {items.length === 0 && <div className="text-center py-4 text-[11px]" style={{ color: 'hsl(var(--muted))' }}>—</div>}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* Contacts table */}
      {tab === 'contacts' && viewMode === 'table' && filteredContacts.length > 0 && (
        <div className="g-card overflow-hidden">
          <div className="grid gap-3 px-4 py-2.5 text-[11px] uppercase tracking-wider"
            style={{
              gridTemplateColumns: isSearch ? 'minmax(240px,2fr) minmax(200px,1.5fr) 140px'
                : isConnection ? 'minmax(240px,2fr) 140px 160px 140px'
                : 'minmax(240px,2fr) 140px 150px 150px 150px',
              color: 'hsl(var(--muted))', background: 'hsl(220 22% 98%)', fontWeight: 600,
            }}>
            <div>Contact</div>
            {isSearch ? (
              <><div>Titre</div><div>LinkedIn</div></>
            ) : isConnection ? (
              <><div>Statut</div><div>Demande envoyée le</div><div>LinkedIn</div></>
            ) : (
              <><div>Statut</div><div>Envoyé le</div><div>Dernier envoi</div><div>Répondu le</div></>
            )}
          </div>
          {filteredContacts.map((cc) => {
            const name = `${cc.contact_first_name || ''} ${cc.contact_last_name || ''}`.trim();
            return (
              <div key={cc.id} onClick={() => setSelectedContact(cc)}
                className="grid gap-3 px-4 py-3 items-center cursor-pointer row-hover border-t"
                style={{
                  gridTemplateColumns: isSearch ? 'minmax(240px,2fr) minmax(200px,1.5fr) 140px'
                    : isConnection ? 'minmax(240px,2fr) 140px 160px 140px'
                    : 'minmax(240px,2fr) 140px 150px 150px 150px',
                  borderColor: 'hsl(var(--border))',
                }}>
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar src={cc.contact_profile_picture_url}
                    initials={getInitials(cc.contact_first_name, cc.contact_last_name)}
                    hue={hueFromString(name)} size={30} />
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium truncate">{name || 'Sans nom'}</div>
                    {!isSearch && cc.contact_headline && (
                      <div className="text-[11px] truncate" style={{ color: 'hsl(var(--muted))' }}>{cc.contact_headline}</div>
                    )}
                  </div>
                </div>
                {isSearch ? (
                  <>
                    <div className="text-[12px] truncate" style={{ color: 'hsl(var(--muted))' }}>{cc.contact_headline || '—'}</div>
                    <div>
                      {cc.contact_linkedin_url ? (
                        <a href={cc.contact_linkedin_url} target="_blank" rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()} className="chip blue" style={{ padding: '3px 9px', textDecoration: 'none' }}>
                          <ExternalLink size={11} /> Profil
                        </a>
                      ) : '—'}
                    </div>
                  </>
                ) : isConnection ? (
                  <>
                    <div><StatusChip status={cc.status} /></div>
                    <div className="mono text-[11.5px]" style={{ color: 'hsl(var(--muted))' }}>{fmtDate(cc.main_sent_at)}</div>
                    <div>
                      {cc.contact_linkedin_url ? (
                        <a href={cc.contact_linkedin_url} target="_blank" rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()} className="chip blue" style={{ padding: '3px 9px', textDecoration: 'none' }}>
                          <ExternalLink size={11} /> Profil
                        </a>
                      ) : '—'}
                    </div>
                  </>
                ) : (
                  <>
                    <div><StatusChip status={cc.status} /></div>
                    <div className="mono text-[11.5px]" style={{ color: 'hsl(var(--muted))' }}>{fmtDate(cc.main_sent_at)}</div>
                    <div className="mono text-[11.5px]" style={{ color: 'hsl(var(--muted))' }}>{fmtDate(cc.last_sent_at)}</div>
                    <div className="mono text-[11.5px]"
                      style={{ color: cc.replied_at ? 'hsl(var(--emerald))' : 'hsl(var(--muted))', fontWeight: cc.replied_at ? 600 : 400 }}>
                      {fmtDate(cc.replied_at)}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {tab === 'contacts' && viewMode === 'table' && filteredContacts.length === 0 && contacts.length > 0 && (
        <div className="g-card p-10 text-center text-[13px]" style={{ color: 'hsl(var(--muted))' }}>
          Aucun contact pour ce filtre
        </div>
      )}

      {/* Journal tab */}
      {(tab === 'actions' || (!isSearch && !isConnection && contacts.length === 0)) && (
        <div className="g-card overflow-hidden">
          {actions.length === 0 ? (
            <div className="text-center py-12 text-[13px]" style={{ color: 'hsl(var(--muted))' }}>
              Aucune action enregistrée
            </div>
          ) : (
            <>
              <div className="grid gap-3 px-4 py-2.5 text-[11px] uppercase tracking-wider"
                style={{
                  gridTemplateColumns: 'minmax(220px,1.6fr) 150px 180px 110px minmax(180px,2fr) 120px',
                  color: 'hsl(var(--muted))', background: 'hsl(220 22% 98%)', fontWeight: 600,
                }}>
                <div>Contact</div><div>Date</div><div>Action</div><div>Statut</div><div>Détails</div><div></div>
              </div>
              {actions.map((a) => {
                const name = `${a.contact_first_name || ''} ${a.contact_last_name || ''}`.trim();
                return (
                  <div key={a.id} className="grid gap-3 px-4 py-3 items-center border-t row-hover"
                    style={{
                      gridTemplateColumns: 'minmax(220px,1.6fr) 150px 180px 110px minmax(180px,2fr) 120px',
                      borderColor: 'hsl(var(--border))',
                    }}>
                    <div className="flex items-center gap-2.5 min-w-0">
                      {a.contact_first_name ? (
                        <div className="flex items-center gap-2.5 cursor-pointer" onClick={() => {
                          const cc = contacts.find((c) => c.contact_id === a.contact_id);
                          if (cc) setSelectedContact(cc);
                        }}>
                          <Avatar src={a.contact_profile_picture_url}
                            initials={getInitials(a.contact_first_name, a.contact_last_name)}
                            hue={hueFromString(name)} size={26} />
                          <span className="text-[13px] truncate">{name}</span>
                        </div>
                      ) : (
                        <span className="text-[12px]" style={{ color: 'hsl(var(--muted))' }}>—</span>
                      )}
                    </div>
                    <div className="mono text-[11.5px]" style={{ color: 'hsl(var(--muted))' }}>{fmtDate(a.created_at)}</div>
                    <div className="text-[12.5px]">{a.action_type}</div>
                    <div><StatusChip status={a.status} /></div>
                    <div className="text-[11.5px]" style={{ color: 'hsl(var(--muted))' }}>{a.error_message || '—'}</div>
                    <div className="text-right">
                      {a.status === 'failed' && (
                        <button onClick={async (e) => {
                            e.stopPropagation();
                            try {
                              const res = await retryFromAction(id, a.id);
                              toast.success(`${res.reset} contact(s) remis en file`);
                              load();
                            } catch { toast.error('Erreur'); }
                          }}
                          className="chip blue" style={{ padding: '4px 10px', cursor: 'pointer', border: 'none' }}
                          title="Reprendre la campagne à partir de ce contact">
                          <RotateCcw size={11} /> Reprendre
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}

      {/* Contact modal */}
      {selectedContact && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'hsl(222 22% 12% / .45)', backdropFilter: 'blur(4px)' }}
          onClick={() => setSelectedContact(null)}>
          <div className="g-card w-full max-w-[440px] overflow-hidden" onClick={(e) => e.stopPropagation()}
            style={{ boxShadow: '0 24px 60px -24px hsl(220 40% 10% / .35)' }}>

            <div className="relative px-6 pt-6 pb-4">
              <button onClick={() => setSelectedContact(null)}
                className="absolute top-4 right-4 w-7 h-7 rounded-lg flex items-center justify-center"
                style={{ color: 'hsl(var(--muted))', background: 'transparent', border: 'none', cursor: 'pointer' }}>
                <X size={14} />
              </button>

              <div className="flex items-center gap-3">
                <Avatar src={selectedContact.contact_profile_picture_url}
                  initials={getInitials(selectedContact.contact_first_name, selectedContact.contact_last_name)}
                  hue={hueFromString(`${selectedContact.contact_first_name || ''}${selectedContact.contact_last_name || ''}`)}
                  size={48} />
                <div className="flex-1 min-w-0 pr-6">
                  <h3 className="text-[16px] font-semibold truncate" style={{ letterSpacing: '-0.01em' }}>
                    {selectedContact.contact_first_name} {selectedContact.contact_last_name}
                  </h3>
                  {selectedContact.contact_headline && (
                    <p className="text-[12px] truncate" style={{ color: 'hsl(var(--muted))' }}>{selectedContact.contact_headline}</p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1.5 mt-3 flex-wrap">
                <StatusChip status={selectedContact.status} />
                {selectedContact.contact_linkedin_url && (
                  <a href={selectedContact.contact_linkedin_url} target="_blank" rel="noopener noreferrer"
                    className="chip blue" style={{ padding: '3px 9px', textDecoration: 'none' }}>
                    <Eye size={11} /> Profil LinkedIn
                  </a>
                )}
              </div>
            </div>

            <div className="px-6 pb-5">
              <div className="pt-4 border-t" style={{ borderColor: 'hsl(var(--border))' }}>
                <div className="eyebrow mb-3">Historique</div>
                <div className="space-y-3 relative">
                  <div style={{ position: 'absolute', left: 7, top: 8, bottom: 16, width: 1, background: 'hsl(var(--border))' }} />
                  {[
                    { l: 'Message initial envoyé', v: fmtDate(selectedContact.main_sent_at), done: !!selectedContact.main_sent_at, tone: 'accent' },
                    { l: 'Dernier envoi', v: fmtDate(selectedContact.last_sent_at), done: !!selectedContact.last_sent_at, tone: 'accent' },
                    {
                      l: `${selectedContact.last_sequence_sent || 0} relance${(selectedContact.last_sequence_sent || 0) > 1 ? 's' : ''} envoyée${(selectedContact.last_sequence_sent || 0) > 1 ? 's' : ''}`,
                      v: (selectedContact.last_sequence_sent || 0) > 0 ? 'Séquence active' : 'Aucune',
                      done: (selectedContact.last_sequence_sent || 0) > 0, tone: 'amber',
                    },
                    { l: 'Réponse reçue', v: selectedContact.replied_at ? fmtDate(selectedContact.replied_at) : 'Pas encore', done: !!selectedContact.replied_at, tone: 'emerald' },
                  ].map((item, i) => (
                    <div key={i} className="flex items-start gap-3 relative">
                      <div className="rounded-full flex items-center justify-center shrink-0 mt-0.5"
                        style={{
                          width: 15, height: 15, zIndex: 2,
                          background: item.done ? `hsl(var(--${item.tone}))` : 'white',
                          border: item.done ? 'none' : '1.5px solid hsl(var(--border-strong))',
                          boxShadow: item.done ? `0 0 0 3px hsl(var(--${item.tone}) / .15)` : 'none',
                        }}>
                        {item.done && <Check size={8} style={{ color: 'white' }} />}
                      </div>
                      <div className="flex-1 min-w-0 pb-1">
                        <div className="text-[12px]" style={{ color: item.done ? 'hsl(var(--text))' : 'hsl(var(--muted))', fontWeight: item.done ? 500 : 400 }}>
                          {item.l}
                        </div>
                        <div className="mono text-[11px] mt-0.5"
                          style={{
                            color: item.done ? `hsl(var(--${item.tone}))` : 'hsl(var(--muted))',
                            fontWeight: item.done ? 500 : 400,
                          }}>
                          {item.v}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {!isSearch && !isConnection && selectedContact.status !== 'pending' && (
              <div className="px-6 py-3 border-t flex items-center justify-between gap-2"
                style={{ borderColor: 'hsl(var(--border))', background: 'hsl(220 22% 98%)' }}>
                <select
                  value={selectedContact.status}
                  onChange={async (e) => {
                    const newStatus = e.target.value;
                    try {
                      await updateContactStatus(id, selectedContact.contact_id, newStatus);
                      setSelectedContact({ ...selectedContact, status: newStatus, replied_at: newStatus === 'reussi' ? (selectedContact.replied_at || new Date().toISOString()) : selectedContact.replied_at });
                      load();
                      toast.success('Statut mis à jour');
                    } catch { toast.error('Erreur lors du changement de statut'); }
                  }}
                  className="ring-a cursor-pointer"
                  style={{
                    padding: '5px 10px', borderRadius: 8, fontSize: 11.5,
                    border: '1px solid hsl(var(--border))', background: 'white',
                  }}>
                  <option value="envoye">Envoyé</option>
                  <option value="relance_1">Relance 1</option>
                  <option value="relance_2">Relance 2</option>
                  <option value="relance_3">Relance 3</option>
                  <option value="reussi">Répondu</option>
                  <option value="perdu">Perdu</option>
                </select>
              </div>
            )}
          </div>
        </div>
      )}
    </PageWrapper>
  );
}

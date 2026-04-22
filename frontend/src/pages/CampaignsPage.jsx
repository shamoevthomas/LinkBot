import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import {
  Plus, Search, MessageSquare, UserPlus, ChevronDown, Sparkles, MessageCircle,
  Trash2, Download, Send, Clock, ArrowRight, Loader2, Grid3x3, List, X,
} from 'lucide-react';
import { getCampaigns, createCampaign, deleteCampaign } from '../api/campaigns';
import { getCRMs } from '../api/crm';
import client from '../api/client';
import PageWrapper from '../components/layout/PageWrapper';
import Modal from '../components/ui/Modal';
import { StatusChip, TypeTag, Progress } from '../components/ui/atoms';
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

const CAMPAIGN_TYPES = [
  { key: 'all', label: 'Tous' },
  { key: 'search', label: 'Recherche' },
  { key: 'dm', label: 'Message' },
  { key: 'connection', label: 'Connexion' },
  { key: 'connection_dm', label: 'Connexion + DM' },
  { key: 'search_connection_dm', label: 'Recherche + DM' },
  { key: 'export', label: 'Export' },
];

const TYPE_ICON = {
  connection: '⇄',
  dm: '✉',
  connection_dm: '◈',
  search_connection_dm: '◌',
  search: '◌',
  export: '↧',
};

const TYPE_HUE = {
  connection: 'accent',
  dm: 'emerald',
  connection_dm: 'violet',
  search_connection_dm: 'amber',
  search: 'accent',
  export: 'slate',
};

function CampaignCard({ c, onOpen, onDelete }) {
  const pct = c.status === 'completed' ? 100 : (c.total_target ? Math.round((c.total_processed / c.total_target) * 100) : 0);
  const dim = ['completed', 'paused', 'cancelled'].includes(c.status);
  const tone = c.status === 'completed' ? 'emerald' : c.status === 'paused' ? 'amber' : '';
  const icon = TYPE_ICON[c.type] || '·';
  const hue = TYPE_HUE[c.type] || 'slate';
  const accepted = c.total_sent || 0;
  const replied = c.total_succeeded || 0;

  return (
    <div onClick={onOpen} className="g-card p-5 cursor-pointer transition-all group relative overflow-hidden"
      style={{ opacity: dim ? 0.82 : 1 }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'hsl(var(--border-strong))'; e.currentTarget.style.boxShadow = '0 8px 24px -12px hsl(220 40% 20% / .12), 0 2px 4px -2px hsl(220 40% 20% / .04)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'hsl(var(--border))'; e.currentTarget.style.boxShadow = ''; }}>

      {c.status === 'running' && (
        <span style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 3,
          background: 'linear-gradient(90deg, hsl(var(--emerald) / .25), hsl(var(--emerald)), hsl(var(--emerald) / .25))',
        }} />
      )}

      <div className="flex items-start gap-3 mb-4">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 text-[14px]"
          style={{
            background: `hsl(var(--${hue}) / .12)`,
            color: `hsl(var(--${hue}))`,
            fontWeight: 600,
          }}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <h3 className="text-[14px] font-semibold truncate">{c.name}</h3>
          </div>
          <div className="flex items-center gap-2 text-[11.5px]" style={{ color: 'hsl(var(--muted))' }}>
            <TypeTag type={c.type} />
            {c.crm_name && <><span>·</span><span className="truncate">{c.crm_name}</span></>}
          </div>
        </div>
        <StatusChip status={c.status} />
      </div>

      <div className="flex items-center gap-3 mb-3">
        <div className="flex-1"><Progress value={pct} tone={tone} /></div>
        <span className="mono text-[11.5px] shrink-0" style={{ fontWeight: 500 }}>
          <span>{c.total_processed ?? 0}</span>
          <span style={{ color: 'hsl(var(--muted))' }}>/{c.total_target || '—'}</span>
          <span className="ml-2" style={{ color: 'hsl(var(--muted))' }}>{pct}%</span>
        </span>
      </div>

      <div className="grid grid-cols-4 gap-2 mb-3">
        {[
          { l: 'Envoyés', v: c.total_processed ?? 0, tone: 'muted' },
          { l: 'Acceptés', v: accepted, tone: accepted > 0 ? 'violet' : 'muted' },
          { l: 'Répondu', v: replied, tone: replied > 0 ? 'emerald' : 'muted' },
          { l: 'Taux rép.', v: c.reply_rate != null ? `${c.reply_rate}%` : '—', tone: c.reply_rate > 0 ? 'accent' : 'muted' },
        ].map((m) => (
          <div key={m.l}>
            <div className="mono text-[14px]" style={{
              color: m.tone === 'muted' ? 'hsl(var(--text))' : `hsl(var(--${m.tone}))`,
              fontWeight: 600,
            }}>
              {m.v}
            </div>
            <div className="text-[10.5px]" style={{ color: 'hsl(var(--muted))' }}>{m.l}</div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between pt-3 border-t text-[11px]"
        style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted))' }}>
        <div className="flex items-center gap-1.5">
          <Clock size={10} />
          <span className="mono">{c.created_at ? new Date(c.created_at).toLocaleDateString('fr-FR') : '—'}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={(e) => { e.stopPropagation(); onDelete(c); }}
            className="p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ color: 'hsl(var(--muted))', background: 'transparent', border: 'none', cursor: 'pointer' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'hsl(var(--rose))'; e.currentTarget.style.background = 'hsl(var(--rose) / .08)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'hsl(var(--muted))'; e.currentTarget.style.background = 'transparent'; }}>
            <Trash2 size={12} />
          </button>
          <span className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1"
            style={{ color: 'hsl(var(--accent))', fontWeight: 500 }}>
            Ouvrir <ArrowRight size={10} />
          </span>
        </div>
      </div>
    </div>
  );
}

function CampaignRow({ c, onOpen, onDelete }) {
  const pct = c.status === 'completed' ? 100 : (c.total_target ? Math.round((c.total_processed / c.total_target) * 100) : 0);
  const dim = ['completed', 'paused', 'cancelled'].includes(c.status);
  const icon = TYPE_ICON[c.type] || '·';
  const hue = TYPE_HUE[c.type] || 'slate';

  return (
    <div onClick={onOpen}
      className="grid gap-3 px-4 py-3 items-center cursor-pointer row-hover border-t group"
      style={{
        gridTemplateColumns: '36px minmax(180px,2fr) 130px 110px minmax(140px,1fr) 80px 80px 80px 40px',
        borderColor: 'hsl(var(--border))', opacity: dim ? 0.8 : 1,
      }}>
      <div className="w-8 h-8 rounded-lg flex items-center justify-center text-[12px]"
        style={{ background: `hsl(var(--${hue}) / .12)`, color: `hsl(var(--${hue}))`, fontWeight: 600 }}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-[13px] font-medium truncate">{c.name}</div>
        <div className="text-[11px] truncate" style={{ color: 'hsl(var(--muted))' }}>{c.crm_name || '—'}</div>
      </div>
      <TypeTag type={c.type} />
      <StatusChip status={c.status} />
      <div className="flex items-center gap-2 min-w-0">
        <div className="flex-1"><Progress value={pct} /></div>
        <span className="mono text-[11px] shrink-0" style={{ color: 'hsl(var(--muted))' }}>{pct}%</span>
      </div>
      <div className="mono text-[12px] text-right" style={{ color: 'hsl(var(--muted))' }}>
        {c.total_processed ?? 0}<span style={{ opacity: 0.5 }}>/{c.total_target || '—'}</span>
      </div>
      <div className="mono text-[12px] text-right"
        style={{ color: c.reply_rate > 0 ? 'hsl(var(--accent))' : 'hsl(var(--muted))', fontWeight: c.reply_rate > 0 ? 600 : 400 }}>
        {c.reply_rate != null ? `${c.reply_rate}%` : '—'}
      </div>
      <div className="mono text-[12px] text-right"
        style={{ color: c.connection_rate > 0 ? 'hsl(var(--emerald))' : 'hsl(var(--muted))', fontWeight: c.connection_rate > 0 ? 600 : 400 }}>
        {c.connection_rate != null ? `${c.connection_rate}%` : '—'}
      </div>
      <button onClick={(e) => { e.stopPropagation(); onDelete(c); }}
        className="p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity justify-self-end"
        style={{ color: 'hsl(var(--muted))', background: 'transparent', border: 'none', cursor: 'pointer' }}
        onMouseEnter={(e) => { e.currentTarget.style.color = 'hsl(var(--rose))'; e.currentTarget.style.background = 'hsl(var(--rose) / .08)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = 'hsl(var(--muted))'; e.currentTarget.style.background = 'transparent'; }}>
        <Trash2 size={13} />
      </button>
    </div>
  );
}

function NewCampaignCard({ onClick }) {
  return (
    <div onClick={onClick}
      className="flex flex-col items-center justify-center text-center p-6 cursor-pointer transition-all"
      style={{
        border: '1.5px dashed hsl(var(--border-strong))',
        minHeight: 240, background: 'hsl(var(--panel))', borderRadius: 18,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'hsl(var(--accent))'; e.currentTarget.style.background = 'hsl(var(--accent-soft))'; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'hsl(var(--border-strong))'; e.currentTarget.style.background = 'hsl(var(--panel))'; }}>
      <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-2"
        style={{ background: 'hsl(var(--accent-soft))', color: 'hsl(var(--accent))' }}>
        <Plus size={18} />
      </div>
      <div className="text-[13.5px] font-semibold mb-1">Nouvelle campagne</div>
      <div className="text-[11.5px]" style={{ color: 'hsl(var(--muted))' }}>Connexion, message, recherche…</div>
    </div>
  );
}

export default function CampaignsPage() {
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [view, setView] = useState('grid');
  const [sort, setSort] = useState('recent');
  const [showNew, setShowNew] = useState(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [crms, setCrms] = useState([]);
  const [form, setForm] = useState({ name: '', crm_id: '', source_crm_id: '', keywords: '', message_template: '', use_ai: false, total_target: 100, withDM: false, autoConnect: false, autoConnectDM: false, search_regions: [] });
  const [creating, setCreating] = useState(false);
  const [aiAvailable, setAiAvailable] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    client.get('/ai/status').then((r) => setAiAvailable(r.data.available)).catch(() => {});
  }, []);

  const { data: campaigns = [], isFetching } = useQuery({
    queryKey: ['campaigns', { type: typeFilter !== 'all' ? typeFilter : undefined }],
    queryFn: () => getCampaigns({ type: typeFilter !== 'all' ? typeFilter : undefined }),
    placeholderData: keepPreviousData,
    refetchInterval: 20_000,
  });
  const loading = isFetching && campaigns.length === 0;
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['campaigns'] });

  const counts = useMemo(() => ({
    all: campaigns.length,
    running: campaigns.filter((c) => c.status === 'running').length,
    scheduled: campaigns.filter((c) => c.status === 'scheduled' || c.status === 'pending').length,
    paused: campaigns.filter((c) => c.status === 'paused').length,
    completed: campaigns.filter((c) => c.status === 'completed').length,
  }), [campaigns]);

  const typeCounts = useMemo(() => Object.fromEntries(CAMPAIGN_TYPES.map((t) => [
    t.key, t.key === 'all' ? campaigns.length : campaigns.filter((c) => c.type === t.key).length,
  ])), [campaigns]);

  const filtered = useMemo(() => {
    let list = campaigns.filter((c) => {
      if (statusFilter !== 'all' && c.status !== statusFilter) {
        if (!(statusFilter === 'scheduled' && c.status === 'pending')) return false;
      }
      if (query && !c.name.toLowerCase().includes(query.toLowerCase()) &&
          !(c.crm_name || '').toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
    if (sort === 'replyRate') list = [...list].sort((a, b) => (b.reply_rate || 0) - (a.reply_rate || 0));
    else if (sort === 'progress') list = [...list].sort((a, b) =>
      ((b.total_processed || 0) / (b.total_target || 1)) - ((a.total_processed || 0) / (a.total_target || 1))
    );
    else if (sort === 'name') list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    else {
      list = [...list].sort((a, b) => {
        const fin = ['completed', 'cancelled', 'failed'];
        return (fin.includes(a.status) ? 1 : 0) - (fin.includes(b.status) ? 1 : 0);
      });
    }
    return list;
  }, [campaigns, query, statusFilter, sort]);

  const totalSent = campaigns.reduce((s, c) => s + (c.total_processed || 0), 0);
  const totalAccepted = campaigns.reduce((s, c) => s + (c.total_sent || 0), 0);
  const totalReplied = campaigns.reduce((s, c) => s + (c.total_succeeded || 0), 0);
  const rateCampaigns = campaigns.filter((c) => c.reply_rate != null && c.reply_rate > 0);
  const avgReplyRate = rateCampaigns.length
    ? Math.round(rateCampaigns.reduce((s, c) => s + c.reply_rate, 0) / rateCampaigns.length * 10) / 10
    : 0;
  const totalTarget = campaigns.reduce((s, c) => s + (c.total_target || 0), 0);

  const openNew = async (type) => {
    setCrms(await getCRMs());
    setForm({ name: '', crm_id: '', source_crm_id: '', keywords: '', message_template: '', use_ai: false, total_target: 100, withDM: false, autoConnect: false, autoConnectDM: false, search_regions: [] });
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
        source_crm_id: form.source_crm_id ? parseInt(form.source_crm_id) : null,
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

  const handleDelete = (c) => {
    if (!confirm('Supprimer cette campagne ?')) return;
    deleteCampaign(c.id).then(() => { toast.success('Campagne supprimée'); invalidate(); }).catch(() => toast.error('Erreur'));
  };

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const KPI_CARDS = [
    { l: 'Contacts traités', v: totalSent.toLocaleString('fr-FR'), sub: totalTarget ? `sur ${totalTarget.toLocaleString('fr-FR')}` : '', tone: 'accent', icon: Send },
    { l: 'Demandes acceptées', v: totalAccepted.toLocaleString('fr-FR'), sub: totalSent > 0 ? `${Math.round(totalAccepted / totalSent * 100)}% acceptation` : '—', tone: 'violet', icon: UserPlus },
    { l: 'Réponses reçues', v: totalReplied.toLocaleString('fr-FR'), sub: totalSent > 0 ? `${Math.round(totalReplied / totalSent * 100)}% globale` : '—', tone: 'emerald', icon: MessageSquare },
    { l: 'Taux réponse moyen', v: `${avgReplyRate}%`, sub: `${rateCampaigns.length} campagne${rateCampaigns.length > 1 ? 's' : ''}`, tone: 'amber', icon: MessageCircle },
  ];

  return (
    <PageWrapper>
      <div className="flex items-end justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight" style={{ letterSpacing: '-0.02em' }}>Campagnes</h1>
          <p className="text-[13.5px] mt-1" style={{ color: 'hsl(var(--muted))' }}>
            Automatisez vos actions LinkedIn —{' '}
            <span className="mono" style={{ fontWeight: 500 }}>{counts.running}</span> en cours,{' '}
            <span className="mono" style={{ fontWeight: 500 }}>{counts.scheduled}</span> planifiée{counts.scheduled > 1 ? 's' : ''},{' '}
            <span className="mono" style={{ fontWeight: 500 }}>{counts.completed}</span> terminée{counts.completed > 1 ? 's' : ''}
          </p>
        </div>
        <div className="relative">
          <button onClick={() => setShowDropdown(!showDropdown)} className="cta-btn">
            <Plus size={14} /> Nouvelle campagne <ChevronDown size={14} />
          </button>
          {showDropdown && (
            <div className="absolute right-0 mt-2 w-56 py-1 z-10"
              style={{
                background: 'hsl(var(--panel))',
                border: '1px solid hsl(var(--border-strong))',
                borderRadius: 14,
                boxShadow: '0 20px 50px -20px hsl(220 40% 20% / .25)',
              }}>
              {[
                { key: 'search', icon: Search, label: 'Campagne Recherche' },
                { key: 'dm_nav', icon: MessageSquare, label: 'Campagne Message', nav: true },
                { key: 'connection', icon: UserPlus, label: 'Campagne Connexion' },
                { key: 'export', icon: Download, label: 'Campagne Export' },
              ].map((o) => {
                const Ic = o.icon;
                return (
                  <button key={o.key}
                    onClick={() => { if (o.nav) { setShowDropdown(false); navigate('/dashboard/campaigns/new-dm'); } else { openNew(o.key); } }}
                    className="w-full text-left flex items-center gap-3 text-[13px]"
                    style={{ padding: '10px 14px', color: 'hsl(var(--text))', background: 'transparent', border: 'none', cursor: 'pointer' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'hsl(220 20% 97%)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                    <Ic size={15} style={{ color: 'hsl(var(--muted))' }} /> {o.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {KPI_CARDS.map((k) => {
          const Ic = k.icon;
          return (
            <div key={k.l} className="g-card p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center"
                  style={{ background: `hsl(var(--${k.tone}) / .12)`, color: `hsl(var(--${k.tone}))` }}>
                  <Ic size={15} />
                </div>
              </div>
              <div className="text-[22px] font-semibold tracking-tight mono" style={{ letterSpacing: '-0.02em' }}>{k.v}</div>
              <div className="text-[11px] mt-0.5" style={{ color: 'hsl(var(--muted))' }}>{k.l}</div>
              {k.sub && <div className="text-[10.5px] mt-1 mono" style={{ color: 'hsl(var(--muted))', opacity: 0.8 }}>{k.sub}</div>}
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-1 mb-4 flex-wrap">
        <div className="flex items-center gap-1 p-0.5 rounded-lg" style={{ background: 'hsl(220 20% 95%)' }}>
          {[
            { k: 'all', l: 'Toutes', n: counts.all },
            { k: 'running', l: 'En cours', n: counts.running, dot: 'emerald' },
            { k: 'scheduled', l: 'Planifiées', n: counts.scheduled, dot: 'amber' },
            { k: 'paused', l: 'En pause', n: counts.paused, dot: 'slate' },
            { k: 'completed', l: 'Terminées', n: counts.completed, dot: 'blue' },
          ].map((f) => (
            <button key={f.k} onClick={() => setStatusFilter(f.k)}
              className="flex items-center gap-2"
              style={{
                padding: '6px 12px', borderRadius: 8, fontSize: 12.5, fontWeight: 500,
                background: statusFilter === f.k ? 'white' : 'transparent',
                color: statusFilter === f.k ? 'hsl(var(--text))' : 'hsl(var(--muted))',
                boxShadow: statusFilter === f.k ? '0 1px 2px hsl(220 40% 20% / .08)' : 'none',
                border: 'none', cursor: 'pointer',
              }}>
              {f.dot && <span style={{ width: 6, height: 6, borderRadius: 999, background: `hsl(var(--${f.dot === 'blue' ? 'accent' : f.dot}))` }} />}
              {f.l}
              <span className="mono" style={{ fontSize: 10.5, opacity: 0.7 }}>{f.n}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'hsl(var(--muted))' }} />
          <input value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher une campagne, un CRM…"
            className="w-full ring-a"
            style={{
              padding: '8px 12px 8px 36px', borderRadius: 10, fontSize: 13,
              border: '1px solid hsl(var(--border))', background: 'hsl(var(--panel))',
            }} />
        </div>

        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
          className="ring-a cursor-pointer"
          style={{ padding: '8px 12px', borderRadius: 10, fontSize: 12.5, border: '1px solid hsl(var(--border))', background: 'hsl(var(--panel))' }}>
          {CAMPAIGN_TYPES.map((t) => (
            <option key={t.key} value={t.key}>{t.label} ({typeCounts[t.key] || 0})</option>
          ))}
        </select>

        <select value={sort} onChange={(e) => setSort(e.target.value)}
          className="ring-a cursor-pointer"
          style={{ padding: '8px 12px', borderRadius: 10, fontSize: 12.5, border: '1px solid hsl(var(--border))', background: 'hsl(var(--panel))' }}>
          <option value="recent">Plus récentes</option>
          <option value="name">Alphabétique</option>
          <option value="replyRate">Taux de réponse</option>
          <option value="progress">Progression</option>
        </select>

        <div className="flex items-center gap-0.5 p-0.5 rounded-lg" style={{ background: 'hsl(220 20% 95%)' }}>
          <button onClick={() => setView('grid')} className="p-1.5 rounded-md"
            style={{
              background: view === 'grid' ? 'white' : 'transparent',
              color: view === 'grid' ? 'hsl(var(--text))' : 'hsl(var(--muted))',
              boxShadow: view === 'grid' ? '0 1px 2px hsl(220 40% 20% / .08)' : 'none',
              border: 'none', cursor: 'pointer',
            }}>
            <Grid3x3 size={14} />
          </button>
          <button onClick={() => setView('table')} className="p-1.5 rounded-md"
            style={{
              background: view === 'table' ? 'white' : 'transparent',
              color: view === 'table' ? 'hsl(var(--text))' : 'hsl(var(--muted))',
              boxShadow: view === 'table' ? '0 1px 2px hsl(220 40% 20% / .08)' : 'none',
              border: 'none', cursor: 'pointer',
            }}>
            <List size={14} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 size={28} className="spin" style={{ color: 'hsl(var(--accent))' }} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="g-card p-12 text-center">
          <div className="w-12 h-12 rounded-xl mx-auto mb-3 flex items-center justify-center"
            style={{ background: 'hsl(var(--accent-soft))', color: 'hsl(var(--accent))' }}>
            <Search size={20} />
          </div>
          <div className="text-[14px] font-semibold">
            {query ? `Aucun résultat pour « ${query} »` : 'Aucune campagne'}
          </div>
          <div className="text-[12.5px] mt-1" style={{ color: 'hsl(var(--muted))' }}>
            {query ? 'Essayez un autre nom ou nettoyez vos filtres.' : 'Créez votre première campagne pour commencer.'}
          </div>
        </div>
      ) : view === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((c) => (
            <CampaignCard key={c.id} c={c}
              onOpen={() => navigate(`/dashboard/campaigns/${c.id}`)}
              onDelete={handleDelete} />
          ))}
          <NewCampaignCard onClick={() => setShowDropdown(true)} />
        </div>
      ) : (
        <div className="g-card overflow-hidden">
          <div className="grid gap-3 px-4 py-2.5 text-[11px] uppercase tracking-wider"
            style={{
              gridTemplateColumns: '36px minmax(180px,2fr) 130px 110px minmax(140px,1fr) 80px 80px 80px 40px',
              color: 'hsl(var(--muted))', background: 'hsl(220 22% 98%)', fontWeight: 600,
            }}>
            <div></div><div>Nom</div><div>Type</div><div>Statut</div><div>Progression</div>
            <div className="text-right">Traités</div><div className="text-right">Réponse</div><div className="text-right">Accept.</div><div></div>
          </div>
          {filtered.map((c) => (
            <CampaignRow key={c.id} c={c}
              onOpen={() => navigate(`/dashboard/campaigns/${c.id}`)}
              onDelete={handleDelete} />
          ))}
        </div>
      )}

      {/* Creation modal — preserves original behavior */}
      <Modal open={!!showNew} onClose={() => setShowNew(null)} title={
        showNew === 'search' ? 'Nouvelle campagne Recherche' :
        showNew === 'dm' ? 'Nouvelle campagne Message' :
        showNew === 'export' ? 'Nouvelle campagne Export' :
        'Nouvelle campagne Connexion'
      } wide>
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-[12px] font-medium mb-1.5" style={{ color: 'hsl(var(--muted))' }}>Nom de la campagne</label>
            <input value={form.name} onChange={(e) => set('name', e.target.value)} required
              className="input-glass" placeholder="Ex: Prospection Marketing Managers" />
          </div>

          {showNew === 'search' && (
            <>
              <div>
                <label className="block text-[12px] font-medium mb-1.5" style={{ color: 'hsl(var(--muted))' }}>Mots-clés de recherche</label>
                <input value={form.keywords} onChange={(e) => set('keywords', e.target.value)}
                  className="input-glass" placeholder="Ex: Marketing Manager Paris" />
              </div>
              <div>
                <label className="block text-[12px] font-medium mb-1.5" style={{ color: 'hsl(var(--muted))' }}>Pays (optionnel)</label>
                <select value="" onChange={(e) => {
                    if (e.target.value && !form.search_regions.includes(e.target.value)) {
                      set('search_regions', [...form.search_regions, e.target.value]);
                    }
                  }} className="input-glass">
                  <option value="">Tous les pays</option>
                  {COUNTRIES.filter((c) => !form.search_regions.includes(c.id)).map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                {form.search_regions.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {form.search_regions.map((id) => {
                      const country = COUNTRIES.find((c) => c.id === id);
                      return (
                        <span key={id} className="chip blue" style={{ cursor: 'pointer' }}>
                          {country?.name || id}
                          <button type="button" onClick={() => set('search_regions', form.search_regions.filter((r) => r !== id))}
                            style={{ marginLeft: 4, background: 'transparent', border: 'none', cursor: 'pointer', color: 'inherit' }}>×</button>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}

          {showNew === 'connection' && (
            <p className="text-[12.5px] p-3 rounded-lg" style={{ color: 'hsl(var(--muted))', background: 'hsl(220 20% 97%)' }}>
              Les demandes de connexion seront envoyées aux contacts du CRM sélectionné ci-dessous.
            </p>
          )}

          {showNew === 'export' && (
            <>
              <p className="text-[12.5px] p-3 rounded-lg" style={{ color: 'hsl(var(--muted))', background: 'hsl(220 20% 97%)' }}>
                Copie les contacts d'un CRM source vers un CRM de destination, filtrés par un mot-clé.
              </p>
              <div>
                <label className="block text-[12px] font-medium mb-1.5" style={{ color: 'hsl(var(--muted))' }}>CRM source</label>
                <select value={form.source_crm_id} onChange={(e) => set('source_crm_id', e.target.value)}
                  className="input-glass" required>
                  <option value="">Sélectionner le CRM source...</option>
                  {crms.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.contact_count} contacts)</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[12px] font-medium mb-1.5" style={{ color: 'hsl(var(--muted))' }}>Mot-clé</label>
                <input value={form.keywords} onChange={(e) => set('keywords', e.target.value)} required
                  className="input-glass" placeholder="Ex: closer" />
              </div>
            </>
          )}

          <div>
            <label className="block text-[12px] font-medium mb-1.5" style={{ color: 'hsl(var(--muted))' }}>CRM de destination</label>
            <select value={form.crm_id} onChange={(e) => set('crm_id', e.target.value)}
              className="input-glass" required>
              <option value="">Sélectionner un CRM...</option>
              {crms
                .filter((c) => showNew !== 'export' || String(c.id) !== String(form.source_crm_id))
                .map((c) => <option key={c.id} value={c.id}>{c.name} ({c.contact_count} contacts)</option>)}
            </select>
          </div>

          {showNew === 'dm' && (
            <div>
              <label className="block text-[12px] font-medium mb-1.5" style={{ color: 'hsl(var(--muted))' }}>Template de message</label>
              <textarea value={form.message_template} onChange={(e) => set('message_template', e.target.value)}
                rows={3} className="input-glass" placeholder="Bonjour {first_name}, ..." />
              <p className="text-[11px] mt-1" style={{ color: 'hsl(var(--muted))' }}>
                {form.use_ai ? "Décrivez le ton et le but. L'IA personnalise pour chaque contact."
                  : <>Variables : {'{first_name}'}, {'{last_name}'}, {'{headline}'}</>}
              </p>
              {aiAvailable && (
                <label className="flex items-center gap-3 mt-3 p-3 rounded-lg cursor-pointer"
                  style={{ background: 'hsl(262 90% 97%)', border: '1px solid hsl(262 70% 88%)' }}>
                  <input type="checkbox" checked={form.use_ai} onChange={(e) => set('use_ai', e.target.checked)} />
                  <Sparkles size={15} style={{ color: 'hsl(var(--violet))' }} />
                  <div>
                    <span className="text-[13px] font-medium" style={{ color: 'hsl(var(--violet))' }}>Personnalisation IA</span>
                    <p className="text-[11px]" style={{ color: 'hsl(262 50% 55%)' }}>Chaque message sera unique, adapté au profil du contact</p>
                  </div>
                </label>
              )}
            </div>
          )}

          {showNew === 'search' && (
            <div>
              <label className="block text-[12px] font-medium mb-1.5" style={{ color: 'hsl(var(--muted))' }}>Nombre de contacts à collecter</label>
              <input type="number" value={form.total_target} onChange={(e) => set('total_target', e.target.value)}
                className="input-glass" min={1} />
            </div>
          )}

          {showNew === 'search' && (
            <label className="flex items-center gap-3 p-3 rounded-lg cursor-pointer"
              style={{ background: form.autoConnectDM ? 'hsl(220 20% 97%)' : 'hsl(var(--accent-soft))', border: `1px solid ${form.autoConnectDM ? 'hsl(var(--border))' : 'hsl(var(--accent) / .25)'}` }}>
              <input type="checkbox" checked={form.autoConnect} disabled={form.autoConnectDM}
                onChange={(e) => { set('autoConnect', e.target.checked); if (e.target.checked) set('autoConnectDM', false); }} />
              <UserPlus size={15} style={{ color: form.autoConnectDM ? 'hsl(var(--muted))' : 'hsl(var(--accent))' }} />
              <div>
                <span className="text-[13px] font-medium" style={{ color: form.autoConnectDM ? 'hsl(var(--muted))' : 'hsl(var(--accent))' }}>Recherche + Connexion</span>
                <p className="text-[11px]" style={{ color: form.autoConnectDM ? 'hsl(var(--muted))' : 'hsl(var(--accent) / .75)' }}>
                  Envoyer automatiquement une demande aux contacts trouvés
                </p>
              </div>
            </label>
          )}

          {showNew === 'search' && (
            <label className="flex items-center gap-3 p-3 rounded-lg cursor-pointer"
              style={{ background: 'hsl(262 90% 97%)', border: '1px solid hsl(262 70% 88%)' }}>
              <input type="checkbox" checked={form.autoConnectDM}
                onChange={(e) => { set('autoConnectDM', e.target.checked); if (e.target.checked) set('autoConnect', false); }} />
              <MessageCircle size={15} style={{ color: 'hsl(var(--violet))' }} />
              <div>
                <span className="text-[13px] font-medium" style={{ color: 'hsl(var(--violet))' }}>Recherche + Connexion + DM</span>
                <p className="text-[11px]" style={{ color: 'hsl(262 50% 55%)' }}>
                  Rechercher, connecter, puis envoyer un DM après acceptation
                </p>
              </div>
            </label>
          )}

          {showNew === 'connection' && (
            <label className="flex items-center gap-3 p-3 rounded-lg cursor-pointer"
              style={{ background: 'hsl(var(--accent-soft))', border: '1px solid hsl(var(--accent) / .25)' }}>
              <input type="checkbox" checked={form.withDM} onChange={(e) => set('withDM', e.target.checked)} />
              <MessageCircle size={15} style={{ color: 'hsl(var(--accent))' }} />
              <div>
                <span className="text-[13px] font-medium" style={{ color: 'hsl(var(--accent))' }}>Connexion + DM</span>
                <p className="text-[11px]" style={{ color: 'hsl(var(--accent) / .75)' }}>Envoyer un message automatiquement après acceptation</p>
              </div>
            </label>
          )}

          {((showNew === 'connection' && form.withDM) || (showNew === 'search' && form.autoConnectDM)) ? (
            <button type="button" onClick={() => {
              if (!form.name.trim()) return toast.error('Donne un nom à la campagne');
              if (!form.crm_id) return toast.error('Sélectionne un CRM');
              if (showNew === 'search' && !form.keywords?.trim()) return toast.error('Ajoute des mots-clés');
              setShowNew(null);
              if (showNew === 'search' && form.autoConnectDM) {
                navigate('/dashboard/campaigns/new-dm', {
                  state: { searchConnectionDMConfig: {
                    name: form.name, keywords: form.keywords,
                    crm_id: parseInt(form.crm_id), total_target: parseInt(form.total_target) || 100,
                    search_regions: form.search_regions,
                  } },
                });
              } else {
                navigate('/dashboard/campaigns/new-dm', {
                  state: { connectionConfig: {
                    name: form.name, keywords: form.keywords, crm_id: parseInt(form.crm_id),
                  } },
                });
              }
            }} className="cta-btn w-full">
              <MessageCircle size={14} /> Configurer les DMs
            </button>
          ) : (
            <button type="submit" disabled={creating} className="cta-btn w-full">
              {creating ? 'Lancement...' : 'Lancer la campagne'}
            </button>
          )}
        </form>
      </Modal>
    </PageWrapper>
  );
}

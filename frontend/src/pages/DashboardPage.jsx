import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, Rocket, MessageSquare, UserPlus, Plus, ArrowRight, Loader2,
  RefreshCw, Send, Clock, Check, X, Eye, MessageCircle, AlertCircle,
} from 'lucide-react';
import { getDashboardStats, getLinkedInProfile } from '../api/dashboard';
import { syncConnections } from '../api/config';
import { useAuth } from '../context/AuthContext';
import PageWrapper from '../components/layout/PageWrapper';
import { StatusChip, TypeTag, Avatar, Progress, Sparkline, hueFromString, getInitials } from '../components/ui/atoms';
import { formatServerTime } from '../utils/date';
import toast from 'react-hot-toast';

function greeting() {
  const h = new Date().getHours();
  if (h < 6) return 'Bonne nuit';
  if (h < 12) return 'Bonjour';
  if (h < 18) return 'Bon après-midi';
  return 'Bonsoir';
}

function todayLabel() {
  return new Date().toLocaleDateString('fr-FR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  });
}

function Hero({ user, stats, onRefresh, onNewCRM, onNewCampaign, syncing }) {
  const replies = stats?.today_replies ?? stats?.recent_actions?.filter((a) => a.action_type?.includes('reply') || a.status === 'reply').length ?? 0;
  const accepted = stats?.today_accepted ?? 0;
  const displayName = (user?.full_name || user?.email || '').split(' ')[0] || '';

  return (
    <div className="flex items-end justify-between gap-6 mb-6 flex-wrap">
      <div>
        <div className="eyebrow mb-2">
          <span className="mono">{todayLabel().toUpperCase()}</span>
        </div>
        <h1 className="text-[28px] font-semibold tracking-tight" style={{ letterSpacing: '-0.02em' }}>
          {greeting()}{displayName ? `, ${displayName}` : ''}.
        </h1>
        <p className="text-[14px] mt-1" style={{ color: 'hsl(var(--muted))' }}>
          {accepted > 0 || replies > 0 ? (
            <>
              <span style={{ color: 'hsl(var(--emerald))', fontWeight: 500 }}>
                {accepted} connexion{accepted > 1 ? 's' : ''} acceptée{accepted > 1 ? 's' : ''}
              </span>
              {' '}et{' '}
              <span style={{ color: 'hsl(var(--accent))', fontWeight: 500 }}>
                {replies} réponse{replies > 1 ? 's' : ''}
              </span>
              {' '}aujourd'hui.
            </>
          ) : 'Aucune action aujourd\'hui pour l\'instant.'}
        </p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={onRefresh} disabled={syncing} className="ghost-btn">
          <RefreshCw size={14} className={syncing ? 'spin' : ''} /> Actualiser
        </button>
        <button onClick={onNewCRM} className="ghost-btn">
          <Plus size={14} /> Nouveau CRM
        </button>
        <button onClick={onNewCampaign} className="cta-btn">
          <Rocket size={14} /> Nouvelle campagne
        </button>
      </div>
    </div>
  );
}

function AccountHealth({ stats, liProfile }) {
  const connToday = stats?.connections_today ?? 0;
  const connLimit = stats?.connections_limit ?? 25;
  const dmToday = stats?.dms_today ?? 0;
  const dmLimit = stats?.dms_limit ?? 50;

  const loading = liProfile === null;
  const valid = liProfile?.valid === true;
  const name = [liProfile?.first_name, liProfile?.last_name].filter(Boolean).join(' ');
  const publicId = liProfile?.public_id || '';
  const picture = liProfile?.picture_url;

  const rows = [
    { icon: UserPlus, label: "Invitations aujourd'hui", value: connToday, sub: connLimit, pct: connLimit > 0 ? (connToday / connLimit) * 100 : 0, tone: 'accent' },
    { icon: Send,     label: 'Messages envoyés',       value: dmToday,   sub: dmLimit,    pct: dmLimit > 0 ? (dmToday / dmLimit) * 100 : 0,     tone: 'emerald' },
  ];

  return (
    <div className="g-card p-4 mb-6 flex items-center gap-6 flex-wrap">
      <div className="flex items-center gap-2.5 pr-5 border-r" style={{ borderColor: 'hsl(var(--border))' }}>
        <div className="relative">
          {loading ? (
            <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
              style={{ background: 'hsl(220 20% 96%)', color: 'hsl(var(--muted))' }}>
              <Loader2 size={14} className="spin" />
            </div>
          ) : valid && picture ? (
            <Avatar
              src={picture}
              initials={getInitials(liProfile?.first_name, liProfile?.last_name) || 'in'}
              hue={hueFromString(name || 'linkedin')}
              size={36}
              alt={name}
            />
          ) : valid ? (
            <Avatar
              initials={getInitials(liProfile?.first_name, liProfile?.last_name) || 'in'}
              hue={hueFromString(name || 'linkedin')}
              size={36}
            />
          ) : (
            <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
              style={{ background: 'hsl(352 90% 96%)', color: 'hsl(var(--rose))' }}>
              <AlertCircle size={16} />
            </div>
          )}
          {valid && <span className="live-dot" style={{ position: 'absolute', bottom: -2, right: -2, border: '2px solid white' }} />}
        </div>
        <div>
          <div className="text-[13px] font-medium">
            {loading
              ? 'Vérification du compte…'
              : valid
                ? (name || 'Compte LinkedIn connecté')
                : 'Cookies LinkedIn expirés'}
          </div>
          <div className="text-[11px] mono" style={{ color: 'hsl(var(--muted))' }}>
            {loading
              ? '…'
              : valid
                ? (publicId ? `@${publicId}` : 'Compte actif')
                : 'Mettez à jour vos cookies'}
          </div>
        </div>
      </div>

      {rows.map((r) => {
        const Ic = r.icon;
        return (
          <div key={r.label} className="flex items-center gap-3 min-w-[200px]" style={{ flex: '1 1 200px' }}>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: `hsl(var(--${r.tone}) / .12)`, color: `hsl(var(--${r.tone}))` }}>
              <Ic size={15} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[12px]" style={{ color: 'hsl(var(--muted))' }}>{r.label}</span>
                <span className="mono text-[12px]">
                  <b style={{ fontWeight: 600 }}>{r.value}</b>
                  <span style={{ color: 'hsl(var(--muted))' }}> / {r.sub}</span>
                </span>
              </div>
              <div className={`pbar mt-1.5 ${r.tone !== 'accent' ? r.tone : ''}`} style={{ height: 4 }}>
                <span style={{ width: `${Math.min(100, r.pct)}%` }} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function KPICards({ stats }) {
  const cards = [
    {
      label: 'Contacts', value: (stats?.total_contacts ?? 0).toLocaleString('fr-FR'),
      icon: Users, tone: 'accent', sparkColor: 'blue',
      delta: stats?.contacts_delta_14d > 0 ? `+${stats.contacts_delta_14d}` : null,
      deltaTone: 'emerald',
      sub: stats?.contacts_delta_14d > 0 ? 'depuis les 14 derniers jours' : 'réseau LinkedIn',
      trend: stats?.contacts_trend || [],
    },
    {
      label: 'Campagnes actives', value: stats?.active_campaigns ?? 0,
      icon: Rocket, tone: 'emerald', sparkColor: 'emerald',
      delta: stats?.total_campaigns != null ? `${stats.total_campaigns} en tout` : null, deltaTone: 'slate',
      sub: stats?.scheduled_campaigns ? `${stats.scheduled_campaigns} planifiée${stats.scheduled_campaigns > 1 ? 's' : ''}` : '',
      trend: stats?.active_trend || [],
    },
    {
      label: 'Taux de réponse', value: `${stats?.global_reply_rate ?? 0}%`,
      icon: MessageSquare, tone: 'violet', sparkColor: 'violet',
      delta: stats?.reply_rate_delta != null ? (stats.reply_rate_delta >= 0 ? `+${stats.reply_rate_delta} pt` : `${stats.reply_rate_delta} pt`) : null,
      deltaTone: (stats?.reply_rate_delta ?? 0) >= 0 ? 'emerald' : 'rose',
      sub: 'vs semaine passée',
      trend: stats?.reply_trend || [],
    },
    {
      label: 'Taux de connexion', value: `${stats?.global_connection_rate ?? 0}%`,
      icon: UserPlus, tone: 'amber', sparkColor: 'amber',
      delta: stats?.connection_rate_delta != null ? (stats.connection_rate_delta >= 0 ? `+${stats.connection_rate_delta} pt` : `${stats.connection_rate_delta} pt`) : null,
      deltaTone: (stats?.connection_rate_delta ?? 0) >= 0 ? 'emerald' : 'rose',
      sub: 'vs semaine passée',
      trend: stats?.connection_trend || [],
    },
  ];

  const deltaColor = {
    emerald: 'hsl(var(--emerald))',
    rose: 'hsl(var(--rose))',
    slate: 'hsl(var(--muted))',
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {cards.map((c) => {
        const Ic = c.icon;
        return (
          <div key={c.label} className="g-card p-5 flex flex-col gap-3 relative overflow-hidden">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-[12.5px]" style={{ color: 'hsl(var(--muted))' }}>{c.label}</div>
                <div className="text-[28px] font-semibold mt-2 tracking-tight" style={{ letterSpacing: '-0.02em' }}>{c.value}</div>
              </div>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: `hsl(var(--${c.tone}) / .12)`, color: `hsl(var(--${c.tone}))` }}>
                <Ic size={16} />
              </div>
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-[11.5px]">
                {c.delta && (
                  <span className="mono" style={{ color: deltaColor[c.deltaTone], fontWeight: 600 }}>
                    {c.deltaTone === 'emerald' && '↗ '}
                    {c.deltaTone === 'rose' && '↘ '}
                    {c.delta}
                  </span>
                )}
                {c.sub && <span style={{ color: 'hsl(var(--muted))' }}>{c.sub}</span>}
              </div>
              {c.trend && c.trend.length > 1 && <Sparkline points={c.trend} color={c.sparkColor} width={70} height={24} />}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CampaignsBlock({ campaigns, onOpen, onViewAll }) {
  const running = campaigns.filter((c) => c.status === 'running').length;
  const scheduled = campaigns.filter((c) => c.status === 'scheduled' || c.status === 'pending').length;
  const completed = campaigns.filter((c) => c.status === 'completed').length;

  return (
    <div className="g-card p-5 flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-[15px] font-semibold">Campagnes récentes</h2>
          <div className="text-[12px] mt-0.5" style={{ color: 'hsl(var(--muted))' }}>
            {running} en cours · {scheduled} planifiée{scheduled > 1 ? 's' : ''} · {completed} terminée{completed > 1 ? 's' : ''}
          </div>
        </div>
        <button onClick={onViewAll} className="text-[12px] flex items-center gap-1 hover:underline"
          style={{ color: 'hsl(var(--accent))', fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer' }}>
          Tout voir <ArrowRight size={12} />
        </button>
      </div>

      {campaigns.length === 0 ? (
        <div className="text-[12.5px] text-center py-6" style={{ color: 'hsl(var(--muted))' }}>
          Aucune campagne pour l'instant.
        </div>
      ) : (
        <div className="space-y-2.5">
          {campaigns.slice(0, 5).map((c) => {
            const pct = c.status === 'completed' ? 100 : (c.total_target ? Math.round((c.total_processed / c.total_target) * 100) : 0);
            const dim = ['completed', 'paused', 'cancelled'].includes(c.status);
            return (
              <div key={c.id} onClick={() => onOpen(c)}
                className="g-card-soft p-4 cursor-pointer transition-colors row-hover"
                style={dim ? { opacity: 0.7 } : undefined}>
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div className="font-medium text-[13.5px] truncate">{c.name}</div>
                  <StatusChip status={c.status} />
                </div>
                <div className="flex items-center gap-2 mb-3">
                  <TypeTag type={c.type} />
                  {c.crm_name && (
                    <span className="text-[11.5px] truncate" style={{ color: 'hsl(var(--muted))' }}>· {c.crm_name}</span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-1"><Progress value={pct} tone={c.status === 'completed' ? 'emerald' : ''} /></div>
                  <div className="mono text-[11.5px] shrink-0" style={{ fontWeight: 500 }}>
                    {c.total_processed ?? 0}
                    <span style={{ color: 'hsl(var(--muted))' }}>/{c.total_target || '—'}</span>
                    <span className="ml-2" style={{ color: 'hsl(var(--muted))' }}>{pct}%</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const ACTION_ICON = {
  reply: MessageCircle,
  dm_sent: Send,
  dm_followup: Send,
  connection_sent: UserPlus,
  connection_accepted: Check,
  search_add: Users,
  export_copy: ArrowRight,
  skipped: X,
};

const ACTION_HUE = {
  reply: 'emerald',
  dm_sent: 'blue',
  dm_followup: 'violet',
  connection_sent: 'violet',
  connection_accepted: 'emerald',
  search_add: 'blue',
  export_copy: 'slate',
  skipped: 'slate',
};

const ACTION_LABEL = {
  reply: 'Réponse reçue',
  dm_sent: 'Message envoyé',
  dm_followup: 'Relance envoyée',
  connection_sent: 'Invitation envoyée',
  connection_accepted: 'Invitation acceptée',
  search_add: 'Contact ajouté',
  export_copy: 'Contact copié',
  skipped: 'Ignoré',
};

function ActivityBlock({ actions, onViewAll }) {
  const [filter, setFilter] = useState('all');
  const normalize = (a) => {
    const t = (a.action_type || '').toLowerCase();
    if (a.status === 'skipped') return 'skipped';
    if (t === 'reply_detected' || t.includes('reply')) return 'reply';
    if (t === 'connection_accepted') return 'connection_accepted';
    if (t === 'connection_request' || t === 'connection_send') return 'connection_sent';
    if (t === 'dm_followup') return 'dm_followup';
    if (t === 'dm_send' || t === 'dm_sent' || t === 'message_sent') return 'dm_sent';
    if (t === 'search_add') return 'search_add';
    if (t === 'export_copy') return 'export_copy';
    return t || 'other';
  };
  const items = (actions || []).map((a) => ({ ...a, _kind: normalize(a) }));

  const filtered = filter === 'all' ? items : items.filter((a) => {
    if (filter === 'replies') return a._kind === 'reply';
    if (filter === 'conn') return a._kind.startsWith('connection');
    if (filter === 'dm') return a._kind === 'dm_sent' || a._kind === 'dm_followup';
    return true;
  });

  const filters = [
    { key: 'all', label: 'Tout', count: items.length },
    { key: 'replies', label: 'Réponses', count: items.filter((a) => a._kind === 'reply').length },
    { key: 'conn', label: 'Connexions', count: items.filter((a) => a._kind.startsWith('connection')).length },
    { key: 'dm', label: 'Messages', count: items.filter((a) => a._kind === 'dm_sent' || a._kind === 'dm_followup').length },
  ];

  const timeAgo = (iso) => formatServerTime(iso);

  return (
    <div className="g-card p-5 flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h2 className="text-[15px] font-semibold">Activité</h2>
          <span className="live-dot" />
          <span className="text-[11px] mono" style={{ color: 'hsl(var(--emerald))' }}>LIVE</span>
        </div>
        <button onClick={onViewAll} className="text-[12px] flex items-center gap-1 hover:underline"
          style={{ color: 'hsl(var(--accent))', fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer' }}>
          Voir tout <ArrowRight size={12} />
        </button>
      </div>

      <div className="flex items-center gap-1 mb-3 flex-wrap">
        {filters.map((f) => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className="flex items-center gap-1.5 transition-colors"
            style={{
              padding: '4px 10px', borderRadius: 8, fontSize: 11.5, fontWeight: 500,
              background: filter === f.key ? 'hsl(var(--accent-soft))' : 'transparent',
              color: filter === f.key ? 'hsl(var(--accent))' : 'hsl(var(--muted))',
              border: `1px solid ${filter === f.key ? 'hsl(var(--accent) / .2)' : 'transparent'}`,
              cursor: 'pointer',
            }}>
            {f.label}
            <span className="mono" style={{ fontSize: 10, opacity: 0.7 }}>{f.count}</span>
          </button>
        ))}
      </div>

      <div className="space-y-1 -mx-1">
        {filtered.length === 0 ? (
          <div className="text-center py-6 text-[12px]" style={{ color: 'hsl(var(--muted))' }}>
            Aucune action pour ce filtre
          </div>
        ) : filtered.slice(0, 8).map((a, i) => {
          const Ic = ACTION_ICON[a._kind] || Eye;
          const hue = ACTION_HUE[a._kind] || 'slate';
          const varName = hue === 'blue' ? 'accent' : hue;
          const name = [a.contact_first_name, a.contact_last_name].filter(Boolean).join(' ') || a.contact_name || 'Contact inconnu';
          let initials = getInitials(a.contact_first_name, a.contact_last_name);
          if (!initials || initials === '?') {
            const parts = (a.contact_name || '').trim().split(/\s+/).filter(Boolean);
            initials = ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?';
          }
          return (
            <div key={a.id || i} className="flex items-center gap-3 px-2 py-2 rounded-lg row-hover transition-colors">
              <Avatar initials={initials} hue={hueFromString(name)} size={30} src={a.contact_profile_picture_url} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium truncate">{name}</span>
                  <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: `hsl(var(--${varName}) / .14)`, color: `hsl(var(--${varName}))` }}>
                    <Ic size={12} />
                  </div>
                </div>
                <div className="text-[11.5px] truncate" style={{ color: 'hsl(var(--muted))' }}>
                  {a.campaign_name || '—'}
                </div>
              </div>
              <div className="text-right shrink-0 min-w-[110px]">
                <div className="text-[11px] font-medium" style={{ color: `hsl(var(--${varName}))` }}>
                  {ACTION_LABEL[a._kind] || a.action_type}
                </div>
                <div className="mono text-[10.5px]" style={{ color: 'hsl(var(--muted))' }}>{timeAgo(a.created_at)}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState(null);
  const [liProfile, setLiProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();

  const load = () => getDashboardStats().then(setStats).finally(() => setLoading(false));
  useEffect(() => {
    load();
    getLinkedInProfile().then(setLiProfile).catch(() => setLiProfile({ valid: false }));
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    try {
      await syncConnections();
      toast.success('Synchronisation lancée');
      setTimeout(load, 5000);
    } catch (err) { toast.error(err.response?.data?.detail || 'Erreur'); }
    finally { setSyncing(false); }
  };

  if (loading) {
    return (
      <PageWrapper>
        <div className="flex justify-center py-20">
          <Loader2 size={28} className="spin" style={{ color: 'hsl(var(--accent))' }} />
        </div>
      </PageWrapper>
    );
  }

  const campaigns = [...(stats?.recent_campaigns || [])].sort((a, b) => {
    const fin = ['completed', 'cancelled', 'failed'];
    return (fin.includes(a.status) ? 1 : 0) - (fin.includes(b.status) ? 1 : 0);
  });

  return (
    <PageWrapper>
      <Hero
        user={user}
        stats={stats}
        onRefresh={handleSync}
        onNewCRM={() => navigate('/dashboard/crms')}
        onNewCampaign={() => navigate('/dashboard/campaigns')}
        syncing={syncing}
      />

      <AccountHealth stats={stats} liProfile={liProfile} />

      <KPICards stats={stats} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        <CampaignsBlock
          campaigns={campaigns}
          onOpen={(c) => navigate(`/dashboard/campaigns/${c.id}`)}
          onViewAll={() => navigate('/dashboard/campaigns')}
        />
        <ActivityBlock
          actions={stats?.recent_actions || []}
          onViewAll={() => navigate('/dashboard/campaigns')}
        />
      </div>
    </PageWrapper>
  );
}

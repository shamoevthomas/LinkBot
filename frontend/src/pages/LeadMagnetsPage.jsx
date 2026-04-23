import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Magnet, Plus, Play, Pause, Square, Trash2, Loader2,
  MessageCircle, UserPlus, Eye, ExternalLink, Sparkles, Check,
} from 'lucide-react';
import toast from 'react-hot-toast';
import PageWrapper from '../components/layout/PageWrapper';
import Modal from '../components/ui/Modal';
import {
  getLeadMagnets, createLeadMagnet, startLeadMagnet,
  pauseLeadMagnet, cancelLeadMagnet, deleteLeadMagnet,
} from '../api/leadMagnets';

const STATUS_META = {
  pending:   { label: 'En attente', tone: 'slate',   dot: 'slate' },
  running:   { label: 'Actif',      tone: 'emerald', dot: 'emerald' },
  paused:    { label: 'En pause',   tone: 'amber',   dot: 'amber' },
  cancelled: { label: 'Arrêté',     tone: 'rose',    dot: 'rose' },
  failed:    { label: 'Échoué',     tone: 'rose',    dot: 'rose' },
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

function KpiTile({ icon: Ic, label, value, tone }) {
  return (
    <div className="g-card p-4">
      <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-3"
        style={{ background: `hsl(var(--${tone}) / .12)`, color: `hsl(var(--${tone}))` }}>
        <Ic size={15} />
      </div>
      <div className="mono text-[22px] font-semibold tracking-tight" style={{ letterSpacing: '-0.02em', color: 'hsl(var(--text))' }}>
        {value}
      </div>
      <div className="text-[11.5px] mt-0.5" style={{ color: 'hsl(var(--muted))' }}>{label}</div>
    </div>
  );
}

function LeadMagnetCard({ lm, onOpen, onAction }) {
  const meta = STATUS_META[lm.status] || { label: lm.status, tone: 'slate', dot: 'slate' };

  return (
    <div className="g-card p-5 cursor-pointer row-hover relative transition-all"
      onClick={onOpen}
      style={{ overflow: 'hidden' }}>
      {/* Accent rail */}
      <span style={{
        position: 'absolute', left: 0, top: 0, bottom: 0, width: 3,
        background: `hsl(var(--${meta.dot}))`,
        opacity: lm.status === 'running' ? 1 : 0.4,
      }} />

      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'hsl(var(--violet) / .12)', color: 'hsl(var(--violet))' }}>
            <Magnet size={16} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-[15px] font-semibold tracking-tight truncate" style={{ letterSpacing: '-0.01em', color: 'hsl(var(--text))' }}>
                {lm.name}
              </h3>
              <span className={`chip ${meta.tone}`} style={{ fontSize: 10.5 }}>
                {lm.status === 'running' && <span className="live-dot" style={{ width: 5, height: 5 }} />}
                {meta.label}
              </span>
            </div>
            <a href={lm.post_url} target="_blank" rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 text-[11.5px] truncate max-w-full transition-colors"
              style={{ color: 'hsl(var(--muted))', textDecoration: 'none' }}
              onMouseEnter={(e) => e.currentTarget.style.color = 'hsl(var(--accent))'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'hsl(var(--muted))'}>
              <ExternalLink size={11} />
              <span className="truncate">{lm.post_url.replace(/^https?:\/\/(www\.)?/, '').split('?')[0]}</span>
            </a>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          {lm.status === 'pending' && (
            <button onClick={() => onAction(lm.id, 'start')} className="icon-btn" title="Démarrer">
              <Play size={13} style={{ color: 'hsl(var(--emerald))' }} />
            </button>
          )}
          {lm.status === 'running' && (
            <button onClick={() => onAction(lm.id, 'pause')} className="icon-btn" title="Mettre en pause">
              <Pause size={13} style={{ color: 'hsl(var(--amber))' }} />
            </button>
          )}
          {lm.status === 'paused' && (
            <button onClick={() => onAction(lm.id, 'start')} className="icon-btn" title="Reprendre">
              <Play size={13} style={{ color: 'hsl(var(--emerald))' }} />
            </button>
          )}
          {['running', 'paused'].includes(lm.status) && (
            <button onClick={() => onAction(lm.id, 'cancel')} className="icon-btn" title="Arrêter">
              <Square size={13} style={{ color: 'hsl(var(--rose))' }} />
            </button>
          )}
          {['pending', 'cancelled', 'failed'].includes(lm.status) && (
            <button onClick={() => onAction(lm.id, 'delete')} className="icon-btn" title="Supprimer">
              <Trash2 size={13} style={{ color: 'hsl(var(--rose))' }} />
            </button>
          )}
        </div>
      </div>

      {/* Stats + keyword chips */}
      <div className="flex items-center flex-wrap gap-1.5">
        <span className="chip blue" style={{ fontSize: 10.5 }}>
          <Sparkles size={10} /> {lm.keyword}
        </span>
        <span className="chip slate inline-flex items-center gap-1" style={{ fontSize: 10.5 }}>
          <MessageCircle size={10} /> {lm.total_dm_sent ?? 0} DMs
        </span>
        <span className="chip slate inline-flex items-center gap-1" style={{ fontSize: 10.5 }}>
          <UserPlus size={10} /> {lm.total_connections_sent ?? 0} connexions
        </span>
        <span className="chip slate inline-flex items-center gap-1" style={{ fontSize: 10.5 }}>
          <Eye size={10} /> {lm.total_processed ?? 0} détectés
        </span>
      </div>

      {lm.error_message && (
        <div className="mt-3 text-[11.5px] flex items-start gap-1.5 rounded-lg px-2.5 py-2"
          style={{
            background: 'hsl(var(--rose) / .08)',
            border: '1px solid hsl(var(--rose) / .2)',
            color: 'hsl(var(--rose))',
          }}>
          {lm.error_message}
        </div>
      )}
    </div>
  );
}

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
      toast.success('Lead magnet créé');
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

  const kpis = useMemo(() => {
    const running = items.filter((i) => i.status === 'running').length;
    const dms = items.reduce((s, i) => s + (i.total_dm_sent || 0), 0);
    const connexions = items.reduce((s, i) => s + (i.total_connections_sent || 0), 0);
    const detected = items.reduce((s, i) => s + (i.total_processed || 0), 0);
    return { running, dms, connexions, detected };
  }, [items]);

  return (
    <PageWrapper>
      {/* Header */}
      <div className="flex items-end justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight" style={{ letterSpacing: '-0.02em' }}>Lead Magnets</h1>
          <p className="text-[13.5px] mt-1" style={{ color: 'hsl(var(--muted))' }}>
            Détectez les commentaires déclencheurs et envoyez automatiquement vos ressources.
          </p>
        </div>
        <button onClick={() => setShowCreate(true)} className="cta-btn">
          <Plus size={14} /> Nouveau
        </button>
      </div>

      {/* KPI strip */}
      {items.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <KpiTile icon={Magnet}         label="Lead magnets actifs" value={kpis.running}    tone="violet" />
          <KpiTile icon={Eye}            label="Commentaires détectés" value={kpis.detected} tone="accent" />
          <KpiTile icon={MessageCircle}  label="DMs envoyés"         value={kpis.dms}        tone="emerald" />
          <KpiTile icon={UserPlus}       label="Demandes envoyées"   value={kpis.connexions} tone="amber" />
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 size={22} className="spin" style={{ color: 'hsl(var(--muted))' }} />
        </div>
      ) : items.length === 0 ? (
        <div className="g-card text-center" style={{ padding: '56px 24px' }}>
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: 'hsl(var(--violet) / .12)', color: 'hsl(var(--violet))' }}>
            <Magnet size={24} />
          </div>
          <h3 className="text-[16px] font-semibold mb-1" style={{ letterSpacing: '-0.01em' }}>
            Aucun lead magnet
          </h3>
          <p className="text-[13px] mb-5 max-w-sm mx-auto" style={{ color: 'hsl(var(--muted))' }}>
            Créez un lead magnet pour détecter les commentaires avec votre mot-clé et envoyer automatiquement votre ressource en DM.
          </p>
          <button onClick={() => setShowCreate(true)} className="cta-btn">
            <Plus size={14} /> Créer mon premier lead magnet
          </button>
        </div>
      ) : (
        <div className="grid gap-3">
          {items.map((lm) => (
            <LeadMagnetCard
              key={lm.id}
              lm={lm}
              onOpen={() => navigate(`/dashboard/lead-magnets/${lm.id}`)}
              onAction={handleAction}
            />
          ))}
        </div>
      )}

      {/* Creation modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)}
        title="Nouveau Lead Magnet"
        subtitle="Détectez un mot-clé dans les commentaires d'un post et envoyez automatiquement votre ressource."
        wide>
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="form-label">Nom *</label>
            <input className="input-sm" placeholder="Ex: Guide prospection B2B"
              value={form.name} onChange={(e) => set('name', e.target.value)} />
          </div>

          <div>
            <label className="form-label">URL du post LinkedIn *</label>
            <input className="input-sm mono" style={{ fontSize: 12 }}
              placeholder="https://www.linkedin.com/posts/…"
              value={form.post_url} onChange={(e) => set('post_url', e.target.value)} />
          </div>

          <div>
            <label className="form-label">Mot-clé déclencheur *</label>
            <input className="input-sm" placeholder="guide, interesse, oui…"
              value={form.keyword} onChange={(e) => set('keyword', e.target.value)} />
            <p className="text-[11px] mt-1.5" style={{ color: 'hsl(var(--muted))' }}>
              Déclenche dès que ce mot-clé est présent dans le commentaire (insensible à la casse, même si le reste de la phrase diffère).
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="form-label">Fréquence de vérification</label>
              <select className="input-sm" value={form.check_interval_seconds}
                onChange={(e) => set('check_interval_seconds', Number(e.target.value))}>
                {CHECK_INTERVALS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Intervalle entre actions</label>
              <select className="input-sm" value={form.action_interval_seconds}
                onChange={(e) => set('action_interval_seconds', Number(e.target.value))}>
                {ACTION_INTERVALS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>

          <div style={{ height: 1, background: 'hsl(var(--border))', margin: '4px 0' }} />

          <div>
            <label className="form-label flex items-center gap-1.5">
              <MessageCircle size={11} /> Message DM *
              <span style={{ color: 'hsl(var(--muted))', fontWeight: 400 }}>(envoyé à tous les déclencheurs)</span>
            </label>
            <textarea className="input-sm" rows={3}
              placeholder="Salut {first_name}, voici le lien…"
              value={form.dm_template} onChange={(e) => set('dm_template', e.target.value)} />
            <p className="text-[11px] mt-1.5" style={{ color: 'hsl(var(--muted))' }}>
              Variables disponibles&nbsp;:{' '}
              <span className="mono" style={{ color: 'hsl(var(--accent))' }}>{'{first_name}'}</span>{', '}
              <span className="mono" style={{ color: 'hsl(var(--accent))' }}>{'{last_name}'}</span>{', '}
              <span className="mono" style={{ color: 'hsl(var(--accent))' }}>{'{name}'}</span>
            </p>
          </div>

          <div>
            <label className="form-label">Réponse au commentaire (connecté)</label>
            <textarea className="input-sm" rows={2}
              placeholder="Merci {first_name} ! Je t'envoie ça en DM"
              value={form.reply_template_connected} onChange={(e) => set('reply_template_connected', e.target.value)} />
          </div>

          <div>
            <label className="form-label">Réponse au commentaire (non connecté)</label>
            <textarea className="input-sm" rows={2}
              placeholder="Connectons-nous pour que je puisse te l'envoyer !"
              value={form.reply_template_not_connected} onChange={(e) => set('reply_template_not_connected', e.target.value)} />
          </div>

          <div>
            <label className="form-label">Message de connexion
              <span style={{ color: 'hsl(var(--muted))', fontWeight: 400 }}> (optionnel, 300 car. max)</span>
            </label>
            <textarea className="input-sm" rows={2} maxLength={300}
              placeholder="Salut {first_name}, je t'envoie le document dès qu'on est connectés !"
              value={form.connection_message} onChange={(e) => set('connection_message', e.target.value)} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setShowCreate(false)} className="ghost-btn" disabled={creating}>
              Annuler
            </button>
            <button type="submit" className="cta-btn" disabled={creating}>
              {creating ? <Loader2 size={14} className="spin" /> : <Check size={14} />}
              {creating ? 'Création…' : 'Créer le lead magnet'}
            </button>
          </div>
        </form>
      </Modal>
    </PageWrapper>
  );
}

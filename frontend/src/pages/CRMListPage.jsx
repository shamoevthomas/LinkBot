import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Users, Clock, Trash2, Search, Rocket, Loader2, X } from 'lucide-react';
import { getCRMs, createCRM, deleteCRM } from '../api/crm';
import PageWrapper from '../components/layout/PageWrapper';
import { Chip, Progress, hueFromString } from '../components/ui/atoms';
import toast from 'react-hot-toast';

function CRMCard({ crm, onOpen, onDelete }) {
  const hue = hueFromString(crm.name || '');
  const varName = hue === 'blue' ? 'accent' : hue;
  const contactCount = crm.contact_count ?? crm.count ?? 0;
  const contactedPct = crm.contacted_pct ?? 0;
  const repliedPct = crm.replied_pct ?? 0;
  const campaigns = crm.campaign_count ?? 0;
  const createdAt = crm.created_at ? new Date(crm.created_at).toLocaleDateString('fr-FR') : '';

  return (
    <div className="g-card p-5 cursor-pointer group transition-all row-hover relative overflow-hidden"
      onClick={onOpen}>

      <div className="flex items-start justify-between mb-4">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: `hsl(var(--${varName}) / .12)`, color: `hsl(var(--${varName}))` }}>
          <Users size={17} />
        </div>
        <div className="flex items-center gap-2">
          <div className="text-right">
            <div className="text-[22px] font-semibold leading-none tracking-tight" style={{ letterSpacing: '-0.02em' }}>
              {contactCount.toLocaleString('fr-FR')}
            </div>
            <div className="text-[10.5px] mt-1" style={{ color: 'hsl(var(--muted))' }}>contacts</div>
          </div>
          <button onClick={(e) => { e.stopPropagation(); onDelete(crm); }}
            className="p-1.5 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
            style={{ color: 'hsl(var(--muted))', background: 'transparent', border: 'none', cursor: 'pointer' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'hsl(var(--rose))'; e.currentTarget.style.background = 'hsl(var(--rose) / .08)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'hsl(var(--muted))'; e.currentTarget.style.background = 'transparent'; }}>
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-1">
        <h3 className="text-[15.5px] font-semibold" style={{ letterSpacing: '-0.01em' }}>{crm.name}</h3>
      </div>
      <p className="text-[12px] line-clamp-2 min-h-[32px]" style={{ color: 'hsl(var(--muted))' }}>
        {crm.description || 'Aucune description'}
      </p>

      {contactCount > 0 && (
        <div className="mt-4 mb-3">
          <div className="flex items-baseline justify-between mb-1.5">
            <span className="text-[11px]" style={{ color: 'hsl(var(--muted))' }}>Contactés</span>
            <span className="mono text-[11px]" style={{ color: 'hsl(var(--muted))' }}>
              <b style={{ color: 'hsl(var(--text))', fontWeight: 600 }}>{contactedPct}%</b>
              {repliedPct > 0 && <> · <b style={{ color: 'hsl(var(--emerald))', fontWeight: 600 }}>{repliedPct}%</b> réponse</>}
            </span>
          </div>
          <div className="pbar" style={{ height: 5 }}>
            <span style={{ width: `${contactedPct}%` }} />
          </div>
        </div>
      )}

      <div className="flex items-center justify-between pt-3 border-t" style={{ borderColor: 'hsl(var(--border))' }}>
        <div className="flex items-center gap-3 text-[11px]" style={{ color: 'hsl(var(--muted))' }}>
          <span className="inline-flex items-center gap-1">
            <Clock size={11} />
            <span className="mono">{createdAt}</span>
          </span>
        </div>
        {campaigns > 0 && (
          <div className="flex items-center gap-1 text-[11px]" style={{ color: 'hsl(var(--muted))' }}>
            <Rocket size={11} />
            <span className="mono">{campaigns}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function NewCRMCard({ onClick }) {
  return (
    <button onClick={onClick}
      className="flex flex-col items-center justify-center text-center p-5 transition-all"
      style={{
        border: '1.5px dashed hsl(var(--border-strong))',
        background: 'transparent',
        minHeight: 240,
        color: 'hsl(var(--muted))',
        borderRadius: 18,
        cursor: 'pointer',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'hsl(var(--accent) / .4)';
        e.currentTarget.style.background = 'hsl(var(--accent-soft) / .4)';
        e.currentTarget.style.color = 'hsl(var(--accent))';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'hsl(var(--border-strong))';
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.color = 'hsl(var(--muted))';
      }}>
      <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3"
        style={{ background: 'hsl(var(--accent-soft))', color: 'hsl(var(--accent))' }}>
        <Plus size={18} />
      </div>
      <div className="text-[14px] font-medium" style={{ color: 'hsl(var(--text))' }}>Nouveau CRM</div>
      <div className="text-[11.5px] mt-1" style={{ color: 'hsl(var(--muted))' }}>Liste de contacts LinkedIn</div>
    </button>
  );
}

function CreateCRMModal({ open, onClose, onCreate, creating }) {
  const [form, setForm] = useState({ name: '', description: '' });
  useEffect(() => { if (open) setForm({ name: '', description: '' }); }, [open]);
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'hsl(222 22% 12% / .4)' }}
      onClick={onClose}>
      <div className="g-card w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-[17px] font-semibold">Nouveau CRM</h3>
            <p className="text-[12px] mt-0.5" style={{ color: 'hsl(var(--muted))' }}>
              Créez une liste et organisez vos contacts LinkedIn
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg"
            style={{ color: 'hsl(var(--muted))', background: 'transparent', border: 'none', cursor: 'pointer' }}>
            <X size={16} />
          </button>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); onCreate(form); }} className="space-y-4">
          <div>
            <label className="text-[11.5px] font-medium" style={{ color: 'hsl(var(--muted))' }}>Nom</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Ex: Prospects Q1 2026"
              required autoFocus
              className="mt-1.5 w-full px-3 py-2.5 rounded-xl text-[13.5px] ring-a"
              style={{ border: '1px solid hsl(var(--border-strong))', background: 'hsl(var(--panel))' }} />
          </div>
          <div>
            <label className="text-[11.5px] font-medium" style={{ color: 'hsl(var(--muted))' }}>Description (optionnel)</label>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Ce que contient ce CRM"
              rows={3}
              className="mt-1.5 w-full px-3 py-2.5 rounded-xl text-[13.5px] ring-a"
              style={{ border: '1px solid hsl(var(--border-strong))', background: 'hsl(var(--panel))' }} />
          </div>
          <div className="flex items-center gap-2 mt-6">
            <button type="button" onClick={onClose} className="ghost-btn flex-1">Annuler</button>
            <button type="submit" disabled={creating || !form.name.trim()} className="cta-btn flex-1">
              {creating ? 'Création...' : 'Créer le CRM'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function CRMListPage() {
  const [crms, setCrms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('recent');
  const navigate = useNavigate();

  const load = async () => {
    try { setCrms(await getCRMs()); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const handleCreate = async (form) => {
    setCreating(true);
    try {
      await createCRM(form);
      toast.success('CRM créé avec succès');
      setShowCreate(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erreur');
    } finally { setCreating(false); }
  };

  const handleDelete = async (crm) => {
    if (!window.confirm(`Supprimer "${crm.name}" et tous ses contacts ?`)) return;
    try {
      await deleteCRM(crm.id);
      toast.success('CRM supprimé');
      load();
    } catch { toast.error('Erreur'); }
  };

  const filtered = useMemo(() => {
    const needle = query.toLowerCase();
    let list = crms.filter((c) =>
      !query ||
      (c.name || '').toLowerCase().includes(needle) ||
      (c.description || '').toLowerCase().includes(needle)
    );
    if (sort === 'name') list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === 'size') list = [...list].sort((a, b) => (b.contact_count || 0) - (a.contact_count || 0));
    return list;
  }, [crms, query, sort]);

  const totalContacts = crms.reduce((s, c) => s + (c.contact_count || 0), 0);
  const activeCampaigns = crms.reduce((s, c) => s + (c.campaign_count || 0), 0);

  return (
    <PageWrapper>
      <div className="flex items-end justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight" style={{ letterSpacing: '-0.02em' }}>CRM</h1>
          <p className="text-[13.5px] mt-1" style={{ color: 'hsl(var(--muted))' }}>
            Gérez vos listes de contacts LinkedIn —{' '}
            <b style={{ color: 'hsl(var(--text))', fontWeight: 600 }}>{crms.length}</b> liste{crms.length > 1 ? 's' : ''},{' '}
            <b style={{ color: 'hsl(var(--text))', fontWeight: 600 }}>{totalContacts.toLocaleString('fr-FR')}</b> contacts
            {activeCampaigns > 0 && (<>
              ,{' '}<b style={{ color: 'hsl(var(--accent))', fontWeight: 600 }}>{activeCampaigns}</b> campagne{activeCampaigns > 1 ? 's' : ''}
            </>)}
          </p>
        </div>
        <button onClick={() => setShowCreate(true)} className="cta-btn">
          <Plus size={14} /> Nouveau CRM
        </button>
      </div>

      {crms.length > 0 && (
        <div className="g-card p-3 mb-5 flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'hsl(var(--muted))' }} />
            <input value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher un CRM…"
              className="w-full ring-a"
              style={{
                padding: '8px 12px 8px 36px',
                borderRadius: 10, fontSize: 13,
                border: '1px solid hsl(var(--border))',
                background: 'hsl(220 22% 98%)',
              }} />
          </div>
          <select value={sort} onChange={(e) => setSort(e.target.value)}
            className="ring-a cursor-pointer"
            style={{
              padding: '8px 12px', borderRadius: 10, fontSize: 12.5,
              border: '1px solid hsl(var(--border))', background: 'hsl(var(--panel))',
            }}>
            <option value="recent">Plus récent</option>
            <option value="name">A → Z</option>
            <option value="size">Taille</option>
          </select>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 size={28} className="spin" style={{ color: 'hsl(var(--accent))' }} />
        </div>
      ) : crms.length === 0 ? (
        <div className="g-card p-16 text-center">
          <div className="w-14 h-14 rounded-2xl mx-auto mb-3 flex items-center justify-center"
            style={{ background: 'hsl(var(--accent-soft))', color: 'hsl(var(--accent))' }}>
            <Users size={20} />
          </div>
          <div className="text-[15px] font-medium">Aucun CRM</div>
          <div className="text-[12.5px] mt-1 mb-5" style={{ color: 'hsl(var(--muted))' }}>
            Créez votre premier CRM pour commencer à organiser vos contacts.
          </div>
          <button onClick={() => setShowCreate(true)} className="cta-btn inline-flex">
            <Plus size={14} /> Créer un CRM
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="g-card p-12 text-center">
          <div className="w-12 h-12 rounded-xl mx-auto mb-3 flex items-center justify-center"
            style={{ background: 'hsl(220 20% 96%)', color: 'hsl(var(--muted))' }}>
            <Search size={18} />
          </div>
          <div className="text-[14px] font-medium">Aucun CRM trouvé</div>
          <div className="text-[12px] mt-1" style={{ color: 'hsl(var(--muted))' }}>Essayez un autre mot-clé.</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((crm) => (
            <CRMCard key={crm.id} crm={crm}
              onOpen={() => navigate(`/dashboard/crm/${crm.id}`)}
              onDelete={handleDelete} />
          ))}
          <NewCRMCard onClick={() => setShowCreate(true)} />
        </div>
      )}

      <CreateCRMModal open={showCreate} onClose={() => setShowCreate(false)} onCreate={handleCreate} creating={creating} />
    </PageWrapper>
  );
}

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Users, Clock, Trash2 } from 'lucide-react';
import { getCRMs, createCRM, deleteCRM } from '../api/crm';
import PageWrapper from '../components/layout/PageWrapper';
import Modal from '../components/ui/Modal';
import toast from 'react-hot-toast';

export default function CRMListPage() {
  const [crms, setCrms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', description: '' });
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();

  const load = async () => {
    try {
      setCrms(await getCRMs());
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setCreating(true);
    try {
      await createCRM(form);
      toast.success('CRM créé avec succès');
      setShowCreate(false);
      setForm({ name: '', description: '' });
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erreur');
    } finally { setCreating(false); }
  };

  return (
    <PageWrapper>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="f" style={{ fontWeight: 700, fontSize: 24, color: 'var(--text)' }}>CRM</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text2)' }}>Gérez vos listes de contacts LinkedIn</p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="cta-btn flex items-center gap-2" style={{ padding: '10px 16px', fontSize: 14 }}>
          <Plus size={18} /> Nouveau CRM
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--blue)', borderTopColor: 'transparent' }} />
        </div>
      ) : crms.length === 0 ? (
        <div className="g-card text-center py-20">
          <Users size={48} className="text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium mb-2" style={{ color: 'var(--text)' }}>Aucun CRM</h3>
          <p className="text-sm mb-6" style={{ color: 'var(--text2)' }}>Créez votre premier CRM pour commencer à organiser vos contacts</p>
          <button onClick={() => setShowCreate(true)}
            className="cta-btn inline-flex items-center gap-2" style={{ padding: '10px 20px', fontSize: 14 }}>
            <Plus size={18} /> Créer un CRM
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {crms.map((crm) => (
            <div key={crm.id} onClick={() => navigate(`/dashboard/crm/${crm.id}`)}
              className="g-card p-5 cursor-pointer group">
              <div className="flex items-start justify-between mb-4">
                <div className="w-11 h-11 rounded-lg flex items-center justify-center transition-colors" style={{ background: 'rgba(0,132,255,0.08)' }}>
                  <Users size={22} style={{ color: 'var(--blue)' }} />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold" style={{ color: 'var(--text)' }}>{crm.contact_count}</span>
                  <button onClick={(e) => {
                    e.stopPropagation();
                    if (!confirm(`Supprimer "${crm.name}" et tous ses contacts ?`)) return;
                    deleteCRM(crm.id).then(() => { toast.success('CRM supprime'); load(); }).catch(() => toast.error('Erreur'));
                  }} className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
              <h3 className="text-lg font-semibold mb-1" style={{ color: 'var(--text)' }}>{crm.name}</h3>
              {crm.description && <p className="text-sm mb-3 line-clamp-2" style={{ color: 'var(--text2)' }}>{crm.description}</p>}
              <div className="flex items-center gap-1 text-xs" style={{ color: 'var(--text3)' }}>
                <Clock size={12} />
                {new Date(crm.created_at).toLocaleDateString('fr-FR')}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Nouveau CRM">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nom</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="input-glass w-full"
              placeholder="Ex: Prospects Q1 2026" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description (optionnel)</label>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="input-glass w-full"
              rows={2} placeholder="Description..." />
          </div>
          <button type="submit" disabled={creating}
            className="cta-btn w-full disabled:opacity-50" style={{ padding: '10px 20px', fontSize: 14 }}>
            {creating ? 'Création...' : 'Créer le CRM'}
          </button>
        </form>
      </Modal>
    </PageWrapper>
  );
}

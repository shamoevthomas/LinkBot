import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Users, Clock } from 'lucide-react';
import { getCRMs, createCRM } from '../api/crm';
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
          <h1 className="text-2xl font-bold text-gray-900">CRM</h1>
          <p className="text-gray-500 text-sm mt-1">Gérez vos listes de contacts LinkedIn</p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="px-4 py-2.5 bg-linkedin text-white font-medium rounded-lg text-sm hover:bg-linkedin-dark transition-colors flex items-center gap-2">
          <Plus size={18} /> Nouveau CRM
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-linkedin border-t-transparent rounded-full animate-spin" />
        </div>
      ) : crms.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-2xl border border-gray-200">
          <Users size={48} className="text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Aucun CRM</h3>
          <p className="text-gray-500 text-sm mb-6">Créez votre premier CRM pour commencer à organiser vos contacts</p>
          <button onClick={() => setShowCreate(true)}
            className="px-5 py-2.5 bg-linkedin text-white font-medium rounded-lg text-sm hover:bg-linkedin-dark transition-colors inline-flex items-center gap-2">
            <Plus size={18} /> Créer un CRM
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {crms.map((crm) => (
            <div key={crm.id} onClick={() => navigate(`/dashboard/crm/${crm.id}`)}
              className="bg-white rounded-xl border border-gray-200 p-5 cursor-pointer hover:shadow-md hover:border-linkedin/30 transition-all group">
              <div className="flex items-start justify-between mb-4">
                <div className="w-11 h-11 bg-linkedin-light rounded-lg flex items-center justify-center group-hover:bg-linkedin/10 transition-colors">
                  <Users size={22} className="text-linkedin" />
                </div>
                <span className="text-2xl font-bold text-gray-900">{crm.contact_count}</span>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-1">{crm.name}</h3>
              {crm.description && <p className="text-sm text-gray-500 mb-3 line-clamp-2">{crm.description}</p>}
              <div className="flex items-center gap-1 text-xs text-gray-400">
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
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-linkedin focus:border-transparent"
              placeholder="Ex: Prospects Q1 2026" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description (optionnel)</label>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-linkedin focus:border-transparent"
              rows={2} placeholder="Description..." />
          </div>
          <button type="submit" disabled={creating}
            className="w-full py-2.5 bg-linkedin text-white font-semibold rounded-lg text-sm hover:bg-linkedin-dark transition-colors disabled:opacity-50">
            {creating ? 'Création...' : 'Créer le CRM'}
          </button>
        </form>
      </Modal>
    </PageWrapper>
  );
}

import { useState } from 'react';
import { Loader2, Upload, ChevronRight, ChevronLeft, HelpCircle, Users, Check } from 'lucide-react';
import { submitOnboarding } from '../api/user';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

const JOB_ROLES = ['Sales', 'Marketing', 'Recrutement', 'Business Development', 'Founder / CEO', 'Consultant', 'Autre'];
const REASONS = ['Génération de leads', 'Networking', 'Recrutement', 'Prospection commerciale', 'Personal branding', 'Autre'];

export default function OnboardingWizard() {
  const { refreshUser } = useAuth();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [importNetwork, setImportNetwork] = useState(true);
  const [form, setForm] = useState({
    first_name: '', last_name: '', job_role: '', reason_for_using: '',
    linkedin_profile_url: '', li_at: '', jsessionid: '', profile_picture: null,
  });
  const [preview, setPreview] = useState(null);

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      set('profile_picture', file);
      setPreview(URL.createObjectURL(file));
    }
  };

  const canStep2 = form.first_name && form.last_name && form.job_role && form.reason_for_using;
  const canStep3 = form.li_at && form.jsessionid;

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => { if (v) fd.append(k, v); });
      fd.append('import_network', importNetwork ? 'true' : 'false');
      await submitOnboarding(fd);
      toast.success(importNetwork
        ? 'Configuration terminée ! Import du réseau en cours...'
        : 'Configuration terminée !');
      await refreshUser();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erreur lors de la configuration');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-linkedin to-linkedin-dark px-6 py-5">
          <h2 className="text-xl font-bold text-white">Configuration de votre compte</h2>
          <div className="flex items-center gap-2 mt-3">
            {[1, 2, 3].map((s) => (
              <div key={s} className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                  step >= s ? 'bg-white text-linkedin' : 'bg-white/30 text-white'
                }`}>
                  {step > s ? <Check size={16} /> : s}
                </div>
                {s < 3 && <div className={`w-12 h-0.5 ${step > s ? 'bg-white' : 'bg-white/30'}`} />}
              </div>
            ))}
          </div>
        </div>

        <div className="p-6">
          {step === 1 && (
            <div className="space-y-4">
              {/* Photo */}
              <div className="flex justify-center">
                <label className="cursor-pointer">
                  <input type="file" accept="image/*" className="hidden" onChange={handleFile} />
                  {preview ? (
                    <img src={preview} alt="Photo" className="w-20 h-20 rounded-full object-cover border-2 border-linkedin" />
                  ) : (
                    <div className="w-20 h-20 rounded-full bg-gray-100 border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-400 hover:border-linkedin hover:text-linkedin transition-colors">
                      <Upload size={20} />
                      <span className="text-[10px] mt-1">Photo</span>
                    </div>
                  )}
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Prénom</label>
                  <input value={form.first_name} onChange={(e) => set('first_name', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-linkedin focus:border-transparent" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nom</label>
                  <input value={form.last_name} onChange={(e) => set('last_name', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-linkedin focus:border-transparent" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Votre rôle</label>
                <select value={form.job_role} onChange={(e) => set('job_role', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-linkedin focus:border-transparent bg-white">
                  <option value="">Sélectionner...</option>
                  {JOB_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Pourquoi utiliser LinkBot ?</label>
                <select value={form.reason_for_using} onChange={(e) => set('reason_for_using', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-linkedin focus:border-transparent bg-white">
                  <option value="">Sélectionner...</option>
                  {REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">URL de votre profil LinkedIn</label>
                <input value={form.linkedin_profile_url} onChange={(e) => set('linkedin_profile_url', e.target.value)}
                  placeholder="https://linkedin.com/in/votre-profil"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-linkedin focus:border-transparent" />
              </div>

              <button onClick={() => setStep(2)} disabled={!canStep2}
                className="w-full py-2.5 bg-linkedin text-white font-semibold rounded-lg text-sm hover:bg-linkedin-dark transition-colors disabled:opacity-40 flex items-center justify-center gap-2">
                Suivant <ChevronRight size={18} />
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-medium text-gray-700">Cookie li_at</label>
                  <button onClick={() => setShowHelp(!showHelp)} className="text-xs text-linkedin flex items-center gap-1 hover:underline">
                    <HelpCircle size={14} /> Comment trouver ?
                  </button>
                </div>
                {showHelp && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-2 text-xs text-blue-800 space-y-1">
                    <p><strong>1.</strong> Ouvrez LinkedIn dans Chrome</p>
                    <p><strong>2.</strong> Appuyez sur F12 (DevTools) → onglet Application</p>
                    <p><strong>3.</strong> Dans Cookies → linkedin.com, cherchez <code className="bg-blue-100 px-1 rounded">li_at</code></p>
                    <p><strong>4.</strong> Copiez la valeur complète</p>
                    <p><strong>5.</strong> Faites la même chose pour <code className="bg-blue-100 px-1 rounded">JSESSIONID</code></p>
                  </div>
                )}
                <textarea value={form.li_at} onChange={(e) => set('li_at', e.target.value)}
                  rows={2} placeholder="Collez votre cookie li_at ici..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-linkedin focus:border-transparent font-mono text-xs" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">JSESSIONID</label>
                <textarea value={form.jsessionid} onChange={(e) => set('jsessionid', e.target.value)}
                  rows={2} placeholder="Collez votre JSESSIONID ici..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-linkedin focus:border-transparent font-mono text-xs" />
              </div>

              <div className="flex gap-3">
                <button onClick={() => setStep(1)}
                  className="flex-1 py-2.5 border border-gray-300 text-gray-700 font-semibold rounded-lg text-sm hover:bg-gray-50 transition-colors flex items-center justify-center gap-2">
                  <ChevronLeft size={18} /> Retour
                </button>
                <button onClick={() => setStep(3)} disabled={!canStep3}
                  className="flex-1 py-2.5 bg-linkedin text-white font-semibold rounded-lg text-sm hover:bg-linkedin-dark transition-colors disabled:opacity-40 flex items-center justify-center gap-2">
                  Suivant <ChevronRight size={18} />
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-3">
                  <Users size={28} className="text-linkedin" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">Importer votre réseau</h3>
                <p className="text-sm text-gray-500 mt-1">
                  Importez toutes vos connexions LinkedIn dans un CRM dédié.
                  Les nouvelles connexions seront ajoutées automatiquement.
                </p>
              </div>

              <label className="flex items-center gap-4 p-4 bg-blue-50 border-2 border-blue-200 rounded-xl cursor-pointer hover:bg-blue-100 transition-colors">
                <input type="checkbox" checked={importNetwork} onChange={(e) => setImportNetwork(e.target.checked)}
                  className="w-5 h-5 text-linkedin rounded-lg" />
                <div className="flex-1">
                  <span className="text-sm font-semibold text-blue-800">Importer mon réseau LinkedIn</span>
                  <p className="text-xs text-blue-600 mt-0.5">
                    Un CRM "Mon Réseau" sera créé avec toutes vos connexions. Synchronisation automatique toutes les 6h.
                  </p>
                </div>
                <Users size={20} className="text-blue-400" />
              </label>

              <p className="text-xs text-gray-400 text-center">
                Cette étape est optionnelle. Vous pourrez toujours importer votre réseau plus tard depuis la Configuration.
              </p>

              <div className="flex gap-3">
                <button onClick={() => setStep(2)}
                  className="flex-1 py-2.5 border border-gray-300 text-gray-700 font-semibold rounded-lg text-sm hover:bg-gray-50 transition-colors flex items-center justify-center gap-2">
                  <ChevronLeft size={18} /> Retour
                </button>
                <button onClick={handleSubmit} disabled={loading}
                  className="flex-1 py-2.5 bg-linkedin text-white font-semibold rounded-lg text-sm hover:bg-linkedin-dark transition-colors disabled:opacity-40 flex items-center justify-center gap-2">
                  {loading ? <Loader2 size={18} className="animate-spin" /> : null}
                  {loading ? 'Validation...' : 'Terminer'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

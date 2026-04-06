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
      await submitOnboarding(fd);
      toast.success('Configuration terminée ! Import du réseau en cours...');
      await refreshUser();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erreur lors de la configuration');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}>
      <div className="g-card w-full max-w-lg overflow-hidden" style={{ borderRadius: '20px', padding: 0 }}>
        {/* Header */}
        <div style={{ background: 'linear-gradient(135deg, var(--blue), rgba(0,132,255,0.8))', padding: '20px 24px' }}>
          <h2 className="f" style={{ fontSize: '1.25rem', fontWeight: 700, color: '#fff' }}>Configuration de votre compte</h2>
          <div className="flex items-center gap-2 mt-3">
            {[1, 2, 3].map((s) => (
              <div key={s} className="flex items-center gap-2">
                <div className="flex items-center justify-center text-sm font-bold" style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: step >= s ? '#fff' : 'rgba(255,255,255,0.3)',
                  color: step >= s ? 'var(--blue)' : '#fff',
                }}>
                  {step > s ? <Check size={16} /> : s}
                </div>
                {s < 3 && <div style={{ width: '48px', height: '2px', background: step > s ? '#fff' : 'rgba(255,255,255,0.3)' }} />}
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
                    <img src={preview} alt="Photo" className="w-20 h-20 rounded-full object-cover" style={{ border: '2px solid var(--blue)' }} />
                  ) : (
                    <div className="w-20 h-20 rounded-full bg-gray-100 flex flex-col items-center justify-center text-gray-400 transition-colors" style={{ border: '2px dashed var(--card-bdr)' }}>
                      <Upload size={20} />
                      <span className="text-[10px] mt-1">Photo</span>
                    </div>
                  )}
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text2)' }}>Prénom</label>
                  <input value={form.first_name} onChange={(e) => set('first_name', e.target.value)}
                    className="input-glass" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text2)' }}>Nom</label>
                  <input value={form.last_name} onChange={(e) => set('last_name', e.target.value)}
                    className="input-glass" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text2)' }}>Votre rôle</label>
                <select value={form.job_role} onChange={(e) => set('job_role', e.target.value)}
                  className="input-glass">
                  <option value="">Sélectionner...</option>
                  {JOB_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text2)' }}>Pourquoi utiliser LinkBot ?</label>
                <select value={form.reason_for_using} onChange={(e) => set('reason_for_using', e.target.value)}
                  className="input-glass">
                  <option value="">Sélectionner...</option>
                  {REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text2)' }}>URL de votre profil LinkedIn</label>
                <input value={form.linkedin_profile_url} onChange={(e) => set('linkedin_profile_url', e.target.value)}
                  placeholder="https://linkedin.com/in/votre-profil"
                  className="input-glass" />
              </div>

              <button onClick={() => setStep(2)} disabled={!canStep2}
                className="cta-btn w-full flex items-center justify-center gap-2 disabled:opacity-40"
                style={{ padding: '10px 16px', fontSize: '14px' }}>
                Suivant <ChevronRight size={18} />
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-medium" style={{ color: 'var(--text2)' }}>Cookie li_at</label>
                  <button onClick={() => setShowHelp(!showHelp)} className="text-xs flex items-center gap-1 hover:underline" style={{ color: 'var(--blue)' }}>
                    <HelpCircle size={14} /> Comment trouver ?
                  </button>
                </div>
                {showHelp && (
                  <div className="rounded-lg p-3 mb-2 text-xs space-y-1" style={{ background: 'rgba(0,132,255,0.08)', border: '1px solid rgba(0,132,255,0.15)', color: 'var(--text)' }}>
                    <p><strong>1.</strong> Ouvrez LinkedIn dans Chrome</p>
                    <p><strong>2.</strong> Appuyez sur F12 (DevTools) → onglet Application</p>
                    <p><strong>3.</strong> Dans Cookies → linkedin.com, cherchez <code style={{ background: 'rgba(0,132,255,0.1)', padding: '1px 4px', borderRadius: '4px' }}>li_at</code></p>
                    <p><strong>4.</strong> Copiez la valeur complète</p>
                    <p><strong>5.</strong> Faites la même chose pour <code style={{ background: 'rgba(0,132,255,0.1)', padding: '1px 4px', borderRadius: '4px' }}>JSESSIONID</code></p>
                  </div>
                )}
                <textarea value={form.li_at} onChange={(e) => set('li_at', e.target.value)}
                  rows={2} placeholder="Collez votre cookie li_at ici..."
                  className="input-glass" style={{ fontFamily: 'monospace', fontSize: '12px' }} />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text2)' }}>JSESSIONID</label>
                <textarea value={form.jsessionid} onChange={(e) => set('jsessionid', e.target.value)}
                  rows={2} placeholder="Collez votre JSESSIONID ici..."
                  className="input-glass" style={{ fontFamily: 'monospace', fontSize: '12px' }} />
              </div>

              <div className="flex gap-3">
                <button onClick={() => setStep(1)}
                  className="flex-1 flex items-center justify-center gap-2 font-semibold rounded-xl text-sm transition-colors"
                  style={{ padding: '10px 16px', border: '1px solid var(--card-bdr)', color: 'var(--text2)', background: '#fff' }}>
                  <ChevronLeft size={18} /> Retour
                </button>
                <button onClick={() => setStep(3)} disabled={!canStep3}
                  className="cta-btn flex-1 flex items-center justify-center gap-2 disabled:opacity-40"
                  style={{ padding: '10px 16px', fontSize: '14px' }}>
                  Suivant <ChevronRight size={18} />
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <div className="text-center">
                <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3" style={{ background: 'rgba(0,132,255,0.08)' }}>
                  <Users size={28} style={{ color: 'var(--blue)' }} />
                </div>
                <h3 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Import de votre réseau</h3>
                <p className="text-sm mt-1" style={{ color: 'var(--text3)' }}>
                  Toutes vos connexions LinkedIn seront importées dans le CRM "Mon Réseau".
                  Les nouvelles connexions seront synchronisées automatiquement toutes les 6h.
                </p>
              </div>

              <div className="flex items-center gap-4 p-4 rounded-xl" style={{ background: 'rgba(0,132,255,0.06)', border: '2px solid rgba(0,132,255,0.18)' }}>
                <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ background: 'rgba(0,132,255,0.12)' }}>
                  <Check size={20} style={{ color: 'var(--blue)' }} />
                </div>
                <div className="flex-1">
                  <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Import automatique activé</span>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text2)' }}>
                    Vos connexions seront importées dès la fin de la configuration.
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <button onClick={() => setStep(2)}
                  className="flex-1 flex items-center justify-center gap-2 font-semibold rounded-xl text-sm transition-colors"
                  style={{ padding: '10px 16px', border: '1px solid var(--card-bdr)', color: 'var(--text2)', background: '#fff' }}>
                  <ChevronLeft size={18} /> Retour
                </button>
                <button onClick={handleSubmit} disabled={loading}
                  className="cta-btn flex-1 flex items-center justify-center gap-2 disabled:opacity-40"
                  style={{ padding: '10px 16px', fontSize: '14px' }}>
                  {loading ? <Loader2 size={18} className="animate-spin" /> : null}
                  {loading ? 'Import en cours...' : 'Lancer l\'import'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

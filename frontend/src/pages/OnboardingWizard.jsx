import { useState } from 'react';
import { Loader2, Upload, ChevronRight, ChevronLeft, HelpCircle, Users, Check, Link, Shield, Sparkles, Key, ExternalLink } from 'lucide-react';
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
  const [wantAI, setWantAI] = useState(false);
  const [form, setForm] = useState({
    first_name: '', last_name: '', job_role: '', reason_for_using: '',
    linkedin_profile_url: '', li_at: '', jsessionid: '', gemini_api_key: '', profile_picture: null,
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
  const canStep4 = !wantAI || form.gemini_api_key;

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

  const stepLabels = ['Profil', 'LinkedIn', 'IA', 'Import'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'linear-gradient(135deg, rgba(0,20,40,0.7) 0%, rgba(0,80,180,0.4) 100%)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
      <div className="w-full max-w-lg overflow-hidden" style={{
        borderRadius: '24px',
        background: '#fff',
        boxShadow: '0 25px 60px rgba(0,0,0,0.25), 0 0 0 1px rgba(255,255,255,0.1)',
      }}>
        {/* Header */}
        <div style={{
          background: 'linear-gradient(135deg, #0066FF 0%, #0084FF 50%, #00A3FF 100%)',
          padding: '28px 28px 24px',
          position: 'relative',
          overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', top: '-30px', right: '-30px', width: '120px', height: '120px',
            borderRadius: '50%', background: 'rgba(255,255,255,0.1)',
          }} />
          <div style={{
            position: 'absolute', bottom: '-20px', left: '40%', width: '80px', height: '80px',
            borderRadius: '50%', background: 'rgba(255,255,255,0.06)',
          }} />

          <div className="flex items-center gap-3 mb-5" style={{ position: 'relative' }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.2)' }}>
              <Link size={20} className="text-white" />
            </div>
            <div>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#fff', lineHeight: 1.2 }}>Bienvenue sur LinkBot</h2>
              <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>Configurez votre compte en 4 étapes</p>
            </div>
          </div>

          {/* Step indicators */}
          <div className="flex items-center gap-3" style={{ position: 'relative' }}>
            {[1, 2, 3, 4].map((s) => (
              <div key={s} className="flex items-center gap-3" style={{ flex: s < 4 ? 1 : 'none' }}>
                <div className="flex items-center gap-2">
                  <div className="flex items-center justify-center text-xs font-bold" style={{
                    width: '28px', height: '28px', borderRadius: '50%',
                    background: step >= s ? '#fff' : 'rgba(255,255,255,0.2)',
                    color: step >= s ? '#0066FF' : 'rgba(255,255,255,0.6)',
                    transition: 'all 0.3s ease',
                  }}>
                    {step > s ? <Check size={14} strokeWidth={3} /> : s}
                  </div>
                  <span className="text-xs font-medium hidden sm:block" style={{
                    color: step >= s ? '#fff' : 'rgba(255,255,255,0.5)',
                  }}>{stepLabels[s - 1]}</span>
                </div>
                {s < 4 && (
                  <div style={{
                    flex: 1, height: '2px', borderRadius: '1px',
                    background: step > s ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.15)',
                    transition: 'all 0.3s ease',
                  }} />
                )}
              </div>
            ))}
          </div>
        </div>

        <div style={{ padding: '28px' }}>
          {step === 1 && (
            <div className="space-y-5">
              {/* Photo */}
              <div className="flex justify-center">
                <label className="cursor-pointer group">
                  <input type="file" accept="image/*" className="hidden" onChange={handleFile} />
                  {preview ? (
                    <div style={{ position: 'relative' }}>
                      <img src={preview} alt="Photo" className="w-24 h-24 rounded-full object-cover"
                        style={{ border: '3px solid var(--blue)', boxShadow: '0 4px 12px rgba(0,132,255,0.25)' }} />
                      <div className="absolute inset-0 rounded-full flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Upload size={20} className="text-white" />
                      </div>
                    </div>
                  ) : (
                    <div className="w-24 h-24 rounded-full flex flex-col items-center justify-center transition-all group-hover:border-blue-300 group-hover:bg-blue-50"
                      style={{ border: '2px dashed #d1d5db', background: '#f9fafb' }}>
                      <Upload size={22} className="text-gray-400 group-hover:text-blue-400 transition-colors" />
                      <span className="text-[10px] mt-1.5 text-gray-400 group-hover:text-blue-400 transition-colors font-medium">Ajouter</span>
                    </div>
                  )}
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text2)' }}>Prénom</label>
                  <input value={form.first_name} onChange={(e) => set('first_name', e.target.value)}
                    className="input-glass" placeholder="Thomas" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text2)' }}>Nom</label>
                  <input value={form.last_name} onChange={(e) => set('last_name', e.target.value)}
                    className="input-glass" placeholder="Dupont" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text2)' }}>Votre rôle</label>
                <select value={form.job_role} onChange={(e) => set('job_role', e.target.value)}
                  className="input-glass">
                  <option value="">Sélectionner...</option>
                  {JOB_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text2)' }}>Pourquoi utiliser LinkBot ?</label>
                <select value={form.reason_for_using} onChange={(e) => set('reason_for_using', e.target.value)}
                  className="input-glass">
                  <option value="">Sélectionner...</option>
                  {REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text2)' }}>URL de votre profil LinkedIn</label>
                <input value={form.linkedin_profile_url} onChange={(e) => set('linkedin_profile_url', e.target.value)}
                  placeholder="https://linkedin.com/in/votre-profil"
                  className="input-glass" />
              </div>

              <button onClick={() => setStep(2)} disabled={!canStep2}
                className="cta-btn w-full flex items-center justify-center gap-2 disabled:opacity-40"
                style={{ padding: '12px 16px', fontSize: '14px', borderRadius: '14px' }}>
                Suivant <ChevronRight size={18} />
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'rgba(0,132,255,0.06)', border: '1px solid rgba(0,132,255,0.12)' }}>
                <Shield size={18} style={{ color: 'var(--blue)', flexShrink: 0 }} />
                <p className="text-xs" style={{ color: 'var(--text2)' }}>
                  Vos cookies sont stockés de manière sécurisée et ne sont jamais partagés.
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm font-medium" style={{ color: 'var(--text2)' }}>Cookie li_at</label>
                  <button onClick={() => setShowHelp(!showHelp)} className="text-xs flex items-center gap-1 hover:underline" style={{ color: 'var(--blue)' }}>
                    <HelpCircle size={14} /> {showHelp ? 'Masquer' : 'Comment trouver ?'}
                  </button>
                </div>
                {showHelp && (
                  <div className="rounded-xl p-4 mb-3 text-xs space-y-2" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                    <p className="font-semibold" style={{ color: 'var(--text)', fontSize: '0.8rem' }}>Comment récupérer vos cookies :</p>
                    <div className="space-y-1.5" style={{ color: 'var(--text2)' }}>
                      <p><span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 text-blue-600 text-[10px] font-bold mr-1.5">1</span>Ouvrez LinkedIn dans Chrome</p>
                      <p><span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 text-blue-600 text-[10px] font-bold mr-1.5">2</span>Appuyez sur <code className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-700">F12</code> → onglet <strong>Application</strong></p>
                      <p><span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 text-blue-600 text-[10px] font-bold mr-1.5">3</span>Dans Cookies → linkedin.com, cherchez <code className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">li_at</code></p>
                      <p><span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 text-blue-600 text-[10px] font-bold mr-1.5">4</span>Copiez la valeur complète</p>
                      <p><span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 text-blue-600 text-[10px] font-bold mr-1.5">5</span>Faites la même chose pour <code className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">JSESSIONID</code></p>
                    </div>
                  </div>
                )}
                <textarea value={form.li_at} onChange={(e) => set('li_at', e.target.value)}
                  rows={2} placeholder="Collez votre cookie li_at ici..."
                  className="input-glass" style={{ fontFamily: 'monospace', fontSize: '12px' }} />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text2)' }}>JSESSIONID</label>
                <textarea value={form.jsessionid} onChange={(e) => set('jsessionid', e.target.value)}
                  rows={2} placeholder='Collez votre JSESSIONID ici (avec les guillemets "ajax:...")'
                  className="input-glass" style={{ fontFamily: 'monospace', fontSize: '12px' }} />
              </div>

              <div className="flex gap-3">
                <button onClick={() => setStep(1)}
                  className="flex-1 flex items-center justify-center gap-2 font-semibold rounded-xl text-sm transition-all hover:bg-gray-50"
                  style={{ padding: '12px 16px', border: '1px solid #e2e8f0', color: 'var(--text2)', background: '#fff', borderRadius: '14px' }}>
                  <ChevronLeft size={18} /> Retour
                </button>
                <button onClick={() => setStep(3)} disabled={!canStep3}
                  className="cta-btn flex-1 flex items-center justify-center gap-2 disabled:opacity-40"
                  style={{ padding: '12px 16px', fontSize: '14px', borderRadius: '14px' }}>
                  Suivant <ChevronRight size={18} />
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <div className="text-center py-2">
                <div className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{
                  background: 'linear-gradient(135deg, rgba(168,85,247,0.1) 0%, rgba(168,85,247,0.05) 100%)',
                  border: '2px solid rgba(168,85,247,0.15)',
                }}>
                  <Key size={32} style={{ color: '#a855f7' }} />
                </div>
                <h3 className="text-lg font-bold" style={{ color: 'var(--text)' }}>Messages 100% personnalisés par IA</h3>
                <p className="text-sm mt-2 mx-4" style={{ color: 'var(--text3)', lineHeight: 1.6 }}>
                  Chaque message sera unique, généré par l'IA en fonction du profil LinkedIn de chaque contact.
                </p>
              </div>

              <div className="flex items-center gap-3 p-3.5 rounded-xl cursor-pointer" onClick={() => { setWantAI(!wantAI); if (wantAI) set('gemini_api_key', ''); }}
                style={{ background: wantAI ? 'rgba(168,85,247,0.06)' : '#f9fafb', border: wantAI ? '2px solid rgba(168,85,247,0.3)' : '2px solid #e5e7eb', transition: 'all 0.2s ease' }}>
                <div className="flex items-center justify-center w-5 h-5 rounded-md shrink-0" style={{
                  background: wantAI ? '#a855f7' : '#fff', border: wantAI ? 'none' : '2px solid #d1d5db', transition: 'all 0.2s ease',
                }}>
                  {wantAI && <Check size={14} className="text-white" strokeWidth={3} />}
                </div>
                <div>
                  <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Oui, je veux des messages IA personnalisés</span>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text3)' }}>Nécessite une clé API Google Gemini (gratuite)</p>
                </div>
              </div>

              {wantAI && (
                <div className="space-y-4">
                  <div className="rounded-xl p-4 text-xs space-y-2" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                    <p className="font-semibold" style={{ color: 'var(--text)', fontSize: '0.8rem' }}>Comment obtenir votre clé API Gemini :</p>
                    <div className="space-y-1.5" style={{ color: 'var(--text2)' }}>
                      <p><span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-purple-100 text-purple-600 text-[10px] font-bold mr-1.5">1</span>Allez sur <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="text-purple-600 underline font-medium">aistudio.google.com/apikey</a></p>
                      <p><span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-purple-100 text-purple-600 text-[10px] font-bold mr-1.5">2</span>Connectez-vous avec votre compte Google</p>
                      <p><span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-purple-100 text-purple-600 text-[10px] font-bold mr-1.5">3</span>Cliquez sur <strong>"Create API Key"</strong></p>
                      <p><span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-purple-100 text-purple-600 text-[10px] font-bold mr-1.5">4</span>Copiez la clé et collez-la ci-dessous</p>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text2)' }}>Clé API Gemini</label>
                    <input value={form.gemini_api_key} onChange={(e) => set('gemini_api_key', e.target.value)}
                      placeholder="AIzaSy..."
                      className="input-glass" style={{ fontFamily: 'monospace', fontSize: '12px' }} />
                  </div>

                  <div className="flex items-center gap-2 p-3 rounded-xl" style={{ background: 'rgba(168,85,247,0.04)', border: '1px solid rgba(168,85,247,0.1)' }}>
                    <HelpCircle size={14} style={{ color: '#a855f7', flexShrink: 0 }} />
                    <p className="text-xs" style={{ color: 'var(--text3)' }}>
                      Besoin d'aide ? Contactez{' '}
                      <a href="https://www.linkedin.com/in/thomas-shamoev/" target="_blank" rel="noopener noreferrer"
                        className="font-medium underline" style={{ color: '#a855f7' }}>
                        Thomas Shamoev sur LinkedIn
                      </a>
                    </p>
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button onClick={() => setStep(2)}
                  className="flex-1 flex items-center justify-center gap-2 font-semibold rounded-xl text-sm transition-all hover:bg-gray-50"
                  style={{ padding: '12px 16px', border: '1px solid #e2e8f0', color: 'var(--text2)', background: '#fff', borderRadius: '14px' }}>
                  <ChevronLeft size={18} /> Retour
                </button>
                <button onClick={() => setStep(4)} disabled={!canStep4}
                  className="cta-btn flex-1 flex items-center justify-center gap-2 disabled:opacity-40"
                  style={{ padding: '12px 16px', fontSize: '14px', borderRadius: '14px' }}>
                  Suivant <ChevronRight size={18} />
                </button>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-5">
              <div className="text-center py-2">
                <div className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{
                  background: 'linear-gradient(135deg, rgba(0,132,255,0.1) 0%, rgba(0,132,255,0.05) 100%)',
                  border: '2px solid rgba(0,132,255,0.15)',
                }}>
                  <Sparkles size={32} style={{ color: 'var(--blue)' }} />
                </div>
                <h3 className="text-lg font-bold" style={{ color: 'var(--text)' }}>Tout est prêt !</h3>
                <p className="text-sm mt-2 mx-4" style={{ color: 'var(--text3)', lineHeight: 1.6 }}>
                  Vos connexions LinkedIn seront importées dans votre CRM <strong style={{ color: 'var(--text2)' }}>"Mon Réseau"</strong> et synchronisées automatiquement.
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-3 p-3.5 rounded-xl" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                  <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: '#dcfce7' }}>
                    <Check size={16} style={{ color: '#16a34a' }} strokeWidth={3} />
                  </div>
                  <div>
                    <span className="text-sm font-semibold" style={{ color: '#15803d' }}>Import automatique</span>
                    <p className="text-xs mt-0.5" style={{ color: '#166534' }}>Toutes vos connexions seront importées</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3.5 rounded-xl" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                  <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: '#dcfce7' }}>
                    <Check size={16} style={{ color: '#16a34a' }} strokeWidth={3} />
                  </div>
                  <div>
                    <span className="text-sm font-semibold" style={{ color: '#15803d' }}>Synchronisation continue</span>
                    <p className="text-xs mt-0.5" style={{ color: '#166534' }}>Mises à jour automatiques toutes les 30 min</p>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-1">
                <button onClick={() => setStep(3)}
                  className="flex-1 flex items-center justify-center gap-2 font-semibold rounded-xl text-sm transition-all hover:bg-gray-50"
                  style={{ padding: '12px 16px', border: '1px solid #e2e8f0', color: 'var(--text2)', background: '#fff', borderRadius: '14px' }}>
                  <ChevronLeft size={18} /> Retour
                </button>
                <button onClick={handleSubmit} disabled={loading}
                  className="cta-btn flex-1 flex items-center justify-center gap-2 disabled:opacity-40"
                  style={{ padding: '12px 16px', fontSize: '14px', borderRadius: '14px' }}>
                  {loading ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
                  {loading ? 'Import en cours...' : 'Lancer LinkBot'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

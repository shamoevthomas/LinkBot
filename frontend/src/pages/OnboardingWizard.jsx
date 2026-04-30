import { useState } from 'react';
import { Loader2, Upload, ChevronRight, ChevronLeft, HelpCircle, Check, Shield, Sparkles, Key, ArrowUpRight, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { submitOnboarding } from '../api/user';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

const JOB_ROLES = ['Sales', 'Marketing', 'Recrutement', 'Business Development', 'Founder / CEO', 'Consultant', 'Autre'];
const REASONS = ['Génération de leads', 'Networking', 'Recrutement', 'Prospection commerciale', 'Personal branding', 'Autre'];

const STEP_TITLES = [
  { eyebrow: 'Étape 1 · Profil',  title: 'Faisons connaissance.' },
  { eyebrow: 'Étape 2 · LinkedIn', title: 'Connectez votre compte.' },
  { eyebrow: 'Étape 3 · IA',       title: 'Messages personnalisés.' },
  { eyebrow: 'Étape 4 · Import',   title: 'Tout est prêt.' },
];

export default function OnboardingWizard() {
  const { refreshUser, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/');
  };
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
      toast.success('Configuration terminée — import du réseau en cours.');
      await refreshUser();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erreur lors de la configuration');
    } finally {
      setLoading(false);
    }
  };

  const head = STEP_TITLES[step - 1];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{
        background: 'radial-gradient(120% 80% at 50% 0%, hsl(var(--accent) / .12), transparent 50%), hsl(220 30% 96% / .8)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
      }}>
      <div className="g-card" style={{
        width: '100%', maxWidth: 540,
        borderRadius: 24,
        padding: 0,
        boxShadow: '0 30px 80px -30px hsl(220 40% 20% / .25), 0 4px 12px -4px hsl(220 40% 20% / .08)',
      }}>
        {/* Header — clean, accent-light */}
        <div style={{ padding: '28px 32px 24px', borderBottom: '1px solid hsl(var(--border))' }}>
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2.5">
              <img src="/Linky.png" alt="Linky" style={{ width: 28, height: 28, objectFit: 'contain' }} />
              <span style={{ fontSize: 15, fontWeight: 600, color: 'hsl(var(--text))', letterSpacing: '-0.01em' }}>Linky</span>
            </div>
            <button onClick={handleLogout} type="button"
              style={{
                fontSize: 12, fontWeight: 500, color: 'hsl(var(--muted))',
                background: 'none', border: 'none', cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '6px 10px', borderRadius: 8, transition: 'all .15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'hsl(var(--text))'; e.currentTarget.style.background = 'hsl(220 30% 96%)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'hsl(var(--muted))'; e.currentTarget.style.background = 'none'; }}>
              <LogOut size={13} /> Se déconnecter
            </button>
          </div>

          <div className="eyebrow mb-2">{head.eyebrow}</div>
          <h2 style={{
            fontSize: 26, fontWeight: 600, lineHeight: 1.15,
            color: 'hsl(var(--text))', letterSpacing: '-0.025em',
          }}>
            {head.title}
          </h2>

          {/* Step pills */}
          <div className="flex items-center gap-1.5 mt-5">
            {[1, 2, 3, 4].map((s) => (
              <div key={s} style={{
                flex: 1, height: 3, borderRadius: 2,
                background: step >= s ? 'hsl(var(--accent))' : 'hsl(var(--border))',
                transition: 'background 0.25s ease',
              }} />
            ))}
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '28px 32px 32px' }}>
          {step === 1 && (
            <div className="space-y-5">
              {/* Photo */}
              <div className="flex justify-center pt-1">
                <label className="cursor-pointer group">
                  <input type="file" accept="image/*" className="hidden" onChange={handleFile} />
                  {preview ? (
                    <div style={{ position: 'relative' }}>
                      <img src={preview} alt="Photo" style={{
                        width: 88, height: 88, borderRadius: '50%', objectFit: 'cover',
                        border: '2px solid hsl(var(--accent))',
                        boxShadow: '0 8px 24px -8px hsl(var(--accent) / .4)',
                      }} />
                      <div style={{
                        position: 'absolute', inset: 0, borderRadius: '50%',
                        background: 'rgba(0,0,0,.35)', opacity: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'opacity .2s',
                      }} className="group-hover:opacity-100">
                        <Upload size={18} color="#fff" />
                      </div>
                    </div>
                  ) : (
                    <div style={{
                      width: 88, height: 88, borderRadius: '50%',
                      border: '1.5px dashed hsl(var(--border-strong))',
                      background: 'hsl(220 30% 98%)',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                      transition: 'all .2s',
                    }}>
                      <Upload size={18} style={{ color: 'hsl(var(--muted))' }} />
                      <span style={{ fontSize: 10, marginTop: 4, color: 'hsl(var(--muted))', fontWeight: 500 }}>Photo</span>
                    </div>
                  )}
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Prénom</label>
                  <input value={form.first_name} onChange={(e) => set('first_name', e.target.value)}
                    className="input-sm" placeholder="Thomas" />
                </div>
                <div>
                  <label className="form-label">Nom</label>
                  <input value={form.last_name} onChange={(e) => set('last_name', e.target.value)}
                    className="input-sm" placeholder="Dupont" />
                </div>
              </div>

              <div>
                <label className="form-label">Votre rôle</label>
                <select value={form.job_role} onChange={(e) => set('job_role', e.target.value)} className="input-sm">
                  <option value="">Sélectionner…</option>
                  {JOB_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>

              <div>
                <label className="form-label">Pourquoi utiliser Linky&nbsp;?</label>
                <select value={form.reason_for_using} onChange={(e) => set('reason_for_using', e.target.value)} className="input-sm">
                  <option value="">Sélectionner…</option>
                  {REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>

              <div>
                <label className="form-label">URL de votre profil LinkedIn</label>
                <input value={form.linkedin_profile_url} onChange={(e) => set('linkedin_profile_url', e.target.value)}
                  placeholder="https://linkedin.com/in/votre-profil" className="input-sm" />
              </div>

              <button onClick={() => setStep(2)} disabled={!canStep2}
                className="cta-btn w-full flex items-center justify-center gap-2"
                style={{ padding: '12px 16px', fontSize: 14, borderRadius: 14, marginTop: 4 }}>
                Continuer <ChevronRight size={16} />
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div style={{
                display: 'flex', alignItems: 'flex-start', gap: 10,
                padding: '12px 14px', borderRadius: 12,
                background: 'hsl(var(--accent-soft))', border: '1px solid hsl(var(--accent) / .2)',
              }}>
                <Shield size={16} style={{ color: 'hsl(var(--accent))', flexShrink: 0, marginTop: 1 }} />
                <p style={{ fontSize: 12.5, color: 'hsl(var(--text))', lineHeight: 1.5, margin: 0 }}>
                  Vos cookies sont stockés de manière sécurisée et ne quittent jamais votre serveur.
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="form-label" style={{ marginBottom: 0 }}>Cookie li_at</label>
                  <button onClick={() => setShowHelp(!showHelp)} type="button"
                    style={{ fontSize: 11.5, fontWeight: 500, color: 'hsl(var(--accent))', display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer' }}>
                    <HelpCircle size={12} /> {showHelp ? 'Masquer' : 'Comment trouver ?'}
                  </button>
                </div>
                {showHelp && (
                  <div style={{
                    padding: 14, marginBottom: 10, borderRadius: 12, fontSize: 12,
                    background: 'hsl(220 30% 98%)', border: '1px solid hsl(var(--border))',
                  }}>
                    <p style={{ fontWeight: 600, color: 'hsl(var(--text))', marginBottom: 6, fontSize: 12 }}>
                      Comment récupérer vos cookies&nbsp;:
                    </p>
                    <ol style={{ color: 'hsl(var(--muted))', display: 'flex', flexDirection: 'column', gap: 5, paddingLeft: 0, listStyle: 'none', margin: 0 }}>
                      {[
                        ['Ouvrez LinkedIn dans Chrome'],
                        ['Appuyez sur ', <code key="c" style={{ padding: '1px 6px', borderRadius: 4, background: 'hsl(var(--border))', color: 'hsl(var(--text))', fontSize: 11 }}>F12</code>, ' → onglet ', <strong key="s">Application</strong>],
                        ['Dans Cookies → linkedin.com, cherchez ', <code key="c" style={{ padding: '1px 6px', borderRadius: 4, background: 'hsl(var(--accent-soft))', color: 'hsl(var(--accent))', fontSize: 11 }}>li_at</code>],
                        ['Copiez la valeur complète'],
                        ['Faites pareil pour ', <code key="c" style={{ padding: '1px 6px', borderRadius: 4, background: 'hsl(var(--accent-soft))', color: 'hsl(var(--accent))', fontSize: 11 }}>JSESSIONID</code>],
                      ].map((parts, i) => (
                        <li key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
                            background: 'hsl(var(--accent) / .12)', color: 'hsl(var(--accent))',
                            fontSize: 10, fontWeight: 700, marginTop: 1,
                          }}>{i + 1}</span>
                          <span>{parts}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
                <textarea value={form.li_at} onChange={(e) => set('li_at', e.target.value)} rows={2}
                  placeholder="Collez votre cookie li_at ici…"
                  className="input-sm" style={{ fontFamily: 'ui-monospace, SFMono-Regular, monospace', fontSize: 12, resize: 'vertical' }} />
              </div>

              <div>
                <label className="form-label">JSESSIONID</label>
                <textarea value={form.jsessionid} onChange={(e) => set('jsessionid', e.target.value)} rows={2}
                  placeholder='"ajax:1234…"' className="input-sm"
                  style={{ fontFamily: 'ui-monospace, SFMono-Regular, monospace', fontSize: 12, resize: 'vertical' }} />
              </div>

              <div className="flex gap-3 pt-1">
                <button onClick={() => setStep(1)} type="button"
                  style={{
                    flex: 1, padding: '12px 16px', fontSize: 14, fontWeight: 600,
                    borderRadius: 14, border: '1px solid hsl(var(--border-strong))',
                    background: '#fff', color: 'hsl(var(--text))',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    cursor: 'pointer', transition: 'background .15s',
                  }}>
                  <ChevronLeft size={16} /> Retour
                </button>
                <button onClick={() => setStep(3)} disabled={!canStep3}
                  className="cta-btn"
                  style={{ flex: 1, padding: '12px 16px', fontSize: 14, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  Continuer <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <div style={{ textAlign: 'center', paddingTop: 4 }}>
                <div style={{
                  width: 56, height: 56, borderRadius: 16, margin: '0 auto 14px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'hsl(var(--accent) / .1)', color: 'hsl(var(--accent))',
                }}>
                  <Sparkles size={24} />
                </div>
                <h3 style={{ fontSize: 18, fontWeight: 600, color: 'hsl(var(--text))', letterSpacing: '-0.015em' }}>
                  Messages 100&nbsp;% personnalisés.
                </h3>
                <p style={{ fontSize: 13, marginTop: 6, color: 'hsl(var(--muted))', lineHeight: 1.55, padding: '0 8px' }}>
                  L'IA rédige chaque message à partir du profil LinkedIn de la personne.
                </p>
              </div>

              <button type="button" onClick={() => { setWantAI(!wantAI); if (wantAI) set('gemini_api_key', ''); }}
                style={{
                  width: '100%', padding: '14px 16px', borderRadius: 14, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 12,
                  background: wantAI ? 'hsl(var(--accent) / .06)' : '#fff',
                  border: wantAI ? '1.5px solid hsl(var(--accent) / .4)' : '1px solid hsl(var(--border-strong))',
                  textAlign: 'left', transition: 'all .15s',
                }}>
                <div style={{
                  width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                  background: wantAI ? 'hsl(var(--accent))' : '#fff',
                  border: wantAI ? 'none' : '1.5px solid hsl(var(--border-strong))',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all .15s',
                }}>
                  {wantAI && <Check size={12} color="#fff" strokeWidth={3} />}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: 'hsl(var(--text))' }}>Activer la personnalisation IA</div>
                  <div style={{ fontSize: 11.5, color: 'hsl(var(--muted))', marginTop: 2 }}>Nécessite une clé API Google Gemini (offre gratuite disponible)</div>
                </div>
              </button>

              {wantAI && (
                <div className="space-y-4">
                  <div style={{
                    padding: 14, borderRadius: 12, fontSize: 12,
                    background: 'hsl(220 30% 98%)', border: '1px solid hsl(var(--border))',
                  }}>
                    <p style={{ fontWeight: 600, color: 'hsl(var(--text))', marginBottom: 6, fontSize: 12 }}>
                      Obtenir une clé&nbsp;:
                    </p>
                    <ol style={{ color: 'hsl(var(--muted))', display: 'flex', flexDirection: 'column', gap: 5, paddingLeft: 0, listStyle: 'none', margin: 0 }}>
                      {[
                        <>Ouvrez <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer"
                          style={{ color: 'hsl(var(--accent))', textDecoration: 'none', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                          aistudio.google.com/apikey <ArrowUpRight size={11} />
                        </a></>,
                        <>Connectez-vous avec Google</>,
                        <>Cliquez sur <strong>Create API Key</strong></>,
                        <>Collez la clé ci-dessous</>,
                      ].map((parts, i) => (
                        <li key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
                            background: 'hsl(var(--accent) / .12)', color: 'hsl(var(--accent))',
                            fontSize: 10, fontWeight: 700, marginTop: 1,
                          }}>{i + 1}</span>
                          <span>{parts}</span>
                        </li>
                      ))}
                    </ol>
                  </div>

                  <div>
                    <label className="form-label">Clé API Gemini</label>
                    <input value={form.gemini_api_key} onChange={(e) => set('gemini_api_key', e.target.value)}
                      placeholder="AIzaSy…" className="input-sm"
                      style={{ fontFamily: 'ui-monospace, SFMono-Regular, monospace', fontSize: 12 }} />
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button onClick={() => setStep(2)} type="button"
                  style={{
                    flex: 1, padding: '12px 16px', fontSize: 14, fontWeight: 600,
                    borderRadius: 14, border: '1px solid hsl(var(--border-strong))',
                    background: '#fff', color: 'hsl(var(--text))',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    cursor: 'pointer',
                  }}>
                  <ChevronLeft size={16} /> Retour
                </button>
                <button onClick={() => setStep(4)} disabled={!canStep4}
                  className="cta-btn"
                  style={{ flex: 1, padding: '12px 16px', fontSize: 14, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  Continuer <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-5">
              <div style={{ textAlign: 'center', paddingTop: 4 }}>
                <div style={{
                  width: 56, height: 56, borderRadius: 16, margin: '0 auto 14px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'hsl(var(--accent) / .1)', color: 'hsl(var(--accent))',
                }}>
                  <Key size={24} />
                </div>
                <h3 style={{ fontSize: 18, fontWeight: 600, color: 'hsl(var(--text))', letterSpacing: '-0.015em' }}>
                  Votre réseau, importé.
                </h3>
                <p style={{ fontSize: 13, marginTop: 6, color: 'hsl(var(--muted))', lineHeight: 1.55, padding: '0 16px' }}>
                  Vos connexions arrivent dans le CRM <strong style={{ color: 'hsl(var(--text))' }}>Mon Réseau</strong> et se mettent à jour toutes les 30 min.
                </p>
              </div>

              <div className="space-y-2.5">
                {[
                  { title: 'Import automatique', sub: 'Toutes vos connexions, rapatriées en arrière-plan' },
                  { title: 'Synchronisation continue', sub: 'Mises à jour toutes les 30 minutes' },
                ].map((row) => (
                  <div key={row.title} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '12px 14px', borderRadius: 12,
                    background: 'hsl(220 30% 98%)', border: '1px solid hsl(var(--border))',
                  }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                      background: 'hsl(var(--accent) / .12)', color: 'hsl(var(--accent))',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Check size={14} strokeWidth={3} />
                    </div>
                    <div>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: 'hsl(var(--text))' }}>{row.title}</div>
                      <div style={{ fontSize: 11.5, color: 'hsl(var(--muted))', marginTop: 1 }}>{row.sub}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex gap-3 pt-1">
                <button onClick={() => setStep(3)} type="button"
                  style={{
                    flex: 1, padding: '12px 16px', fontSize: 14, fontWeight: 600,
                    borderRadius: 14, border: '1px solid hsl(var(--border-strong))',
                    background: '#fff', color: 'hsl(var(--text))',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    cursor: 'pointer',
                  }}>
                  <ChevronLeft size={16} /> Retour
                </button>
                <button onClick={handleSubmit} disabled={loading}
                  className="cta-btn"
                  style={{ flex: 1, padding: '12px 16px', fontSize: 14, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  {loading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                  {loading ? 'Import en cours…' : 'Lancer Linky'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

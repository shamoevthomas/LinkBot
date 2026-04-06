import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Sparkles, Plus, Trash2, Loader2, FileText, Upload, Clock, Send, Rocket, RefreshCw, Eye, User, PenTool, Wand2 } from 'lucide-react';
import { getCRMs } from '../api/crm';
import client from '../api/client';
import PageWrapper from '../components/layout/PageWrapper';
import toast from 'react-hot-toast';

export default function NewDMCampaignPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const connectionConfig = location.state?.connectionConfig || null;
  const [step, setStep] = useState(1);
  const [crms, setCrms] = useState([]);
  const [aiAvailable, setAiAvailable] = useState(false);
  const [loading, setLoading] = useState(true);

  // Step 1
  const [name, setName] = useState(connectionConfig?.name || '');
  const [crmId, setCrmId] = useState(connectionConfig?.crm_id?.toString() || '');
  const [contextText, setContextText] = useState('');
  const [pdfName, setPdfName] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [useAi, setUseAi] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [delayMinutes, setDelayMinutes] = useState(2);

  // Step 2
  // Mode: 'template' = user writes template with variables, 'full' = AI writes everything per contact
  const [mode, setMode] = useState('template');
  const [messages, setMessages] = useState([
    { sequence: 0, message_template: '', delay_days: 0 },
  ]);
  const [generating, setGenerating] = useState(false);
  const [regeneratingIdx, setRegeneratingIdx] = useState(null);
  // Full mode state
  const [followupCount, setFollowupCount] = useState(0);
  const [followupDelays, setFollowupDelays] = useState([]);
  const [previews, setPreviews] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [extraInstructions, setExtraInstructions] = useState('');

  // Step 3
  const [launching, setLaunching] = useState(false);

  useEffect(() => {
    Promise.all([
      getCRMs(),
      client.get('/ai/status').then((r) => r.data).catch(() => ({ available: false })),
    ]).then(([crmsData, aiData]) => {
      setCrms(crmsData);
      setAiAvailable(aiData.available);
      setLoading(false);
    });
  }, []);

  const handlePdfUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.pdf')) return toast.error('Fichier PDF uniquement');
    setExtracting(true);
    setPdfName(file.name);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const { data } = await client.post('/campaigns/extract-pdf', formData);
      setContextText((prev) => prev ? prev + '\n\n--- Contenu du PDF ---\n' + data.text : data.text);
      toast.success('PDF extrait');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erreur');
      setPdfName('');
    } finally { setExtracting(false); }
    e.target.value = '';
  };

  // --- Template mode helpers ---
  const addFollowup = () => {
    if (messages.length >= 8) return;
    setMessages([...messages, { sequence: messages.length, message_template: '', delay_days: 3 }]);
  };
  const removeFollowup = (idx) => {
    if (idx === 0) return;
    setMessages(messages.filter((_, i) => i !== idx).map((m, i) => ({ ...m, sequence: i })));
  };
  const updateMessage = (idx, field, value) => {
    const updated = [...messages];
    updated[idx] = { ...updated[idx], [field]: value };
    setMessages(updated);
  };
  const generateAllMessages = async () => {
    if (!aiPrompt.trim()) return toast.error('Donne des instructions a l\'IA (etape 1)');
    setGenerating(true);
    try {
      const { data } = await client.post('/campaigns/generate-messages', {
        ai_prompt: aiPrompt.trim(),
        context_text: contextText,
        followup_count: messages.length - 1,
        followup_delays: messages.slice(1).map((m) => m.delay_days),
      });
      if (data.messages) {
        setMessages(data.messages.map((m, i) => ({
          ...m,
          delay_days: i === 0 ? 0 : (messages[i]?.delay_days || m.delay_days || 3),
        })));
        toast.success('Messages generes');
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erreur');
    } finally { setGenerating(false); }
  };
  const regenerateOne = async (idx) => {
    if (!aiPrompt.trim()) return toast.error('Donne des instructions a l\'IA');
    setRegeneratingIdx(idx);
    try {
      const { data } = await client.post('/campaigns/generate-messages', {
        ai_prompt: aiPrompt.trim(), context_text: contextText, followup_count: 0, followup_delays: [],
      });
      if (data.messages?.[0]) {
        updateMessage(idx, 'message_template', data.messages[0].message_template);
        toast.success('Regenere');
      }
    } catch { toast.error('Erreur'); }
    finally { setRegeneratingIdx(null); }
  };

  // --- Full mode helpers ---
  const addFullFollowup = () => {
    if (followupCount >= 7) return;
    setFollowupCount(followupCount + 1);
    setFollowupDelays([...followupDelays, 3]);
    setPreviews(null);
  };
  const removeFullFollowup = () => {
    if (followupCount <= 0) return;
    setFollowupCount(followupCount - 1);
    setFollowupDelays(followupDelays.slice(0, -1));
    setPreviews(null);
  };
  const updateFollowupDelay = (idx, val) => {
    const updated = [...followupDelays];
    updated[idx] = parseInt(val) || 3;
    setFollowupDelays(updated);
    setPreviews(null);
  };

  const generatePreviews = async () => {
    if (!crmId) return toast.error('Selectionne un CRM');
    if (!aiPrompt.trim()) return toast.error('Donne des instructions a l\'IA (etape 1)');
    setPreviewLoading(true);
    try {
      const fullPrompt = [aiPrompt, extraInstructions].filter(Boolean).join('\n\nConsignes supplementaires:\n');
      const { data } = await client.post('/campaigns/preview-personalization', {
        crm_id: parseInt(crmId),
        ai_prompt: fullPrompt,
        context_text: contextText,
        followup_count: followupCount,
        followup_delays: followupDelays,
      });
      setPreviews(data.previews);
      toast.success(`Apercu genere pour ${data.previews.length} contacts`);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erreur');
    } finally { setPreviewLoading(false); }
  };

  // --- Launch ---
  const handleLaunch = async () => {
    if (!name.trim()) return toast.error('Donne un nom');
    if (!crmId) return toast.error('Selectionne un CRM');
    if (mode === 'template' && !messages[0].message_template.trim()) return toast.error('Message principal vide');
    if (mode === 'full' && !aiPrompt.trim()) return toast.error('Donne des instructions a l\'IA');
    setLaunching(true);
    try {
      const totalContacts = crms.find((c) => c.id === parseInt(crmId))?.contact_count || 50;

      // Build messages array for the API
      let msgPayload;
      if (mode === 'full') {
        // For full mode, send placeholder messages with delay info
        msgPayload = [{ sequence: 0, message_template: '__FULL_AI__', delay_days: 0 }];
        for (let i = 0; i < followupCount; i++) {
          msgPayload.push({ sequence: i + 1, message_template: '__FULL_AI__', delay_days: followupDelays[i] || 3 });
        }
      } else {
        msgPayload = messages.map((m) => ({ sequence: m.sequence, message_template: m.message_template, delay_days: m.delay_days }));
      }

      const payload = {
        name: name.trim(),
        crm_id: parseInt(crmId),
        context_text: contextText || null,
        ai_prompt: [aiPrompt, extraInstructions].filter(Boolean).join('\n\nConsignes supplementaires:\n') || null,
        use_ai: mode === 'full' ? true : useAi,
        full_personalize: mode === 'full',
        messages: msgPayload,
        total_target: totalContacts,
        delay_minutes: delayMinutes,
      };
      if (connectionConfig) {
        payload.keywords = connectionConfig.keywords || '';
        payload.is_connection_dm = true;
      }
      const { data } = await client.post('/campaigns/dm', payload);
      toast.success('Campagne lancee !');
      navigate(`/dashboard/campaigns/${data.id}`);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erreur');
    } finally { setLaunching(false); }
  };

  const selectedCrm = crms.find((c) => c.id === parseInt(crmId));

  if (loading) return (
    <PageWrapper><div className="flex justify-center py-20"><Loader2 size={32} className="animate-spin" style={{ color: 'var(--blue)' }} /></div></PageWrapper>
  );

  return (
    <PageWrapper>
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <button onClick={() => navigate('/dashboard/campaigns')} className="p-2 hover:bg-gray-200 rounded-lg">
          <ArrowLeft size={20} className="text-gray-600" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 f">
            {connectionConfig ? 'Nouvelle campagne Connexion + DM' : 'Nouvelle campagne Message'}
          </h1>
          <p className="text-sm text-gray-500">
            {connectionConfig
              ? 'Configurez les messages envoyés après acceptation de la connexion'
              : 'Configurez vos messages et relances automatiques'}
          </p>
        </div>
      </div>

      {/* Steps */}
      <div className="flex items-center gap-3 mb-8">
        {[{ n: 1, label: 'Configuration' }, { n: 2, label: 'Messages' }, { n: 3, label: 'Lancement' }].map(({ n, label }) => (
          <button key={n} onClick={() => n < step ? setStep(n) : null}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${
              step === n ? 'text-white shadow-md' :
              step > n ? 'bg-green-100 text-green-700 cursor-pointer' : 'bg-gray-100 text-gray-400'
            }`}
            style={step === n ? { background: 'var(--blue)' } : undefined}>
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
              step === n ? 'bg-white/20' : step > n ? 'bg-green-200' : 'bg-gray-200'
            }`}>{step > n ? '\u2713' : n}</span>
            {label}
          </button>
        ))}
      </div>

      {/* ============ STEP 1 ============ */}
      {step === 1 && (
        <div className="space-y-6 max-w-3xl">
          <div className="g-card space-y-5">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Send size={18} style={{ color: 'var(--blue)' }} /> Informations generales
            </h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nom de la campagne</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Prospection Immobilier Q2"
                className="input-glass w-full" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">CRM cible</label>
              <select value={crmId} onChange={(e) => setCrmId(e.target.value)}
                className="input-glass w-full">
                <option value="">Selectionner un CRM...</option>
                {crms.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.contact_count} contacts)</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Delai entre actions</label>
              <div className="flex items-center gap-2">
                <input type="number" value={delayMinutes} onChange={(e) => setDelayMinutes(Math.max(1, parseInt(e.target.value) || 2))}
                  min={1} max={60} className="input-glass w-24" />
                <span className="text-sm text-gray-500 whitespace-nowrap">minutes</span>
              </div>
            </div>
          </div>

          {/* Context */}
          <div className="g-card space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <FileText size={18} className="text-orange-500" /> Contexte
            </h2>
            <p className="text-xs text-gray-400">Decrivez votre offre, produit, service... Ou importez un PDF.</p>
            <textarea value={contextText} onChange={(e) => setContextText(e.target.value)}
              rows={5} placeholder="Ex: Nous sommes une agence immobiliere a Lyon..."
              className="input-glass w-full resize-none" />
            <div className="flex items-center gap-3">
              <label className="px-4 py-2 border border-gray-300 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 cursor-pointer flex items-center gap-2">
                {extracting ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                {extracting ? 'Extraction...' : 'Importer un PDF'}
                <input type="file" accept=".pdf" onChange={handlePdfUpload} className="hidden" disabled={extracting} />
              </label>
              {pdfName && <span className="text-xs text-green-600 flex items-center gap-1"><FileText size={12} /> {pdfName}</span>}
            </div>
          </div>

          {/* AI */}
          {aiAvailable && (
            <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-2xl border border-purple-200 p-6 space-y-4">
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={useAi} onChange={(e) => setUseAi(e.target.checked)}
                  className="w-5 h-5 text-purple-600 rounded-lg" />
                <div className="flex items-center gap-2">
                  <Sparkles size={18} className="text-purple-500" />
                  <span className="text-base font-semibold text-purple-800">Personnalisation IA (Gemini 2.5)</span>
                </div>
              </label>
              {useAi && (
                <div>
                  <label className="block text-sm font-medium text-purple-700 mb-1">Instructions pour l'IA</label>
                  <textarea value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)}
                    rows={4} placeholder="Ex: Ecris des messages professionnels et chaleureux. Mentionne que tu peux les aider a trouver leur premier investissement locatif..."
                    className="w-full px-4 py-3 border border-purple-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 resize-none bg-white" />
                </div>
              )}
            </div>
          )}

          <button onClick={() => setStep(2)} disabled={!name.trim() || !crmId}
            className="cta-btn w-full py-3 rounded-xl text-sm disabled:opacity-40">
            Configurer les messages
          </button>
        </div>
      )}

      {/* ============ STEP 2 ============ */}
      {step === 2 && (
        <div className="space-y-6 max-w-3xl">

          {/* Mode selector */}
          {useAi && (
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => { setMode('template'); setPreviews(null); }}
                className={`p-4 rounded-2xl border-2 text-left transition-all ${
                  mode === 'template' ? 'bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                }`}
                style={mode === 'template' ? { borderColor: 'var(--blue)' } : undefined}>
                <div className="flex items-center gap-2 mb-1">
                  <PenTool size={18} style={mode === 'template' ? { color: 'var(--blue)' } : undefined} className={mode !== 'template' ? 'text-gray-400' : ''} />
                  <span className={`font-semibold text-sm ${mode !== 'template' ? 'text-gray-600' : ''}`} style={mode === 'template' ? { color: 'var(--blue)' } : undefined}>
                    Template + variables
                  </span>
                </div>
                <p className="text-xs text-gray-400">
                  Vous ecrivez le message, l'IA personnalise {'{compliment}'} par contact
                </p>
              </button>
              <button onClick={() => { setMode('full'); setPreviews(null); }}
                className={`p-4 rounded-2xl border-2 text-left transition-all ${
                  mode === 'full' ? 'border-purple-500 bg-purple-50' : 'border-gray-200 hover:border-gray-300'
                }`}>
                <div className="flex items-center gap-2 mb-1">
                  <Wand2 size={18} className={mode === 'full' ? 'text-purple-600' : 'text-gray-400'} />
                  <span className={`font-semibold text-sm ${mode === 'full' ? 'text-purple-700' : 'text-gray-600'}`}>
                    Message entier par l'IA
                  </span>
                </div>
                <p className="text-xs text-gray-400">
                  L'IA ecrit tout le message de A a Z pour chaque contact
                </p>
              </button>
            </div>
          )}

          {/* ---- TEMPLATE MODE ---- */}
          {mode === 'template' && (
            <>
              {useAi && aiPrompt && (
                <button onClick={generateAllMessages} disabled={generating}
                  className="w-full py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-semibold rounded-xl text-sm hover:from-purple-700 hover:to-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-purple-200">
                  {generating ? <><Loader2 size={18} className="animate-spin" /> Generation...</> : <><Sparkles size={18} /> Generer les templates avec l'IA</>}
                </button>
              )}

              {messages.map((msg, idx) => (
                <div key={idx} className="g-card !p-0 overflow-hidden" style={idx === 0 ? { borderColor: 'var(--blue)', borderWidth: '2px' } : { borderWidth: '2px' }}>
                  <div className={`px-6 py-3 flex items-center justify-between ${idx === 0 ? '' : 'bg-gray-50 border-b border-gray-200'}`}
                    style={idx === 0 ? { background: 'linear-gradient(to right, var(--blue), #2563eb)' } : undefined}>
                    <div className="flex items-center gap-2">
                      {idx === 0 ? <span className="text-white font-semibold text-sm">Message principal</span> : (
                        <>
                          <Clock size={14} className="text-gray-500" />
                          <span className="font-semibold text-sm text-gray-700">Relance {idx}</span>
                          <span className="text-xs text-gray-400 ml-1">apres</span>
                          <input type="number" value={msg.delay_days} min={1} max={30}
                            onChange={(e) => updateMessage(idx, 'delay_days', parseInt(e.target.value) || 1)}
                            className="w-12 px-2 py-0.5 border border-gray-300 rounded-md text-xs text-center" />
                          <span className="text-xs text-gray-400">jours</span>
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {useAi && aiPrompt && (
                        <button onClick={() => regenerateOne(idx)} disabled={regeneratingIdx === idx}
                          className={`p-1.5 rounded-lg ${idx === 0 ? 'hover:bg-white/20 text-white/80' : 'hover:bg-gray-200 text-gray-400'}`}>
                          {regeneratingIdx === idx ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                        </button>
                      )}
                      {idx > 0 && (
                        <button onClick={() => removeFollowup(idx)} className="p-1.5 hover:bg-red-100 text-gray-400 hover:text-red-500 rounded-lg">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="p-6">
                    <textarea value={msg.message_template} onChange={(e) => updateMessage(idx, 'message_template', e.target.value)}
                      rows={4} placeholder={`Bonjour {first_name},\n{compliment}\n...\n\nVariables : {first_name}, {last_name}, {headline}, {compliment}`}
                      className="input-glass w-full resize-none" />
                    <div className="mt-2 space-y-1">
                      <p className="text-xs text-gray-400">Variables : {'{first_name}'}, {'{last_name}'}, {'{headline}'}, {'{company}'}, {'{location}'}</p>
                      {useAi && <p className="text-xs text-purple-500 font-medium">{'{compliment}'} = accroche IA personnalisee par contact</p>}
                    </div>
                  </div>
                </div>
              ))}
              {messages.length < 8 && (
                <button onClick={addFollowup}
                  className="w-full py-3 border-2 border-dashed border-gray-300 rounded-2xl text-sm font-medium text-gray-500 hover:border-blue-300 flex items-center justify-center gap-2"
                  style={{ '--tw-border-opacity': 1 }}>
                  <Plus size={18} /> Ajouter une relance ({messages.length - 1}/7)
                </button>
              )}
            </>
          )}

          {/* ---- FULL AI MODE ---- */}
          {mode === 'full' && (
            <>
              <div className="bg-gradient-to-br from-purple-50 via-indigo-50 to-blue-50 rounded-2xl border border-purple-200 p-6 space-y-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
                    <Wand2 size={20} className="text-purple-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-purple-800">Personnalisation complete par l'IA</h3>
                    <p className="text-xs text-purple-500">Chaque message sera ecrit de A a Z en fonction du profil LinkedIn du contact</p>
                  </div>
                </div>

                {/* Follow-ups config */}
                <div>
                  <label className="block text-sm font-medium text-purple-700 mb-2">Messages de relance</label>
                  <div className="space-y-2">
                    {Array.from({ length: followupCount }).map((_, i) => (
                      <div key={i} className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 border border-purple-100">
                        <Clock size={14} className="text-purple-400" />
                        <span className="text-sm text-gray-600">Relance {i + 1} apres</span>
                        <input type="number" value={followupDelays[i] || 3} min={1} max={30}
                          onChange={(e) => updateFollowupDelay(i, e.target.value)}
                          className="w-14 px-2 py-1 border border-gray-200 rounded-md text-xs text-center" />
                        <span className="text-sm text-gray-400">jours</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2 mt-2">
                    {followupCount < 7 && (
                      <button onClick={addFullFollowup}
                        className="px-3 py-1.5 border border-dashed border-purple-300 rounded-lg text-xs font-medium text-purple-600 hover:bg-purple-50 flex items-center gap-1">
                        <Plus size={12} /> Relance ({followupCount}/7)
                      </button>
                    )}
                    {followupCount > 0 && (
                      <button onClick={removeFullFollowup}
                        className="px-3 py-1.5 border border-dashed border-red-200 rounded-lg text-xs font-medium text-red-500 hover:bg-red-50 flex items-center gap-1">
                        <Trash2 size={12} /> Retirer la derniere
                      </button>
                    )}
                  </div>
                </div>

                {/* Extra instructions */}
                <div>
                  <label className="block text-sm font-medium text-purple-700 mb-1">Consignes supplementaires (optionnel)</label>
                  <textarea value={extraInstructions} onChange={(e) => { setExtraInstructions(e.target.value); setPreviews(null); }}
                    rows={2} placeholder="Ex: Commence par Hello, ton direct et amical, pose une question ouverte..."
                    className="w-full px-4 py-3 border border-purple-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 resize-none bg-white" />
                </div>

                {/* Generate previews button */}
                <button onClick={generatePreviews} disabled={previewLoading}
                  className="w-full py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-semibold rounded-xl text-sm hover:from-purple-700 hover:to-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2">
                  {previewLoading
                    ? <><Loader2 size={16} className="animate-spin" /> Analyse des profils en cours...</>
                    : <><Eye size={16} /> {previews ? 'Regenerer les apercus' : 'Voir l\'apercu sur 3 contacts'}</>
                  }
                </button>
              </div>

              {/* Preview results */}
              {previews && (
                <div className="space-y-4">
                  <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                    <Eye size={16} className="text-purple-500" /> Apercu des messages personnalises
                  </h3>
                  {previews.map((preview, pIdx) => (
                    <div key={pIdx} className="g-card !p-0 overflow-hidden">
                      <div className="flex items-center gap-3 px-5 py-3 bg-gray-50 border-b border-gray-100">
                        {preview.contact.profile_picture_url ? (
                          <img src={preview.contact.profile_picture_url} alt="" className="w-10 h-10 rounded-full object-cover border border-gray-200" />
                        ) : (
                          <div className="w-10 h-10 rounded-full text-sm font-bold flex items-center justify-center"
                            style={{ background: 'rgba(0,132,255,0.08)', color: 'var(--blue)' }}>
                            {(preview.contact.first_name?.[0] || '')}{(preview.contact.last_name?.[0] || '')}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-gray-900 text-sm">{preview.contact.first_name} {preview.contact.last_name}</p>
                          {preview.contact.headline && <p className="text-xs text-gray-400 truncate">{preview.contact.headline}</p>}
                        </div>
                        <User size={14} className="text-gray-300" />
                      </div>
                      <div className="p-5 space-y-3">
                        {preview.messages.map((rm, mIdx) => (
                          <div key={mIdx}>
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                              mIdx === 0 ? 'text-white' : 'bg-gray-100 text-gray-500'
                            }`}
                              style={mIdx === 0 ? { background: 'var(--blue)' } : undefined}>
                              {mIdx === 0 ? 'Principal' : `Relance ${mIdx} (J+${rm.delay_days})`}
                            </span>
                            <div className="mt-1 bg-blue-50 rounded-lg px-4 py-3 text-sm text-gray-800 whitespace-pre-wrap border-l-4"
                              style={{ borderColor: 'var(--blue)' }}>
                              {rm.rendered}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Nav */}
          <div className="flex gap-3">
            <button onClick={() => setStep(1)}
              className="flex-1 py-3 border border-gray-300 text-gray-700 font-semibold rounded-xl text-sm hover:bg-gray-50">
              Retour
            </button>
            <button onClick={() => setStep(3)}
              disabled={mode === 'template' ? !messages[0].message_template.trim() : !aiPrompt.trim()}
              className="cta-btn flex-1 py-3 rounded-xl text-sm disabled:opacity-40">
              Apercu et lancement
            </button>
          </div>
        </div>
      )}

      {/* ============ STEP 3 ============ */}
      {step === 3 && (
        <div className="space-y-6 max-w-3xl">
          <div className="g-card">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Resume</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-xs text-gray-400">Campagne</p>
                <p className="font-semibold text-gray-900 mt-0.5">{name}</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-xs text-gray-400">CRM</p>
                <p className="font-semibold text-gray-900 mt-0.5">{selectedCrm?.name} ({selectedCrm?.contact_count} contacts)</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-xs text-gray-400">Messages</p>
                <p className="font-semibold text-gray-900 mt-0.5">
                  {mode === 'full' ? `1 principal + ${followupCount} relance(s)` : `1 principal + ${messages.length - 1} relance(s)`}
                </p>
              </div>
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-xs text-gray-400">Rythme</p>
                <p className="font-semibold text-gray-900 mt-0.5">1 msg / {delayMinutes} min, max {maxPerDay}/jour</p>
              </div>
              <div className="col-span-2 bg-purple-50 rounded-xl p-4 flex items-center gap-2">
                <Sparkles size={16} className="text-purple-500" />
                <p className="text-sm text-purple-700 font-medium">
                  {mode === 'full'
                    ? 'Message entier personnalise par l\'IA pour chaque contact'
                    : useAi ? 'Template avec personnalisation IA' : 'Template sans IA'}
                </p>
              </div>
            </div>
          </div>

          {mode === 'template' && (
            <div className="g-card space-y-4">
              <h2 className="text-lg font-semibold text-gray-900">Templates</h2>
              {messages.map((msg, idx) => (
                <div key={idx} className="bg-gray-50 rounded-xl p-4">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                    idx === 0 ? 'text-white' : 'bg-gray-200 text-gray-600'
                  }`}
                    style={idx === 0 ? { background: 'var(--blue)' } : undefined}>
                    {idx === 0 ? 'Principal' : `Relance ${idx} (J+${msg.delay_days})`}
                  </span>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap mt-2">{msg.message_template || '(vide)'}</p>
                </div>
              ))}
            </div>
          )}

          {mode === 'full' && previews && (
            <div className="g-card space-y-4">
              <h2 className="text-lg font-semibold text-gray-900">Exemples de messages generes</h2>
              {previews.slice(0, 2).map((p, i) => (
                <div key={i} className="bg-gray-50 rounded-xl p-4">
                  <p className="text-xs font-medium text-gray-500 mb-2">{p.contact.first_name} {p.contact.last_name}</p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{p.messages[0]?.rendered}</p>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={() => setStep(2)} className="flex-1 py-3 border border-gray-300 text-gray-700 font-semibold rounded-xl text-sm hover:bg-gray-50">
              Modifier
            </button>
            <button onClick={handleLaunch} disabled={launching}
              className="flex-1 py-4 text-white font-bold rounded-xl text-base disabled:opacity-50 flex items-center justify-center gap-3 shadow-lg"
              style={{ background: 'linear-gradient(to right, var(--blue), #2563eb)' }}>
              {launching ? <><Loader2 size={20} className="animate-spin" /> Lancement...</> : <><Rocket size={20} /> Lancer la campagne</>}
            </button>
          </div>
        </div>
      )}
    </PageWrapper>
  );
}

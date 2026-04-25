import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Sparkles, Plus, Trash2, Loader2, FileText, Upload, Clock, Send, Rocket, RefreshCw, Eye, User, PenTool, Wand2, Save, AlertCircle } from 'lucide-react';
import { getCRMs } from '../api/crm';
import { updateCampaign, resumeCampaign } from '../api/campaigns';
import client from '../api/client';
import PageWrapper from '../components/layout/PageWrapper';
import toast from 'react-hot-toast';

export default function NewDMCampaignPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const connectionConfig = location.state?.connectionConfig || null;
  const searchConnectionDMConfig = location.state?.searchConnectionDMConfig || null;
  const reconfigure = location.state?.reconfigure || null;
  const [crms, setCrms] = useState([]);
  const [aiAvailable, setAiAvailable] = useState(false);
  const [loading, setLoading] = useState(true);

  // Config
  const [name, setName] = useState(reconfigure?.name || searchConnectionDMConfig?.name || connectionConfig?.name || '');
  const [crmId, setCrmId] = useState(reconfigure?.crm_id?.toString() || searchConnectionDMConfig?.crm_id?.toString() || connectionConfig?.crm_id?.toString() || '');
  const [contextText, setContextText] = useState(reconfigure?.context_text || '');
  const [pdfName, setPdfName] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [useAi, setUseAi] = useState(reconfigure ? true : false);
  const [aiPrompt, setAiPrompt] = useState(reconfigure?.ai_prompt || '');
  const [dmDelayHours, setDmDelayHours] = useState((connectionConfig || searchConnectionDMConfig) ? 2 : 0);
  const [fallbackMessage, setFallbackMessage] = useState(reconfigure?.fallback_message || '');
  // Build initial fallbacks from reconfigure messages
  const [fallbacks, setFallbacks] = useState(() => {
    if (reconfigure?.messages) {
      const fb = {};
      reconfigure.messages.forEach(m => { if (m.fallback_template) fb[m.sequence] = m.fallback_template; });
      return fb;
    }
    return {};
  });

  // Messages
  const [mode, setMode] = useState(reconfigure ? 'full' : 'template');
  const [messages, setMessages] = useState(() => {
    if (reconfigure?.messages?.length) return reconfigure.messages.map(m => ({ sequence: m.sequence, message_template: m.message_template || '', delay_days: m.delay_days || 0 }));
    return [{ sequence: 0, message_template: '', delay_days: 0 }];
  });
  const [generating, setGenerating] = useState(false);
  const [regeneratingIdx, setRegeneratingIdx] = useState(null);
  // Full mode
  const [followupCount, setFollowupCount] = useState(() => {
    if (reconfigure?.messages) { const fups = reconfigure.messages.filter(m => m.sequence > 0); return fups.length; }
    return 0;
  });
  const [followupDelays, setFollowupDelays] = useState(() => {
    if (reconfigure?.messages) return reconfigure.messages.filter(m => m.sequence > 0).map(m => m.delay_days || 1);
    return [];
  });
  const [previews, setPreviews] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [extraInstructions, setExtraInstructions] = useState('');

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

  // Template helpers
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
    if (!aiPrompt.trim()) return toast.error('Donne des instructions a l\'IA');
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

  // Full mode helpers
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
    if (!aiPrompt.trim()) return toast.error('Donne des instructions a l\'IA');
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

  // Launch (or save for reconfigure)
  const handleLaunch = async () => {
    if (!name.trim()) return toast.error('Donne un nom');
    if (!crmId) return toast.error('Selectionne un CRM');
    if (mode === 'template' && !messages[0].message_template.trim()) return toast.error('Message principal vide');
    if (mode === 'full' && !aiPrompt.trim()) return toast.error('Donne des instructions a l\'IA');
    setLaunching(true);
    try {
      // Reconfigure mode: update existing campaign and resume
      if (reconfigure) {
        let msgPayload;
        if (mode === 'full') {
          msgPayload = [{ sequence: 0, message_template: '__FULL_AI__', fallback_template: fallbacks[0] || fallbackMessage || null, delay_days: 0 }];
          for (let i = 0; i < followupCount; i++) {
            msgPayload.push({ sequence: i + 1, message_template: '__FULL_AI__', fallback_template: fallbacks[i + 1] || null, delay_days: followupDelays[i] || 3 });
          }
        } else {
          msgPayload = messages.map((m) => ({ sequence: m.sequence, message_template: m.message_template, fallback_template: fallbacks[m.sequence] || null, delay_days: m.delay_days }));
        }
        await updateCampaign(reconfigure.id, {
          ai_prompt: [aiPrompt, extraInstructions].filter(Boolean).join('\n\nConsignes supplementaires:\n') || null,
          context_text: contextText || null,
          fallback_message: fallbackMessage.trim() || null,
          messages: msgPayload,
        });
        await resumeCampaign(reconfigure.id);
        toast.success('Campagne reconfiguree et relancee');
        navigate(`/dashboard/campaigns/${reconfigure.id}`);
        return;
      }

      const totalContacts = crms.find((c) => c.id === parseInt(crmId))?.contact_count || 50;
      let msgPayload;
      if (mode === 'full') {
        msgPayload = [{ sequence: 0, message_template: '__FULL_AI__', fallback_template: fallbacks[0] || fallbackMessage || null, delay_days: 0 }];
        for (let i = 0; i < followupCount; i++) {
          msgPayload.push({ sequence: i + 1, message_template: '__FULL_AI__', fallback_template: fallbacks[i + 1] || null, delay_days: followupDelays[i] || 3 });
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
        fallback_message: fallbackMessage.trim() || null,
      };
      if (searchConnectionDMConfig) {
        payload.keywords = searchConnectionDMConfig.keywords || '';
        payload.is_search_connection_dm = true;
        payload.dm_delay_hours = dmDelayHours;
        payload.total_target = searchConnectionDMConfig.total_target;
        if (searchConnectionDMConfig.search_regions?.length) {
          payload.search_regions = searchConnectionDMConfig.search_regions;
        }
      } else if (connectionConfig) {
        payload.keywords = connectionConfig.keywords || '';
        payload.is_connection_dm = true;
        payload.dm_delay_hours = dmDelayHours;
      }
      const { data } = await client.post('/campaigns/dm', payload);
      toast.success('Campagne lancee !');
      navigate(`/dashboard/campaigns/${data.id}`);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erreur');
    } finally { setLaunching(false); }
  };

  const selectedCrm = crms.find((c) => c.id === parseInt(crmId));
  const canLaunch = name.trim() && crmId && (mode === 'full' ? aiPrompt.trim() : messages[0].message_template.trim());

  if (loading) return (
    <PageWrapper><div className="flex justify-center py-20"><Loader2 size={32} className="animate-spin" style={{ color: 'var(--blue)' }} /></div></PageWrapper>
  );

  return (
    <PageWrapper>
      {/* Header */}
      <div className="flex items-center gap-3 mb-7">
        <button onClick={() => navigate(reconfigure ? `/dashboard/campaigns/${reconfigure.id}` : '/dashboard/campaigns')}
          className="p-2 rounded-lg transition-colors"
          style={{ color: 'hsl(var(--muted))' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'hsl(220 18% 96%)'; e.currentTarget.style.color = 'hsl(var(--text))'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'hsl(var(--muted))'; }}>
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <div className="eyebrow mb-1">
            {reconfigure ? 'Reconfigurer' : searchConnectionDMConfig ? 'Recherche + Connexion + DM' : connectionConfig ? 'Connexion + DM' : 'Campagne'}
          </div>
          <h1 className="text-[24px] font-semibold tracking-tight"
            style={{ color: 'hsl(var(--text))', letterSpacing: '-0.02em' }}>
            {reconfigure ? 'Reconfigurer la campagne' : searchConnectionDMConfig ? 'Campagne Recherche + Connexion + DM' : connectionConfig ? 'Campagne Connexion + DM' : 'Campagne Message'}
          </h1>
          <p className="text-[12.5px] mt-0.5" style={{ color: 'hsl(var(--muted))' }}>
            {reconfigure ? 'Modifiez les messages et ajoutez un message de secours' : searchConnectionDMConfig ? 'Recherche + connexion + messages après acceptation' : connectionConfig ? 'Messages après acceptation de la connexion' : 'Configurez et visualisez votre séquence de messages'}
          </p>
        </div>
        <button onClick={handleLaunch} disabled={launching || !canLaunch}
          className="cta-btn flex items-center gap-2"
          style={{ padding: '11px 24px', fontSize: 13.5 }}>
          {launching ? <><Loader2 size={16} className="animate-spin" /> {reconfigure ? 'Sauvegarde…' : 'Lancement…'}</> : reconfigure ? <><Save size={16} /> Sauvegarder</> : <><Rocket size={16} /> Lancer</>}
        </button>
      </div>

      {/* Two-column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 24, alignItems: 'start' }}>

        {/* ======== LEFT: Configuration ======== */}
        <div className="space-y-4" style={{ position: 'sticky', top: 80 }}>
          {/* General */}
          <div className="g-card !p-5 space-y-3.5">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                style={{ background: 'hsl(var(--accent) / .12)', color: 'hsl(var(--accent))' }}>
                <Send size={13} />
              </div>
              <h3 className="text-[13.5px] font-semibold" style={{ color: 'hsl(var(--text))', letterSpacing: '-0.005em' }}>Configuration</h3>
            </div>
            <div>
              <label className="block text-[11px] font-medium mb-1.5" style={{ color: 'hsl(var(--muted))' }}>Nom</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex : Prospection Q2"
                className="input-glass w-full" style={{ fontSize: 13 }} disabled={!!reconfigure} />
            </div>
            <div>
              <label className="block text-[11px] font-medium mb-1.5" style={{ color: 'hsl(var(--muted))' }}>CRM cible</label>
              <select value={crmId} onChange={(e) => setCrmId(e.target.value)}
                className="input-glass w-full" style={{ fontSize: 13 }} disabled={!!reconfigure}>
                <option value="">Sélectionner…</option>
                {crms.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.contact_count})</option>)}
              </select>
            </div>
            {(connectionConfig || searchConnectionDMConfig) && (
              <div>
                <label className="block text-[11px] font-medium mb-1.5" style={{ color: 'hsl(var(--muted))' }}>Délai avant DM (après acceptation)</label>
                <div className="flex items-center gap-2">
                  <input type="number" min={0} max={168} value={dmDelayHours} onChange={(e) => setDmDelayHours(parseInt(e.target.value) || 0)}
                    className="input-glass w-20" style={{ fontSize: 13 }} />
                  <span className="text-[11.5px]" style={{ color: 'hsl(var(--muted))' }}>heure(s)</span>
                </div>
              </div>
            )}
          </div>

          {/* Context */}
          <div className="g-card !p-5 space-y-3.5">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                style={{ background: 'hsl(var(--amber) / .14)', color: 'hsl(var(--amber))' }}>
                <FileText size={13} />
              </div>
              <h3 className="text-[13.5px] font-semibold" style={{ color: 'hsl(var(--text))', letterSpacing: '-0.005em' }}>Contexte</h3>
            </div>
            <textarea value={contextText} onChange={(e) => setContextText(e.target.value)}
              rows={3} placeholder="Votre offre, produit, service…"
              className="input-glass w-full resize-none" style={{ fontSize: 12.5 }} />
            <div className="flex items-center gap-2">
              <label className="ghost-btn !py-1.5 !px-3 cursor-pointer flex items-center gap-1.5"
                style={{ fontSize: 11.5 }}>
                {extracting ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                {extracting ? 'Extraction…' : 'PDF'}
                <input type="file" accept=".pdf" onChange={handlePdfUpload} className="hidden" disabled={extracting} />
              </label>
              {pdfName && (
                <span className="chip emerald truncate flex-1" style={{ fontSize: 10.5 }} title={pdfName}>
                  {pdfName}
                </span>
              )}
            </div>
          </div>

          {/* AI */}
          <div className="g-card !p-5 space-y-3"
            style={useAi ? {
              borderColor: 'hsl(var(--violet) / .35)',
              background: 'linear-gradient(180deg, hsl(var(--panel)) 0%, hsl(262 100% 99%) 100%)',
            } : undefined}>
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input type="checkbox" checked={useAi} onChange={(e) => setUseAi(e.target.checked)}
                className="w-4 h-4 rounded"
                style={{ accentColor: 'hsl(var(--violet))' }} />
              <Sparkles size={14} style={{ color: 'hsl(var(--violet))' }} />
              <span className="text-[13px] font-semibold" style={{ color: 'hsl(var(--violet))' }}>IA Gemini</span>
              {!aiAvailable && (
                <span className="chip slate" style={{ fontSize: 9.5, padding: '1px 6px' }}>non configurée</span>
              )}
            </label>
            {useAi && (
              <textarea value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)}
                rows={3} placeholder="Instructions pour l'IA…"
                className="input-glass w-full resize-none" style={{ fontSize: 12.5 }} />
            )}
          </div>

          {/* Fallback message — only show here in template mode (in full mode it's in the workflow) */}
          {useAi && mode !== 'full' && (
            <div className="g-card !p-5 space-y-3"
              style={{
                borderColor: 'hsl(var(--amber) / .35)',
                background: 'linear-gradient(180deg, hsl(var(--panel)) 0%, hsl(38 100% 98%) 100%)',
              }}>
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                  style={{ background: 'hsl(var(--amber) / .14)', color: 'hsl(var(--amber))' }}>
                  <AlertCircle size={13} />
                </div>
                <h3 className="text-[13.5px] font-semibold" style={{ color: 'hsl(var(--text))', letterSpacing: '-0.005em' }}>Message de secours</h3>
              </div>
              <p className="text-[11.5px] leading-relaxed" style={{ color: 'hsl(var(--muted))' }}>
                Si l'IA échoue après 3 tentatives, ce message sera envoyé à la place.
              </p>
              <textarea value={fallbackMessage} onChange={(e) => setFallbackMessage(e.target.value)}
                rows={3} placeholder={`Bonjour {first_name},\n\nJ'aimerais échanger avec vous sur…`}
                className="input-glass w-full resize-none" style={{ fontSize: 12.5 }} />
              <div className="flex flex-wrap gap-1.5">
                {['{first_name}', '{last_name}', '{headline}'].map((v) => (
                  <span key={v} className="chip amber mono" style={{ fontSize: 10 }}>{v}</span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ======== RIGHT: Workflow ======== */}
        <div>
          {/* Mode selector */}
          {useAi && (
            <div className="flex gap-2 mb-5">
              <button onClick={() => { setMode('template'); setPreviews(null); }}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-medium transition-all"
                style={mode === 'template'
                  ? { border: '1.5px solid hsl(var(--accent) / .5)', background: 'hsl(var(--accent-soft))', color: 'hsl(var(--accent))' }
                  : { border: '1.5px solid hsl(var(--border))', background: 'hsl(var(--panel))', color: 'hsl(var(--muted))' }}>
                <PenTool size={14} /> Template + variables
              </button>
              <button onClick={() => { setMode('full'); setPreviews(null); }}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-medium transition-all"
                style={mode === 'full'
                  ? { border: '1.5px solid hsl(var(--violet) / .5)', background: 'hsl(262 90% 97%)', color: 'hsl(var(--violet))' }
                  : { border: '1.5px solid hsl(var(--border))', background: 'hsl(var(--panel))', color: 'hsl(var(--muted))' }}>
                <Wand2 size={14} /> IA complète
              </button>
            </div>
          )}

          {/* AI generate button */}
          {mode === 'template' && useAi && aiPrompt && (
            <button onClick={generateAllMessages} disabled={generating}
              className="w-full mb-4 flex items-center justify-center gap-2 transition-all"
              style={{
                padding: '11px 18px',
                fontSize: 13.5, fontWeight: 600,
                color: 'white',
                background: 'linear-gradient(135deg, hsl(var(--violet)), hsl(262 75% 52%))',
                borderRadius: 12,
                border: '1px solid hsl(var(--violet) / .6)',
                boxShadow: '0 6px 16px -8px hsl(var(--violet) / .5)',
                cursor: generating ? 'not-allowed' : 'pointer',
                opacity: generating ? 0.5 : 1,
              }}>
              {generating ? <><Loader2 size={16} className="animate-spin" /> Génération…</> : <><Sparkles size={16} /> Générer avec l'IA</>}
            </button>
          )}

          {/* ======== TEMPLATE WORKFLOW ======== */}
          {mode === 'template' && (
            <div style={{ position: 'relative' }}>
              {messages.map((msg, idx) => (
                <div key={idx}>
                  {/* Delay connector */}
                  {idx > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '4px 0' }}>
                      <div style={{ width: 1.5, height: 16, background: 'hsl(var(--border-strong))' }} />
                      <div className="flex items-center gap-1.5"
                        style={{
                          padding: '4px 12px', borderRadius: 999,
                          background: 'hsl(var(--panel))',
                          border: '1px solid hsl(var(--border))',
                          boxShadow: '0 1px 2px hsl(220 40% 20% / .04)',
                        }}>
                        <Clock size={11} style={{ color: 'hsl(var(--muted))' }} />
                        <span className="text-[11px] font-medium" style={{ color: 'hsl(var(--muted))' }}>après</span>
                        <input type="number" value={msg.delay_days} min={1} max={30}
                          onChange={(e) => updateMessage(idx, 'delay_days', parseInt(e.target.value) || 1)}
                          className="mono"
                          style={{
                            width: 36, padding: '2px 4px',
                            border: '1px solid hsl(var(--border))', borderRadius: 6,
                            fontSize: 11, textAlign: 'center',
                            background: 'hsl(var(--bg))',
                            color: 'hsl(var(--text))',
                          }} />
                        <span className="text-[11px]" style={{ color: 'hsl(var(--muted))' }}>jours</span>
                      </div>
                      <div style={{ width: 1.5, height: 16, background: 'hsl(var(--border-strong))' }} />
                    </div>
                  )}

                  {/* Message node */}
                  <div style={{
                    border: idx === 0 ? '1.5px solid hsl(var(--accent) / .55)' : '1px solid hsl(var(--border))',
                    borderRadius: 18, overflow: 'hidden',
                    background: 'hsl(var(--panel))',
                    boxShadow: idx === 0
                      ? '0 12px 30px -16px hsl(var(--accent) / .25), 0 2px 6px hsl(220 40% 20% / .04)'
                      : '0 1px 3px hsl(220 40% 20% / .04)',
                  }}>
                    {/* Node header */}
                    <div className="flex items-center justify-between"
                      style={{
                        padding: '10px 16px',
                        background: idx === 0
                          ? 'linear-gradient(135deg, hsl(var(--accent)), hsl(214 95% 50%))'
                          : 'hsl(220 22% 98%)',
                        borderBottom: idx === 0 ? 'none' : '1px solid hsl(var(--border))',
                      }}>
                      <div className="flex items-center gap-2.5">
                        <div className="flex items-center justify-center"
                          style={{
                            width: 24, height: 24, borderRadius: 8,
                            background: idx === 0 ? 'rgba(255,255,255,0.22)' : 'hsl(220 18% 92%)',
                            color: idx === 0 ? '#fff' : 'hsl(var(--muted))',
                            fontSize: 11, fontWeight: 700,
                          }}>
                          {idx === 0 ? <Send size={11} /> : idx}
                        </div>
                        <span className="text-[13px] font-semibold"
                          style={{
                            color: idx === 0 ? '#fff' : 'hsl(var(--text))',
                            letterSpacing: '-0.005em',
                          }}>
                          {idx === 0 ? 'Message principal' : `Relance ${idx}`}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        {useAi && aiPrompt && (
                          <button onClick={() => regenerateOne(idx)} disabled={regeneratingIdx === idx}
                            style={{
                              background: 'none', border: 'none', cursor: 'pointer',
                              padding: 5, borderRadius: 6,
                              color: idx === 0 ? 'rgba(255,255,255,0.85)' : 'hsl(var(--muted))',
                              transition: 'background 0.15s',
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = idx === 0 ? 'rgba(255,255,255,0.15)' : 'hsl(220 18% 96%)'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                            {regeneratingIdx === idx ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                          </button>
                        )}
                        {idx > 0 && (
                          <button onClick={() => removeFollowup(idx)}
                            style={{
                              background: 'none', border: 'none', cursor: 'pointer',
                              padding: 5, borderRadius: 6,
                              color: 'hsl(var(--rose))',
                              transition: 'background 0.15s',
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = 'hsl(352 90% 96%)'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Node body */}
                    <div style={{ padding: 16 }}>
                      <textarea value={msg.message_template} onChange={(e) => updateMessage(idx, 'message_template', e.target.value)}
                        rows={3} placeholder={idx === 0
                          ? `Bonjour {first_name},\n{compliment}\n…`
                          : `Bonjour {first_name}, je me permets de revenir vers vous…`}
                        className="input-glass w-full resize-none"
                        style={{ fontSize: 12.5, lineHeight: 1.55 }} />
                      <div className="flex flex-wrap gap-1.5 mt-2.5">
                        {['{first_name}', '{last_name}', '{headline}', '{location}'].map((v) => (
                          <span key={v} className="chip slate mono" style={{ fontSize: 10 }}>{v}</span>
                        ))}
                        {useAi && (
                          <span className="chip violet mono" style={{ fontSize: 10, fontWeight: 600 }}>{'{compliment}'}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {/* Add follow-up button */}
              {messages.length < 8 && (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '6px 0' }}>
                    <div style={{ width: 1.5, height: 20, borderLeft: '1.5px dashed hsl(var(--border-strong))' }} />
                  </div>
                  <button onClick={addFollowup}
                    className="w-full flex items-center justify-center gap-2 transition-all"
                    style={{
                      padding: '12px 0',
                      border: '1.5px dashed hsl(var(--border-strong))',
                      borderRadius: 14,
                      background: 'transparent',
                      cursor: 'pointer',
                      fontSize: 13, fontWeight: 500,
                      color: 'hsl(var(--muted))',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'hsl(var(--accent))'; e.currentTarget.style.color = 'hsl(var(--accent))'; e.currentTarget.style.background = 'hsl(var(--accent-soft))'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'hsl(var(--border-strong))'; e.currentTarget.style.color = 'hsl(var(--muted))'; e.currentTarget.style.background = 'transparent'; }}>
                    <Plus size={15} /> Ajouter une relance ({messages.length - 1}/7)
                  </button>
                </>
              )}
            </div>
          )}

          {/* ======== FULL AI WORKFLOW ======== */}
          {mode === 'full' && (
            <div>
              {/* Info card */}
              <div className="g-card !p-5 mb-4"
                style={{
                  background: 'linear-gradient(135deg, hsl(var(--panel)) 0%, hsl(262 100% 98%) 100%)',
                  border: '1px solid hsl(var(--violet) / .3)',
                }}>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{ background: 'hsl(var(--violet) / .14)', color: 'hsl(var(--violet))' }}>
                    <Wand2 size={15} />
                  </div>
                  <span className="text-[14px] font-semibold" style={{ color: 'hsl(var(--violet))', letterSpacing: '-0.005em' }}>
                    Message entier par l'IA
                  </span>
                </div>
                <p className="text-[12px] leading-relaxed" style={{ color: 'hsl(var(--muted))' }}>
                  Chaque message sera écrit de A à Z en fonction du profil LinkedIn du contact.
                </p>
              </div>

              {/* Visual flow nodes */}
              <div>
                {/* Main message node */}
                <div style={{
                  border: '1.5px solid hsl(var(--violet) / .55)', borderRadius: 18, overflow: 'hidden',
                  background: 'hsl(var(--panel))',
                  boxShadow: '0 12px 30px -16px hsl(var(--violet) / .25), 0 2px 6px hsl(220 40% 20% / .04)',
                }}>
                  <div className="flex items-center gap-2.5"
                    style={{
                      padding: '10px 16px',
                      background: 'linear-gradient(135deg, hsl(var(--violet)), hsl(262 75% 52%))',
                    }}>
                    <div className="flex items-center justify-center"
                      style={{ width: 24, height: 24, borderRadius: 8, background: 'rgba(255,255,255,0.22)' }}>
                      <Send size={11} color="#fff" />
                    </div>
                    <span className="text-[13px] font-semibold" style={{ color: '#fff', letterSpacing: '-0.005em' }}>Message principal</span>
                  </div>
                  <div style={{ padding: 16 }}>
                    <p className="text-[12px] italic mb-3" style={{ color: 'hsl(var(--muted))' }}>
                      Généré automatiquement par l'IA pour chaque contact
                    </p>
                    <div style={{
                      background: 'linear-gradient(180deg, hsl(var(--panel)) 0%, hsl(38 100% 98%) 100%)',
                      border: '1px solid hsl(var(--amber) / .35)',
                      borderRadius: 10, padding: 12,
                    }}>
                      <div className="flex items-center gap-2 mb-2">
                        <AlertCircle size={12} style={{ color: 'hsl(var(--amber))' }} />
                        <span className="text-[11px] font-semibold" style={{ color: 'hsl(var(--amber))', letterSpacing: '-0.005em' }}>
                          Message de secours
                        </span>
                      </div>
                      <textarea value={fallbacks[0] || ''} onChange={(e) => setFallbacks({ ...fallbacks, 0: e.target.value })}
                        rows={2} placeholder={`Bonjour {first_name}, j'aimerais échanger avec vous…`}
                        className="input-glass w-full resize-none" style={{ fontSize: 11.5 }} />
                      <div className="flex flex-wrap gap-1 mt-2">
                        {['{first_name}', '{last_name}', '{headline}'].map((v) => (
                          <span key={v} className="chip amber mono" style={{ fontSize: 9.5 }}>{v}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Follow-up nodes */}
                {Array.from({ length: followupCount }).map((_, i) => (
                  <div key={i}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '6px 0' }}>
                      <div style={{ width: 1.5, height: 16, background: 'hsl(var(--border-strong))' }} />
                      <div className="flex items-center gap-1.5"
                        style={{
                          padding: '4px 12px', borderRadius: 999,
                          background: 'hsl(var(--panel))',
                          border: '1px solid hsl(var(--border))',
                          boxShadow: '0 1px 2px hsl(220 40% 20% / .04)',
                        }}>
                        <Clock size={11} style={{ color: 'hsl(var(--muted))' }} />
                        <span className="text-[11px] font-medium" style={{ color: 'hsl(var(--muted))' }}>après</span>
                        <input type="number" value={followupDelays[i] || 3} min={1} max={30}
                          onChange={(e) => updateFollowupDelay(i, e.target.value)}
                          className="mono"
                          style={{
                            width: 36, padding: '2px 4px',
                            border: '1px solid hsl(var(--border))', borderRadius: 6,
                            fontSize: 11, textAlign: 'center',
                            background: 'hsl(var(--bg))',
                            color: 'hsl(var(--text))',
                          }} />
                        <span className="text-[11px]" style={{ color: 'hsl(var(--muted))' }}>jours</span>
                      </div>
                      <div style={{ width: 1.5, height: 16, background: 'hsl(var(--border-strong))' }} />
                    </div>
                    <div style={{
                      border: '1px solid hsl(var(--border))', borderRadius: 18, overflow: 'hidden',
                      background: 'hsl(var(--panel))',
                      boxShadow: '0 1px 3px hsl(220 40% 20% / .04)',
                    }}>
                      <div className="flex items-center justify-between"
                        style={{
                          padding: '10px 16px',
                          background: 'hsl(220 22% 98%)',
                          borderBottom: '1px solid hsl(var(--border))',
                        }}>
                        <div className="flex items-center gap-2.5">
                          <div className="flex items-center justify-center"
                            style={{
                              width: 24, height: 24, borderRadius: 8,
                              background: 'hsl(220 18% 92%)',
                              color: 'hsl(var(--muted))',
                              fontSize: 11, fontWeight: 700,
                            }}>{i + 1}</div>
                          <span className="text-[13px] font-semibold" style={{ color: 'hsl(var(--text))', letterSpacing: '-0.005em' }}>
                            Relance {i + 1}
                          </span>
                        </div>
                        <button onClick={removeFullFollowup}
                          style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            padding: 5, borderRadius: 6, color: 'hsl(var(--rose))',
                          }}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                      <div style={{ padding: 16 }}>
                        <p className="text-[12px] italic mb-3" style={{ color: 'hsl(var(--muted))' }}>
                          Généré automatiquement par l'IA
                        </p>
                        <div style={{
                          background: 'linear-gradient(180deg, hsl(var(--panel)) 0%, hsl(38 100% 98%) 100%)',
                          border: '1px solid hsl(var(--amber) / .35)',
                          borderRadius: 10, padding: 12,
                        }}>
                          <div className="flex items-center gap-2 mb-2">
                            <AlertCircle size={12} style={{ color: 'hsl(var(--amber))' }} />
                            <span className="text-[11px] font-semibold" style={{ color: 'hsl(var(--amber))', letterSpacing: '-0.005em' }}>
                              Message de secours
                            </span>
                          </div>
                          <textarea value={fallbacks[i + 1] || ''} onChange={(e) => setFallbacks({ ...fallbacks, [i + 1]: e.target.value })}
                            rows={2} placeholder={`Bonjour {first_name}, je me permets de vous relancer…`}
                            className="input-glass w-full resize-none" style={{ fontSize: 11.5 }} />
                          <div className="flex flex-wrap gap-1 mt-2">
                            {['{first_name}', '{last_name}', '{headline}'].map((v) => (
                              <span key={v} className="chip amber mono" style={{ fontSize: 9.5 }}>{v}</span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Add follow-up */}
                {followupCount < 7 && (
                  <>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '6px 0' }}>
                      <div style={{ width: 1.5, height: 20, borderLeft: '1.5px dashed hsl(var(--border-strong))' }} />
                    </div>
                    <button onClick={addFullFollowup}
                      className="w-full flex items-center justify-center gap-2 transition-all"
                      style={{
                        padding: '12px 0',
                        border: '1.5px dashed hsl(var(--border-strong))',
                        borderRadius: 14,
                        background: 'transparent',
                        cursor: 'pointer',
                        fontSize: 13, fontWeight: 500,
                        color: 'hsl(var(--muted))',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'hsl(var(--violet))'; e.currentTarget.style.color = 'hsl(var(--violet))'; e.currentTarget.style.background = 'hsl(262 100% 98%)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'hsl(var(--border-strong))'; e.currentTarget.style.color = 'hsl(var(--muted))'; e.currentTarget.style.background = 'transparent'; }}>
                      <Plus size={15} /> Ajouter une relance ({followupCount}/7)
                    </button>
                  </>
                )}
              </div>

              {/* Extra instructions */}
              <div style={{ marginTop: 18 }}>
                <label className="block text-[11.5px] font-medium mb-1.5" style={{ color: 'hsl(var(--violet))', letterSpacing: '-0.005em' }}>
                  Consignes supplémentaires (optionnel)
                </label>
                <textarea value={extraInstructions} onChange={(e) => { setExtraInstructions(e.target.value); setPreviews(null); }}
                  rows={2} placeholder="Ex : Ton direct et amical, pose une question ouverte…"
                  className="input-glass w-full resize-none"
                  style={{
                    fontSize: 12.5,
                    borderColor: 'hsl(var(--violet) / .3)',
                  }} />
              </div>

              {/* Preview button */}
              <button onClick={generatePreviews} disabled={previewLoading}
                className="w-full flex items-center justify-center gap-2 transition-all"
                style={{
                  marginTop: 12, padding: '11px 18px',
                  borderRadius: 12,
                  border: '1.5px solid hsl(var(--violet) / .4)',
                  background: 'hsl(262 100% 98%)',
                  cursor: previewLoading ? 'not-allowed' : 'pointer',
                  fontSize: 13, fontWeight: 600,
                  color: 'hsl(var(--violet))',
                  opacity: previewLoading ? 0.6 : 1,
                }}>
                {previewLoading
                  ? <><Loader2 size={14} className="animate-spin" /> Analyse des profils…</>
                  : <><Eye size={14} /> {previews ? 'Régénérer les aperçus' : 'Aperçu sur 3 contacts'}</>
                }
              </button>

              {/* Preview results */}
              {previews && (
                <div style={{ marginTop: 18 }} className="space-y-3">
                  <h4 className="flex items-center gap-2 text-[13px] font-semibold"
                    style={{ color: 'hsl(var(--text))', letterSpacing: '-0.005em' }}>
                    <Eye size={14} style={{ color: 'hsl(var(--violet))' }} /> Aperçu
                  </h4>
                  {previews.map((preview, pIdx) => (
                    <div key={pIdx} className="g-card overflow-hidden" style={{ borderRadius: 14 }}>
                      <div className="flex items-center gap-2.5"
                        style={{
                          padding: '10px 14px',
                          background: 'hsl(220 22% 98%)',
                          borderBottom: '1px solid hsl(var(--border))',
                        }}>
                        {preview.contact.profile_picture_url ? (
                          <img src={preview.contact.profile_picture_url} alt=""
                            style={{ width: 28, height: 28, borderRadius: 99, objectFit: 'cover' }} />
                        ) : (
                          <div className="flex items-center justify-center font-semibold"
                            style={{
                              width: 28, height: 28, borderRadius: 99,
                              background: 'hsl(var(--accent-soft))',
                              color: 'hsl(var(--accent))',
                              fontSize: 10,
                            }}>
                            {(preview.contact.first_name?.[0] || '')}{(preview.contact.last_name?.[0] || '')}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-[12.5px] font-semibold truncate" style={{ color: 'hsl(var(--text))' }}>
                            {preview.contact.first_name} {preview.contact.last_name}
                          </p>
                          {preview.contact.headline && (
                            <p className="text-[10.5px] truncate" style={{ color: 'hsl(var(--muted))' }}>
                              {preview.contact.headline}
                            </p>
                          )}
                        </div>
                      </div>
                      <div style={{ padding: 14 }}>
                        {preview.messages.map((rm, mIdx) => (
                          <div key={mIdx} style={{ marginBottom: mIdx < preview.messages.length - 1 ? 12 : 0 }}>
                            <span className={`chip ${mIdx === 0 ? 'blue' : 'slate'}`}
                              style={{ fontSize: 10, fontWeight: 600 }}>
                              {mIdx === 0 ? 'Principal' : `Relance ${mIdx}`}
                            </span>
                            <div style={{
                              marginTop: 6, padding: '10px 12px', borderRadius: 8,
                              background: 'hsl(220 22% 98%)',
                              fontSize: 12.5, color: 'hsl(var(--text))',
                              whiteSpace: 'pre-wrap', lineHeight: 1.55,
                              borderLeft: '2.5px solid hsl(var(--accent) / .5)',
                            }}>
                              {rm.rendered}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </PageWrapper>
  );
}

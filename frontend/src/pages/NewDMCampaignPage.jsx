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
  const [crms, setCrms] = useState([]);
  const [aiAvailable, setAiAvailable] = useState(false);
  const [loading, setLoading] = useState(true);

  // Config
  const [name, setName] = useState(connectionConfig?.name || '');
  const [crmId, setCrmId] = useState(connectionConfig?.crm_id?.toString() || '');
  const [contextText, setContextText] = useState('');
  const [pdfName, setPdfName] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [useAi, setUseAi] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [dmDelayHours, setDmDelayHours] = useState(connectionConfig ? 2 : 0);

  // Messages
  const [mode, setMode] = useState('template');
  const [messages, setMessages] = useState([
    { sequence: 0, message_template: '', delay_days: 0 },
  ]);
  const [generating, setGenerating] = useState(false);
  const [regeneratingIdx, setRegeneratingIdx] = useState(null);
  // Full mode
  const [followupCount, setFollowupCount] = useState(0);
  const [followupDelays, setFollowupDelays] = useState([]);
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

  // Launch
  const handleLaunch = async () => {
    if (!name.trim()) return toast.error('Donne un nom');
    if (!crmId) return toast.error('Selectionne un CRM');
    if (mode === 'template' && !messages[0].message_template.trim()) return toast.error('Message principal vide');
    if (mode === 'full' && !aiPrompt.trim()) return toast.error('Donne des instructions a l\'IA');
    setLaunching(true);
    try {
      const totalContacts = crms.find((c) => c.id === parseInt(crmId))?.contact_count || 50;
      let msgPayload;
      if (mode === 'full') {
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
      };
      if (connectionConfig) {
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
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/dashboard/campaigns')} className="p-2 hover:bg-gray-200 rounded-lg">
          <ArrowLeft size={20} className="text-gray-600" />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900 f">
            {connectionConfig ? 'Campagne Connexion + DM' : 'Campagne Message'}
          </h1>
          <p className="text-xs text-gray-500">
            {connectionConfig ? 'Messages apres acceptation de la connexion' : 'Configurez et visualisez votre sequence de messages'}
          </p>
        </div>
        <button onClick={handleLaunch} disabled={launching || !canLaunch}
          className="cta-btn flex items-center gap-2 disabled:opacity-40"
          style={{ padding: '10px 24px', fontSize: 14 }}>
          {launching ? <><Loader2 size={16} className="animate-spin" /> Lancement...</> : <><Rocket size={16} /> Lancer</>}
        </button>
      </div>

      {/* Two-column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 24, alignItems: 'start' }}>

        {/* ======== LEFT: Configuration ======== */}
        <div className="space-y-4" style={{ position: 'sticky', top: 80 }}>
          {/* General */}
          <div className="g-card !p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <Send size={14} style={{ color: 'var(--blue)' }} /> Configuration
            </h3>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Nom</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Prospection Q2"
                className="input-glass w-full" style={{ fontSize: 13 }} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">CRM cible</label>
              <select value={crmId} onChange={(e) => setCrmId(e.target.value)}
                className="input-glass w-full" style={{ fontSize: 13 }}>
                <option value="">Selectionner...</option>
                {crms.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.contact_count})</option>)}
              </select>
            </div>
            {connectionConfig && (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Delai avant DM (apres acceptation)</label>
                <div className="flex items-center gap-2">
                  <input type="number" min={0} max={168} value={dmDelayHours} onChange={(e) => setDmDelayHours(parseInt(e.target.value) || 0)}
                    className="input-glass w-20" style={{ fontSize: 13 }} />
                  <span className="text-xs text-gray-500">heure(s)</span>
                </div>
              </div>
            )}
          </div>

          {/* Context */}
          <div className="g-card !p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <FileText size={14} className="text-orange-500" /> Contexte
            </h3>
            <textarea value={contextText} onChange={(e) => setContextText(e.target.value)}
              rows={3} placeholder="Votre offre, produit, service..."
              className="input-glass w-full resize-none" style={{ fontSize: 12 }} />
            <div className="flex items-center gap-2">
              <label className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50 cursor-pointer flex items-center gap-1.5">
                {extracting ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                {extracting ? 'Extraction...' : 'PDF'}
                <input type="file" accept=".pdf" onChange={handlePdfUpload} className="hidden" disabled={extracting} />
              </label>
              {pdfName && <span className="text-[10px] text-green-600 truncate flex-1">{pdfName}</span>}
            </div>
          </div>

          {/* AI */}
          <div className="g-card !p-4 space-y-3" style={useAi ? { borderColor: 'rgba(147,51,234,0.3)', background: 'rgba(147,51,234,0.02)' } : undefined}>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={useAi} onChange={(e) => setUseAi(e.target.checked)}
                className="w-4 h-4 text-purple-600 rounded" />
              <Sparkles size={14} className="text-purple-500" />
              <span className="text-sm font-semibold text-purple-800">IA Gemini</span>
              {!aiAvailable && <span className="text-[10px] text-gray-400">(non configure)</span>}
            </label>
            {useAi && (
              <textarea value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)}
                rows={3} placeholder="Instructions pour l'IA..."
                className="w-full px-3 py-2 border border-purple-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-purple-400 resize-none bg-white" />
            )}
          </div>
        </div>

        {/* ======== RIGHT: Workflow ======== */}
        <div>
          {/* Mode selector */}
          {useAi && (
            <div className="flex gap-2 mb-5">
              <button onClick={() => { setMode('template'); setPreviews(null); }}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all border-2"
                style={mode === 'template'
                  ? { borderColor: 'var(--blue)', background: 'rgba(0,132,255,0.05)', color: 'var(--blue)' }
                  : { borderColor: '#e5e7eb', color: '#6b7280' }}>
                <PenTool size={14} /> Template + variables
              </button>
              <button onClick={() => { setMode('full'); setPreviews(null); }}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all border-2"
                style={mode === 'full'
                  ? { borderColor: '#9333ea', background: 'rgba(147,51,234,0.05)', color: '#9333ea' }
                  : { borderColor: '#e5e7eb', color: '#6b7280' }}>
                <Wand2 size={14} /> IA complete
              </button>
            </div>
          )}

          {/* AI generate button */}
          {mode === 'template' && useAi && aiPrompt && (
            <button onClick={generateAllMessages} disabled={generating}
              className="w-full mb-4 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-semibold rounded-xl text-sm hover:from-purple-700 hover:to-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2">
              {generating ? <><Loader2 size={16} className="animate-spin" /> Generation...</> : <><Sparkles size={16} /> Generer avec l'IA</>}
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
                      <div style={{ width: 2, height: 16, background: '#d1d5db' }} />
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '4px 12px', borderRadius: 99,
                        background: '#f3f4f6', border: '1px solid #e5e7eb',
                      }}>
                        <Clock size={12} style={{ color: '#9ca3af' }} />
                        <span style={{ fontSize: 11, color: '#6b7280', fontWeight: 500 }}>apres</span>
                        <input type="number" value={msg.delay_days} min={1} max={30}
                          onChange={(e) => updateMessage(idx, 'delay_days', parseInt(e.target.value) || 1)}
                          style={{
                            width: 36, padding: '2px 4px', border: '1px solid #d1d5db', borderRadius: 6,
                            fontSize: 11, textAlign: 'center', background: '#fff',
                          }} />
                        <span style={{ fontSize: 11, color: '#6b7280' }}>jours</span>
                      </div>
                      <div style={{ width: 2, height: 16, background: '#d1d5db' }} />
                    </div>
                  )}

                  {/* Message node */}
                  <div style={{
                    border: idx === 0 ? '2px solid var(--blue)' : '1px solid #e5e7eb',
                    borderRadius: 16, overflow: 'hidden',
                    background: '#fff',
                    boxShadow: idx === 0 ? '0 4px 12px rgba(0,132,255,0.08)' : '0 1px 4px rgba(0,0,0,0.04)',
                  }}>
                    {/* Node header */}
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '8px 14px',
                      background: idx === 0 ? 'linear-gradient(135deg, var(--blue), #2563eb)' : '#f9fafb',
                      borderBottom: idx === 0 ? 'none' : '1px solid #e5e7eb',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{
                          width: 22, height: 22, borderRadius: 8,
                          background: idx === 0 ? 'rgba(255,255,255,0.2)' : '#e5e7eb',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 11, fontWeight: 700,
                          color: idx === 0 ? '#fff' : '#6b7280',
                        }}>
                          {idx === 0 ? <Send size={11} /> : idx}
                        </div>
                        <span style={{
                          fontSize: 13, fontWeight: 600,
                          color: idx === 0 ? '#fff' : '#374151',
                        }}>
                          {idx === 0 ? 'Message principal' : `Relance ${idx}`}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        {useAi && aiPrompt && (
                          <button onClick={() => regenerateOne(idx)} disabled={regeneratingIdx === idx}
                            style={{
                              background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 6,
                              color: idx === 0 ? 'rgba(255,255,255,0.7)' : '#9ca3af',
                            }}>
                            {regeneratingIdx === idx ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                          </button>
                        )}
                        {idx > 0 && (
                          <button onClick={() => removeFollowup(idx)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 6, color: '#ef4444' }}>
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Node body */}
                    <div style={{ padding: 14 }}>
                      <textarea value={msg.message_template} onChange={(e) => updateMessage(idx, 'message_template', e.target.value)}
                        rows={3} placeholder={idx === 0
                          ? `Bonjour {first_name},\n{compliment}\n...`
                          : `Bonjour {first_name}, je me permets de revenir vers vous...`}
                        style={{
                          width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: 10,
                          fontSize: 12, resize: 'none', lineHeight: 1.5,
                          background: '#fafafa',
                        }} />
                      <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {['{first_name}', '{last_name}', '{headline}', '{location}'].map((v) => (
                          <span key={v} style={{
                            fontSize: 10, padding: '2px 6px', borderRadius: 4,
                            background: '#f3f4f6', color: '#6b7280', fontFamily: 'monospace',
                          }}>{v}</span>
                        ))}
                        {useAi && (
                          <span style={{
                            fontSize: 10, padding: '2px 6px', borderRadius: 4,
                            background: 'rgba(147,51,234,0.08)', color: '#9333ea', fontFamily: 'monospace', fontWeight: 600,
                          }}>{'{compliment}'}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {/* Add follow-up button */}
              {messages.length < 8 && (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '4px 0' }}>
                    <div style={{ width: 2, height: 20, background: '#e5e7eb', borderStyle: 'dashed' }} />
                  </div>
                  <button onClick={addFollowup}
                    style={{
                      width: '100%', padding: '12px 0',
                      border: '2px dashed #d1d5db', borderRadius: 14,
                      background: 'none', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      fontSize: 13, fontWeight: 500, color: '#9ca3af',
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--blue)'; e.currentTarget.style.color = 'var(--blue)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#d1d5db'; e.currentTarget.style.color = '#9ca3af'; }}>
                    <Plus size={16} /> Ajouter une relance ({messages.length - 1}/7)
                  </button>
                </>
              )}
            </div>
          )}

          {/* ======== FULL AI WORKFLOW ======== */}
          {mode === 'full' && (
            <div>
              {/* Info card */}
              <div style={{
                background: 'linear-gradient(135deg, rgba(147,51,234,0.06), rgba(99,102,241,0.06))',
                border: '1px solid rgba(147,51,234,0.15)', borderRadius: 14,
                padding: 16, marginBottom: 16,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <Wand2 size={18} className="text-purple-600" />
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#6b21a8' }}>Message entier par l'IA</span>
                </div>
                <p style={{ fontSize: 11, color: '#7c3aed', lineHeight: 1.5 }}>
                  Chaque message sera ecrit de A a Z en fonction du profil LinkedIn du contact.
                </p>
              </div>

              {/* Visual flow nodes */}
              <div>
                {/* Main message node */}
                <div style={{
                  border: '2px solid #9333ea', borderRadius: 14, overflow: 'hidden',
                  boxShadow: '0 4px 12px rgba(147,51,234,0.08)',
                }}>
                  <div style={{
                    padding: '8px 14px',
                    background: 'linear-gradient(135deg, #9333ea, #6366f1)',
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}>
                    <Send size={12} color="#fff" />
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>Message principal</span>
                  </div>
                  <div style={{ padding: 14 }}>
                    <p style={{ fontSize: 12, color: '#6b7280', fontStyle: 'italic' }}>
                      Genere automatiquement par l'IA pour chaque contact
                    </p>
                  </div>
                </div>

                {/* Follow-up nodes */}
                {Array.from({ length: followupCount }).map((_, i) => (
                  <div key={i}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '4px 0' }}>
                      <div style={{ width: 2, height: 16, background: '#d1d5db' }} />
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '4px 12px', borderRadius: 99,
                        background: '#f3f4f6', border: '1px solid #e5e7eb',
                      }}>
                        <Clock size={12} style={{ color: '#9ca3af' }} />
                        <span style={{ fontSize: 11, color: '#6b7280', fontWeight: 500 }}>apres</span>
                        <input type="number" value={followupDelays[i] || 3} min={1} max={30}
                          onChange={(e) => updateFollowupDelay(i, e.target.value)}
                          style={{
                            width: 36, padding: '2px 4px', border: '1px solid #d1d5db', borderRadius: 6,
                            fontSize: 11, textAlign: 'center', background: '#fff',
                          }} />
                        <span style={{ fontSize: 11, color: '#6b7280' }}>jours</span>
                      </div>
                      <div style={{ width: 2, height: 16, background: '#d1d5db' }} />
                    </div>
                    <div style={{
                      border: '1px solid #e5e7eb', borderRadius: 14, overflow: 'hidden',
                      boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                    }}>
                      <div style={{
                        padding: '8px 14px', background: '#f9fafb', borderBottom: '1px solid #e5e7eb',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{
                            width: 22, height: 22, borderRadius: 8, background: '#e5e7eb',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 11, fontWeight: 700, color: '#6b7280',
                          }}>{i + 1}</div>
                          <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Relance {i + 1}</span>
                        </div>
                        <button onClick={removeFullFollowup}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#ef4444' }}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                      <div style={{ padding: 14 }}>
                        <p style={{ fontSize: 12, color: '#6b7280', fontStyle: 'italic' }}>
                          Genere automatiquement par l'IA
                        </p>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Add follow-up */}
                {followupCount < 7 && (
                  <>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '4px 0' }}>
                      <div style={{ width: 2, height: 20, borderLeft: '2px dashed #e5e7eb' }} />
                    </div>
                    <button onClick={addFullFollowup}
                      style={{
                        width: '100%', padding: '12px 0',
                        border: '2px dashed #d1d5db', borderRadius: 14,
                        background: 'none', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        fontSize: 13, fontWeight: 500, color: '#9ca3af',
                        transition: 'all 0.2s',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#9333ea'; e.currentTarget.style.color = '#9333ea'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#d1d5db'; e.currentTarget.style.color = '#9ca3af'; }}>
                      <Plus size={16} /> Ajouter une relance ({followupCount}/7)
                    </button>
                  </>
                )}
              </div>

              {/* Extra instructions */}
              <div style={{ marginTop: 16 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#7c3aed', marginBottom: 4 }}>
                  Consignes supplementaires (optionnel)
                </label>
                <textarea value={extraInstructions} onChange={(e) => { setExtraInstructions(e.target.value); setPreviews(null); }}
                  rows={2} placeholder="Ex: Ton direct et amical, pose une question ouverte..."
                  style={{
                    width: '100%', padding: '8px 12px', border: '1px solid rgba(147,51,234,0.2)',
                    borderRadius: 10, fontSize: 12, resize: 'none', background: '#fff',
                  }} />
              </div>

              {/* Preview button */}
              <button onClick={generatePreviews} disabled={previewLoading}
                style={{ marginTop: 12, width: '100%', padding: '10px 0', borderRadius: 12, border: '1px solid rgba(147,51,234,0.3)', background: 'rgba(147,51,234,0.04)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: '#7c3aed' }}>
                {previewLoading
                  ? <><Loader2 size={14} className="animate-spin" /> Analyse des profils...</>
                  : <><Eye size={14} /> {previews ? 'Regenerer les apercus' : 'Apercu sur 3 contacts'}</>
                }
              </button>

              {/* Preview results */}
              {previews && (
                <div style={{ marginTop: 16 }} className="space-y-3">
                  <h4 style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Eye size={14} className="text-purple-500" /> Apercu
                  </h4>
                  {previews.map((preview, pIdx) => (
                    <div key={pIdx} style={{ border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: '#f9fafb', borderBottom: '1px solid #f3f4f6' }}>
                        {preview.contact.profile_picture_url ? (
                          <img src={preview.contact.profile_picture_url} alt="" style={{ width: 28, height: 28, borderRadius: 99, objectFit: 'cover' }} />
                        ) : (
                          <div style={{ width: 28, height: 28, borderRadius: 99, background: 'rgba(0,132,255,0.08)', color: 'var(--blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>
                            {(preview.contact.first_name?.[0] || '')}{(preview.contact.last_name?.[0] || '')}
                          </div>
                        )}
                        <div>
                          <p style={{ fontSize: 12, fontWeight: 600, color: '#111827' }}>{preview.contact.first_name} {preview.contact.last_name}</p>
                          {preview.contact.headline && <p style={{ fontSize: 10, color: '#9ca3af' }}>{preview.contact.headline}</p>}
                        </div>
                      </div>
                      <div style={{ padding: 14 }}>
                        {preview.messages.map((rm, mIdx) => (
                          <div key={mIdx} style={{ marginBottom: mIdx < preview.messages.length - 1 ? 10 : 0 }}>
                            <span style={{
                              fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 99,
                              background: mIdx === 0 ? 'var(--blue)' : '#f3f4f6',
                              color: mIdx === 0 ? '#fff' : '#6b7280',
                            }}>
                              {mIdx === 0 ? 'Principal' : `Relance ${mIdx}`}
                            </span>
                            <div style={{
                              marginTop: 6, padding: '10px 12px', borderRadius: 8,
                              background: '#f8fafc', fontSize: 12, color: '#374151',
                              whiteSpace: 'pre-wrap', lineHeight: 1.5,
                              borderLeft: '3px solid var(--blue)',
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

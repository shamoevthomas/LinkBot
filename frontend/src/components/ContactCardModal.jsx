import { useState, useEffect } from 'react';
import { X, Send, ExternalLink, MapPin, Briefcase, Sparkles, Loader2 } from 'lucide-react';
import { sendMessageToContact, generateAIMessage, updateContactNotes, getContactById } from '../api/crm';
import client from '../api/client';
import Badge from './ui/Badge';
import { formatServerDate } from '../utils/date';
import toast from 'react-hot-toast';

function initials(c) {
  return `${(c?.first_name?.[0] || '').toUpperCase()}${(c?.last_name?.[0] || '').toUpperCase()}` || '?';
}

/**
 * Shared contact detail modal. Opens on a full contact object (requires id + crm_id).
 * If `contactId` is provided instead, fetches the contact on mount.
 *
 * Props:
 *   contact?: full contact object (id, crm_id, first_name, last_name, headline, location,
 *             profile_picture_url, linkedin_url, connection_status, added_at,
 *             last_interaction_at, notes)
 *   contactId?: number — alternative to `contact`, triggers a fetch
 *   onClose: () => void
 *   onUpdate?: (updatedContact) => void — called after a note save or message send
 */
export default function ContactCardModal({ contact: contactProp, contactId, onClose, onUpdate }) {
  const [contact, setContact] = useState(contactProp || null);
  const [loading, setLoading] = useState(!contactProp && !!contactId);
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const [aiAvailable, setAiAvailable] = useState(false);
  const [showAiPrompt, setShowAiPrompt] = useState(false);
  const [aiInstructions, setAiInstructions] = useState('');
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    client.get('/ai/status').then((r) => setAiAvailable(r.data.available)).catch(() => {});
  }, []);

  useEffect(() => {
    if (contactProp) {
      setContact(contactProp);
      setLoading(false);
      return;
    }
    if (contactId) {
      setLoading(true);
      getContactById(contactId)
        .then((c) => setContact(c))
        .catch(() => toast.error('Contact introuvable'))
        .finally(() => setLoading(false));
    }
  }, [contactProp, contactId]);

  const close = () => {
    setMessageText('');
    setShowAiPrompt(false);
    setAiInstructions('');
    onClose?.();
  };

  const handleGenerateAI = async () => {
    if (!aiInstructions.trim() || !contact) return;
    setGenerating(true);
    try {
      const data = await generateAIMessage(contact.crm_id, contact.id, aiInstructions.trim());
      setMessageText(data.message);
      setShowAiPrompt(false);
      setAiInstructions('');
      toast.success("Message genere par l'IA");
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erreur lors de la generation');
    } finally {
      setGenerating(false);
    }
  };

  const handleSendMessage = async () => {
    if (!messageText.trim() || !contact) return;
    setSending(true);
    try {
      await sendMessageToContact(contact.crm_id, contact.id, messageText.trim());
      toast.success('Message envoye');
      setMessageText('');
      const updated = { ...contact, last_interaction_at: new Date().toISOString() };
      setContact(updated);
      onUpdate?.(updated);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Erreur lors de l'envoi");
    } finally {
      setSending(false);
    }
  };

  const handleNotesBlur = (val) => {
    if (!contact) return;
    const current = contact.notes || '';
    if (val === current) return;
    updateContactNotes(contact.crm_id, contact.id, val).catch(() => {});
    const updated = { ...contact, notes: val };
    setContact(updated);
    onUpdate?.(updated);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={close}>
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <button onClick={close}
          className="absolute top-4 right-4 p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors z-10"
          aria-label="Fermer">
          <X size={18} />
        </button>

        {loading || !contact ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin text-gray-400" />
          </div>
        ) : (
          <>
            <div className="flex justify-center pt-8">
              {contact.profile_picture_url ? (
                <img src={contact.profile_picture_url} alt=""
                  className="w-24 h-24 rounded-full object-cover shadow-sm" />
              ) : (
                <div className="w-24 h-24 rounded-full text-2xl font-bold flex items-center justify-center shadow-sm"
                  style={{ background: 'rgba(0,132,255,0.08)', color: 'var(--blue)' }}>
                  {initials(contact)}
                </div>
              )}
            </div>

            <div className="px-6 pt-3 pb-6">
              <div className="text-center mb-4">
                <h2 className="text-xl font-bold text-gray-900">
                  {contact.first_name} {contact.last_name}
                </h2>
                {contact.headline && (
                  <p className="text-sm text-gray-500 mt-1">{contact.headline}</p>
                )}
              </div>

              <div className="space-y-2 mb-5">
                {contact.location && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <MapPin size={14} className="text-gray-400 shrink-0" />
                    {contact.location}
                  </div>
                )}
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Briefcase size={14} className="text-gray-400 shrink-0" />
                  <Badge status={contact.connection_status} />
                </div>
                {contact.linkedin_url && (
                  <a href={contact.linkedin_url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm hover:underline" style={{ color: 'var(--blue)' }}>
                    <ExternalLink size={14} className="shrink-0" />
                    Voir le profil LinkedIn
                  </a>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs mb-5">
                <div className="bg-gray-50 rounded-lg p-3">
                  <span className="text-gray-400">Ajoute le</span>
                  <p className="font-medium text-gray-700 mt-0.5">
                    {formatServerDate(contact.added_at)}
                  </p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <span className="text-gray-400">Derniere interaction</span>
                  <p className="font-medium text-gray-700 mt-0.5">
                    {contact.last_interaction_at
                      ? formatServerDate(contact.last_interaction_at)
                      : 'Aucune'}
                  </p>
                </div>
              </div>

              <div className="border-t border-gray-200 pt-4">
                <label className="text-sm font-medium text-gray-700 mb-1 block">Notes</label>
                <textarea
                  defaultValue={contact.notes || ''}
                  onBlur={(e) => handleNotesBlur(e.target.value)}
                  rows={3}
                  placeholder="Ajouter des notes..."
                  className="input-glass w-full resize-none text-sm"
                />
              </div>

              <div className="border-t border-gray-200 pt-4">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700">Envoyer un message</label>
                  {aiAvailable && !showAiPrompt && (
                    <button onClick={() => setShowAiPrompt(true)}
                      className="px-3 py-1 bg-purple-100 text-purple-700 rounded-lg text-xs font-medium hover:bg-purple-200 transition-colors flex items-center gap-1.5">
                      <Sparkles size={13} /> Ecrire avec l'IA
                    </button>
                  )}
                </div>

                {showAiPrompt && (
                  <div className="mb-3 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Sparkles size={14} className="text-purple-500" />
                      <span className="text-sm font-medium text-purple-700">Instructions pour l'IA</span>
                      <button onClick={() => setShowAiPrompt(false)} className="ml-auto text-purple-400 hover:text-purple-600">
                        <X size={14} />
                      </button>
                    </div>
                    <textarea value={aiInstructions} onChange={(e) => setAiInstructions(e.target.value)}
                      rows={3} placeholder="Ex: Je veux le contacter pour lui proposer un partenariat..."
                      className="w-full px-3 py-2 border border-purple-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent resize-none bg-white" />
                    <button onClick={handleGenerateAI} disabled={generating || !aiInstructions.trim()}
                      className="mt-2 w-full py-2 bg-purple-600 text-white font-semibold rounded-lg text-sm hover:bg-purple-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                      {generating ? <><Loader2 size={14} className="animate-spin" /> Generation en cours...</> : <><Sparkles size={14} /> Generer le message</>}
                    </button>
                  </div>
                )}

                <textarea value={messageText} onChange={(e) => setMessageText(e.target.value)}
                  rows={3} placeholder={`Bonjour ${contact.first_name || ''}...`}
                  className="input-glass w-full px-3 py-2 resize-none" />
                <button onClick={handleSendMessage} disabled={sending || !messageText.trim()}
                  className="cta-btn mt-2 w-full disabled:opacity-50 flex items-center justify-center gap-2" style={{ padding: '10px 16px', fontSize: '14px' }}>
                  {sending ? <><Loader2 size={16} className="animate-spin" /> Envoi...</> : <><Send size={16} /> Envoyer</>}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

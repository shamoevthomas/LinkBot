import { useState, useEffect } from 'react';
import { X } from 'lucide-react';

/**
 * Modal for creating a new CRM. Reused across the CRM list page,
 * campaign creation flows, and import flows so users never have to
 * leave their context to create a destination CRM.
 */
export default function CreateCRMModal({ open, onClose, onCreate, creating = false }) {
  const [form, setForm] = useState({ name: '', description: '' });
  useEffect(() => { if (open) setForm({ name: '', description: '' }); }, [open]);
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'hsl(222 22% 12% / .4)' }}
      onClick={onClose}>
      <div className="g-card w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-[17px] font-semibold">Nouveau CRM</h3>
            <p className="text-[12px] mt-0.5" style={{ color: 'hsl(var(--muted))' }}>
              Créez une liste et organisez vos contacts LinkedIn
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg"
            style={{ color: 'hsl(var(--muted))', background: 'transparent', border: 'none', cursor: 'pointer' }}>
            <X size={16} />
          </button>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); onCreate(form); }} className="space-y-4">
          <div>
            <label className="text-[11.5px] font-medium" style={{ color: 'hsl(var(--muted))' }}>Nom</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Ex: Prospects Q1 2026"
              required autoFocus
              className="mt-1.5 w-full px-3 py-2.5 rounded-xl text-[13.5px] ring-a"
              style={{ border: '1px solid hsl(var(--border-strong))', background: 'hsl(var(--panel))' }} />
          </div>
          <div>
            <label className="text-[11.5px] font-medium" style={{ color: 'hsl(var(--muted))' }}>Description (optionnel)</label>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Ce que contient ce CRM"
              rows={3}
              className="mt-1.5 w-full px-3 py-2.5 rounded-xl text-[13.5px] ring-a"
              style={{ border: '1px solid hsl(var(--border-strong))', background: 'hsl(var(--panel))' }} />
          </div>
          <div className="flex items-center gap-2 mt-6">
            <button type="button" onClick={onClose} className="ghost-btn flex-1">Annuler</button>
            <button type="submit" disabled={creating || !form.name.trim()} className="cta-btn flex-1">
              {creating ? 'Création...' : 'Créer le CRM'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

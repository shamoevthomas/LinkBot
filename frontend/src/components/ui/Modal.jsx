import { X } from 'lucide-react';

export default function Modal({ open, onClose, title, children, wide }) {
  if (!open) return null;
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(4px)',
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#fff', borderRadius: 20,
          boxShadow: '0 24px 80px rgba(0,0,0,0.12)',
          width: '100%', maxWidth: wide ? 640 : 440,
          maxHeight: '90vh', overflowY: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '20px 24px', borderBottom: '1px solid var(--card-bdr)',
        }}>
          <h2 className="f" style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', margin: 0 }}>{title}</h2>
          <button onClick={onClose} style={{
            padding: 6, borderRadius: 10, border: 'none',
            background: 'transparent', cursor: 'pointer', color: 'var(--text3)',
            display: 'flex',
          }}>
            <X size={20} />
          </button>
        </div>
        <div style={{ padding: 24 }}>{children}</div>
      </div>
    </div>
  );
}

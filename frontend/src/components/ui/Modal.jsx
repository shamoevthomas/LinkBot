import { X } from 'lucide-react';

export default function Modal({ open, onClose, title, subtitle, children, wide, maxWidth }) {
  if (!open) return null;
  const width = maxWidth || (wide ? 640 : 480);
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'hsl(222 22% 12% / .4)', backdropFilter: 'blur(4px)',
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        className="g-card"
        style={{
          width: '100%', maxWidth: width,
          maxHeight: '90vh', overflowY: 'auto',
          padding: 0,
          boxShadow: '0 24px 60px -24px hsl(220 40% 10% / .35)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          gap: 12, padding: '20px 24px 16px',
        }}>
          <div style={{ minWidth: 0 }}>
            <h3 style={{
              fontSize: 17, fontWeight: 600, letterSpacing: '-0.01em',
              color: 'hsl(var(--text))', margin: 0,
            }}>{title}</h3>
            {subtitle && (
              <p style={{ fontSize: 12, color: 'hsl(var(--muted))', marginTop: 4, margin: 0 }}>
                {subtitle}
              </p>
            )}
          </div>
          <button onClick={onClose}
            style={{
              padding: 6, borderRadius: 10, border: 'none',
              background: 'transparent', cursor: 'pointer',
              color: 'hsl(var(--muted))',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'hsl(220 20% 95%)'; e.currentTarget.style.color = 'hsl(var(--text))'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'hsl(var(--muted))'; }}>
            <X size={16} />
          </button>
        </div>
        <div style={{ padding: '4px 24px 24px' }}>{children}</div>
      </div>
    </div>
  );
}

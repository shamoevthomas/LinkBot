import { useState, useEffect } from 'react';

export function Sparkline({ points = [], color = 'blue', width = 80, height = 24, showArea = true }) {
  if (!points || points.length === 0) return null;
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const range = max - min || 1;
  const step = width / (points.length - 1 || 1);
  const path = points.map((v, i) => {
    const x = i * step;
    const y = height - ((v - min) / range) * (height - 2) - 1;
    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');
  const area = `${path} L ${width} ${height} L 0 ${height} Z`;
  const varName = color === 'blue' ? 'accent' : color;
  return (
    <svg className={`spark ${color}`} width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {showArea && <path d={area} className="area" fill="currentColor" style={{ color: `hsl(var(--${varName}))` }} />}
      <path d={path} />
    </svg>
  );
}

export function Chip({ children, tone = 'slate', className = '', dot, style }) {
  return (
    <span className={`chip ${tone} ${className}`} style={style}>
      {dot && <span style={{ width: 6, height: 6, borderRadius: 999, background: 'currentColor', display: 'inline-block' }} />}
      {children}
    </span>
  );
}

const STATUS_TONES = {
  running: 'emerald', active: 'emerald', reussi: 'emerald', success: 'emerald',
  scheduled: 'amber', pending: 'amber', en_attente: 'amber',
  paused: 'slate', skipped: 'slate', perdu: 'slate',
  completed: 'blue', envoye: 'blue', demande_envoyee: 'blue',
  failed: 'rose', cancelled: 'rose',
};

const STATUS_LABELS = {
  running: 'En cours',
  pending: 'En attente',
  scheduled: 'Planifiée',
  paused: 'En pause',
  completed: 'Terminée',
  failed: 'Échouée',
  cancelled: 'Annulée',
  active: 'Active',
  draft: 'Brouillon',
  synced: 'Synchronisé',
  en_attente: 'En attente',
  envoye: 'Envoyé',
  demande_envoyee: 'Demande envoyée',
  reussi: 'Répondu',
  perdu: 'Perdu',
  success: 'Succès',
  skipped: 'Ignoré',
  relance_1: 'Relance 1',
  relance_2: 'Relance 2',
  relance_3: 'Relance 3',
  relance_4: 'Relance 4',
  relance_5: 'Relance 5',
  relance_6: 'Relance 6',
  relance_7: 'Relance 7',
};

export function StatusChip({ status, label }) {
  if (!status) return null;
  const key = String(status);
  let tone = STATUS_TONES[key];
  if (!tone && key.startsWith('relance_')) tone = 'amber';
  if (!tone) tone = 'slate';
  const text = label || STATUS_LABELS[key] || key;
  return <Chip tone={tone} dot={key === 'running' || key === 'reussi'}>{text}</Chip>;
}

const CAMPAIGN_TYPE_META = {
  'connection': { label: 'Connexion', tone: 'blue' },
  'dm': { label: 'Message', tone: 'emerald' },
  'connection_dm': { label: 'Connexion + DM', tone: 'violet' },
  'connection+dm': { label: 'Connexion + DM', tone: 'violet' },
  'search_connection_dm': { label: 'Recherche + DM', tone: 'amber' },
  'search+connection+dm': { label: 'Recherche + DM', tone: 'amber' },
  'export': { label: 'Export', tone: 'slate' },
  'search': { label: 'Recherche', tone: 'blue' },
};

export function TypeTag({ type, label }) {
  const meta = CAMPAIGN_TYPE_META[type] || { label: label || type, tone: 'slate' };
  return <Chip tone={meta.tone}>{label || meta.label}</Chip>;
}

const AVATAR_HUES = {
  blue:    'linear-gradient(135deg, hsl(214 80% 58%), hsl(224 80% 52%))',
  emerald: 'linear-gradient(135deg, hsl(158 60% 50%), hsl(170 60% 42%))',
  violet:  'linear-gradient(135deg, hsl(262 60% 62%), hsl(280 60% 56%))',
  amber:   'linear-gradient(135deg, hsl(38 90% 58%), hsl(26 85% 54%))',
  rose:    'linear-gradient(135deg, hsl(352 75% 62%), hsl(338 70% 58%))',
  slate:   'linear-gradient(135deg, hsl(220 12% 65%), hsl(220 12% 55%))',
};

export function Avatar({ initials, hue = 'blue', size = 32, src, alt = '' }) {
  const [broken, setBroken] = useState(false);
  // Reset error state when src changes
  useEffect(() => { setBroken(false); }, [src]);

  if (src && !broken) {
    return (
      <img
        src={src}
        alt={alt}
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
        style={{ width: size, height: size, borderRadius: 999, objectFit: 'cover', flexShrink: 0 }}
      />
    );
  }
  const bg = AVATAR_HUES[hue] || AVATAR_HUES.blue;
  return (
    <div className="avatar" style={{ width: size, height: size, fontSize: size * 0.38, background: bg }}>
      {initials}
    </div>
  );
}

export function Progress({ value, tone = '' }) {
  return (
    <div className={`pbar ${tone}`}>
      <span style={{ width: `${Math.max(0, Math.min(100, value || 0))}%` }} />
    </div>
  );
}

export function BarMini({ points = [], color = 'blue', width = 110, height = 30 }) {
  if (!points.length) return null;
  const max = Math.max(...points, 1);
  const bw = width / points.length - 2;
  const varName = color === 'blue' ? 'accent' : color;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {points.map((v, i) => {
        const h = (v / max) * (height - 2);
        return (
          <rect key={i} x={i * (bw + 2)} y={height - h} width={bw} height={h} rx="1.5"
            fill={`hsl(var(--${varName}))`} opacity={0.65} />
        );
      })}
    </svg>
  );
}

// String to hue deterministic helper
const HUES = ['blue', 'emerald', 'violet', 'amber', 'rose', 'slate'];
export function hueFromString(str = '') {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return HUES[Math.abs(h) % HUES.length];
}

export function getInitials(first, last) {
  const a = (first || '').trim()[0] || '';
  const b = (last || '').trim()[0] || '';
  return (a + b).toUpperCase() || '?';
}

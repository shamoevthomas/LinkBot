import { useEffect, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { getRateLimitStatus } from '../../api/dashboard';

function fmtCountdown(untilIso) {
  if (!untilIso) return null;
  const ms = new Date(untilIso).getTime() - Date.now();
  if (ms <= 0) return null;
  const totalMin = Math.ceil(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h <= 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export default function RateLimitBanner() {
  const [status, setStatus] = useState(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    const fetchStatus = async () => {
      try {
        const s = await getRateLimitStatus();
        if (alive) setStatus(s);
      } catch {
        // silent: banner just stays hidden if endpoint fails
      }
    };
    fetchStatus();
    const poll = setInterval(fetchStatus, 60_000);
    const tick = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => { alive = false; clearInterval(poll); clearInterval(tick); };
  }, []);

  if (!status) return null;
  const conn = fmtCountdown(status.connections_until);
  const dms = fmtCountdown(status.dms_until);
  if (!conn && !dms) return null;

  let label;
  if (conn && dms) label = 'Invitations et messages LinkedIn';
  else if (conn) label = 'Invitations LinkedIn';
  else label = 'Messages LinkedIn';

  const remaining = conn && dms
    ? `${conn} (invitations) · ${dms} (messages)`
    : (conn || dms);

  return (
    <div style={{
      width: '100%',
      background: 'linear-gradient(90deg, #fef2f2 0%, #fff7ed 100%)',
      borderBottom: '1px solid #fecaca',
      padding: '14px 24px',
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14,
      position: 'sticky', top: 0, zIndex: 50,
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 10, flexShrink: 0,
        background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <ShieldAlert size={18} color="#dc2626" />
      </div>
      <div style={{ flex: 1, minWidth: 0, maxWidth: 920 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#991b1b', lineHeight: 1.3 }}>
          LinkedIn a temporairement bloqué votre compte ({label.toLowerCase()})
        </div>
        <div style={{ fontSize: 12.5, color: '#7f1d1d', lineHeight: 1.5, marginTop: 2 }}>
          Pour protéger votre compte, toutes les campagnes concernées sont en pause pendant <strong>{remaining}</strong>.
          Les lead magnets et le suivi des réponses continuent à fonctionner normalement. Aucune action n'est requise — la reprise est automatique.
        </div>
      </div>
    </div>
  );
}

import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Settings, User, Moon, Sun, Shield, ExternalLink } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export default function UserPopup() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const initials = `${user?.first_name?.[0] || 'U'}${user?.last_name?.[0] || ''}`;
  const fullName = [user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.username || 'Utilisateur';

  const item = (icon, label, onClick, danger) => (
    <button
      onClick={() => { setOpen(false); onClick(); }}
      className="w-full px-4 py-2.5 text-left text-sm flex items-center gap-3 transition-colors"
      style={{ color: danger ? '#ef4444' : 'var(--text)', background: 'none', border: 'none', cursor: 'pointer' }}
      onMouseEnter={(e) => e.currentTarget.style.background = danger ? 'rgba(239,68,68,0.06)' : 'rgba(0,0,0,0.03)'}
      onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          padding: 0, border: 'none', background: 'none', cursor: 'pointer',
          borderRadius: 99, outline: 'none',
          boxShadow: open ? '0 0 0 2px var(--blue)' : 'none',
          transition: 'box-shadow 0.2s',
        }}
      >
        {user?.profile_picture_path ? (
          <img src={user.profile_picture_path} alt="" style={{ width: 32, height: 32, borderRadius: 99, objectFit: 'cover' }} />
        ) : (
          <div style={{
            width: 32, height: 32, borderRadius: 99,
            background: 'rgba(0,132,255,0.1)', color: 'var(--blue)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 700,
          }}>
            {initials}
          </div>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', right: 0, top: 'calc(100% + 8px)',
          width: 280, background: '#fff', borderRadius: 16,
          boxShadow: '0 12px 40px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.06)',
          zIndex: 100, overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
            <div className="flex items-center gap-3">
              {user?.profile_picture_path ? (
                <img src={user.profile_picture_path} alt="" style={{ width: 40, height: 40, borderRadius: 99, objectFit: 'cover' }} />
              ) : (
                <div style={{
                  width: 40, height: 40, borderRadius: 99,
                  background: 'rgba(0,132,255,0.1)', color: 'var(--blue)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 14, fontWeight: 700,
                }}>
                  {initials}
                </div>
              )}
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{fullName}</p>
                <p className="text-xs truncate" style={{ color: 'var(--text3)' }}>{user?.job_role || user?.username}</p>
              </div>
            </div>
            {user?.cookies_valid === false && (
              <div className="mt-3 px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-2" style={{ background: 'rgba(239,68,68,0.08)', color: '#ef4444' }}>
                <Shield size={14} /> Cookies LinkedIn expirés
              </div>
            )}
          </div>

          {/* Actions */}
          <div style={{ padding: '6px 0' }}>
            {item(<User size={16} style={{ color: 'var(--text3)' }} />, 'Mon profil', () => navigate('/dashboard/config'))}
            {item(<Settings size={16} style={{ color: 'var(--text3)' }} />, 'Configuration', () => navigate('/dashboard/config'))}
            {user?.linkedin_profile_url && item(
              <ExternalLink size={16} style={{ color: 'var(--text3)' }} />,
              'Mon LinkedIn',
              () => window.open(user.linkedin_profile_url, '_blank')
            )}
          </div>

          <div style={{ height: 1, background: 'rgba(0,0,0,0.06)' }} />

          {/* App info */}
          <div style={{ padding: '8px 16px' }}>
            <p className="text-[10px]" style={{ color: 'var(--text3)' }}>
              LinkBot v1.0 — {user?.cookies_valid ? 'LinkedIn connecté' : 'LinkedIn déconnecté'}
            </p>
          </div>

          <div style={{ height: 1, background: 'rgba(0,0,0,0.06)' }} />

          {/* Logout */}
          <div style={{ padding: '4px 0' }}>
            {item(<LogOut size={16} />, 'Se déconnecter', logout, true)}
          </div>
        </div>
      )}
    </div>
  );
}

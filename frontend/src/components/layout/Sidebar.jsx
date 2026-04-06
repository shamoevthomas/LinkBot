import { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Users, Rocket, Settings, LogOut, Link } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getNotifications } from '../../api/dashboard';

const links = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Tableau de bord', end: true },
  { to: '/dashboard/crms', icon: Users, label: 'CRM' },
  { to: '/dashboard/campaigns', icon: Rocket, label: 'Campagnes', badgeKey: 'campaigns_attention' },
  { to: '/dashboard/config', icon: Settings, label: 'Configuration', dotKey: 'cookies_invalid' },
];

export default function Sidebar() {
  const { user, logout } = useAuth();
  const [notifs, setNotifs] = useState({});

  useEffect(() => {
    const fetchNotifs = () => getNotifications().then(setNotifs).catch(() => {});
    fetchNotifs();
    const interval = setInterval(fetchNotifs, 60000);
    return () => clearInterval(interval);
  }, []);

  return (
    <nav style={{
      position: 'sticky', top: 12, zIndex: 40,
      maxWidth: 900, margin: '0 auto',
      padding: '0 12px',
    }}>
      <div className="glass-nav" style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '8px 12px',
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
      }}>
        {/* Logo */}
        <NavLink to="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', marginRight: 16 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 10,
            background: 'var(--blue-alpha)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Link size={16} color="#fff" />
          </div>
          <span className="f hidden sm:inline" style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>LinkBot</span>
        </NavLink>

        {/* Nav links */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }}>
          {links.map(({ to, icon: Icon, label, end, badgeKey, dotKey }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              style={{ textDecoration: 'none' }}
              className={({ isActive }) => isActive ? 'nav-active' : 'nav-idle'}
            >
              {({ isActive }) => (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '8px 14px', borderRadius: 12,
                  fontSize: 13, fontWeight: 500,
                  color: isActive ? 'var(--blue)' : 'var(--text2)',
                  background: isActive ? 'rgba(0,132,255,0.08)' : 'transparent',
                  transition: 'all 0.2s',
                }}>
                  <Icon size={17} />
                  <span className="hidden sm:inline">{label}</span>
                  {badgeKey && notifs[badgeKey] > 0 && (
                    <span style={{
                      minWidth: 18, height: 18, padding: '0 5px',
                      background: '#ef4444', color: '#fff',
                      fontSize: 10, fontWeight: 700, borderRadius: 99,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {notifs[badgeKey]}
                    </span>
                  )}
                  {dotKey && notifs[dotKey] && (
                    <span style={{ width: 8, height: 8, background: '#ef4444', borderRadius: 99 }} />
                  )}
                </div>
              )}
            </NavLink>
          ))}
        </div>

        {/* User */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 8 }}>
          {user?.profile_picture_path ? (
            <img src={user.profile_picture_path} alt="" style={{ width: 32, height: 32, borderRadius: 99, objectFit: 'cover' }} />
          ) : (
            <div style={{
              width: 32, height: 32, borderRadius: 99,
              background: 'rgba(0,132,255,0.1)', color: 'var(--blue)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 700,
            }}>
              {user?.first_name?.[0] || 'U'}{user?.last_name?.[0] || ''}
            </div>
          )}
          <button onClick={logout} style={{
            padding: 6, borderRadius: 10, border: 'none',
            background: 'transparent', cursor: 'pointer', color: 'var(--text3)',
            display: 'flex', alignItems: 'center',
          }}>
            <LogOut size={17} />
          </button>
        </div>
      </div>
    </nav>
  );
}

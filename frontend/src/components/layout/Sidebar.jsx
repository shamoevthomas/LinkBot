import { useState, useEffect, useRef } from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Users, Rocket, Settings, Link, Contact, Bell, Check, Magnet } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getNotifications } from '../../api/dashboard';
import { getNotificationsList, markNotificationRead, markAllNotificationsRead } from '../../api/notifications';
import UserPopup from '../ui/UserPopup';

const links = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Tableau de bord', end: true },
  { to: '/dashboard/crms', icon: Users, label: 'CRM' },
  { to: '/dashboard/contacts', icon: Contact, label: 'Contacts' },
  { to: '/dashboard/campaigns', icon: Rocket, label: 'Campagnes', badgeKey: 'campaigns_attention' },
  { to: '/dashboard/lead-magnets', icon: Magnet, label: 'Lead Magnets' },
  { to: '/dashboard/config', icon: Settings, label: 'Configuration', dotKey: 'cookies_invalid' },
];

const NOTIF_ICONS = {
  reply_received: '💬',
  campaign_completed: '✅',
  cookies_expired: '⚠️',
};

export default function Sidebar() {
  const { user } = useAuth();
  const [notifs, setNotifs] = useState({});
  const [showNotifs, setShowNotifs] = useState(false);
  const [notifList, setNotifList] = useState([]);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const fetchNotifs = () => getNotifications().then(setNotifs).catch(() => {});
    fetchNotifs();
    const interval = setInterval(fetchNotifs, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (showNotifs) {
      getNotificationsList().then((data) => setNotifList((data.notifications || []).map(n => ({ ...n, read: true })))).catch(() => {});
      // Auto-mark all as read when opening the bell
      markAllNotificationsRead().then(() => {
        setNotifs((prev) => ({ ...prev, unread_notifications: 0 }));
      }).catch(() => {});
    }
  }, [showNotifs]);

  useEffect(() => {
    const handleClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setShowNotifs(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleMarkAllRead = async () => {
    await markAllNotificationsRead();
    setNotifList((prev) => prev.map((n) => ({ ...n, read: true })));
    setNotifs((prev) => ({ ...prev, unread_notifications: 0 }));
  };

  const handleMarkRead = async (id) => {
    await markNotificationRead(id);
    setNotifList((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
    setNotifs((prev) => ({ ...prev, unread_notifications: Math.max(0, (prev.unread_notifications || 1) - 1) }));
  };

  const unreadCount = notifs.unread_notifications || 0;

  const timeAgo = (iso) => {
    if (!iso) return '';
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 60) return 'a l\'instant';
    if (diff < 3600) return `${Math.floor(diff / 60)}min`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    return `${Math.floor(diff / 86400)}j`;
  };

  return (
    <nav style={{
      position: 'sticky', top: 12, zIndex: 40,
      maxWidth: 900, margin: '0 auto',
      padding: '0 12px',
    }}>
      <div className="glass-nav" style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '8px 12px',
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

        {/* Notifications bell */}
        <div ref={dropdownRef} style={{ position: 'relative', marginLeft: 4 }}>
          <button
            onClick={() => setShowNotifs(!showNotifs)}
            style={{
              position: 'relative', padding: 8, borderRadius: 10,
              background: showNotifs ? 'rgba(0,132,255,0.08)' : 'transparent',
              border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center',
            }}
          >
            <Bell size={18} color={showNotifs ? 'var(--blue)' : '#6b7280'} />
            {unreadCount > 0 && (
              <span style={{
                position: 'absolute', top: 4, right: 4,
                minWidth: 16, height: 16, padding: '0 4px',
                background: '#ef4444', color: '#fff',
                fontSize: 9, fontWeight: 700, borderRadius: 99,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {unreadCount}
              </span>
            )}
          </button>

          {showNotifs && (
            <div style={{
              position: 'absolute', right: 0, top: 44,
              width: 340, maxHeight: 400, overflowY: 'auto',
              background: '#fff', borderRadius: 14,
              boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
              border: '1px solid #e5e7eb',
              zIndex: 100,
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 16px', borderBottom: '1px solid #f3f4f6',
              }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#111' }}>Notifications</span>
                {unreadCount > 0 && (
                  <button onClick={handleMarkAllRead}
                    style={{ fontSize: 11, color: 'var(--blue)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500 }}>
                    Tout marquer lu
                  </button>
                )}
              </div>
              {notifList.length === 0 ? (
                <div style={{ padding: '24px 16px', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
                  Aucune notification
                </div>
              ) : (
                notifList.map((n) => (
                  <div
                    key={n.id}
                    onClick={() => !n.read && handleMarkRead(n.id)}
                    style={{
                      padding: '10px 16px',
                      borderBottom: '1px solid #f9fafb',
                      background: n.read ? '#fff' : '#f0f7ff',
                      cursor: n.read ? 'default' : 'pointer',
                      display: 'flex', gap: 10, alignItems: 'flex-start',
                    }}
                  >
                    <span style={{ fontSize: 16, marginTop: 2 }}>{NOTIF_ICONS[n.type] || '🔔'}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: n.read ? 400 : 600, color: '#111' }}>{n.title}</div>
                      {n.message && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{n.message}</div>}
                    </div>
                    <span style={{ fontSize: 10, color: '#9ca3af', whiteSpace: 'nowrap', marginTop: 2 }}>{timeAgo(n.created_at)}</span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* User popup */}
        <div style={{ marginLeft: 4 }}>
          <UserPopup />
        </div>
      </div>
    </nav>
  );
}

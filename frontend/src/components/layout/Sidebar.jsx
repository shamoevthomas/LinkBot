import { useState, useEffect, useRef } from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Users, Rocket, Settings, Link as LinkIcon, Contact as ContactIcon, Bell, Magnet, Search } from 'lucide-react';
import { getNotifications } from '../../api/dashboard';
import { getNotificationsList, markNotificationRead, markAllNotificationsRead } from '../../api/notifications';
import UserPopup from '../ui/UserPopup';

const links = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Tableau de bord', end: true },
  { to: '/dashboard/crms', icon: Users, label: 'CRM' },
  { to: '/dashboard/contacts', icon: ContactIcon, label: 'Contacts' },
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
    if (diff < 60) return "à l'instant";
    if (diff < 3600) return `${Math.floor(diff / 60)}min`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    return `${Math.floor(diff / 86400)}j`;
  };

  return (
    <div className="topbar sticky top-0 z-40 border-b" style={{ borderColor: 'hsl(var(--border))' }}>
      <div className="mx-auto flex items-center gap-4 px-6 py-3" style={{ maxWidth: 1280 }}>
        {/* Logo */}
        <NavLink to="/dashboard" end className="flex items-center gap-2 pr-3 border-r"
          style={{ borderColor: 'hsl(var(--border))', textDecoration: 'none' }}>
          <div className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{
              background: 'hsl(var(--accent))', color: 'white',
              boxShadow: '0 6px 18px -6px hsl(var(--accent) / .6)',
            }}>
            <LinkIcon size={16} />
          </div>
          <span style={{ fontWeight: 600, fontSize: 14, letterSpacing: '-0.01em', color: 'hsl(var(--text))' }}>LinkBot</span>
        </NavLink>

        {/* Navigation */}
        <nav className="flex items-center gap-1 overflow-x-auto flex-1">
          {links.map(({ to, icon: Icon, label, end, badgeKey, dotKey }) => (
            <NavLink key={to} to={to} end={end} style={{ textDecoration: 'none' }}>
              {({ isActive }) => (
                <span className={`tab-pill ${isActive ? 'active' : ''}`}>
                  <Icon size={14} />
                  <span className="hidden sm:inline">{label}</span>
                  {badgeKey && notifs[badgeKey] > 0 && (
                    <span className="mono" style={{
                      marginLeft: 2,
                      background: isActive ? 'hsl(var(--accent) / .2)' : 'hsl(var(--rose) / .12)',
                      color: isActive ? 'hsl(var(--accent))' : 'hsl(var(--rose))',
                      fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 999,
                    }}>{notifs[badgeKey]}</span>
                  )}
                  {dotKey && notifs[dotKey] && (
                    <span style={{ width: 6, height: 6, background: 'hsl(var(--rose))', borderRadius: 999, marginLeft: 2 }} />
                  )}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Right zone */}
        <div className="ml-auto flex items-center gap-2">
          <button className="ghost-btn hidden md:flex" style={{ padding: '7px 10px' }}>
            <Search size={14} />
            <span className="text-[12px]" style={{ color: 'hsl(var(--muted))' }}>Rechercher</span>
            <span className="kbd">⌘K</span>
          </button>

          <div ref={dropdownRef} style={{ position: 'relative' }}>
            <button onClick={() => setShowNotifs(!showNotifs)} className="ghost-btn relative" style={{ padding: '8px 10px' }}>
              <Bell size={15} />
              {unreadCount > 0 && (
                <span className="mono" style={{
                  position: 'absolute', top: -4, right: -4,
                  background: 'hsl(var(--rose))', color: 'white',
                  fontSize: 9, fontWeight: 700, borderRadius: 999, padding: '1px 5px',
                }}>{unreadCount}</span>
              )}
            </button>

            {showNotifs && (
              <div style={{
                position: 'absolute', right: 0, top: 44,
                width: 340, maxHeight: 420, overflowY: 'auto',
                background: 'hsl(var(--panel))', borderRadius: 14,
                boxShadow: '0 20px 50px -20px hsl(220 40% 20% / .25), 0 4px 14px -6px hsl(220 40% 20% / .08)',
                border: '1px solid hsl(var(--border-strong))',
                zIndex: 100,
              }}>
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '12px 16px', borderBottom: '1px solid hsl(var(--border))',
                }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>Notifications</span>
                  {unreadCount > 0 && (
                    <button onClick={handleMarkAllRead}
                      style={{ fontSize: 11, color: 'hsl(var(--accent))', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500 }}>
                      Tout marquer lu
                    </button>
                  )}
                </div>
                {notifList.length === 0 ? (
                  <div style={{ padding: '24px 16px', textAlign: 'center', color: 'hsl(var(--muted))', fontSize: 13 }}>
                    Aucune notification
                  </div>
                ) : (
                  notifList.map((n) => (
                    <div key={n.id}
                      onClick={() => !n.read && handleMarkRead(n.id)}
                      style={{
                        padding: '10px 16px',
                        borderBottom: '1px solid hsl(var(--border))',
                        background: n.read ? 'hsl(var(--panel))' : 'hsl(var(--accent-soft))',
                        cursor: n.read ? 'default' : 'pointer',
                        display: 'flex', gap: 10, alignItems: 'flex-start',
                      }}>
                      <span style={{ fontSize: 16, marginTop: 2 }}>{NOTIF_ICONS[n.type] || '🔔'}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: n.read ? 400 : 600 }}>{n.title}</div>
                        {n.message && <div style={{ fontSize: 11, color: 'hsl(var(--muted))', marginTop: 2 }}>{n.message}</div>}
                      </div>
                      <span className="mono" style={{ fontSize: 10, color: 'hsl(var(--muted))', whiteSpace: 'nowrap', marginTop: 2 }}>{timeAgo(n.created_at)}</span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          <UserPopup />
        </div>
      </div>
    </div>
  );
}

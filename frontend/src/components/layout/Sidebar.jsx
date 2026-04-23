import { useState, useEffect, useRef } from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Users, Rocket, Settings, Contact as ContactIcon, Bell, Magnet, MessageCircle, CheckCircle, AlertTriangle, BellOff, CheckCheck } from 'lucide-react';
import { getNotifications } from '../../api/dashboard';
import { getNotificationsList, markNotificationRead, markAllNotificationsRead } from '../../api/notifications';
import UserPopup from '../ui/UserPopup';
import { parseServerDate } from '../../utils/date';

const links = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Tableau de bord', end: true },
  { to: '/dashboard/crms', icon: Users, label: 'CRM' },
  { to: '/dashboard/contacts', icon: ContactIcon, label: 'Contacts' },
  { to: '/dashboard/campaigns', icon: Rocket, label: 'Campagnes', badgeKey: 'campaigns_attention' },
  { to: '/dashboard/lead-magnets', icon: Magnet, label: 'Lead Magnets' },
  { to: '/dashboard/config', icon: Settings, label: 'Configuration', dotKey: 'cookies_invalid' },
];

const NOTIF_META = {
  reply_received:     { icon: MessageCircle, tone: 'violet' },
  campaign_completed: { icon: CheckCircle,   tone: 'emerald' },
  cookies_expired:    { icon: AlertTriangle, tone: 'amber' },
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
    const diff = (Date.now() - parseServerDate(iso).getTime()) / 1000;
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
          <img src="/Linky.png" alt="Linky"
            style={{
              width: 32, height: 32, objectFit: 'contain',
              filter: 'drop-shadow(0 6px 18px hsl(var(--accent) / .35))',
            }} />
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
                width: 360, maxHeight: 460, display: 'flex', flexDirection: 'column',
                background: 'hsl(var(--panel))', borderRadius: 16,
                boxShadow: '0 24px 60px -24px hsl(220 40% 20% / .28), 0 6px 18px -8px hsl(220 40% 20% / .08)',
                border: '1px solid hsl(var(--border))',
                overflow: 'hidden', zIndex: 100,
              }}>
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '14px 16px 12px', borderBottom: '1px solid hsl(var(--border))',
                  flexShrink: 0,
                }}>
                  <div className="flex items-center gap-2">
                    <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.01em', color: 'hsl(var(--text))' }}>
                      Notifications
                    </span>
                    {unreadCount > 0 && (
                      <span className="chip blue mono" style={{ fontSize: 10, padding: '1px 7px' }}>
                        {unreadCount}
                      </span>
                    )}
                  </div>
                  {unreadCount > 0 && (
                    <button onClick={handleMarkAllRead}
                      className="inline-flex items-center gap-1 transition-colors"
                      style={{
                        fontSize: 11.5, color: 'hsl(var(--muted))',
                        background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500,
                        padding: '4px 8px', borderRadius: 6,
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = 'hsl(var(--accent))'; e.currentTarget.style.background = 'hsl(var(--accent-soft))'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = 'hsl(var(--muted))'; e.currentTarget.style.background = 'none'; }}>
                      <CheckCheck size={11} /> Tout marquer lu
                    </button>
                  )}
                </div>

                <div style={{ overflowY: 'auto', flex: 1 }}>
                  {notifList.length === 0 ? (
                    <div style={{ padding: '40px 16px', textAlign: 'center' }}>
                      <BellOff size={26} style={{ color: 'hsl(var(--muted))', opacity: 0.4, margin: '0 auto 8px' }} />
                      <div style={{ fontSize: 12.5, color: 'hsl(var(--muted))' }}>Aucune notification</div>
                    </div>
                  ) : (
                    notifList.map((n, i) => {
                      const meta = NOTIF_META[n.type] || { icon: Bell, tone: 'accent' };
                      const Ic = meta.icon;
                      const isLast = i === notifList.length - 1;
                      return (
                        <div key={n.id}
                          onClick={() => !n.read && handleMarkRead(n.id)}
                          style={{
                            position: 'relative',
                            padding: '12px 16px 12px 18px',
                            borderBottom: isLast ? 'none' : '1px solid hsl(var(--border))',
                            cursor: n.read ? 'default' : 'pointer',
                            display: 'flex', gap: 11, alignItems: 'flex-start',
                            transition: 'background .15s',
                          }}
                          onMouseEnter={(e) => { if (!n.read) e.currentTarget.style.background = 'hsl(220 22% 98%)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                          {!n.read && (
                            <span style={{
                              position: 'absolute', left: 7, top: 20,
                              width: 6, height: 6, borderRadius: '50%',
                              background: 'hsl(var(--accent))',
                              boxShadow: '0 0 0 3px hsl(var(--accent) / .18)',
                            }} />
                          )}
                          <div style={{
                            width: 32, height: 32, borderRadius: 10, flexShrink: 0,
                            background: `hsl(var(--${meta.tone}) / .12)`,
                            color: `hsl(var(--${meta.tone}))`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            <Ic size={14} />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{
                              fontSize: 13, fontWeight: n.read ? 500 : 600,
                              color: 'hsl(var(--text))', letterSpacing: '-0.005em',
                              lineHeight: 1.35,
                            }}>{n.title}</div>
                            {n.message && (
                              <div style={{ fontSize: 11.5, color: 'hsl(var(--muted))', marginTop: 2, lineHeight: 1.4 }}>
                                {n.message}
                              </div>
                            )}
                          </div>
                          <span className="mono" style={{
                            fontSize: 10, color: 'hsl(var(--muted))',
                            whiteSpace: 'nowrap', marginTop: 3, flexShrink: 0,
                          }}>
                            {timeAgo(n.created_at)}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          <UserPopup />
        </div>
      </div>
    </div>
  );
}

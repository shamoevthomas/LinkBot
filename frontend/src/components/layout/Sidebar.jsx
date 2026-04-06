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
    <aside className="w-64 bg-white border-r border-gray-200 flex flex-col h-screen sticky top-0">
      <div className="p-5 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 bg-linkedin rounded-lg flex items-center justify-center">
            <Link size={20} className="text-white" />
          </div>
          <span className="text-xl font-bold text-gray-900">LinkBot</span>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {links.map(({ to, icon: Icon, label, end, badgeKey, dotKey }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-linkedin-light text-linkedin'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`
            }
          >
            <Icon size={20} />
            <span className="flex-1">{label}</span>
            {badgeKey && notifs[badgeKey] > 0 && (
              <span className="min-w-[20px] h-5 px-1.5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                {notifs[badgeKey]}
              </span>
            )}
            {dotKey && notifs[dotKey] && (
              <span className="w-2.5 h-2.5 bg-red-500 rounded-full" />
            )}
          </NavLink>
        ))}
      </nav>

      <div className="p-4 border-t border-gray-200">
        <div className="flex items-center gap-3">
          {user?.profile_picture_path ? (
            <img src={user.profile_picture_path} alt="" className="w-9 h-9 rounded-full object-cover" />
          ) : (
            <div className="w-9 h-9 bg-linkedin-light rounded-full flex items-center justify-center text-sm font-semibold text-linkedin">
              {user?.first_name?.[0] || 'U'}{user?.last_name?.[0] || ''}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">
              {user?.first_name} {user?.last_name}
            </p>
            <p className="text-xs text-gray-500 truncate">{user?.job_role || 'Utilisateur'}</p>
          </div>
          <button onClick={logout} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
            <LogOut size={18} />
          </button>
        </div>
      </div>
    </aside>
  );
}

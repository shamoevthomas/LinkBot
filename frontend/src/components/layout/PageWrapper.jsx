import Sidebar from './Sidebar';
import AlertBanner from '../ui/AlertBanner';
import RateLimitBanner from '../ui/RateLimitBanner';
import CookiesBlockerModal from '../ui/CookiesBlockerModal';
import ImportBanner from '../ImportBanner';
import { useAuth } from '../../context/AuthContext';

export default function PageWrapper({ children }) {
  const { user } = useAuth();
  const cookiesInvalid = !!(user && !user.cookies_valid);

  return (
    <div style={{ minHeight: '100vh', background: 'hsl(var(--bg))' }}>
      <RateLimitBanner />
      <Sidebar />
      <main className="mx-auto" style={{ maxWidth: 1280, padding: '28px 24px 64px' }}>
        <AlertBanner show={cookiesInvalid} />
        <ImportBanner />
        {children}
      </main>
      {/* Full-screen blocker — only on non-config pages */}
      <CookiesBlockerModal show={cookiesInvalid} />
    </div>
  );
}

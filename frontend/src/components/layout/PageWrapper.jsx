import Sidebar from './Sidebar';
import AlertBanner from '../ui/AlertBanner';
import RateLimitBanner from '../ui/RateLimitBanner';
import ImportBanner from '../ImportBanner';
import { useAuth } from '../../context/AuthContext';

export default function PageWrapper({ children }) {
  const { user } = useAuth();

  return (
    <div style={{ minHeight: '100vh', background: 'hsl(var(--bg))' }}>
      <RateLimitBanner />
      <Sidebar />
      <main className="mx-auto" style={{ maxWidth: 1280, padding: '28px 24px 64px' }}>
        <AlertBanner show={user && !user.cookies_valid} />
        <ImportBanner />
        {children}
      </main>
    </div>
  );
}

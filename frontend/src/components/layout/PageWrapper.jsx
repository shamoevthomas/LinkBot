import Sidebar from './Sidebar';
import AlertBanner from '../ui/AlertBanner';
import RateLimitBanner from '../ui/RateLimitBanner';
import CookiesBlockerModal from '../ui/CookiesBlockerModal';
import GeminiBlockerModal from '../ui/GeminiBlockerModal';
import ImportBanner from '../ImportBanner';
import { useAuth } from '../../context/AuthContext';

export default function PageWrapper({ children }) {
  const { user } = useAuth();
  const cookiesInvalid = !!(user && !user.cookies_valid);
  // Cookies popup takes priority — don't stack two full-screen modals.
  const geminiInvalid = !!(user && user.gemini_key_invalid && !cookiesInvalid);

  return (
    <div style={{ minHeight: '100vh', background: 'hsl(var(--bg))' }}>
      <RateLimitBanner />
      <Sidebar />
      <main className="mx-auto" style={{ maxWidth: 1280, padding: '28px 24px 64px' }}>
        <AlertBanner show={cookiesInvalid} />
        <ImportBanner />
        {children}
      </main>
      {/* Full-screen blockers — only on non-config pages */}
      <CookiesBlockerModal show={cookiesInvalid} />
      <GeminiBlockerModal show={geminiInvalid} />
    </div>
  );
}

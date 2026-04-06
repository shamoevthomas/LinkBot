import Sidebar from './Sidebar';
import AlertBanner from '../ui/AlertBanner';
import ImportBanner from '../ImportBanner';
import { useAuth } from '../../context/AuthContext';

export default function PageWrapper({ children }) {
  const { user } = useAuth();

  return (
    <div style={{ minHeight: '100vh', background: '#fff' }}>
      <div style={{ paddingTop: 20 }}>
        <Sidebar />
      </div>
      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px 64px' }}>
        <AlertBanner show={user && !user.cookies_valid} />
        <ImportBanner />
        {children}
      </main>
    </div>
  );
}

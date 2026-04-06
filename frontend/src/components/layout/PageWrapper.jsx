import Sidebar from './Sidebar';
import AlertBanner from '../ui/AlertBanner';
import { useAuth } from '../../context/AuthContext';

export default function PageWrapper({ children }) {
  const { user } = useAuth();

  return (
    <div style={{ minHeight: '100vh', background: '#fff' }}>
      <div style={{ paddingTop: 20 }}>
        <Sidebar />
      </div>
      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 48px 64px' }}>
        <AlertBanner show={user && !user.cookies_valid} />
        {children}
      </main>
    </div>
  );
}

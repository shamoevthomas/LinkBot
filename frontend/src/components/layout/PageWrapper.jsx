import Sidebar from './Sidebar';
import AlertBanner from '../ui/AlertBanner';
import { useAuth } from '../../context/AuthContext';

export default function PageWrapper({ children }) {
  const { user } = useAuth();

  return (
    <div className="flex min-h-screen bg-surface">
      <Sidebar />
      <main className="flex-1 p-6 overflow-auto">
        <AlertBanner show={user && !user.cookies_valid} />
        {children}
      </main>
    </div>
  );
}

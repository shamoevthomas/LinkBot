import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import OnboardingWizard from './pages/OnboardingWizard';
import DashboardPage from './pages/DashboardPage';
import CRMListPage from './pages/CRMListPage';
import CRMDetailPage from './pages/CRMDetailPage';
import CampaignsPage from './pages/CampaignsPage';
import CampaignDetailPage from './pages/CampaignDetailPage';
import NewDMCampaignPage from './pages/NewDMCampaignPage';
import ContactsPage from './pages/ContactsPage';
import ConfigPage from './pages/ConfigPage';
import LeadMagnetsPage from './pages/LeadMagnetsPage';
import LeadMagnetDetailPage from './pages/LeadMagnetDetailPage';

function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-surface">
      <div className="w-10 h-10 border-4 border-linkedin border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return children;
}

function DashboardWrapper({ children }) {
  const { user } = useAuth();
  return (
    <>
      {user && !user.onboarding_completed && <OnboardingWizard />}
      {children}
    </>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/dashboard" element={
        <ProtectedRoute><DashboardWrapper><DashboardPage /></DashboardWrapper></ProtectedRoute>
      } />
      <Route path="/dashboard/crms" element={
        <ProtectedRoute><DashboardWrapper><CRMListPage /></DashboardWrapper></ProtectedRoute>
      } />
      <Route path="/dashboard/crm/:id" element={
        <ProtectedRoute><DashboardWrapper><CRMDetailPage /></DashboardWrapper></ProtectedRoute>
      } />
      <Route path="/dashboard/contacts" element={
        <ProtectedRoute><DashboardWrapper><ContactsPage /></DashboardWrapper></ProtectedRoute>
      } />
      <Route path="/dashboard/campaigns" element={
        <ProtectedRoute><DashboardWrapper><CampaignsPage /></DashboardWrapper></ProtectedRoute>
      } />
      <Route path="/dashboard/campaigns/new-dm" element={
        <ProtectedRoute><DashboardWrapper><NewDMCampaignPage /></DashboardWrapper></ProtectedRoute>
      } />
      <Route path="/dashboard/campaigns/:id" element={
        <ProtectedRoute><DashboardWrapper><CampaignDetailPage /></DashboardWrapper></ProtectedRoute>
      } />
      <Route path="/dashboard/lead-magnets" element={
        <ProtectedRoute><DashboardWrapper><LeadMagnetsPage /></DashboardWrapper></ProtectedRoute>
      } />
      <Route path="/dashboard/lead-magnets/:id" element={
        <ProtectedRoute><DashboardWrapper><LeadMagnetDetailPage /></DashboardWrapper></ProtectedRoute>
      } />
      <Route path="/dashboard/config" element={
        <ProtectedRoute><DashboardWrapper><ConfigPage /></DashboardWrapper></ProtectedRoute>
      } />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
        <Toaster position="top-right" toastOptions={{
          style: { fontSize: '14px' },
          success: { iconTheme: { primary: '#057642' } },
        }} />
      </AuthProvider>
    </BrowserRouter>
  );
}

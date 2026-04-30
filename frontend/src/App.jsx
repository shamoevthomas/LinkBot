import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { Analytics } from '@vercel/analytics/react';
import { AuthProvider, useAuth } from './context/AuthContext';

// Each page is its own chunk so the initial bundle only ships the route
// the user actually lands on. First-paint time is dominated by downloading
// and parsing JS, so splitting ~615 KB into per-route chunks of 20–80 KB
// cuts first interaction well below a second on broadband.
const LandingPage = lazy(() => import('./pages/LandingPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const RegisterPage = lazy(() => import('./pages/RegisterPage'));
const OnboardingWizard = lazy(() => import('./pages/OnboardingWizard'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const CRMListPage = lazy(() => import('./pages/CRMListPage'));
const CRMDetailPage = lazy(() => import('./pages/CRMDetailPage'));
const CampaignsPage = lazy(() => import('./pages/CampaignsPage'));
const CampaignDetailPage = lazy(() => import('./pages/CampaignDetailPage'));
const NewDMCampaignPage = lazy(() => import('./pages/NewDMCampaignPage'));
const ContactsPage = lazy(() => import('./pages/ContactsPage'));
const ConfigPage = lazy(() => import('./pages/ConfigPage'));
const LeadMagnetsPage = lazy(() => import('./pages/LeadMagnetsPage'));
const LeadMagnetDetailPage = lazy(() => import('./pages/LeadMagnetDetailPage'));

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'hsl(var(--bg))' }}>
      <div className="w-10 h-10 rounded-full border-4 animate-spin"
        style={{ borderColor: 'hsl(var(--accent) / .25)', borderTopColor: 'hsl(var(--accent))' }} />
    </div>
  );
}

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
    <Suspense fallback={<PageLoader />}>
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
    </Suspense>
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
        <Analytics />
      </AuthProvider>
    </BrowserRouter>
  );
}

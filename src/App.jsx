import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Login from './pages/Login';
import Layout from './components/Layout';
import DealersPage from './pages/DealersPage';
import DealerDetailPage from './pages/DealerDetailPage';
import UsersPage from './pages/UsersPage';
import NewRegistrationPage from './pages/NewRegistrationPage';
import RegistrationsPage from './pages/RegistrationsPage';
import HomePage from './pages/HomePage';
import AdminMenuPage from './pages/AdminMenuPage';

// Dashboard harita kütüphanesini içerdiği için sadece açıldığında yüklenir
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
// Veri Yükle, Excel okuma kütüphanesini içerdiği için sadece açıldığında yüklenir
const SyncPage = lazy(() => import('./pages/SyncPage'));
const BackupPage = lazy(() => import('./pages/BackupPage'));

function PrivateRoute({ children }) {
  const { user } = useAuth();
  return user ? children : <Navigate to="/login" />;
}

// Sadece sahip (Kullanıcılar, Veri Yükle, Yönetim menüsü)
function AdminRoute({ children }) {
  const { isOwner } = useAuth();
  return isOwner ? children : <Navigate to="/" />;
}

// Kayıt girebilenler: temsilci ve sahip
function RegisterRoute({ children }) {
  const { canRegister } = useAuth();
  return canRegister ? children : <Navigate to="/registrations" />;
}

function AppRoutes() {
  const { user } = useAuth();

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" /> : <Login />} />
        <Route path="/*" element={
          <PrivateRoute>
            <Layout>
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/dealers" element={<DealersPage />} />
                <Route path="/dealers/:id" element={<DealerDetailPage />} />
                <Route path="/registrations/new" element={<RegisterRoute><NewRegistrationPage /></RegisterRoute>} />
                <Route path="/dashboard" element={<Suspense fallback={<div className="page"><div className="page-subtitle">Dashboard yükleniyor…</div></div>}><DashboardPage /></Suspense>} />
                <Route path="/registrations" element={<RegistrationsPage />} />
                <Route path="/my-dealers" element={<Navigate to="/registrations" replace />} />
                <Route path="/admin" element={<AdminRoute><AdminMenuPage /></AdminRoute>} />
                <Route path="/admin/backup" element={<AdminRoute><Suspense fallback={null}><BackupPage /></Suspense></AdminRoute>} />
                <Route path="/admin/users" element={<AdminRoute><UsersPage /></AdminRoute>} />
                <Route path="/admin/sync" element={<AdminRoute><Suspense fallback={<div className="page"><div className="page-subtitle">Yükleniyor…</div></div>}><SyncPage /></Suspense></AdminRoute>} />
              </Routes>
            </Layout>
          </PrivateRoute>
        } />
      </Routes>
    </BrowserRouter>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
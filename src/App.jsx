import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Login from './pages/Login';
import Layout from './components/Layout';
import SyncPage from './pages/SyncPage';
import DealersPage from './pages/DealersPage';
import DealerDetailPage from './pages/DealerDetailPage';
import UsersPage from './pages/UsersPage';
import NewRegistrationPage from './pages/NewRegistrationPage';
import RegistrationsPage from './pages/RegistrationsPage';

function PrivateRoute({ children }) {
  const { user } = useAuth();
  return user ? children : <Navigate to="/login" />;
}

function AdminRoute({ children }) {
  const { userRole } = useAuth();
  return userRole === 'admin' ? children : <Navigate to="/" />;
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
                <Route path="/" element={
                  <div style={{ textAlign: 'center', padding: 60 }}>
                    <h1 style={{ color: '#BE1E2D', fontSize: 32 }}>Airfel Bayi Takip Sistemi</h1>
                    <p style={{ color: '#9a9590', marginTop: 12 }}>Hoş geldiniz! Sol menüden başlayabilirsiniz.</p>
                  </div>
                } />
                <Route path="/dealers" element={<DealersPage />} />
                <Route path="/dealers/:id" element={<DealerDetailPage />} />
                <Route path="/registrations/new" element={<NewRegistrationPage />} />
                <Route path="/dashboard" element={<div style={{padding:20}}><h2>Dashboard — yakında</h2></div>} />
                <Route path="/registrations" element={<RegistrationsPage />} />
                <Route path="/my-dealers" element={<Navigate to="/registrations" replace />} />
                <Route path="/admin/users" element={<AdminRoute><UsersPage /></AdminRoute>} />
                <Route path="/admin/sync" element={<AdminRoute><SyncPage /></AdminRoute>} />
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
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
import HomePage from './pages/HomePage';
import AdminMenuPage from './pages/AdminMenuPage';

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
                <Route path="/" element={<HomePage />} />
                <Route path="/dealers" element={<DealersPage />} />
                <Route path="/dealers/:id" element={<DealerDetailPage />} />
                <Route path="/registrations/new" element={<NewRegistrationPage />} />
                <Route path="/dashboard" element={<AdminRoute><div style={{ padding: '40px 8px', textAlign: 'center', color: '#7a7570' }}><h1 style={{ fontSize: 22, color: '#2b2b2b', marginBottom: 8 }}>Dashboard</h1>Yakında</div></AdminRoute>} />
                <Route path="/registrations" element={<RegistrationsPage />} />
                <Route path="/my-dealers" element={<Navigate to="/registrations" replace />} />
                <Route path="/admin" element={<AdminRoute><AdminMenuPage /></AdminRoute>} />
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
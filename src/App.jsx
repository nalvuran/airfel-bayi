import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Login from './pages/Login';
import Layout from './components/Layout';

function PrivateRoute({ children }) {
  const { user } = useAuth();
  return user ? children : <Navigate to="/login" />;
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
                <Route path="/dealers" element={<div style={{padding:20}}><h2>Bayiler — yakında</h2></div>} />
                <Route path="/dashboard" element={<div style={{padding:20}}><h2>Dashboard — yakında</h2></div>} />
                <Route path="/my-dealers" element={<div style={{padding:20}}><h2>Kayıtlarım — yakında</h2></div>} />
                <Route path="/admin/users" element={<div style={{padding:20}}><h2>Kullanıcılar — yakında</h2></div>} />
                <Route path="/admin/sync" element={<div style={{padding:20}}><h2>Veri Yükle — yakında</h2></div>} />
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
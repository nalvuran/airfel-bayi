import { useAuth } from '../contexts/AuthContext';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';
import { useNavigate, useLocation } from 'react-router-dom';

export default function Layout({ children }) {
  const { user, userRole } = useAuth();
  const location = useLocation();

  const handleLogout = async () => {
    await signOut(auth);
  };

  const adminLinks = [
    { label: '🏠 Ana Sayfa', path: '/' },
    { label: '🏪 Bayiler', path: '/dealers' },
    { label: '📊 Dashboard', path: '/dashboard' },
    { label: '👥 Kullanıcılar', path: '/admin/users' },
    { label: '📂 Veri Yükle', path: '/admin/sync' },
  ];

  const repLinks = [
    { label: '🏠 Ana Sayfa', path: '/' },
    { label: '🏪 Bayiler', path: '/dealers' },
    { label: '📋 Kayıtlarım', path: '/my-dealers' },
  ];

  const links = userRole === 'admin' ? adminLinks : repLinks;

  return (
    <div style={{ minHeight: '100vh', background: '#f8f7f5', fontFamily: 'system-ui, sans-serif' }}>
      <header style={{
        background: 'white',
        borderBottom: '1px solid #e5e3df',
        padding: '0 24px',
        height: 64,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 100,
        boxShadow: '0 1px 4px rgba(0,0,0,0.07)'
      }}>
        <div style={{ fontSize: 28, fontWeight: 700, color: '#BE1E2D', fontFamily: 'Georgia, serif' }}>
          airfel
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontSize: 13, color: '#4a4a4a' }}>{user?.email}</span>
          <span style={{
            background: userRole === 'admin' ? '#fdf0f0' : '#f0f7ff',
            color: userRole === 'admin' ? '#BE1E2D' : '#065a82',
            padding: '4px 10px',
            borderRadius: 20,
            fontSize: 12,
            fontWeight: 700
          }}>
            {userRole === 'admin' ? 'Yönetici' : 'Temsilci'}
          </span>
          <button onClick={handleLogout} style={{
            background: 'transparent',
            border: '1.5px solid #e5e3df',
            borderRadius: 8,
            padding: '6px 14px',
            fontSize: 13,
            cursor: 'pointer',
            color: '#4a4a4a'
          }}>
            Çıkış
          </button>
        </div>
      </header>

      <nav style={{
        background: 'white',
        borderBottom: '1px solid #e5e3df',
        padding: '0 24px',
        display: 'flex',
        gap: 4,
        overflowX: 'auto'
      }}>
        {links.map(item => (
          <a key={item.path} href={item.path} style={{
            padding: '14px 16px',
            fontSize: 13,
            fontWeight: 600,
            color: location.pathname === item.path ? '#BE1E2D' : '#4a4a4a',
            borderBottom: location.pathname === item.path ? '2px solid #BE1E2D' : '2px solid transparent',
            textDecoration: 'none',
            whiteSpace: 'nowrap'
          }}>
            {item.label}
          </a>
        ))}
      </nav>

      <main style={{ padding: 24 }}>
        {children}
      </main>
    </div>
  );
}
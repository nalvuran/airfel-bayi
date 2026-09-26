// src/components/Layout.jsx
import { signOut } from 'firebase/auth';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { auth } from '../firebase';
import { useAuth, ROLE_LABELS } from '../contexts/AuthContext';
import { clearSyncError, useOnline, useSyncState } from '../utils/offline';
import { useTheme } from '../utils/theme';

/* ---------- Simgeler ---------- */
const Icon = ({ children }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);
const HomeIcon = () => <Icon><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /><path d="M10 21v-6h4v6" /></Icon>;
const StoreIcon = () => <Icon><path d="M3 9l1.5-5h15L21 9" /><path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0" /><path d="M5 12v9h14v-9" /><path d="M10 21v-5h4v5" /></Icon>;
const PlusIcon = () => <Icon><path d="M12 5v14M5 12h14" /></Icon>;
const ListIcon = () => <Icon><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 8h6M9 12h6M9 16h4" /></Icon>;
const ChartIcon = () => <Icon><path d="M4 20V10" /><path d="M10 20V4" /><path d="M16 20v-7" /><path d="M22 20H2" /></Icon>;
const GridIcon = () => <Icon><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></Icon>;
const SunIcon = () => <Icon><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></Icon>;
const MoonIcon = () => <Icon><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></Icon>;
const AutoIcon = () => <Icon><circle cx="12" cy="12" r="9" /><path d="M12 3v18" /><path d="M12 3a9 9 0 0 1 0 18" fill="currentColor" /></Icon>;
const LogoutIcon = () => <Icon><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /><path d="M10 17l-5-5 5-5" /><path d="M5 12h11" /></Icon>;

// Bağlantı ve gönderim durumu: sadece bir sorun ya da bekleyen iş varsa görünür
function SyncStatus() {
  const online = useOnline();
  const { pending, error } = useSyncState();
  if (error) {
    return (
      <button className="sync-chip sync-error" onClick={() => { window.alert(error); clearSyncError(); }} title={error}>
        ⚠ Gönderilemeyen kayıt
      </button>
    );
  }
  if (!online) return <span className="sync-chip sync-offline" title="İnternet bağlantısı yok. Girdiğin kayıtlar telefonda saklanır.">Çevrimdışı</span>;
  if (pending) return <span className="sync-chip sync-pending" title="Telefonda bekleyen kayıtlar gönderiliyor">Gönderiliyor…</span>;
  return null;
}

// Tema düğmesi: Sistem → Açık → Koyu → Sistem
function ThemeButton() {
  const { pref, setPref } = useTheme();
  const next = { system: 'light', light: 'dark', dark: 'system' }[pref] || 'light';
  const label = { system: 'Tema: telefonun ayarı', light: 'Tema: açık', dark: 'Tema: koyu' }[pref];
  return (
    <button className="theme-btn" onClick={() => setPref(next)} title={`${label} (değiştirmek için dokun)`} aria-label={`${label}. Değiştir`}>
      {pref === 'dark' ? <MoonIcon /> : pref === 'light' ? <SunIcon /> : <AutoIcon />}
    </button>
  );
}

export default function Layout({ children }) {
  const { user, userRole, userProfile, isOwner, canRegister } = useAuth();
  const { pathname } = useLocation();
  const regsLabel = userRole === 'rep' ? 'Kayıtlarım' : 'Kayıtlar';

  const handleLogout = async () => {
    if (window.confirm('Çıkış yapmak istiyor musun?')) await signOut(auth);
  };

  // Bilgisayar: üst menü
  const topLinks = [
    { label: 'Ana Sayfa', to: '/', end: true },
    { label: 'Bayiler', to: '/dealers' },
    ...(canRegister ? [{ label: 'Yeni Kayıt', to: '/registrations/new' }] : []),
    { label: regsLabel, to: '/registrations', end: true },
    { label: 'Talepler', to: '/requests' },
    { label: 'Pano', to: '/pano' },
    { label: 'Dashboard', to: '/dashboard' },
    ...(isOwner ? [
      { label: 'Ekip', to: '/admin/users' },
      { label: 'Veri Yükle', to: '/admin/sync' },
      { label: 'Yedek', to: '/admin/backup' },
    ] : []),
  ];

  // Telefon: alt sekme çubuğu
  const tabActive = {
    home: pathname === '/',
    dealers: pathname.startsWith('/dealers'),
    add: pathname === '/registrations/new',
    regs: pathname === '/registrations',
    dash: pathname.startsWith('/dashboard'),
    admin: pathname.startsWith('/admin'),
  };
  const tab = (key) => (tabActive[key] ? 'active' : '');

  return (
    <div>
      <header className="app-header">
        <div className="app-header-inner">
          <Link to="/" className="app-logo" aria-label="Ana sayfa">
            <img className="logo-light" src="/logo.png" alt="airfel" />
            <img className="logo-dark" src="/logo-dark.png" alt="airfel" />
          </Link>
          <nav className="top-nav" aria-label="Ana menü">
            {topLinks.map((l) => (
              <NavLink key={l.to} to={l.to} end={l.end}>{l.label}</NavLink>
            ))}
          </nav>
          <div className="user-box">
            <SyncStatus />
            <ThemeButton />
            <span className="user-name">{userProfile?.name || user?.email}</span>
            <span className="role-chip">{ROLE_LABELS[userRole] || 'Temsilci'}</span>
            <button className="logout-btn" onClick={handleLogout} aria-label="Çıkış yap">
              <LogoutIcon /><span>Çıkış</span>
            </button>
          </div>
        </div>
      </header>

      <main className="app-main">{children}</main>

      <nav className="tabbar" aria-label="Alt menü">
        <Link to="/" className={tab('home')}><HomeIcon />Ana Sayfa</Link>
        <Link to="/dealers" className={tab('dealers')}><StoreIcon />Bayiler</Link>
        {canRegister && (
          <Link to="/registrations/new" className={`tab-add ${tab('add')}`} aria-label="Yeni kayıt">
            <span className="plus"><PlusIcon /></span>Yeni Kayıt
          </Link>
        )}
        <Link to="/registrations" className={tab('regs')}><ListIcon />{regsLabel}</Link>
        {isOwner
          ? <Link to="/admin" className={tab('admin') || tab('dash')}><GridIcon />Yönetim</Link>
          : <Link to="/dashboard" className={tab('dash')}><ChartIcon />Dashboard</Link>}
      </nav>
    </div>
  );
}

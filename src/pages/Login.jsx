import { useState } from 'react';
import { sendPasswordResetEmail, signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { APP_NAME, APP_VERSION } from '../utils/version';
import { Alert } from '../components/ui';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { authError } = useAuth();
  const [loading, setLoading] = useState(false);
  // 'login' | 'reset' (şifremi unuttum)
  const [mode, setMode] = useState('login');
  const [resetSent, setResetSent] = useState(false);

  const handleReset = async (e) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      auth.languageCode = 'tr';
      await sendPasswordResetEmail(auth, email.trim());
      setResetSent(true);
    } catch (err) {
      // Kayıtlı olmayan adreslerde de aynı mesaj: hangi adresin kayıtlı olduğu anlaşılmasın
      if (err?.code === 'auth/user-not-found') setResetSent(true);
      else if (err?.code === 'auth/invalid-email') setError('E-posta adresini kontrol et.');
      else if (err?.code === 'auth/too-many-requests') setError('Çok fazla deneme yapıldı. Birkaç dakika sonra tekrar dene.');
      else setError('Bağlantı gönderilemedi. İnternet bağlantını kontrol edip tekrar dene.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      try { sessionStorage.setItem('airfel.justLoggedIn', '1'); } catch { /* yok say */ }
    } catch {
      setError('E-posta veya şifre hatalı.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div className="card" style={{ width: '100%', maxWidth: 400, padding: 'clamp(24px, 7vw, 40px)', boxShadow: '0 8px 32px var(--lift)' }}>
        <div style={{ textAlign: 'center', marginBottom: 22 }}>
          <img className="logo-light" src="/logo-full.png" alt="airfel — Daima senden yana" style={{ width: 190, maxWidth: '70%', height: 'auto' }} />
          <img className="logo-dark" src="/logo-full-dark.png" alt="airfel — Daima senden yana" style={{ width: 190, maxWidth: '70%', height: 'auto' }} />
        </div>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <h1 className="app-name" style={{ fontSize: 26, margin: 0 }}>{APP_NAME} <span className="app-ver">V{APP_VERSION}</span></h1>
          <div className="muted" style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>Bayi takip sistemi</div>
        </div>

        {mode === 'reset' ? (
          <form onSubmit={handleReset} className="stack" style={{ gap: 16 }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 17 }}>Şifremi unuttum</div>
              <div className="text-sm muted" style={{ marginTop: 4 }}>E-posta adresini yaz; sana yeni şifre belirleme bağlantısı gönderelim.</div>
            </div>
            {resetSent ? (
              <Alert tone="success">
                E-posta adresin sistemde kayıtlıysa şifre belirleme bağlantısı gönderildi. Bağlantı 1 saat geçerli; gelen kutunda yoksa spam klasörüne bak.
              </Alert>
            ) : (
              <>
                <div>
                  <label className="label" htmlFor="reset-email">E-posta</label>
                  <input id="reset-email" type="email" className="input input-lg" value={email} onChange={(e) => setEmail(e.target.value)}
                    placeholder="ornek@airfel.com.tr" autoComplete="email" autoCapitalize="off" required autoFocus />
                </div>
                {error && <Alert tone="danger">{error}</Alert>}
                <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={loading}>
                  {loading ? 'Gönderiliyor…' : 'Bağlantı gönder'}
                </button>
              </>
            )}
            <button type="button" className="btn-link" style={{ justifySelf: 'center' }}
              onClick={() => { setMode('login'); setResetSent(false); setError(''); }}>← Girişe dön</button>
          </form>
        ) : (
        <form onSubmit={handleLogin} className="stack" style={{ gap: 16 }}>
          <div>
            <label className="label" htmlFor="login-email">E-posta</label>
            <input id="login-email" type="email" className="input input-lg" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="ornek@airfel.com.tr" autoComplete="email" autoCapitalize="off" required />
          </div>
          <div>
            <label className="label" htmlFor="login-password">Şifre</label>
            <input id="login-password" type="password" className="input input-lg" value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••" autoComplete="current-password" required />
          </div>
          {(error || authError) && <Alert tone="danger">{error || authError}</Alert>}
          <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={loading}>
            {loading ? 'Giriş yapılıyor…' : 'Giriş yap'}
          </button>
          <button type="button" className="btn-link text-sm" style={{ justifySelf: 'center' }}
            onClick={() => { setMode('reset'); setResetSent(false); setError(''); }}>Şifremi unuttum</button>
        </form>
        )}
      </div>
    </div>
  );
}

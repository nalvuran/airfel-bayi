import { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { Alert } from '../components/ui';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { authError } = useAuth();
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch {
      setError('E-posta veya şifre hatalı.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div className="card" style={{ width: '100%', maxWidth: 400, padding: 'clamp(24px, 7vw, 40px)', boxShadow: '0 8px 32px rgba(30,30,30,0.08)' }}>
        <div style={{ textAlign: 'center', marginBottom: 22 }}>
          <img src="/logo-full.png" alt="airfel — Daima senden yana" style={{ width: 190, maxWidth: '70%', height: 'auto' }} />
        </div>
        <h1 style={{ fontSize: 20, textAlign: 'center', marginBottom: 24 }}>Bayi Takip Sistemi</h1>

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
        </form>
      </div>
    </div>
  );
}

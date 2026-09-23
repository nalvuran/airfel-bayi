import { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebase';
import { useAuth } from '../contexts/AuthContext';

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
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      setError('E-posta veya şifre hatalı.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: '#f8f7f5',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 16
    }}>
      <div style={{
        background: 'white',
        borderRadius: 16,
        padding: 'clamp(24px, 7vw, 40px)',
        width: '100%',
        maxWidth: 400,
        boxShadow: '0 8px 32px rgba(0,0,0,0.10)'
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <img src="/logo-full.png" alt="airfel — Daima senden yana" style={{ width: 190, maxWidth: '70%', height: 'auto' }} />
        </div>

        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 24, color: '#1a1a1a', textAlign: 'center' }}>
          Bayi Takip Sistemi
        </h2>

        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#4a4a4a', marginBottom: 6 }}>
              E-Posta
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="ornek@airfel.com.tr"
              required
              style={{
                width: '100%',
                padding: '12px 14px',
                border: '1.5px solid #e5e3df',
                borderRadius: 10,
                fontSize: 14,
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#4a4a4a', marginBottom: 6 }}>
              Şifre
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              style={{
                width: '100%',
                padding: '12px 14px',
                border: '1.5px solid #e5e3df',
                borderRadius: 10,
                fontSize: 14,
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {(error || authError) && (
            <div style={{
              background: '#fdf2f2',
              border: '1px solid #f5c6c6',
              color: '#c0392b',
              padding: '10px 14px',
              borderRadius: 8,
              fontSize: 13,
              marginBottom: 16
            }}>
              {error || authError}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              background: loading ? '#ccc' : '#B91724',
              color: 'white',
              border: 'none',
              borderRadius: 10,
              padding: '14px',
              fontSize: 15,
              fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            {loading ? 'Giriş yapılıyor...' : 'Giriş Yap'}
          </button>
        </form>
      </div>
    </div>
  );
}
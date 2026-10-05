// src/components/KvkkGate.jsx
// Yayınlanmış aydınlatma metni varsa ve kullanıcı bu sürümü onaylamadıysa, uygulamadan önce tam ekran gösterilir.
import { useEffect, useState } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { acceptKvkk, loadKvkk } from '../utils/kvkk';
import { Alert } from './ui';

export default function KvkkGate({ children }) {
  const { user, userProfile } = useAuth();
  const [kvkk, setKvkk] = useState(undefined);
  const [accepted, setAccepted] = useState(false);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Bağlantı yoksa metin okunamaz: kullanıcıyı engelleme, bir sonraki açılışta sorulur
  useEffect(() => { loadKvkk().then(setKvkk).catch(() => setKvkk(null)); }, []);

  if (kvkk === undefined) return null;
  if (!kvkk || accepted || (userProfile?.kvkkVersion || 0) >= kvkk.version) return children;

  const accept = async () => {
    setBusy(true); setError('');
    try { await acceptKvkk(user.uid, kvkk.version); setAccepted(true); }
    catch (e) { setError(e.code === 'permission-denied' ? 'Onay kaydedilemedi (izin hatası). Yöneticine bildir.' : 'Onay kaydedilemedi. İnternet bağlantını kontrol edip tekrar dene.'); }
    finally { setBusy(false); }
  };

  return (
    <div className="kvkk-wrap">
      <div className="kvkk-card">
        <img className="logo-light" src="/logo.png" alt="airfel" style={{ height: 28 }} />
        <img className="logo-dark" src="/logo-dark.png" alt="airfel" style={{ height: 28 }} />
        <h1 className="kvkk-title">Kişisel Verilerin Korunması</h1>
        <p className="text-sm muted" style={{ margin: '0 0 12px' }}>
          {(userProfile?.kvkkVersion || 0) > 0 ? 'Aydınlatma metni güncellendi. ' : ''}Uygulamayı kullanmaya devam etmeden önce lütfen aşağıdaki metni oku.
        </p>
        <div className="kvkk-text" tabIndex={0}>{kvkk.text}</div>
        <label className="kvkk-check">
          <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
          <span>Aydınlatma metnini okudum ve anladım.</span>
        </label>
        {error && <Alert tone="danger" style={{ marginTop: 10 }}>{error}</Alert>}
        <button className="btn btn-primary btn-lg btn-block mt-12" disabled={!checked || busy} onClick={accept}>
          {busy ? 'Kaydediliyor…' : 'Devam et'}
        </button>
        <button className="btn-link text-sm mt-12" style={{ display: 'block', margin: '12px auto 0' }} onClick={() => signOut(auth)}>Çıkış yap</button>
      </div>
    </div>
  );
}

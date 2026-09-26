import { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, getDocFromCache } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { startPresence } from '../utils/presence';

const AuthContext = createContext(null);

// Roller: owner (sahip; eski 'admin' de sahip sayılır), deptManager (departman müdürü),
// regionManager (bölge müdürü; eski 'manager' de bölge müdürü sayılır), rep (temsilci)
export const ROLE_LABELS = { owner: 'Sahip', deptManager: 'Departman Müdürü', regionManager: 'Bölge Müdürü', rep: 'Temsilci' };
export function normalizeRole(role) {
  if (role === 'owner' || role === 'admin') return 'owner';
  if (role === 'deptManager') return 'deptManager';
  if (role === 'regionManager' || role === 'manager') return 'regionManager';
  return 'rep';
}

// Yetki tablosu: tek yerden
export function permissionsFor(role) {
  return {
    isOwner: role === 'owner',
    isRep: role === 'rep',
    isRegionManager: role === 'regionManager',
    isDeptManager: role === 'deptManager',
    isManager: role === 'regionManager' || role === 'deptManager',
    canRegister: role === 'owner' || role === 'rep',                                    // saha kaydı
    canOpenRequest: role === 'owner' || role === 'rep' || role === 'regionManager',    // talep açma
    canPin: role === 'owner' || role === 'regionManager' || role === 'deptManager',    // panoda sabitleme
  };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [authError, setAuthError] = useState('');
  const [loading, setLoading] = useState(true);

  // Son görülme: oturum açık kullanıcı için
  useEffect(() => {
    if (!user || !userProfile) return undefined;
    return startPresence(db, user.uid, userProfile);
  }, [user?.uid, !!userProfile]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null); setUserRole(null); setUserProfile(null);
        setLoading(false);
        return;
      }
      try {
        const ref = doc(db, 'users', firebaseUser.uid);
        // Bağlantı yoksa telefonda kayıtlı profille devam et
        const snap = await getDoc(ref).catch(() => getDocFromCache(ref));
        const profile = snap.exists() ? snap.data() : null;
        // Sadece yöneticinin açtığı ve aktif olan hesaplar uygulamaya girebilir
        if (!profile) {
          setAuthError('Bu hesap sistemde tanımlı değil. Yöneticinizle iletişime geçin.');
          await signOut(auth);
          return;
        }
        if (profile.active === false) {
          setAuthError('Hesabınız pasif durumda. Yöneticinizle iletişime geçin.');
          await signOut(auth);
          return;
        }
        setAuthError('');
        setUserRole(normalizeRole(profile.role));
        setUserProfile(profile);
        setUser(firebaseUser);
      } catch {
        // Profil ne sunucudan ne telefondan okunabildi: oturumu kapatmadan hata göster, bağlantı gelince tekrar denenir
        setAuthError('Hesap bilgileri okunamadı. İnternet bağlantını kontrol edip uygulamayı yeniden aç.');
        setUser(null);
        return;
      } finally {
        setLoading(false);
      }
    });
    return unsub;
  }, []);

  return (
    <AuthContext.Provider value={{
      user, userRole, userProfile, authError, loading,
      // Ekip ağacındaki kişi anahtarı (temsilcide Customer Data'daki adı)
      personKey: userProfile?.personKey || userProfile?.salesRepKey || null,
      ...permissionsFor(userRole),
    }}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

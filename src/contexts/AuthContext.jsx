import { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [authError, setAuthError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null); setUserRole(null); setUserProfile(null);
        setLoading(false);
        return;
      }
      try {
        const snap = await getDoc(doc(db, 'users', firebaseUser.uid));
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
        setUserRole(profile.role);
        setUserProfile(profile);
        setUser(firebaseUser);
      } catch {
        setAuthError('Hesap bilgileri okunamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.');
        await signOut(auth);
        return;
      } finally {
        setLoading(false);
      }
    });
    return unsub;
  }, []);

  return (
    <AuthContext.Provider value={{ user, userRole, userProfile, authError, loading }}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
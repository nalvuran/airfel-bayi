import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: "AIzaSyCnNJvLUjdYZpqVOr26SbedVDNTJQyOrSA",
  authDomain: "airfel-bayi.firebaseapp.com",
  projectId: "airfel-bayi",
  storageBucket: "airfel-bayi.firebasestorage.app",
  messagingSenderId: "636362044453",
  appId: "1:636362044453:web:e71676baca9802708efbcc"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
export const storage = getStorage(app);
export default app;
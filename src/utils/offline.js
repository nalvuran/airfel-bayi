// src/utils/offline.js
// Bağlantısız çalışma yardımcıları.
// Firestore, bağlantı yokken yazılanları telefonda saklar ve bağlantı gelince kendiliğinden gönderir.
// Burada sadece kullanıcının bunu bekletilmeden öğrenmesini ve gönderim durumunu görmesini sağlıyoruz.
import { useEffect, useState } from 'react';
import { waitForPendingWrites } from 'firebase/firestore';
import { db } from '../firebase';

const PENDING_KEY = 'airfel.pendingWrites';
const ERROR_KEY = 'airfel.syncError';

const read = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* yok say */ } };

let state = { pending: read(PENDING_KEY) === '1', error: read(ERROR_KEY) };
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn(state));
function setState(patch) {
  state = { ...state, ...patch };
  write(PENDING_KEY, state.pending ? '1' : null);
  write(ERROR_KEY, state.error || null);
  emit();
}

let watching = false;
function watchPending() {
  if (watching) return;
  watching = true;
  waitForPendingWrites(db)
    .then(() => setState({ pending: false }))
    .catch(() => { /* oturum kapandıysa bir sonraki açılışta tekrar denenir */ })
    .finally(() => { watching = false; });
}

// Uygulama açıldığında önceki oturumdan gönderilmeyi bekleyen kayıt varsa izlemeye başla
if (state.pending) watchPending();

/**
 * Bir yazma işlemini başlatır. Sunucu 10 saniye içinde onaylarsa { queued: false },
 * bağlantı yok ya da çok zayıfsa işlem telefonda sıraya alınır ve { queued: true } döner.
 * Sunucu yazmayı reddederse (ör. izin yok) hata fırlatılır.
 */
export async function commitOrQueue(promise, { timeout = 10000 } = {}) {
  const tracked = promise.then(() => 'ok');
  const later = (e) => setState({ error: e?.code === 'permission-denied'
    ? 'Telefonda bekleyen bir kayıt izin hatası nedeniyle gönderilemedi.'
    : `Telefonda bekleyen bir kayıt gönderilemedi: ${e?.message || e}` });

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    tracked.catch(later);
    setState({ pending: true }); watchPending();
    return { queued: true };
  }
  const result = await Promise.race([tracked, new Promise((res) => setTimeout(() => res('timeout'), timeout))]);
  if (result === 'ok') return { queued: false };
  tracked.catch(later);
  setState({ pending: true }); watchPending();
  return { queued: true };
}

export function clearSyncError() { setState({ error: null }); }

export function useSyncState() {
  const [s, setS] = useState(state);
  useEffect(() => { listeners.add(setS); return () => { listeners.delete(setS); }; }, []);
  return s;
}

export function useOnline() {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const on = () => { setOnline(true); if (state.pending) watchPending(); };
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  return online;
}

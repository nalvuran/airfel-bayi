// src/utils/presence.js
// "Son görülme": uygulama açıldığında ve arka plandan geri gelindiğinde (en fazla saatte bir)
// kullanıcının kendi profiline son görülme zamanı ve o günün tarihi yazılır. Sadece sahip görür.
import { deleteField, doc, serverTimestamp, updateDoc } from 'firebase/firestore';

const KEY = 'airfel.lastTouch';
const EVERY_MS = 60 * 60 * 1000;
const KEEP_DAYS = 60;

const dayStr = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function touchPresence(db, uid, profile) {
  try {
    const last = Number(localStorage.getItem(`${KEY}.${uid}`)) || 0;
    if (Date.now() - last < EVERY_MS) return;
    localStorage.setItem(`${KEY}.${uid}`, String(Date.now()));
  } catch { /* gizli sekme: yine de yaz */ }

  const update = { lastSeenAt: serverTimestamp(), [`activeDays.${dayStr(new Date())}`]: true };
  // 60 günden eski günleri temizle (alan büyümesin)
  const limit = new Date(Date.now() - KEEP_DAYS * 86400000);
  Object.keys(profile?.activeDays || {}).forEach((d) => { if (d < dayStr(limit)) update[`activeDays.${d}`] = deleteField(); });
  // Beklemeden gönder; bağlantı yoksa Firebase sıraya alır
  updateDoc(doc(db, 'users', uid), update).catch(() => {});
}

export function startPresence(db, uid, profile) {
  touchPresence(db, uid, profile);
  const onVisible = () => { if (document.visibilityState === 'visible') touchPresence(db, uid, profile); };
  document.addEventListener('visibilitychange', onVisible);
  return () => document.removeEventListener('visibilitychange', onVisible);
}

// Ekip sayfası için: son görülme metni ve son 30 günde kullanılan gün sayısı
export function presenceInfo(u) {
  const at = u.lastSeenAt?.toDate ? u.lastSeenAt.toDate() : u.lastSeenAt instanceof Date ? u.lastSeenAt : null;
  const since = dayStr(new Date(Date.now() - 29 * 86400000));
  const days30 = Object.keys(u.activeDays || {}).filter((d) => d >= since).length;
  if (!at) return { text: 'Hiç girmedi', days30, tone: 'warn' };
  const min = Math.floor((Date.now() - at.getTime()) / 60000);
  const hm = at.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  let text;
  if (min < 60) text = 'Son görülme: az önce';
  else if (dayStr(at) === dayStr(new Date())) text = `Son görülme: bugün ${hm}`;
  else if (dayStr(at) === dayStr(new Date(Date.now() - 86400000))) text = `Son görülme: dün ${hm}`;
  else {
    const g = Math.floor(min / 1440);
    text = g < 7 ? `Son görülme: ${g} gün önce` : `Son görülme: ${at.toLocaleDateString('tr-TR')}`;
  }
  const g = Math.floor(min / 1440);
  return { text, days30, tone: g >= 7 ? 'warn' : g >= 3 ? undefined : 'success' };
}

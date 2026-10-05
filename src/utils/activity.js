// src/utils/activity.js
// Hareket günlüğü: activity/{id}. Her işlem yapıldığı anda bir satır yazılır.
// Okuma sadece sahipte; satırlar değiştirilemez; 30 günden eskileri sahip sayfayı açınca silinir.
import { addDoc, collection, getDocs, limit, orderBy, query, serverTimestamp, startAfter, where, writeBatch, Timestamp } from 'firebase/firestore';
import { auth, db } from '../firebase';

export const RETENTION_DAYS = 30;

export const ACTIVITY_TYPES = {
  'auth.login': { label: 'Giriş yaptı', group: 'Hesap' },
  'kvkk.accept': { label: 'Aydınlatma metnini onayladı', group: 'Hesap' },
  'registration.create': { label: 'Saha kaydı girdi', group: 'Kayıt' },
  'registration.edit': { label: 'Kaydı düzenledi', group: 'Kayıt' },
  'registration.move': { label: 'Kaydı başka bayiye taşıdı', group: 'Kayıt' },
  'registration.flags': { label: 'Kayıt işaretini kaldırdı', group: 'Kayıt' },
  'registration.delete': { label: 'Kaydı sildi', group: 'Kayıt' },
  'request.create': { label: 'Talep açtı', group: 'Talep' },
  'request.close': { label: 'Talep kapattı', group: 'Talep' },
  'note.add': { label: 'Not yazdı', group: 'Not' },
  'note.edit': { label: 'Notu düzenledi', group: 'Not' },
  'note.delete': { label: 'Notu sildi', group: 'Not' },
  'post.add': { label: 'Panoya yazdı', group: 'Pano' },
  'post.edit': { label: 'Pano yazısını düzenledi', group: 'Pano' },
  'post.pin': { label: 'Pano yazısını sabitledi', group: 'Pano' },
  'post.unpin': { label: 'Sabitlemeyi kaldırdı', group: 'Pano' },
  'post.delete': { label: 'Pano yazısını sildi', group: 'Pano' },
  'comment.add': { label: 'Yorum yaptı', group: 'Pano' },
  'comment.delete': { label: 'Yorumu sildi', group: 'Pano' },
  'followup.set': { label: 'Takip tarihi koydu', group: 'Takip' },
  'followup.clear': { label: 'Takibi kapattı', group: 'Takip' },
  'location.save': { label: 'Bayi konumunu kaydetti', group: 'Konum' },
  'export.registrations': { label: 'Kayıtları Excel\'e aktardı', group: 'Excel' },
  'export.dealers': { label: 'Bayileri Excel\'e aktardı', group: 'Excel' },
  'export.requests': { label: 'Talepleri Excel\'e aktardı', group: 'Excel' },
  'user.create': { label: 'Hesap açtı', group: 'Yönetim' },
  'user.remove': { label: 'Hesabı kaldırdı', group: 'Yönetim' },
  'user.active': { label: 'Hesabı aktif yaptı', group: 'Yönetim' },
  'user.inactive': { label: 'Hesabı pasif yaptı', group: 'Yönetim' },
  'user.link': { label: 'Hesabı ekiple eşleştirdi', group: 'Yönetim' },
  'team.save': { label: 'Ekip bilgisini değiştirdi', group: 'Yönetim' },
  'team.remove': { label: 'Kişiyi ekipten çıkardı', group: 'Yönetim' },
  'sync.upload': { label: 'Customer Data yükledi', group: 'Yönetim' },
  'backup.run': { label: 'Yedek aldı', group: 'Yönetim' },
  'page.view': { label: 'Sayfa görüntüledi', group: 'Gezinti' },
};

// Sayfa adresinden okunur ad
export function pageLabel(path) {
  if (path === '/') return 'Ana Sayfa';
  if (path === '/dealers') return 'Bayiler';
  if (path.startsWith('/dealers/')) return 'Bayi sayfası';
  if (path === '/registrations/new') return 'Yeni kayıt formu';
  if (path === '/registrations') return 'Kayıtlar';
  if (path === '/requests') return 'Talepler';
  if (path === '/pano') return 'Pano';
  if (path === '/dashboard') return 'Dashboard';
  if (path === '/admin') return 'Yönetim';
  if (path === '/admin/users') return 'Ekip ve kullanıcılar';
  if (path === '/admin/sync') return 'Veri Yükle';
  if (path === '/admin/backup') return 'Yedek';
  if (path === '/admin/kvkk') return 'Aydınlatma metni';
  return path;
}

// Sayfa görüntüleme: aynı sayfa 1 dakika içinde tekrar açılırsa yazılmaz; günlük sayfasının kendisi yazılmaz
const lastView = new Map();
export function logPageView(path) {
  if (path === '/admin/activity' || path === '/login') return;
  const now = Date.now();
  if (now - (lastView.get(path) || 0) < 60 * 1000) return;
  lastView.set(path, now);
  const m = path.match(/^\/dealers\/([^/]+)$/);
  logActivity('page.view', { dealerId: m ? decodeURIComponent(m[1]) : null, detail: pageLabel(path) });
}

let actor = null;
// AuthContext profil yüklenince çağırır
export function setActivityActor(a) { actor = a; }

/**
 * Günlüğe bir satır yazar; beklemez, hata uygulamayı etkilemez.
 * info: { dealerId, dealerName, detail }
 */
export function logActivity(type, info = {}) {
  const u = auth.currentUser;
  if (!u) return;
  const row = {
    type,
    at: serverTimestamp(),
    byUid: u.uid,
    byName: (actor?.uid === u.uid && actor.name) || u.email,
    byRole: actor?.uid === u.uid ? actor.role || null : null,
    dealerId: info.dealerId || null,
    dealerName: info.dealerName || null,
    detail: info.detail ? String(info.detail).slice(0, 300) : null,
  };
  addDoc(collection(db, 'activity'), row).catch(() => { /* günlük yazılamazsa işlem yine geçerli */ });
}

const toDate = (v) => (v?.toDate ? v.toDate() : v instanceof Date ? v : null);
const PAGE = 300;

// En yeniden eskiye; since: Date (ör. son 7 gün), after: önceki sayfanın son belgesi
export async function loadActivity({ since, after } = {}) {
  const parts = [orderBy('at', 'desc')];
  if (since) parts.unshift(where('at', '>=', Timestamp.fromDate(since)));
  if (after) parts.push(startAfter(after));
  parts.push(limit(PAGE));
  const snap = await getDocs(query(collection(db, 'activity'), ...parts));
  return {
    rows: snap.docs.map((d) => ({ id: d.id, ...d.data(), date: toDate(d.data().at) })),
    last: snap.docs[snap.docs.length - 1] || null,
    more: snap.size === PAGE,
  };
}

// 30 günden eski satırları sil (sahip sayfayı açınca)
export async function purgeOldActivity() {
  const cutoff = Timestamp.fromDate(new Date(Date.now() - RETENTION_DAYS * 86400000));
  let removed = 0;
  for (let i = 0; i < 10; i++) {
    const snap = await getDocs(query(collection(db, 'activity'), where('at', '<', cutoff), limit(400)));
    if (snap.empty) break;
    const b = writeBatch(db);
    snap.docs.forEach((d) => b.delete(d.ref));
    await b.commit();
    removed += snap.size;
    if (snap.size < 400) break;
  }
  return removed;
}

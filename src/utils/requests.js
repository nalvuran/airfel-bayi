// src/utils/requests.js
// Bayi talepleri: requests/{id}. Katalog, eğitim, servis sorunu, diğer.
import { collection, doc, getDocs, serverTimestamp, updateDoc, writeBatch } from 'firebase/firestore';
import { addPhoto } from './registrations';
import { commitOrQueue } from './offline';

let cache = null; // { list, at }
const MEMORY_MS = 60 * 1000;
const toDate = (v) => (v?.toDate ? v.toDate() : v instanceof Date ? v : null);

export async function loadRequests(db, { force } = {}) {
  if (!force && cache && Date.now() - cache.at < MEMORY_MS) return cache.list;
  const snap = await getDocs(collection(db, 'requests'));
  const list = snap.docs.map((d) => {
    const x = d.data({ serverTimestamps: 'estimate' });
    return { id: d.id, ...x, date: toDate(x.createdAt), closedDate: toDate(x.closedAt) };
  }).sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0));
  cache = { list, at: Date.now() };
  return list;
}
export function invalidateRequests() { cache = null; }

// Taslak talebi Firestore'a uygun hale getirir ve (varsa) servis fotoğrafıyla birlikte işleme ekler
export function addRequestToBatch(batch, db, { draft, dealer, user, profile, registrationId = null }) {
  const ref = doc(collection(db, 'requests'));
  let photo = null;
  if (draft.type === 'service' && draft.photo) {
    photo = addPhoto(batch, db, ref.id, 'service', draft.photo, user.uid);
  }
  batch.set(ref, {
    dealerId: dealer.i,
    dealerName: dealer.n,
    type: draft.type,
    items: draft.type === 'catalog' ? draft.items : [],
    topic: draft.type === 'training' ? draft.topic : null,
    text: (draft.text || '').trim() || null,
    photo: photo ? { photoId: photo.photoId } : null,
    status: 'open',
    createdAt: serverTimestamp(),
    createdByUid: user.uid,
    createdByName: profile?.name || user.email,
    createdByRepKey: profile?.salesRepKey || null,
    registrationId,
    syncAt: serverTimestamp(),
  });
  return ref.id;
}

export function validateRequestDraft(d) {
  if (d.type === 'catalog' && !d.items?.length) return 'Katalog talebinde en az bir tür seç.';
  if (d.type === 'training' && !d.topic) return 'Eğitim konusunu seç.';
  if ((d.type === 'service' || d.type === 'other') && !(d.text || '').trim()) return 'Talebin açıklamasını yaz.';
  return null;
}

// Bayi sayfasından, ziyaret olmadan tek talep açma
export async function createRequest(db, { draft, dealer, user, profile }) {
  const batch = writeBatch(db);
  addRequestToBatch(batch, db, { draft, dealer, user, profile });
  const res = await commitOrQueue(batch.commit());
  invalidateRequests();
  return res;
}

export async function closeRequest(db, { request, status, note, user, profile }) {
  const res = await commitOrQueue(updateDoc(doc(db, 'requests', request.id), {
    status,
    closedAt: serverTimestamp(),
    closedByUid: user.uid,
    closedByName: profile?.name || user.email,
    closeNote: (note || '').trim() || null,
    syncAt: serverTimestamp(),
  }));
  invalidateRequests();
  return res;
}

export const requestAgeDays = (q) => (q.date ? Math.floor((Date.now() - q.date.getTime()) / 86400000) : 0);

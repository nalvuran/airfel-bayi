// src/utils/posts.js
// Pano: posts/{id} ve yorumlar posts/{id}/comments/{id}. Fotoğraf yok, bağlantılar tıklanabilir.
import {
  collection, doc, getDocs, increment, limit, orderBy, query,
  serverTimestamp, updateDoc, where, writeBatch,
} from 'firebase/firestore';
import { commitOrQueue } from './offline';
import { addPhoto } from './registrations';

export const POST_MAX = 2000;
const SEEN_KEY = 'airfel.panoSeen';
const toDate = (v) => (v?.toDate ? v.toDate() : v instanceof Date ? v : null);
const row = (d) => { const x = d.data({ serverTimestamps: 'estimate' }); return { id: d.id, ...x, date: toDate(x.createdAt) }; };

let cache = null;
const MEMORY_MS = 60 * 1000;

// Sabitlenenler en üstte, sonra en yeniler (son 50 yazı)
export async function loadPosts(db, { force } = {}) {
  if (!force && cache && Date.now() - cache.at < MEMORY_MS) return cache.list;
  const coll = collection(db, 'posts');
  const [recent, pinned] = await Promise.all([
    getDocs(query(coll, orderBy('createdAt', 'desc'), limit(50))),
    getDocs(query(coll, where('pinned', '==', true))),
  ]);
  const map = new Map();
  [...pinned.docs, ...recent.docs].forEach((d) => map.set(d.id, row(d)));
  const list = [...map.values()].sort((a, b) =>
    (b.pinned === true) - (a.pinned === true) || (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0));
  cache = { list, at: Date.now() };
  return list;
}
export function invalidatePosts() { cache = null; }

const author = (user, profile) => ({ byUid: user.uid, byName: profile?.name || user.email, byRepKey: profile?.salesRepKey || null });

// photo: isteğe bağlı, compressImage çıktısı. Fotoğraf ayrı dokümanda, yazıyla aynı işlemde yazılır.
export async function addPost(db, { text, photo, user, profile }) {
  const batch = writeBatch(db);
  const ref = doc(collection(db, 'posts'));
  const photoInfo = photo ? addPhoto(batch, db, ref.id, 'post', photo, user.uid) : null;
  batch.set(ref, {
    text, ...author(user, profile), createdAt: serverTimestamp(), pinned: false, commentCount: 0,
    photo: photoInfo ? { photoId: photoInfo.photoId } : null,
  });
  const res = await commitOrQueue(batch.commit());
  invalidatePosts(); return res;
}
export async function editPost(db, id, text) {
  const res = await commitOrQueue(updateDoc(doc(db, 'posts', id), { text, editedAt: serverTimestamp() }));
  invalidatePosts(); return res;
}
export async function setPinned(db, id, pinned) {
  const res = await commitOrQueue(updateDoc(doc(db, 'posts', id), { pinned, pinnedAt: pinned ? serverTimestamp() : null }));
  invalidatePosts(); return res;
}
export async function removePost(db, post) {
  // Önce yorumlar ve fotoğraf, sonra yazı
  const comments = await getDocs(collection(db, 'posts', post.id, 'comments'));
  const batch = writeBatch(db);
  comments.docs.forEach((c) => batch.delete(c.ref));
  if (post.photo?.photoId) batch.delete(doc(db, 'photos', post.photo.photoId));
  batch.delete(doc(db, 'posts', post.id));
  const res = await commitOrQueue(batch.commit());
  invalidatePosts(); return res;
}

export async function loadComments(db, postId) {
  const snap = await getDocs(collection(db, 'posts', postId, 'comments'));
  return snap.docs.map(row).sort((a, b) => (a.date?.getTime() ?? 0) - (b.date?.getTime() ?? 0));
}
export async function addComment(db, { postId, text, user, profile }) {
  const batch = writeBatch(db);
  batch.set(doc(collection(db, 'posts', postId, 'comments')), { text, ...author(user, profile), createdAt: serverTimestamp() });
  batch.update(doc(db, 'posts', postId), { commentCount: increment(1) });
  const res = await commitOrQueue(batch.commit());
  invalidatePosts(); return res;
}
export async function editComment(db, postId, id, text) {
  return commitOrQueue(updateDoc(doc(db, 'posts', postId, 'comments', id), { text, editedAt: serverTimestamp() }));
}
export async function removeComment(db, postId, id) {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'posts', postId, 'comments', id));
  batch.update(doc(db, 'posts', postId), { commentCount: increment(-1) });
  const res = await commitOrQueue(batch.commit());
  invalidatePosts(); return res;
}

// "Yeni" işareti: bu telefonda panoya en son ne zaman bakıldı
export function lastSeenPosts() { try { return Number(localStorage.getItem(SEEN_KEY)) || 0; } catch { return 0; } }
export function markPostsSeen() { try { localStorage.setItem(SEEN_KEY, String(Date.now())); } catch { /* yok say */ } }

// Metindeki bağlantıları tıklanabilir parçalara ayırır
export function linkify(text) {
  const parts = [];
  const re = /(https?:\/\/[^\s]+)/g;
  let last = 0; let m;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push({ t: text.slice(last, m.index) });
    parts.push({ url: m[0].replace(/[).,;!?]+$/, '') , t: m[0] });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ t: text.slice(last) });
  return parts;
}

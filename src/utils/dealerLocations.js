// src/utils/dealerLocations.js
// Ziyaret kaydı olmadan elle kaydedilen bayi konumları. Hepsi tek bir dokümanda (dealerLocations/all)
// tutulur; harita açılırken bayi sayısı kadar değil, tek bir okuma yapılır.
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { commitOrQueue } from './offline';
import { logActivity } from './activity';

let cache = null;
const MEMORY_MS = 60 * 1000;
const ref = (db) => doc(db, 'dealerLocations', 'all');

export async function loadDealerLocations(db, { force } = {}) {
  if (!force && cache && Date.now() - cache.at < MEMORY_MS) return cache.locs;
  const snap = await getDoc(ref(db)).catch(() => null);
  const locs = snap?.exists() ? snap.data().locs || {} : {};
  cache = { locs, at: Date.now() };
  return locs;
}

async function saveDealerLocation__(db, { dealerId, value, user, profile }) {
  const entry = {
    lat: value.location.lat, lng: value.location.lng,
    acc: value.locationAccuracy ?? null, src: value.locationSource || 'link',
    by: profile?.name || user.email, byUid: user.uid, at: Date.now(),
  };
  const res = await commitOrQueue(setDoc(ref(db), { locs: { [dealerId]: entry }, updatedAt: serverTimestamp() }, { merge: true }));
  if (cache) cache.locs = { ...cache.locs, [dealerId]: entry };
  return res;
}

// Bayinin en güncel konumu: elle kaydedilen ya da konumlu son ziyaret, hangisi yeniyse
export function effectiveLocation(manual, lastRegWithLoc) {
  const regAt = lastRegWithLoc?.date ? lastRegWithLoc.date.getTime() : 0;
  if (manual && manual.at >= regAt) return { lat: manual.lat, lng: manual.lng, source: 'manual', at: new Date(manual.at), by: manual.by };
  if (lastRegWithLoc) return { lat: lastRegWithLoc.location.lat, lng: lastRegWithLoc.location.lng, source: 'visit', at: lastRegWithLoc.date, by: lastRegWithLoc.salesRep };
  return null;
}

/* ---------- Hareket günlüğü: işlem başarılı olunca günlüğe yaz ---------- */
export async function saveDealerLocation(db, args) {
  const res = await saveDealerLocation__(db, args);
  logActivity('location.save', { dealerId: args.dealerId, detail: args.value?.locationSource === 'gps' ? 'GPS ile' : 'Google Maps bağlantısıyla' });
  return res;
}

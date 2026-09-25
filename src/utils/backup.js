// src/utils/backup.js
// Tüm verilerin (fotoğraflar hariç) tek bir JSON dosyası olarak yedeği.
import { useEffect, useState } from 'react';
import {
  Bytes, Timestamp, collection, collectionGroup, doc, getCountFromServer, getDoc, getDocs,
  limit, orderBy, query, serverTimestamp, setDoc, startAfter, where,
} from 'firebase/firestore';
import { getDealerIndex } from './dealerIndex';
import { db } from '../firebase';

export const BACKUP_DUE_DAYS = 30;
const toD = (v) => (v?.toDate ? v.toDate() : v instanceof Date ? v : null);

// Firestore değerlerini JSON'a uygun hale getirir (zaman damgaları ISO metin, ikili veriler atlanır)
function plain(v) {
  if (v instanceof Timestamp) return v.toDate().toISOString();
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString();
  if (v instanceof Bytes) return undefined; // fotoğraflar yedeğe dahil değil
  if (Array.isArray(v)) return v.map(plain);
  if (v && typeof v === 'object') {
    const o = {};
    for (const [k, val] of Object.entries(v)) { const p = plain(val); if (p !== undefined) o[k] = p; }
    return o;
  }
  return v;
}
const rows = (snap) => snap.docs.map((d) => ({ _path: d.ref.path, _id: d.id, ...plain(d.data()) }));

const STEPS = [
  ['dealers', 'Bayiler', () => getDocs(collection(db, 'dealers'))],
  ['registrations', 'Saha kayıtları', () => getDocs(collection(db, 'registrations'))],
  ['history', 'Değişiklik geçmişleri', () => getDocs(collectionGroup(db, 'history'))],
  ['notes', 'Bayi notları', () => getDocs(collectionGroup(db, 'notes'))],
  ['requests', 'Talepler', () => getDocs(collection(db, 'requests'))],
  ['followUps', 'Takipler', () => getDocs(collection(db, 'followUps'))],
  ['posts', 'Pano yazıları', () => getDocs(collection(db, 'posts'))],
  ['comments', 'Pano yorumları', () => getDocs(collectionGroup(db, 'comments'))],
  ['snapshots', 'Yükleme geçmişi (devreye alım)', () => getDocs(collection(db, 'snapshots'))],
  ['users', 'Kullanıcılar', () => getDocs(collection(db, 'users'))],
  ['repProfiles', 'Temsilci profilleri', () => getDocs(collection(db, 'repProfiles'))],
  ['syncLogs', 'Yükleme geçmişi', () => getDocs(collection(db, 'syncLogs'))],
];
export const BACKUP_STEPS = STEPS.map(([key, label]) => ({ key, label }));

function downloadBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
}

// Dosya ve klasör adlarında sorun çıkaran karakterleri temizler
const safe = (s) => String(s || '').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'isimsiz';
const SLOT_FILE = { exterior: 'dis-cephe', interior: 'dukkan-ici', exteriorAfter: 'dis-cephe-sonrasi', interiorAfter: 'dukkan-ici-sonrasi', service: 'servis-talebi', post: 'pano' };
const PAGE = 150;

async function collectPhotos({ mode, since, regs, requestsRows, onStep }) {
  const coll = collection(db, 'photos');
  const base = mode === 'new' && since ? [where('createdAt', '>', Timestamp.fromDate(since)), orderBy('createdAt')] : [orderBy('createdAt')];
  const total = (await getCountFromServer(query(coll, ...base))).data().count;
  onStep({ key: 'photos', label: 'Fotoğraflar', status: 'running', count: 0, total });

  const files = {};
  const byReg = new Map(regs.map((r) => [r._id, r]));
  // Servis talebi fotoğrafları talebe bağlı: klasörleme için talebi kayıt gibi kullan
  (requestsRows || []).forEach((q) => byReg.set(q._id, { dealerId: q.dealerId, dealerName: q.dealerName, createdAt: q.createdAt }));
  const index = await getDealerIndex(db).catch(() => ({ entries: [] }));
  const dealers = new Map(index.entries.map((e) => [e.i, e.n]));
  let last = null;
  let count = 0;
  let newest = since || null;
  for (;;) {
    const snap = await getDocs(query(coll, ...base, ...(last ? [startAfter(last)] : []), limit(PAGE)));
    if (snap.empty) break;
    snap.docs.forEach((d) => {
      const p = d.data();
      const created = toD(p.createdAt);
      if (created && (!newest || created > newest)) newest = created;
      const reg = byReg.get(p.registrationId);
      const regDate = reg?.createdAt ? new Date(reg.createdAt) : null;
      const when = regDate && !Number.isNaN(regDate.getTime()) ? regDate : created;
      const iso = when && !Number.isNaN(when.getTime()) ? when.toISOString() : null;
      const month = iso ? iso.slice(0, 7) : 'tarihsiz';
      const day = iso ? iso.slice(0, 10) : 'tarihsiz';
      const dealerName = dealers.get(reg?.dealerId) || reg?.dealerName || reg?.companyTitle || 'bayi-bilinmiyor';
      const folder = p.slot === 'post'
        ? `fotograflar/pano/${month}`
        : `fotograflar/${month}/${safe(dealerName)} (${safe(reg?.dealerId || '-')})`;
      // Aynı bayiye aynı gün birden fazla ziyaret ya da değiştirilmiş fotoğraf olabilir: adlar her zaman benzersiz
      const baseName = `${folder}/${day}_${SLOT_FILE[p.slot] || safe(p.slot)}`;
      let path = `${baseName}.jpg`;
      for (let n = 2; files[path]; n++) path = `${baseName}_${n}.jpg`;
      files[path] = [p.data.toUint8Array(), { level: 0 }]; // JPEG zaten sıkıştırılmış
      count++;
    });
    last = snap.docs[snap.docs.length - 1];
    onStep({ key: 'photos', label: 'Fotoğraflar', status: 'running', count, total });
    if (snap.size < PAGE) break;
  }
  onStep({ key: 'photos', label: 'Fotoğraflar', status: 'done', count, total });
  return { files, count, newest };
}

/**
 * photos: 'none' (sadece veriler, JSON) | 'all' (tüm fotoğraflar, ZIP) | 'new' (son fotoğraflı yedekten sonrakiler, ZIP)
 */
export async function runBackup({ user, onStep, photos = 'none', photosSince = null }) {
  const out = { app: 'airfel-bayi', version: 1, createdAt: new Date().toISOString(), createdBy: user.email, collections: {} };
  const counts = {};
  for (const [key, label, load] of STEPS) {
    onStep({ key, label, status: 'running' });
    const snap = await load();
    out.collections[key] = rows(snap);
    counts[key] = snap.size;
    onStep({ key, label, status: 'done', count: snap.size });
  }
  const json = JSON.stringify(out, null, 1);
  const date = out.createdAt.slice(0, 10);

  if (photos === 'none') {
    const blob = new Blob([json], { type: 'application/json' });
    downloadBlob(blob, `airfel-yedek-${date}.json`);
    await setDoc(doc(db, 'syncLogs', 'lastBackup'), { at: serverTimestamp(), by: user.email, counts, sizeBytes: blob.size });
    cachedLast = { at: new Date(), by: user.email };
    return { counts, sizeBytes: blob.size };
  }

  const { files, count, newest } = await collectPhotos({ mode: photos, since: photosSince, regs: out.collections.registrations, requestsRows: out.collections.requests, onStep });
  onStep({ key: 'zip', label: 'ZIP dosyası hazırlanıyor', status: 'running' });
  const { zipSync, strToU8 } = await import('fflate');
  files['veriler.json'] = strToU8(json);
  files['BENİOKU.txt'] = strToU8(
    `Airfel Bayi Takip yedeği\r\nTarih: ${out.createdAt}\r\nAlan: ${user.email}\r\n` +
    `Fotoğraf sayısı: ${count} (${photos === 'all' ? 'tüm fotoğraflar' : `${photosSince ? photosSince.toLocaleDateString('tr-TR') : ''} sonrasında eklenenler`})\r\n\r\n` +
    'veriler.json: bayiler, kayıtlar, değişiklik geçmişleri, notlar, talepler, takipler, pano, kullanıcılar\r\nfotograflar/: ay / bayi klasörlerine ayrılmış saha fotoğrafları\r\n',
  );
  const zipped = zipSync(files);
  const blob = new Blob([zipped], { type: 'application/zip' });
  onStep({ key: 'zip', label: 'ZIP dosyası hazırlanıyor', status: 'done' });
  downloadBlob(blob, `airfel-yedek-fotografli-${date}.zip`);

  counts.photos = count;
  await setDoc(doc(db, 'syncLogs', 'lastBackup'), { at: serverTimestamp(), by: user.email, counts, sizeBytes: blob.size, withPhotos: true });
  await setDoc(doc(db, 'syncLogs', 'lastPhotoBackup'), {
    at: serverTimestamp(), by: user.email, photos: count, mode: photos, until: newest ? Timestamp.fromDate(newest) : null,
  });
  cachedLast = { at: new Date(), by: user.email };
  cachedPhoto = undefined;
  return { counts, sizeBytes: blob.size, photos: count };
}

let cachedPhoto;
// Son fotoğraflı yedek: tarihi ve kapsadığı en yeni fotoğrafın zamanı
export function useLastPhotoBackup(refresh = 0) {
  const [last, setLast] = useState(cachedPhoto);
  useEffect(() => {
    if (cachedPhoto !== undefined && !refresh) return;
    getDoc(doc(db, 'syncLogs', 'lastPhotoBackup'))
      .then((s) => {
        cachedPhoto = s.exists() ? { at: toD(s.data().at), until: toD(s.data().until), photos: s.data().photos } : null;
        setLast(cachedPhoto);
      })
      .catch(() => { cachedPhoto = null; setLast(null); });
  }, [refresh]);
  return last;
}

let cachedLast;
export function useLastBackup(enabled = true, refresh = 0) {
  const [last, setLast] = useState(cachedLast);
  useEffect(() => {
    if (!enabled || (cachedLast !== undefined && !refresh)) return;
    getDoc(doc(db, 'syncLogs', 'lastBackup'))
      .then((s) => { cachedLast = s.exists() ? { at: toD(s.data().at), by: s.data().by } : null; setLast(cachedLast); })
      .catch(() => {});
  }, [enabled, refresh]);
  const days = last?.at ? Math.floor((Date.now() - last.at.getTime()) / 86400000) : null;
  return { loaded: last !== undefined, at: last?.at || null, by: last?.by || null, days, due: last !== undefined && (days === null || days >= BACKUP_DUE_DAYS) };
}

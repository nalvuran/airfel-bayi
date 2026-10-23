// src/utils/dealerIndex.js
// Bayi listesi için özet dizin. 3.663 bayiyi tek tek okumak yerine
// birkaç büyük dokümandan (dealerIndex/chunk-N) tek seferde yüklenir.
import { collection, doc, getDocs, writeBatch } from 'firebase/firestore';

const COLL = 'dealerIndex';
// Satış rakamları gizlenen kullanıcılar (users/{uid}.hideSales) bu kopyayı okur: içinde devreye alım rakamları yok.
// Güvenlik kuralları bu kullanıcıların dealerIndex, dealers ve snapshots okumasını engeller.
const LITE = 'dealerIndexLite';
let salesHidden = false;
export function setSalesHidden(v) {
  if (salesHidden !== !!v) { salesHidden = !!v; cache = null; }
}
export const isSalesHidden = () => salesHidden;
const toLite = ({ q, v, f, ...e }) => e; // eslint-disable-line no-unused-vars
const CHUNK_CHARS = 700_000; // Firestore doküman sınırı 1 MB; pay bırakıyoruz

// Bayinin Customer Data'dan gelen bilgilerinin parmak izi: yüklemede sadece değişen bayileri yazmak için
const HASH_FIELDS = ['platformId', 'sapNo', 'name', 'status', 'department', 'rsgSegment', 'sbuSegment', 'servicesStatus',
  'currentClass', 'createdDate', 'firstLoginDate', 'sales', 'distributor', 'region', 'city', 'district', 'salesRep',
  'salesRepKey', 'regionManager'];
function norm(v) {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v.toDate === 'function') return v.toDate().toISOString().slice(0, 10);
  if (Array.isArray(v)) return v.map(norm);
  if (typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, norm(v[k])]));
  return v;
}
export function dealerHash(d) {
  const str = JSON.stringify(HASH_FIELDS.map((k) => norm(d[k])));
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
}

// Firestore'daki tam bayi verisinden kısa özet üretir
export function toIndexEntry(id, d) {
  return {
    i: id,
    n: d.name ?? '',
    c: d.city ?? '',
    d: d.district ?? '',
    s: d.status ?? '',
    g: d.sbuSegment ?? '',
    f: d.sales?.fy26?.segment ?? '',
    q: d.sales?.fy26?.total ?? 0,
    r: d.salesRep ?? '',
    k: d.salesRepKey ?? '',
    x: d.distributor ?? '',
    // Devreye alım: [kombi24, klima24, kombi25, klima25, kombi26, klima26] (CB = kombi, AC = klima)
    v: ['fy24', 'fy25', 'fy26'].flatMap((y) => [d.sales?.[y]?.cb ?? 0, d.sales?.[y]?.ac ?? 0]),
    m: d.regionManager ?? '',
    // Bayi sayfasındaki bilgiler (satış rakamı görmeyenler bayinin tam kaydını okuyamaz, buradan gösterilir)
    p: d.platformId ?? '',
    e: d.region ?? '',
    sb: d.sapNo ?? '',
    cc: d.currentClass ?? '',
    ss: d.servicesStatus ?? '',
    cd: norm(d.createdDate) ?? '',
    h: dealerHash(d),
  };
}

function toChunks(entries) {
  const chunks = [];
  let cur = [];
  let size = 2;
  for (const e of entries) {
    const len = JSON.stringify(e).length + 1;
    if (size + len > CHUNK_CHARS && cur.length) { chunks.push(cur); cur = []; size = 2; }
    cur.push(e); size += len;
  }
  if (cur.length) chunks.push(cur);
  return chunks;
}

async function writeChunks(db, coll, entries) {
  const chunks = toChunks(entries);
  const existing = await getDocs(collection(db, coll));
  const batch = writeBatch(db);
  const updatedAt = new Date();
  chunks.forEach((c, part) => {
    batch.set(doc(db, coll, `chunk-${part}`), {
      part, parts: chunks.length, count: entries.length, updatedAt, json: JSON.stringify(c),
    });
  });
  // eski, artık kullanılmayan parçaları sil
  existing.docs.forEach((d) => { if ((d.data().part ?? 0) >= chunks.length) batch.delete(d.ref); });
  await batch.commit();
  return chunks.length;
}

export async function writeDealerIndex(db, entries) {
  const parts = await writeChunks(db, COLL, entries);
  await writeChunks(db, LITE, entries.map(toLite));
  return { parts, count: entries.length };
}

// Dizini (ve satışsız kopyasını) bayi kayıtlarından yeniden kurar.
// Güncel listeden çıkmış bayilerin "gizli" işareti eski dizinden korunur.
export async function rebuildDealerIndexFromFirestore(db) {
  const old = await getDocs(collection(db, COLL)).catch(() => null);
  const gone = new Set();
  old?.docs.forEach((d) => { try { JSON.parse(d.data().json).forEach((e) => { if (e.gone) gone.add(e.i); }); } catch { /* bozuk parça */ } });
  const snap = await getDocs(collection(db, 'dealers'));
  const entries = snap.docs.map((d) => ({ ...toIndexEntry(d.id, d.data()), ...(gone.has(d.id) ? { gone: 1 } : {}) }));
  return writeDealerIndex(db, entries);
}

// Türkçe karakterleri sadeleştirir: aramada "yildiz" -> "YILDIZ" / "YILDIZ" eşleşsin
export function fold(s) {
  return String(s ?? '')
    .toLocaleUpperCase('tr-TR')
    .replace(/İ/g, 'I').replace(/Ş/g, 'S').replace(/Ğ/g, 'G')
    .replace(/Ü/g, 'U').replace(/Ö/g, 'O').replace(/Ç/g, 'C')
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

// Oturum boyunca bellekte tutulur: sayfalar arasında gidip gelince tekrar okunmaz
let cache = null;
let pending = null;
export function getDealerIndex(db) {
  if (cache) return Promise.resolve(cache);
  if (!pending) {
    pending = loadDealerIndex(db)
      .then((res) => { cache = res; return res; })
      .finally(() => { pending = null; });
  }
  return pending;
}
export function getCachedDealerIndex() { return cache; }
export function clearDealerIndexCache() { cache = null; }

export async function loadDealerIndex(db) {
  const snap = await getDocs(collection(db, salesHidden ? LITE : COLL));
  if (snap.empty) return { entries: [], updatedAt: null };
  const docs = snap.docs.map((d) => d.data()).sort((a, b) => a.part - b.part);
  if (docs.length !== docs[0].parts) throw new Error('Bayi dizini eksik görünüyor. Veri Yükle sayfasından dizini yeniden oluştur.');
  const all = docs.flatMap((d) => JSON.parse(d.json)).map((e) => ({
    v: null, // eski dizinde ve satışsız kopyada devreye alım rakamları yok
    q: 0,
    ...e,
    search: fold(`${e.n} ${e.i} ${e.d} ${e.c}`),
  }));
  // entries: güncel Customer Data'daki bayiler. all: listeden çıkanlar dahil (geçmiş kayıtların adları için)
  return { entries: all.filter((e) => !e.gone), all, updatedAt: docs[0].updatedAt?.toDate?.() ?? null };
}

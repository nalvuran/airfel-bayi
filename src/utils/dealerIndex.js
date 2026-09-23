// src/utils/dealerIndex.js
// Bayi listesi için özet dizin. 3.663 bayiyi tek tek okumak yerine
// birkaç büyük dokümandan (dealerIndex/chunk-N) tek seferde yüklenir.
import { collection, doc, getDocs, writeBatch } from 'firebase/firestore';

const COLL = 'dealerIndex';
const CHUNK_CHARS = 700_000; // Firestore doküman sınırı 1 MB; pay bırakıyoruz

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
  };
}

export async function writeDealerIndex(db, entries) {
  const chunks = [];
  let cur = [];
  let size = 2;
  for (const e of entries) {
    const len = JSON.stringify(e).length + 1;
    if (size + len > CHUNK_CHARS && cur.length) { chunks.push(cur); cur = []; size = 2; }
    cur.push(e); size += len;
  }
  if (cur.length) chunks.push(cur);

  const existing = await getDocs(collection(db, COLL));
  const batch = writeBatch(db);
  const updatedAt = new Date();
  chunks.forEach((c, part) => {
    batch.set(doc(db, COLL, `chunk-${part}`), {
      part, parts: chunks.length, count: entries.length, updatedAt, json: JSON.stringify(c),
    });
  });
  // eski, artık kullanılmayan parçaları sil
  existing.docs.forEach((d) => { if ((d.data().part ?? 0) >= chunks.length) batch.delete(d.ref); });
  await batch.commit();
  return { parts: chunks.length, count: entries.length };
}

export async function rebuildDealerIndexFromFirestore(db) {
  const snap = await getDocs(collection(db, 'dealers'));
  const entries = snap.docs.map((d) => toIndexEntry(d.id, d.data()));
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

export async function loadDealerIndex(db) {
  const snap = await getDocs(collection(db, COLL));
  if (snap.empty) return { entries: [], updatedAt: null };
  const docs = snap.docs.map((d) => d.data()).sort((a, b) => a.part - b.part);
  if (docs.length !== docs[0].parts) throw new Error('Bayi dizini eksik görünüyor. Veri Yükle sayfasından dizini yeniden oluştur.');
  const entries = docs.flatMap((d) => JSON.parse(d.json)).map((e) => ({
    ...e,
    search: fold(`${e.n} ${e.i} ${e.d} ${e.c}`),
  }));
  return { entries, updatedAt: docs[0].updatedAt?.toDate?.() ?? null };
}
// src/utils/registrationStore.js
// Tüm saha kayıtlarını telefonda saklar; sonraki açılışlarda sadece eklenen/değişen kayıtları çeker.
// Kayıtlar Dashboard ve Kayıtlar sayfası tarafından ortak kullanılır. Böylece okuma kotası
// kayıt sayısı arttıkça büyümez ve bağlantı yokken de son indirilen kayıtlar görülebilir.
import { Timestamp, collection, getDocs, getDocsFromCache, query, where } from 'firebase/firestore';

const META_KEY = 'airfel.regSync.v1';
const FULL_REFRESH_MS = 24 * 60 * 60 * 1000; // günde bir tam yenileme (silinen kayıtları yakalamak için)
const MEMORY_MS = 60 * 1000;                 // aynı dakika içindeki tekrar açılışlar hiç okuma yapmaz
const OVERLAP_MS = 5 * 60 * 1000;            // saat farklarına karşı güvenlik payı

let memory = null; // { list, at, offline }
let pending = null;

const toDate = (v) => (v?.toDate ? v.toDate() : v instanceof Date ? v : null);
const ms = (v) => v?.toMillis?.() ?? (v instanceof Date ? v.getTime() : 0);

function readMeta() {
  try { return JSON.parse(localStorage.getItem(META_KEY)) || null; } catch { return null; }
}
function writeMeta(m) {
  try { localStorage.setItem(META_KEY, JSON.stringify(m)); } catch { /* gizli sekme vb. */ }
}
function toRow(d) {
  const data = d.data();
  return { id: d.id, ...data, date: toDate(data.createdAt) };
}
function finish(map, offline) {
  const list = [...map.values()].sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0));
  memory = { list, at: Date.now(), offline };
  return memory;
}

async function fullLoad(db) {
  const snap = await getDocs(collection(db, 'registrations'));
  const map = new Map(snap.docs.map((d) => [d.id, toRow(d)]));
  const lastSync = Math.max(0, ...[...map.values()].map((r) => ms(r.syncAt)));
  writeMeta({ lastSync, lastFull: Date.now() });
  return finish(map, false);
}

async function sync(db) {
  const meta = readMeta();
  if (!meta || Date.now() - meta.lastFull > FULL_REFRESH_MS) return fullLoad(db);

  let cached;
  try {
    cached = await getDocsFromCache(collection(db, 'registrations'));
  } catch {
    return fullLoad(db); // telefonun hafızası temizlenmiş
  }
  if (cached.empty) return fullLoad(db);
  const map = new Map(cached.docs.map((d) => [d.id, toRow(d)]));

  try {
    const since = Timestamp.fromMillis(Math.max(0, meta.lastSync - OVERLAP_MS));
    const delta = await getDocs(query(collection(db, 'registrations'), where('syncAt', '>', since)));
    delta.docs.forEach((d) => map.set(d.id, toRow(d)));
    const lastSync = Math.max(meta.lastSync, ...delta.docs.map((d) => ms(d.data().syncAt)));
    writeMeta({ ...meta, lastSync });
    return finish(map, false);
  } catch {
    return finish(map, true); // bağlantı yok: telefondaki son kayıtlarla devam
  }
}

export function getRegistrations(db, { force } = {}) {
  if (!force && memory && Date.now() - memory.at < MEMORY_MS) return Promise.resolve(memory);
  if (!pending) pending = (force ? fullLoad(db) : sync(db)).finally(() => { pending = null; });
  return pending;
}

// Bir kayıt eklenince/değişince çağrılır; bir sonraki açılışta değişiklik çekilir
export function invalidateRegistrations() { memory = null; }

// Kurulum bekleyen: tabela/stant talep edilmiş, sonrası fotoğrafı yok
export const waitingInstall = (r) =>
  (r.signRequest === true || r.standRequest === true) &&
  !r.photoFiles?.exteriorAfter && !r.photoFiles?.interiorAfter && !r.photos?.exteriorAfter && !r.photos?.interiorAfter;

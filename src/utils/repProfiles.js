// src/utils/repProfiles.js
// Temsilci profilleri (isim ve fotoğraf). Hesaptan bağımsız, Customer Data'daki temsilci adına bağlı:
// repProfiles/{salesRepKey}. Tüm aktif kullanıcılar okuyabilir, sadece yönetici yazar.
import { useEffect, useState } from 'react';
import { Bytes, collection, deleteField, doc, getDocs, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { logActivity } from './activity';

let cache = null;     // { [salesRepKey]: { name, url } }
let pending = null;
const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn(cache));

export function loadRepProfiles(db, { force } = {}) {
  if (cache && !force) return Promise.resolve(cache);
  if (!pending || force) {
    pending = getDocs(collection(db, 'repProfiles')).then((snap) => {
      if (cache) Object.values(cache).forEach((p) => p.url && URL.revokeObjectURL(p.url));
      const next = {};
      snap.docs.forEach((d) => {
        const p = d.data();
        next[d.id] = {
          key: d.id,
          name: p.name || d.id,
          url: p.photo ? URL.createObjectURL(new Blob([p.photo.toUint8Array()], { type: 'image/jpeg' })) : null,
          // Ekip ağacı
          inTeam: p.inTeam === true,
          role: p.role || null,
          managerKey: p.managerKey || null,
        };
      });
      cache = next;
      notify();
      return cache;
    }).finally(() => { pending = null; });
  }
  return pending;
}

// Bileşenlerde kullanım: const profiles = useRepProfiles(db); profiles[key]?.url
export function useRepProfiles(db) {
  const [state, setState] = useState(cache || {});
  useEffect(() => {
    listeners.add(setState);
    loadRepProfiles(db).then(setState).catch(() => {});
    return () => { listeners.delete(setState); };
  }, [db]);
  return state;
}

export async function saveRepPhoto(db, { key, name, photo, by }) {
  await setDoc(doc(db, 'repProfiles', key), {
    salesRepKey: key,
    name,
    photo: Bytes.fromUint8Array(photo.bytes),
    photoSize: photo.size,
    updatedAt: serverTimestamp(),
    updatedBy: by,
  }, { merge: true });
  await loadRepProfiles(db, { force: true });
}

export async function removeRepPhoto(db, { key, by }) {
  await updateDoc(doc(db, 'repProfiles', key), {
    photo: deleteField(), photoSize: deleteField(), updatedAt: serverTimestamp(), updatedBy: by,
  });
  await loadRepProfiles(db, { force: true });
}

// "MUSTAFA KEMAL NALVURAN" -> "Mustafa Kemal Nalvuran"
export const titleCase = (s) => (s || '').toLocaleLowerCase('tr-TR').replace(/(^|\s)\S/g, (c) => c.toLocaleUpperCase('tr-TR'));

/* ---------- Ekip ağacı (sadece sahip değiştirir) ---------- */

async function savePerson__(db, { key, name, role, managerKey, by }) {
  await setDoc(doc(db, 'repProfiles', key), {
    salesRepKey: key, name, role, managerKey: managerKey || null, inTeam: true, updatedAt: serverTimestamp(), updatedBy: by,
  }, { merge: true });
  await loadRepProfiles(db, { force: true });
}

async function removePerson__(db, { key, by }) {
  await setDoc(doc(db, 'repProfiles', key), { inTeam: false, updatedAt: serverTimestamp(), updatedBy: by }, { merge: true });
  await loadRepProfiles(db, { force: true });
}

/* ---------- Hareket günlüğü: işlem başarılı olunca günlüğe yaz ---------- */
export async function savePerson(db, args) {
  const res = await savePerson__(db, args);
  logActivity('team.save', { detail: `${args.name}${args.role ? ` · ${{ rep: 'Temsilci', regionManager: 'Bölge Müdürü', deptManager: 'Departman Müdürü' }[args.role] || args.role}` : ''}` });
  return res;
}
export async function removePerson(db, args) {
  const res = await removePerson__(db, args);
  logActivity('team.remove', { detail: args.key });
  return res;
}

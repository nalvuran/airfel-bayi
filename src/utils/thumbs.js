// src/utils/thumbs.js
// Kayıt kartlarındaki küçük fotoğraflar: thumbs/{kayıtId} = { exterior, interior } (her biri ~10-20 KB)
import { useEffect, useRef, useState } from 'react';
import { Bytes, collection, doc, getDoc, getDocs, serverTimestamp, writeBatch } from 'firebase/firestore';
import { makeThumb } from './image';

const cache = new Map(); // regId -> { exterior: url, interior: url } | 'none'

// Kart ekrana yaklaşınca önizlemeleri yükler
export function useThumbs(db, regId, enabled) {
  const ref = useRef(null);
  const [thumbs, setThumbs] = useState(() => cache.get(regId) || null);

  useEffect(() => {
    if (!enabled || cache.has(regId) || !ref.current) return undefined;
    let cancelled = false;
    const el = ref.current;
    const load = () => {
      getDoc(doc(db, 'thumbs', regId)).then((snap) => {
        let value = 'none';
        if (snap.exists()) {
          const d = snap.data();
          value = {};
          ['exterior', 'interior'].forEach((s) => {
            if (d[s]) value[s] = URL.createObjectURL(new Blob([d[s].toUint8Array()], { type: 'image/jpeg' }));
          });
        }
        cache.set(regId, value);
        if (!cancelled) setThumbs(value);
      }).catch(() => { if (!cancelled) setThumbs('none'); });
    };
    if (!('IntersectionObserver' in window)) { load(); return () => { cancelled = true; }; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { io.disconnect(); load(); }
    }, { rootMargin: '300px 0px' });
    io.observe(el);
    return () => { cancelled = true; io.disconnect(); };
  }, [db, regId, enabled]);

  return [ref, thumbs];
}

export function clearThumbCache(regId) { cache.delete(regId); }

// Yönetici aracı: önizlemesi olmayan kayıtlar için oluşturur. Kesilirse tekrar çalıştırmak güvenli.
export async function buildMissingThumbs(db, { uid, onProgress }) {
  const snap = await getDocs(collection(db, 'registrations'));
  const todo = snap.docs.filter((d) => {
    const r = d.data();
    return !r.thumbs && (r.photoFiles?.exterior || r.photoFiles?.interior);
  });
  let done = 0, failed = 0;
  const errors = [];
  onProgress({ total: todo.length, done, failed });

  const work = async (d) => {
    const r = d.data();
    try {
      const data = { uploadedBy: uid, createdAt: serverTimestamp() };
      for (const slot of ['exterior', 'interior']) {
        const photoId = r.photoFiles?.[slot]?.photoId;
        if (!photoId) continue;
        const p = await getDoc(doc(db, 'photos', photoId));
        if (!p.exists()) continue;
        data[slot] = Bytes.fromUint8Array(await makeThumb(p.data().data.toUint8Array()));
      }
      const batch = writeBatch(db);
      batch.set(doc(db, 'thumbs', d.id), data);
      batch.update(doc(db, 'registrations', d.id), { thumbs: true, syncAt: serverTimestamp() });
      await batch.commit();
      done++;
    } catch (e) {
      failed++;
      errors.push(`${d.id}: ${e.message}`);
    }
    onProgress({ total: todo.length, done, failed });
  };

  // Aynı anda 4 kayıt işlenir
  const queue = [...todo];
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (queue.length) await work(queue.shift());
  }));
  return { total: todo.length, done, failed, errors, alreadyDone: snap.size - todo.length };
}

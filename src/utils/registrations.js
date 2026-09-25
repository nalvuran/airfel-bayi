// src/utils/registrations.js
// Saha kaydı ve fotoğraflarını tek seferde (atomik) yazar: ya hepsi kaydedilir ya hiçbiri.
import { Bytes, collection, doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { makeThumb } from './image';
import { commitOrQueue } from './offline';
import { addRequestToBatch, invalidateRequests } from './requests';
import { addFollowUpToBatch, invalidateFollowUps } from './followUps';

export function addPhoto(batch, db, regId, slot, photo, uid) {
  const photoId = `${regId}_${slot}_${Date.now().toString(36)}`;
  batch.set(doc(db, 'photos', photoId), {
    data: Bytes.fromUint8Array(photo.bytes),
    contentType: 'image/jpeg',
    size: photo.size,
    width: photo.width,
    height: photo.height,
    registrationId: regId,
    slot,
    source: 'app',
    uploadedBy: uid,
    createdAt: serverTimestamp(),
  });
  return { photoId, contentType: 'image/jpeg', size: photo.size, uploadedAt: new Date() };
}

/**
 * Ziyaret kaydı; aynı işlemde (varsa) talepler ve takip tarihi de yazılır.
 * dealer: dizindeki bayi satırı ({ i, n, ... }), requests: talep taslakları,
 * followUpDate: 'YYYY-MM-DD' ya da null, hadOpenFollowUp: bayinin açık takibi var mıydı
 */
export async function createRegistration(db, { fields, photos, profile, user, dealer, requests = [], followUpDate = null, hadOpenFollowUp = false }) {
  const ref = doc(collection(db, 'registrations'));
  const batch = writeBatch(db);
  const photoFiles = {};
  Object.entries(photos).forEach(([slot, p]) => {
    if (p) photoFiles[slot] = addPhoto(batch, db, ref.id, slot, p, user.uid);
  });
  // Kart önizlemeleri (kayıtla aynı anda yazılır)
  const thumbData = { uploadedBy: user.uid, createdAt: serverTimestamp() };
  let hasThumbs = false;
  for (const slot of ['exterior', 'interior']) {
    if (!photos[slot]) continue;
    try {
      thumbData[slot] = Bytes.fromUint8Array(await makeThumb(photos[slot].blob));
      hasThumbs = true;
    } catch { /* önizleme oluşmazsa kayıt yine de kaydedilir */ }
  }
  if (hasThumbs) batch.set(doc(db, 'thumbs', ref.id), thumbData);

  batch.set(ref, {
    ...fields,
    thumbs: hasThumbs,
    syncAt: serverTimestamp(),
    photos: {},
    photoFiles,
    photoStorage: 'firestore',
    salesRep: profile?.name || user.email,
    salesRepKey: profile?.salesRepKey || null,
    createdByUid: user.uid,
    createdByEmail: user.email,
    createdAt: serverTimestamp(),
    source: 'app',
    needsReview: false,
    reviewReasons: [],
  });
  if (dealer) {
    requests.forEach((draft) => addRequestToBatch(batch, db, { draft, dealer, user, profile, registrationId: ref.id }));
    addFollowUpToBatch(batch, db, { dealer, date: followUpDate, user, profile, hadOpen: hadOpenFollowUp });
  }
  const { queued } = await commitOrQueue(batch.commit());
  if (requests.length) invalidateRequests();
  invalidateFollowUps();
  return { id: ref.id, queued };
}

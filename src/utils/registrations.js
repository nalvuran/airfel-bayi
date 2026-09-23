// src/utils/registrations.js
// Saha kaydı ve fotoğraflarını tek seferde (atomik) yazar: ya hepsi kaydedilir ya hiçbiri.
import { Bytes, collection, doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { makeThumb } from './image';

function addPhoto(batch, db, regId, slot, photo, uid) {
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

export async function createRegistration(db, { fields, photos, profile, user }) {
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
  await batch.commit();
  return ref.id;
}

export async function addAfterPhotos(db, { regId, photos, user }) {
  const batch = writeBatch(db);
  const update = { afterPhotosAt: serverTimestamp() };
  Object.entries(photos).forEach(([slot, p]) => {
    if (p) update[`photoFiles.${slot}`] = addPhoto(batch, db, regId, slot, p, user.uid);
  });
  batch.update(doc(db, 'registrations', regId), update);
  await batch.commit();
}

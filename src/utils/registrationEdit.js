// src/utils/registrationEdit.js
// Kayıt düzenleme, taşıma, silme. Her değişiklik registrations/{id}/history altına iz olarak yazılır;
// güvenlik kuralları iz kaydı olmadan güncellemeye izin vermez.
import { Bytes, collection, deleteField, doc, getDocs, increment, serverTimestamp, writeBatch } from 'firebase/firestore';
import { addPhoto } from './registrations';
import { makeThumb } from './image';

export const FIELD_LABELS = {
  contactName: 'Görüşülen kişi',
  phone: 'Telefon',
  email: 'E-posta',
  signRequest: 'Tabela talebi',
  standRequest: 'Stant talebi',
  location: 'Konum',
  dealerId: 'Bayi',
  needsReview: 'Kontrol gerekli',
};
export const PHOTO_LABELS = {
  exterior: 'Dış cephe', interior: 'Dükkan içi',
  exteriorAfter: 'Dış cephe (sonrası)', interiorAfter: 'Dükkan içi (sonrası)',
};

const hasInstallPhoto = (r) => !!(r.photoFiles?.exteriorAfter || r.photoFiles?.interiorAfter || r.photos?.exteriorAfter || r.photos?.interiorAfter);
const actor = (user, profile) => ({ byUid: user.uid, byName: profile?.name || user.email, byEmail: user.email });

function startEdit(db, r, user, profile) {
  const batch = writeBatch(db);
  const hRef = doc(collection(db, 'registrations', r.id, 'history'));
  const meta = {
    editedAt: serverTimestamp(),
    editedByUid: user.uid,
    editedByName: profile?.name || user.email,
    editCount: increment(1),
    lastHistoryId: hRef.id,
  };
  return { batch, hRef, meta };
}

/**
 * changes: { contactName?, phone?, email?, signRequest?, standRequest?, location?: {location, locationSource, locationAccuracy, mapsUrl} }
 * photos:  { exterior?, interior?, exteriorAfter?, interiorAfter? }  (compressImage çıktısı)
 */
export async function saveRegistrationEdit(db, { r, changes = {}, photos = {}, user, profile }) {
  const { batch, hRef, meta } = startEdit(db, r, user, profile);
  const update = { ...meta };
  const hist = [];
  const photoHist = [];

  for (const [field, value] of Object.entries(changes)) {
    if (field === 'location') {
      update.location = value.location ?? null;
      update.locationSource = value.locationSource ?? null;
      update.locationAccuracy = value.locationAccuracy ?? null;
      update.mapsUrl = value.mapsUrl ?? null;
      hist.push({ field, label: FIELD_LABELS.location, from: r.mapsUrl || null, to: value.mapsUrl || null });
    } else {
      update[field] = value;
      hist.push({ field, label: FIELD_LABELS[field] || field, from: r[field] ?? null, to: value ?? null });
    }
  }

  const thumbUpdate = {};
  for (const [slot, p] of Object.entries(photos)) {
    if (!p) continue;
    const info = addPhoto(batch, db, r.id, slot, p, user.uid);
    update[`photoFiles.${slot}`] = info;
    photoHist.push({ slot, label: PHOTO_LABELS[slot], oldPhotoId: r.photoFiles?.[slot]?.photoId || null, newPhotoId: info.photoId });
    if (slot === 'exterior' || slot === 'interior') {
      try { thumbUpdate[slot] = Bytes.fromUint8Array(await makeThumb(p.blob)); } catch { /* önizleme olmadan da kaydedilir */ }
    }
    if ((slot === 'exteriorAfter' || slot === 'interiorAfter') && !r.afterPhotosAt) update.afterPhotosAt = serverTimestamp();
  }
  if (Object.keys(thumbUpdate).length) {
    batch.set(doc(db, 'thumbs', r.id), { ...thumbUpdate, uploadedBy: user.uid, updatedAt: serverTimestamp() }, { merge: true });
    update.thumbs = true;
  }

  if (!hist.length && !photoHist.length) return null;

  // Kurulum yapıldıktan sonra tabela/stant talebinin değişmesi dikkat gerektirir
  const attention = hasInstallPhoto(r) && hist.some((h) => h.field === 'signRequest' || h.field === 'standRequest');
  if (attention) { update.attention = true; update.attentionAt = serverTimestamp(); }

  batch.set(hRef, { action: 'edit', at: serverTimestamp(), ...actor(user, profile), changes: hist, photos: photoHist, attention });
  batch.update(doc(db, 'registrations', r.id), update);
  await batch.commit();
  return hRef.id;
}

// Sahip: kaydı başka bayiye taşır (firma ünvanı ve distribütör yeni bayiden gelir)
export async function moveRegistration(db, { r, dealer, user, profile }) {
  const { batch, hRef, meta } = startEdit(db, r, user, profile);
  const fromName = r.dealerName || r.companyTitle || r.dealerId;
  batch.set(hRef, {
    action: 'move', at: serverTimestamp(), ...actor(user, profile), photos: [], attention: false,
    changes: [{ field: 'dealerId', label: FIELD_LABELS.dealerId, from: `${fromName} (${r.dealerId || '-'})`, to: `${dealer.n} (${dealer.i})` }],
  });
  batch.update(doc(db, 'registrations', r.id), {
    ...meta,
    dealerId: dealer.i,
    platformId: dealer.i.startsWith('NOID-') ? null : dealer.i,
    dealerName: dealer.n,
    companyTitle: dealer.n,
    distributor: dealer.x || null,
  });
  await batch.commit();
}

// Sahip: "kontrol gerekli" işaretini ve dikkat işaretini kaldırır
export async function clearFlags(db, { r, user, profile, which }) {
  const { batch, hRef, meta } = startEdit(db, r, user, profile);
  const update = { ...meta };
  const changes = [];
  if (which === 'review') {
    update.needsReview = false; update.reviewReasons = [];
    changes.push({ field: 'needsReview', label: 'Kontrol gerekli', from: true, to: false });
  } else {
    update.attention = false; update.attentionAt = deleteField();
    changes.push({ field: 'attention', label: 'Dikkat işareti', from: true, to: false });
  }
  batch.set(hRef, { action: 'clear', at: serverTimestamp(), ...actor(user, profile), changes, photos: [], attention: false });
  batch.update(doc(db, 'registrations', r.id), update);
  await batch.commit();
}

// Sahip: kaydı, fotoğraflarını, önizlemesini ve geçmişini tamamen siler
export async function deleteRegistration(db, { r }) {
  const hist = await getDocs(collection(db, 'registrations', r.id, 'history'));
  const photoIds = new Set(Object.values(r.photoFiles || {}).map((p) => p?.photoId).filter(Boolean));
  hist.docs.forEach((h) => (h.data().photos || []).forEach((p) => { if (p.oldPhotoId) photoIds.add(p.oldPhotoId); }));
  const batch = writeBatch(db);
  photoIds.forEach((id) => batch.delete(doc(db, 'photos', id)));
  hist.docs.forEach((h) => batch.delete(h.ref));
  batch.delete(doc(db, 'thumbs', r.id));
  batch.delete(doc(db, 'registrations', r.id));
  await batch.commit();
}

export async function loadHistory(db, regId) {
  const snap = await getDocs(collection(db, 'registrations', regId, 'history'));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.at?.toMillis?.() ?? 0) - (a.at?.toMillis?.() ?? 0));
}

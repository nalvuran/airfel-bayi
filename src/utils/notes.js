// src/utils/notes.js
// Bayi notları: dealers/{bayiId}/notes/{notId}. Customer Data yüklemesinden etkilenmez.
import { addDoc, collection, deleteDoc, doc, getDocs, serverTimestamp, updateDoc } from 'firebase/firestore';
import { commitOrQueue } from './offline';

export const NOTE_MAX = 2000;

// Firestore zaman damgası ya da Date; henüz sunucuya yazılmamışsa "şimdi" sayılır (en üstte görünsün)
const ms = (v) => v?.toMillis?.() ?? (v instanceof Date ? v.getTime() : Date.now());

export async function loadNotes(db, dealerId) {
  const snap = await getDocs(collection(db, 'dealers', dealerId, 'notes'));
  return snap.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }))
    .sort((a, b) => ms(b.createdAt) - ms(a.createdAt));
}

export function addNote(db, dealerId, { text, user, profile }) {
  return commitOrQueue(addDoc(collection(db, 'dealers', dealerId, 'notes'), {
    text,
    byUid: user.uid,
    byName: profile?.name || user.email,
    byRepKey: profile?.salesRepKey || null,
    createdAt: serverTimestamp(),
  }));
}

export function editNote(db, dealerId, noteId, text) {
  return commitOrQueue(updateDoc(doc(db, 'dealers', dealerId, 'notes', noteId), { text, editedAt: serverTimestamp() }));
}

export function removeNote(db, dealerId, noteId) {
  return commitOrQueue(deleteDoc(doc(db, 'dealers', dealerId, 'notes', noteId)));
}

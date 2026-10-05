// src/utils/notes.js
// Bayi notları: dealers/{bayiId}/notes/{notId}. Customer Data yüklemesinden etkilenmez.
import { addDoc, collection, deleteDoc, doc, getDocs, serverTimestamp, updateDoc } from 'firebase/firestore';
import { commitOrQueue } from './offline';
import { logActivity } from './activity';

export const NOTE_MAX = 2000;

// Firestore zaman damgası ya da Date; henüz sunucuya yazılmamışsa "şimdi" sayılır (en üstte görünsün)
const ms = (v) => v?.toMillis?.() ?? (v instanceof Date ? v.getTime() : Date.now());

export async function loadNotes(db, dealerId) {
  const snap = await getDocs(collection(db, 'dealers', dealerId, 'notes'));
  return snap.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }))
    .sort((a, b) => ms(b.createdAt) - ms(a.createdAt));
}

function addNote__(db, dealerId, { text, user, profile, role }) {
  return commitOrQueue(addDoc(collection(db, 'dealers', dealerId, 'notes'), {
    text,
    byUid: user.uid,
    byName: profile?.name || user.email,
    byRepKey: profile?.salesRepKey || profile?.personKey || null,
    byRole: role || null, // müdür notlarını ayırt etmek için
    createdAt: serverTimestamp(),
  }));
}

function editNote__(db, dealerId, noteId, text) {
  return commitOrQueue(updateDoc(doc(db, 'dealers', dealerId, 'notes', noteId), { text, editedAt: serverTimestamp() }));
}

function removeNote__(db, dealerId, noteId) {
  return commitOrQueue(deleteDoc(doc(db, 'dealers', dealerId, 'notes', noteId)));
}

/* ---------- Hareket günlüğü: işlem başarılı olunca günlüğe yaz ---------- */
export async function addNote(db, dealerId, args) {
  const res = await addNote__(db, dealerId, args);
  logActivity('note.add', { dealerId, detail: args.text });
  return res;
}
export async function editNote(db, dealerId, noteId, text) {
  const res = await editNote__(db, dealerId, noteId, text);
  logActivity('note.edit', { dealerId, detail: text });
  return res;
}
export async function removeNote(db, dealerId, noteId) {
  const res = await removeNote__(db, dealerId, noteId);
  logActivity('note.delete', { dealerId });
  return res;
}

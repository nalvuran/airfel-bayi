// src/utils/followUps.js
// Takip hatırlatmaları: followUps/{bayiId} — her bayi için tek bir açık takip.
// Aynı bayiye yeni ziyaret kaydı girilince takip kendiliğinden kapanır.
import { collection, deleteField, doc, getDocs, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { commitOrQueue } from './offline';

let cache = null;
const MEMORY_MS = 60 * 1000;

export const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const fmtDay = (s) => (s ? s.split('-').reverse().join('.') : '');
export function dayDiff(s) {
  const [y, m, d] = s.split('-').map(Number);
  const t = new Date(y, m - 1, d);
  const n = new Date(); n.setHours(0, 0, 0, 0);
  return Math.round((t - n) / 86400000);
}
export function followUpState(f) {
  const diff = dayDiff(f.date);
  if (diff < 0) return { key: 'late', label: `${-diff} gün geçti`, tone: 'danger' };
  if (diff === 0) return { key: 'today', label: 'Bugün', tone: 'warn' };
  if (diff <= 7) return { key: 'week', label: diff === 1 ? 'Yarın' : `${diff} gün sonra`, tone: undefined };
  return { key: 'later', label: fmtDay(f.date), tone: undefined };
}

export async function loadOpenFollowUps(db, { force } = {}) {
  if (!force && cache && Date.now() - cache.at < MEMORY_MS) return cache.list;
  const snap = await getDocs(query(collection(db, 'followUps'), where('done', '==', false)));
  const list = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.date.localeCompare(b.date));
  cache = { list, at: Date.now() };
  return list;
}
export function invalidateFollowUps() { cache = null; }

function followUpData({ dealer, date, note, user, profile }) {
  return {
    dealerId: dealer.i, dealerName: dealer.n, date, note: (note || '').trim() || null, done: false,
    byUid: user.uid, byName: profile?.name || user.email, byRepKey: profile?.salesRepKey || null,
    setAt: serverTimestamp(), closedAt: deleteField(), closedByName: deleteField(), closedReason: deleteField(),
  };
}

// Ziyaret kaydıyla aynı işlemde: yeni tarih varsa takip kurulur, yoksa açık takip "ziyaret edildi" olarak kapanır
export function addFollowUpToBatch(batch, db, { dealer, date, user, profile, hadOpen }) {
  const ref = doc(db, 'followUps', dealer.i);
  if (date) batch.set(ref, followUpData({ dealer, date, user, profile }), { merge: true });
  else if (hadOpen) batch.set(ref, { done: true, closedAt: serverTimestamp(), closedByName: profile?.name || user.email, closedReason: 'visit' }, { merge: true });
}

export async function setFollowUp(db, { dealer, date, note, user, profile }) {
  const res = await commitOrQueue(setDoc(doc(db, 'followUps', dealer.i), followUpData({ dealer, date, note, user, profile }), { merge: true }));
  invalidateFollowUps();
  return res;
}

export async function clearFollowUp(db, { dealer, user, profile }) {
  const res = await commitOrQueue(setDoc(doc(db, 'followUps', dealer.i), {
    done: true, closedAt: serverTimestamp(), closedByName: profile?.name || user.email, closedReason: 'manual',
  }, { merge: true }));
  invalidateFollowUps();
  return res;
}

/* ---------- Takvime ekleme: Outlook (şirket), Google Takvim, telefonun takvimi ---------- */

const isApple = () => /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent) && 'ontouchend' in document;

// Takip günü saat 09:00-09:30 arası etkinlik
function eventOf({ dealerName, date, note, url }) {
  return { title: `Takip: ${dealerName}`, details: [note, url].filter(Boolean).join('\n'), date, d: date.replace(/-/g, '') };
}

// Outlook (Microsoft 365 şirket hesabı): etkinlik oluşturma ekranı hazır açılır, sadece "Kaydet"e basılır
export function openOutlook(input) {
  const ev = eventOf(input);
  const u = 'https://outlook.office.com/calendar/deeplink/compose?path=%2Fcalendar%2Faction%2Fcompose&rru=addevent'
    + `&subject=${encodeURIComponent(ev.title)}&body=${encodeURIComponent(ev.details)}`
    + `&startdt=${encodeURIComponent(`${ev.date}T09:00:00+03:00`)}&enddt=${encodeURIComponent(`${ev.date}T09:30:00+03:00`)}`;
  window.open(u, '_blank');
}

export function openGoogle(input) {
  const ev = eventOf(input);
  const u = 'https://calendar.google.com/calendar/render?action=TEMPLATE'
    + `&text=${encodeURIComponent(ev.title)}&dates=${ev.d}T090000/${ev.d}T093000&ctz=Europe/Istanbul`
    + `&details=${encodeURIComponent(ev.details)}`;
  window.open(u, '_blank');
}

// Telefonun takvimi: .ics dosyası (iPhone'da Takvim açılır; Android'de yüklü takvim/Outlook uygulamasıyla açılır)
export function openIcs(input) {
  const ev = eventOf(input);
  const esc = (x) => String(x).replace(/[\\,;]/g, (m) => `\\${m}`).replace(/\n/g, '\\n');
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Airfel Segment//TR', 'BEGIN:VEVENT',
    `UID:${ev.d}-${Math.random().toString(36).slice(2)}@airfel-segment`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
    `DTSTART;TZID=Europe/Istanbul:${ev.d}T090000`, `DTEND;TZID=Europe/Istanbul:${ev.d}T093000`,
    `SUMMARY:${esc(ev.title)}`, `DESCRIPTION:${esc(ev.details)}`,
    'BEGIN:VALARM', 'TRIGGER:PT0M', 'ACTION:DISPLAY', `DESCRIPTION:${esc(ev.title)}`, 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
  if (isApple()) { window.location.href = `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`; return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
  a.download = `takip-${ev.date}.ics`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

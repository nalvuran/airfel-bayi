// src/pages/UsersPage.jsx
import { useEffect, useMemo, useState } from 'react';
import { deleteApp, initializeApp } from 'firebase/app';
import { createUserWithEmailAndPassword, getAuth, sendPasswordResetEmail, signOut } from 'firebase/auth';
import { collection, doc, getDocs, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import app, { auth, db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { getDealerIndex } from '../utils/dealerIndex';
import { Avatar, PageHeader } from '../components/ui';

const C = {
  red: 'var(--red)', redBg: 'var(--red-soft)', text: 'var(--ink)', muted: 'var(--muted)',
  border: 'var(--border)', soft: 'var(--surface-2)', ok: 'var(--green)', okBg: 'var(--green-soft)', warn: 'var(--amber)', warnBg: 'var(--amber-soft)',
};
const ROLES = { admin: 'Yönetici', rep: 'Temsilci' };

const card = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: 'var(--shadow)', padding: 20, marginBottom: 16 };
const input = {
  border: '1.5px solid var(--border)', borderRadius: 8, padding: '10px 12px', fontSize: 15,
  background: 'var(--surface)', color: 'var(--ink)', width: '100%', boxSizing: 'border-box',
};
const label = { display: 'block', fontSize: 12, color: 'var(--muted)', marginBottom: 4, fontWeight: 700 };
const btn = (primary, disabled) => ({
  background: disabled ? '#DCD8D3' : primary ? 'var(--red)' : 'var(--surface)',
  color: primary || disabled ? '#fff' : 'var(--ink)',
  border: `1.5px solid ${disabled ? '#DCD8D3' : primary ? 'var(--red)' : 'var(--border)'}`,
  borderRadius: 10, padding: '10px 16px', fontSize: 14, fontWeight: 800,
  cursor: disabled ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap',
});
const linkBtn = { background: 'none', border: 'none', padding: 0, color: 'var(--red)', fontSize: 13, fontWeight: 800, cursor: 'pointer' };

const AUTH_ERRORS = {
  'auth/email-already-in-use': 'Bu e-posta ile zaten bir hesap var. Firebase Console > Authentication bölümünden kontrol et.',
  'auth/invalid-email': 'E-posta adresi geçersiz.',
  'auth/weak-password': 'Şifre en az 6 karakter olmalı.',
  'auth/too-many-requests': 'Çok fazla deneme yapıldı. Birkaç dakika sonra tekrar dene.',
  'auth/operation-not-allowed': 'Firebase\'de e-posta/şifre girişi kapalı. Authentication > Sign-in method bölümünden aç.',
};
const authMsg = (e) => AUTH_ERRORS[e.code] || e.message;

function randomPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#%';
  const a = new Uint32Array(20);
  crypto.getRandomValues(a);
  return Array.from(a, (n) => chars[n % chars.length]).join('');
}

// Yeni kullanıcıyı ikinci bir Firebase örneğiyle açar; böylece yönetici oturumu kapanmaz
async function createAuthAccount(email, password) {
  const secondary = initializeApp(app.options, `user-create-${Date.now()}`);
  try {
    const secAuth = getAuth(secondary);
    const cred = await createUserWithEmailAndPassword(secAuth, email, password);
    await signOut(secAuth);
    return cred.user.uid;
  } finally {
    await deleteApp(secondary);
  }
}

async function sendSetPasswordMail(email) {
  auth.languageCode = 'tr';
  await sendPasswordResetEmail(auth, email);
}

function Message({ msg }) {
  if (!msg) return null;
  const bg = msg.tone === 'error' ? C.redBg : msg.tone === 'ok' ? C.okBg : C.warnBg;
  const fg = msg.tone === 'error' ? C.red : msg.tone === 'ok' ? C.ok : C.warn;
  return <div style={{ background: bg, color: fg, borderRadius: 8, padding: '10px 14px', fontSize: 14, marginTop: 12 }}>{msg.text}</div>;
}

function RepSelect({ value, onChange, reps, takenBy, selfUid }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={input}>
      <option value="">Bağlı değil</option>
      {reps.map((r) => {
        const owner = takenBy[r.key];
        const taken = owner && owner !== selfUid;
        return (
          <option key={r.key} value={r.key}>
            {r.name} ({r.count} bayi){taken ? ' · başka hesaba bağlı' : ''}
          </option>
        );
      })}
    </select>
  );
}

/* ---------- Yeni kullanıcı ---------- */

function CreateUser({ reps, takenBy, onCreated, adminEmail }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: '', email: '', role: 'rep', salesRepKey: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));

  // Temsilci seçilince ad alanı boşsa, adı temsilci adından doldur
  const pickRep = (key) => {
    const rep = reps.find((r) => r.key === key);
    setF((x) => ({ ...x, salesRepKey: key, name: x.name || (rep ? rep.name.toLocaleLowerCase('tr-TR').replace(/(^|\s)\S/g, (c) => c.toLocaleUpperCase('tr-TR')) : '') }));
  };

  const submit = async () => {
    setMsg(null);
    const email = f.email.trim().toLowerCase();
    if (!f.name.trim() || !email) { setMsg({ tone: 'error', text: 'Ad soyad ve e-posta zorunlu.' }); return; }
    if (f.password && f.password.length < 6) { setMsg({ tone: 'error', text: 'Şifre en az 6 karakter olmalı.' }); return; }
    if (f.salesRepKey && takenBy[f.salesRepKey]) { setMsg({ tone: 'error', text: 'Bu temsilci adı zaten başka bir hesaba bağlı.' }); return; }

    setBusy(true);
    let uid = null;
    try {
      uid = await createAuthAccount(email, f.password || randomPassword());
      await setDoc(doc(db, 'users', uid), {
        name: f.name.trim(),
        email,
        role: f.role,
        salesRepKey: f.salesRepKey || null,
        active: true,
        createdAt: serverTimestamp(),
        createdBy: adminEmail,
      });
      let text = `${f.name.trim()} için hesap açıldı.`;
      if (!f.password) {
        try {
          await sendSetPasswordMail(email);
          text += ` ${email} adresine şifre belirleme e-postası gönderildi. E-posta gelmezse spam klasörüne baktırın.`;
        } catch (e) {
          text += ` Ancak şifre e-postası gönderilemedi (${authMsg(e)}). Listeden "Şifre e-postası gönder" ile tekrar dene.`;
        }
      } else {
        text += ' Belirlediğin şifreyi kullanıcıya ilet.';
      }
      setMsg({ tone: 'ok', text });
      setF({ name: '', email: '', role: 'rep', salesRepKey: '', password: '' });
      onCreated();
    } catch (e) {
      setMsg({
        tone: 'error',
        text: uid
          ? `Giriş hesabı açıldı ama profil kaydedilemedi (${e.message}). Bu kişi giriş yapamaz; Firebase Console > Authentication'dan ${email} hesabını silip tekrar dene.`
          : authMsg(e),
      });
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <div style={{ marginBottom: 16 }}>
        <button style={btn(true, false)} onClick={() => setOpen(true)}>+ Yeni kullanıcı</button>
      </div>
    );
  }

  return (
    <section style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <h2 className="card-title">Yeni kullanıcı</h2>
        <button style={linkBtn} onClick={() => { setOpen(false); setMsg(null); }}>Kapat</button>
      </div>
      <p style={{ fontSize: 13, color: C.muted, margin: '0 0 16px' }}>
        Şifreyi boş bırakırsan kullanıcıya kendi şifresini belirleyeceği bir e-posta gider.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        <div>
          <label style={label}>Rol</label>
          <select value={f.role} onChange={(e) => set('role')(e.target.value)} style={input}>
            <option value="rep">Temsilci</option>
            <option value="admin">Yönetici</option>
          </select>
        </div>
        <div>
          <label style={label}>Customer Data'daki temsilci adı</label>
          <RepSelect value={f.salesRepKey} onChange={pickRep} reps={reps} takenBy={takenBy} />
        </div>
        <div>
          <label style={label}>Ad soyad</label>
          <input value={f.name} onChange={(e) => set('name')(e.target.value)} style={input} placeholder="Örn. Tuğçe Yıldırıcı" />
        </div>
        <div>
          <label style={label}>E-posta</label>
          <input type="email" value={f.email} onChange={(e) => set('email')(e.target.value)} style={input} placeholder="ornek@firma.com" autoComplete="off" />
        </div>
        <div>
          <label style={label}>Şifre (isteğe bağlı)</label>
          <input type="text" value={f.password} onChange={(e) => set('password')(e.target.value)} style={input} placeholder="Boş: e-postayla belirlesin" autoComplete="new-password" />
        </div>
      </div>
      <div style={{ marginTop: 16 }}>
        <button style={btn(true, busy)} disabled={busy} onClick={submit}>{busy ? 'Hesap açılıyor…' : 'Hesap aç'}</button>
      </div>
      <Message msg={msg} />
    </section>
  );
}

/* ---------- Kullanıcı satırı ---------- */

function UserRow({ u, reps, takenBy, isSelf, selfEmail, onChanged }) {
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState({ name: u.name || '', role: u.role || 'rep', salesRepKey: u.salesRepKey || '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const repName = reps.find((r) => r.key === u.salesRepKey)?.name || u.salesRepKey;
  const active = u.active !== false;

  const save = async () => {
    if (isSelf && f.role !== 'admin') { setMsg({ tone: 'error', text: 'Kendi yönetici yetkini kaldıramazsın; başka bir yönetici yapmalı.' }); return; }
    if (f.salesRepKey && takenBy[f.salesRepKey] && takenBy[f.salesRepKey] !== u.id) { setMsg({ tone: 'error', text: 'Bu temsilci adı başka bir hesaba bağlı.' }); return; }
    setBusy(true); setMsg(null);
    try {
      await updateDoc(doc(db, 'users', u.id), {
        name: f.name.trim(), role: f.role, salesRepKey: f.salesRepKey || null,
        ...(isSelf && !u.email && selfEmail ? { email: selfEmail } : {}),
      });
      setEditing(false);
      setMsg({ tone: 'ok', text: isSelf ? 'Kaydedildi. Değişikliğin görünmesi için çıkış yapıp tekrar giriş yap.' : 'Kaydedildi. Kullanıcı bir sonraki girişinde değişikliği görür.' });
      onChanged();
    } catch (e) { setMsg({ tone: 'error', text: e.message }); } finally { setBusy(false); }
  };

  const toggleActive = async () => {
    if (isSelf) return;
    const next = !active;
    if (!next && !window.confirm(`${u.name || u.email} pasif yapılsın mı? Bir sonraki girişinde sisteme alınmaz, verileri silinmez.`)) return;
    setBusy(true); setMsg(null);
    try {
      await updateDoc(doc(db, 'users', u.id), { active: next });
      onChanged();
    } catch (e) { setMsg({ tone: 'error', text: e.message }); } finally { setBusy(false); }
  };

  const resetMail = async () => {
    if (!u.email) return;
    setBusy(true); setMsg(null);
    try {
      await sendSetPasswordMail(u.email);
      setMsg({ tone: 'ok', text: `${u.email} adresine şifre belirleme e-postası gönderildi.` });
    } catch (e) { setMsg({ tone: 'error', text: authMsg(e) }); } finally { setBusy(false); }
  };

  return (
    <div style={{ padding: '14px 16px', borderTop: `1px solid ${C.border}`, opacity: active ? 1 : 0.6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', gap: 12, minWidth: 0 }}>
          <Avatar name={u.name || u.email} size={40} />
          <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 15, color: C.text }}>
            {u.name || '(adsız)'} {isSelf && <span style={{ fontWeight: 400, color: C.muted }}>· sen</span>}
          </div>
          <div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>{u.email || (isSelf && selfEmail) || u.id}</div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>
            <span style={{ fontWeight: 700, color: u.role === 'admin' ? C.red : C.text }}>{ROLES[u.role] || u.role || 'Rol yok'}</span>
            {' · '}{repName ? `Temsilci adı: ${repName}` : 'Temsilci adı bağlı değil'}
            {!active && <span style={{ color: C.red, fontWeight: 700 }}> · Pasif</span>}
          </div>
          </div>
        </div>
        {!editing && (
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <button style={linkBtn} disabled={busy} onClick={() => setEditing(true)}>Düzenle</button>
            {u.email && <button style={linkBtn} disabled={busy} onClick={resetMail}>Şifre e-postası gönder</button>}
            {!isSelf && <button style={linkBtn} disabled={busy} onClick={toggleActive}>{active ? 'Pasif yap' : 'Aktif yap'}</button>}
          </div>
        )}
      </div>

      {editing && (
        <div style={{ marginTop: 12, background: C.soft, borderRadius: 8, padding: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
            <div>
              <label style={label}>Ad soyad</label>
              <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} style={input} />
            </div>
            <div>
              <label style={label}>Rol</label>
              <select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} style={input}>
                <option value="rep">Temsilci</option>
                <option value="admin">Yönetici</option>
              </select>
            </div>
            <div>
              <label style={label}>Temsilci adı</label>
              <RepSelect value={f.salesRepKey} onChange={(v) => setF({ ...f, salesRepKey: v })} reps={reps} takenBy={takenBy} selfUid={u.id} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            <button style={btn(true, busy)} disabled={busy} onClick={save}>Kaydet</button>
            <button style={btn(false, false)} onClick={() => { setEditing(false); setF({ name: u.name || '', role: u.role || 'rep', salesRepKey: u.salesRepKey || '' }); }}>Vazgeç</button>
          </div>
        </div>
      )}
      <Message msg={msg} />
    </div>
  );
}

/* ---------- Sayfa ---------- */

export default function UsersPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState(null);
  const [index, setIndex] = useState(null);
  const [error, setError] = useState(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    getDocs(collection(db, 'users'))
      .then((snap) => setUsers(snap.docs.map((d) => ({ id: d.id, ...d.data() }))))
      .catch((e) => setError(e.message));
  }, [reload]);

  useEffect(() => {
    getDealerIndex(db).then(setIndex).catch(() => setIndex({ entries: [] }));
  }, []);

  // Customer Data'daki temsilciler ve bayi sayıları
  const reps = useMemo(() => {
    const m = new Map();
    (index?.entries ?? []).forEach((e) => {
      if (!e.k) return;
      const r = m.get(e.k) || { key: e.k, name: e.k, count: 0 };
      r.count++;
      if (e.r === e.k) r.name = e.r; // standart yazılışı tercih et
      m.set(e.k, r);
    });
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  }, [index]);

  const takenBy = useMemo(() => {
    const t = {};
    (users ?? []).forEach((u) => { if (u.salesRepKey && u.active !== false) t[u.salesRepKey] = u.id; });
    return t;
  }, [users]);

  const sorted = useMemo(() => [...(users ?? [])].sort((a, b) =>
    (a.active === false) - (b.active === false) ||
    (a.role === 'admin' ? 0 : 1) - (b.role === 'admin' ? 0 : 1) ||
    (a.name || a.email || '').localeCompare(b.name || b.email || '', 'tr')), [users]);

  const missingReps = reps.filter((r) => !takenBy[r.key]);

  return (
    <div className="page-narrow" style={{ maxWidth: 900 }}>
      <PageHeader title="Kullanıcılar" />

      <CreateUser reps={reps} takenBy={takenBy} adminEmail={user?.email} onCreated={() => setReload((x) => x + 1)} />

      {error && <div style={{ ...card, color: C.red }}>Kullanıcılar okunamadı: {error}</div>}
      {!users && !error && <p style={{ color: C.muted }}>Yükleniyor…</p>}

      {users && (
        <section style={{ ...card, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <h2 className="card-title">Hesaplar ({users.length})</h2>
            {reps.length > 0 && (
              <span style={{ fontSize: 13, color: missingReps.length ? C.warn : C.ok }}>
                {missingReps.length ? `${missingReps.length} temsilcinin hesabı yok` : 'Tüm temsilcilerin hesabı var'}
              </span>
            )}
          </div>
          {sorted.map((u) => (
            <UserRow key={u.id} u={u} reps={reps} takenBy={takenBy} isSelf={u.id === user?.uid} selfEmail={user?.email} onChanged={() => setReload((x) => x + 1)} />
          ))}
          {missingReps.length > 0 && (
            <div style={{ padding: '12px 16px', borderTop: `1px solid ${C.border}`, background: C.soft, fontSize: 13, color: C.muted }}>
              Hesabı olmayan temsilciler: {missingReps.map((r) => r.name).join(', ')}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

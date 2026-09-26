// src/pages/UsersPage.jsx — Ekip ağacı ve hesaplar (sadece sahip)
import { useEffect, useMemo, useState } from 'react';
import { deleteApp, initializeApp } from 'firebase/app';
import { createUserWithEmailAndPassword, getAuth, sendPasswordResetEmail, signOut } from 'firebase/auth';
import { collection, deleteDoc, doc, getDocs, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import app, { auth, db } from '../firebase';
import { useAuth, normalizeRole, ROLE_LABELS } from '../contexts/AuthContext';
import { getDealerIndex } from '../utils/dealerIndex';
import { removeRepPhoto, removePerson, savePerson, saveRepPhoto } from '../utils/repProfiles';
import { SEED_TEAM, TEAM_ROLES, personKey, seedTeam, useTeam } from '../utils/team';
import { squareAvatar } from '../utils/image';
import { Alert, Avatar, Badge, Card, PageHeader } from '../components/ui';

const AUTH_ERRORS = {
  'auth/email-already-in-use': 'Bu e-posta ile zaten bir hesap var. Firebase Console > Authentication bölümünden kontrol et.',
  'auth/invalid-email': 'E-posta adresi geçersiz.',
  'auth/weak-password': 'Şifre en az 6 karakter olmalı.',
  'auth/too-many-requests': 'Çok fazla deneme yapıldı. Birkaç dakika sonra tekrar dene.',
  'auth/operation-not-allowed': 'Firebase\'de e-posta/şifre girişi kapalı. Authentication > Sign-in method bölümünden aç.',
};
const errMsg = (e) => AUTH_ERRORS[e?.code] || (e?.code === 'permission-denied' ? 'Bu işlem için iznin yok. Firestore kurallarını güncellediğinden emin ol.' : e?.message || String(e));

function randomPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#%';
  const a = new Uint32Array(20);
  crypto.getRandomValues(a);
  return Array.from(a, (n) => chars[n % chars.length]).join('');
}

// Yeni hesabı ikinci bir Firebase örneğiyle açar; böylece senin oturumun kapanmaz
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

const accountKey = (u) => u.personKey || u.salesRepKey || null;

/* ---------- Ekip ağacı: bir kişi satırı ---------- */

function PersonRow({ p, depth, account, team, adminEmail, onChanged }) {
  const [mode, setMode] = useState(null); // 'edit'
  const [f, setF] = useState({ role: p.role, managerKey: p.managerKey || '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const run = async (fn, ok) => {
    setBusy(true); setMsg(null);
    try { await fn(); if (ok) setMsg({ tone: 'success', text: ok }); onChanged(); } catch (e) { setMsg({ tone: 'danger', text: errMsg(e) }); } finally { setBusy(false); }
  };
  const onPhoto = async (e) => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    await run(async () => {
      const photo = await squareAvatar(file);
      URL.revokeObjectURL(photo.previewUrl);
      await saveRepPhoto(db, { key: p.key, name: p.name, photo, by: adminEmail });
    });
  };
  const managerOptions = f.role === 'rep' ? team.managers : f.role === 'regionManager' ? team.dept : [];
  const acc = account;
  const accState = !acc ? { tone: undefined, text: 'Hesabı yok' }
    : acc.active === false ? { tone: 'warn', text: 'Hesap pasif' }
      : { tone: 'success', text: 'Hesabı var' };

  return (
    <div className="team-row" style={{ paddingLeft: 12 + depth * 22 }}>
      <div className="row" style={{ flexWrap: 'nowrap', gap: 10 }}>
        <Avatar name={p.name} src={p.url} size={depth === 0 ? 44 : 38} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 800 }}>{p.name}</div>
          <div className="row" style={{ gap: 6, marginTop: 3 }}>
            <span className="text-xs muted" style={{ fontWeight: 700 }}>{TEAM_ROLES[p.role]}</span>
            <Badge tone={accState.tone}>{accState.text}</Badge>
          </div>
        </div>
      </div>
      {mode !== 'edit' && (
        <div className="row mt-8" style={{ gap: 14, paddingLeft: depth === 0 ? 54 : 48 }}>
          <label className="btn-link text-sm" style={{ cursor: busy ? 'wait' : 'pointer' }}>
            {p.url ? 'Fotoğrafı değiştir' : 'Fotoğraf ekle'}
            <input type="file" accept="image/*" onChange={onPhoto} disabled={busy} style={{ display: 'none' }} />
          </label>
          {p.url && <button className="btn-link text-sm" style={{ color: 'var(--muted)' }} disabled={busy}
            onClick={() => window.confirm('Fotoğraf kaldırılsın mı?') && run(() => removeRepPhoto(db, { key: p.key, by: adminEmail }))}>Fotoğrafı kaldır</button>}
          <button className="btn-link text-sm" disabled={busy} onClick={() => setMode('edit')}>Düzenle</button>
          <button className="btn-link text-sm" style={{ color: 'var(--muted)' }} disabled={busy}
            onClick={() => window.confirm(`${p.name} ekipten çıkarılsın mı?${acc ? ' Hesabı ayrıca "Hesaplar" bölümünden kaldırman gerekir.' : ''}`) && run(() => removePerson(db, { key: p.key, by: adminEmail }))}>Ekipten çıkar</button>
        </div>
      )}
      {mode === 'edit' && (
        <div className="editor" style={{ marginTop: 10 }}>
          <div className="form-grid">
            <div>
              <span className="label-sm">Görev</span>
              <select className="select" value={f.role} onChange={(e) => setF({ role: e.target.value, managerKey: '' })}>
                {Object.entries(TEAM_ROLES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </div>
            {f.role !== 'deptManager' && (
              <div>
                <span className="label-sm">Bağlı olduğu kişi</span>
                <select className="select" value={f.managerKey} onChange={(e) => setF({ ...f, managerKey: e.target.value })}>
                  <option value="">Seç</option>
                  {managerOptions.filter((m) => m.key !== p.key).map((m) => <option key={m.key} value={m.key}>{m.name}</option>)}
                </select>
              </div>
            )}
          </div>
          <div className="row mt-12">
            <button className="btn btn-primary btn-sm" disabled={busy || (f.role !== 'deptManager' && !f.managerKey)}
              onClick={() => run(async () => {
                await savePerson(db, { key: p.key, name: p.name, role: f.role, managerKey: f.role === 'deptManager' ? null : f.managerKey, by: adminEmail });
                // Hesabı varsa görevi hesaba da yansıt (sahip hariç)
                if (acc && normalizeRole(acc.role) !== 'owner') await updateDoc(doc(db, 'users', acc.id), { role: f.role, salesRepKey: f.role === 'rep' ? p.key : null, personKey: p.key });
                setMode(null);
              }, 'Kaydedildi.')}>Kaydet</button>
            <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => setMode(null)}>Vazgeç</button>
          </div>
        </div>
      )}
      {msg && <Alert tone={msg.tone} style={{ marginTop: 8 }}>{msg.text}</Alert>}
    </div>
  );
}

function AddPerson({ team, adminEmail, onChanged }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: '', role: 'rep', managerKey: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const managerOptions = f.role === 'rep' ? team.managers : f.role === 'regionManager' ? team.dept : [];
  if (!open) return <button className="btn btn-secondary btn-sm" onClick={() => setOpen(true)}>+ Kişi ekle</button>;
  const save = async () => {
    const name = f.name.trim().replace(/\s+/g, ' ');
    if (!name) { setMsg({ tone: 'danger', text: 'Adı yaz.' }); return; }
    if (f.role !== 'deptManager' && !f.managerKey) { setMsg({ tone: 'danger', text: 'Bağlı olduğu kişiyi seç.' }); return; }
    setBusy(true); setMsg(null);
    try {
      await savePerson(db, { key: personKey(name), name, role: f.role, managerKey: f.role === 'deptManager' ? null : f.managerKey, by: adminEmail });
      setOpen(false); setF({ name: '', role: 'rep', managerKey: '' }); onChanged();
    } catch (e) { setMsg({ tone: 'danger', text: errMsg(e) }); } finally { setBusy(false); }
  };
  return (
    <div className="editor">
      <div className="form-grid">
        <div>
          <span className="label-sm">Ad soyad (Customer Data'daki yazılışla aynı)</span>
          <input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Örn. Sinan Aydın" />
        </div>
        <div>
          <span className="label-sm">Görev</span>
          <select className="select" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value, managerKey: '' })}>
            {Object.entries(TEAM_ROLES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
        {f.role !== 'deptManager' && (
          <div>
            <span className="label-sm">Bağlı olduğu kişi</span>
            <select className="select" value={f.managerKey} onChange={(e) => setF({ ...f, managerKey: e.target.value })}>
              <option value="">Seç</option>
              {managerOptions.map((m) => <option key={m.key} value={m.key}>{m.name}</option>)}
            </select>
          </div>
        )}
      </div>
      {msg && <Alert tone={msg.tone} style={{ marginTop: 10 }}>{msg.text}</Alert>}
      <div className="row mt-12">
        <button className="btn btn-primary btn-sm" disabled={busy} onClick={save}>{busy ? 'Kaydediliyor…' : 'Ekle'}</button>
        <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => setOpen(false)}>Vazgeç</button>
      </div>
    </div>
  );
}

function TeamTree({ team, accounts, adminEmail, cdReps, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const accByKey = useMemo(() => Object.fromEntries(accounts.filter((u) => accountKey(u)).map((u) => [accountKey(u), u])), [accounts]);

  if (!team.defined) {
    return (
      <Card title="Ekip" desc="Ekip ağacı henüz oluşturulmadı. Aşağıdaki butonla verdiğin 14 kişilik ekip (1 departman müdürü, 4 bölge müdürü, 9 temsilci) kurulur; sonra istediğin gibi değiştirebilirsin.">
        <ul className="text-sm" style={{ margin: '0 0 14px', paddingLeft: 18 }}>
          {SEED_TEAM.map((p) => <li key={p.name}>{p.name} · {TEAM_ROLES[p.role]}{p.manager ? ` → ${p.manager}` : ''}</li>)}
        </ul>
        <button className="btn btn-primary" disabled={busy}
          onClick={async () => { setBusy(true); setMsg(null); try { await seedTeam(adminEmail); onChanged(); } catch (e) { setMsg({ tone: 'danger', text: errMsg(e) }); } finally { setBusy(false); } }}>
          {busy ? 'Oluşturuluyor…' : 'Ekibi oluştur'}
        </button>
        {msg && <Alert tone={msg.tone} style={{ marginTop: 10 }}>{msg.text}</Alert>}
      </Card>
    );
  }

  const children = (key) => team.people.filter((p) => p.managerKey === key).sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  const shown = new Set();
  const render = (p, depth) => {
    shown.add(p.key);
    return (
      <div key={p.key}>
        <PersonRow p={p} depth={depth} account={accByKey[p.key]} team={team} adminEmail={adminEmail} onChanged={onChanged} />
        {children(p.key).map((c) => render(c, depth + 1))}
      </div>
    );
  };
  const tree = team.dept.map((d) => render(d, 0));
  const orphans = team.people.filter((p) => !shown.has(p.key));
  const teamRepKeys = new Set(team.reps.map((r) => r.key));
  const unknownInCd = cdReps.filter((r) => !teamRepKeys.has(r.key));

  return (
    <Card title="Ekip" desc="Uygulamadaki görünümler (Ekibim, bölge ekipleri) bu ağaca göre çalışır. Fotoğraflar da buradan yönetilir." flush>
      <div>{tree}</div>
      {orphans.length > 0 && (
        <div>
          <div className="text-sm" style={{ fontWeight: 800, color: 'var(--amber)', padding: '12px 16px 0' }}>Bağlı olduğu kişi eksik olanlar</div>
          {orphans.map((p) => <PersonRow key={p.key} p={p} depth={0} account={accByKey[p.key]} team={team} adminEmail={adminEmail} onChanged={onChanged} />)}
        </div>
      )}
      {unknownInCd.length > 0 && (
        <div style={{ padding: '0 16px 12px' }}>
          <Alert tone="warn">
            Customer Data'da olup ekipte olmayan temsilci adları: {unknownInCd.map((r) => `${r.name} (${r.count} bayi)`).join(', ')}. Yazılış farkı varsa Customer Data'yı düzelt ya da kişiyi aynı yazılışla ekle.
          </Alert>
        </div>
      )}
      <div style={{ padding: '12px 16px 16px', borderTop: '1px solid var(--border)' }}>
        <AddPerson team={team} adminEmail={adminEmail} onChanged={onChanged} />
      </div>
    </Card>
  );
}

/* ---------- Hesaplar ---------- */

function AccountRow({ u, team, isSelf, onChanged }) {
  const [mode, setMode] = useState(null);
  const [link, setLink] = useState(accountKey(u) || '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const role = normalizeRole(u.role);
  const isOwnerRow = role === 'owner';
  const person = team.byKey[accountKey(u)];
  const active = u.active !== false;

  const run = async (fn, ok) => {
    setBusy(true); setMsg(null);
    try { await fn(); if (ok) setMsg({ tone: 'success', text: ok }); onChanged(); } catch (e) { setMsg({ tone: 'danger', text: errMsg(e) }); } finally { setBusy(false); }
  };
  const saveLink = () => run(async () => {
    const p = team.byKey[link];
    const patch = { personKey: link || null, name: p?.name || u.name };
    if (isOwnerRow) patch.salesRepKey = p?.role === 'rep' ? link : null;
    else Object.assign(patch, { role: p?.role || 'rep', salesRepKey: p?.role === 'rep' ? link : null });
    await updateDoc(doc(db, 'users', u.id), patch);
    setMode(null);
  }, isSelf ? 'Kaydedildi. Görmek için çıkış yapıp tekrar giriş yap.' : 'Kaydedildi.');

  return (
    <div className="list-row" style={{ opacity: active ? 1 : 0.6 }}>
      <div className="row" style={{ flexWrap: 'nowrap', gap: 10 }}>
        <Avatar name={u.name || u.email} src={person?.url} size={38} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 800 }}>{u.name || '(adsız)'} {isSelf && <span className="muted" style={{ fontWeight: 600 }}>· sen</span>}</div>
          <div className="text-xs muted" style={{ fontWeight: 600 }}>{u.email || u.id}</div>
          <div className="row" style={{ gap: 6, marginTop: 4 }}>
            <Badge tone={isOwnerRow ? 'danger' : undefined}>{ROLE_LABELS[role]}</Badge>
            {!person && <Badge tone="warn">Ekipteki bir kişiye bağlı değil</Badge>}
            {!active && <Badge tone="warn">Pasif</Badge>}
          </div>
        </div>
      </div>
      {mode !== 'link' && (
        <div className="row mt-8" style={{ gap: 14, paddingLeft: 48 }}>
          <button className="btn-link text-sm" disabled={busy} onClick={() => setMode('link')}>Ekipteki kişiyi seç</button>
          {u.email && <button className="btn-link text-sm" disabled={busy} onClick={() => run(() => sendSetPasswordMail(u.email), `${u.email} adresine şifre belirleme e-postası gönderildi.`)}>Şifre e-postası gönder</button>}
          {!isOwnerRow && !isSelf && (
            <button className="btn-link text-sm" style={{ color: 'var(--muted)' }} disabled={busy}
              onClick={() => (active || window.confirm('Hesap tekrar aktif yapılsın mı?')) && (!active || window.confirm(`${u.name || u.email} pasif yapılsın mı?`)) && run(() => updateDoc(doc(db, 'users', u.id), { active: !active }))}>
              {active ? 'Pasif yap' : 'Aktif yap'}
            </button>
          )}
          {!isOwnerRow && !isSelf && (
            <button className="btn-link text-sm" style={{ color: 'var(--danger)' }} disabled={busy}
              onClick={() => window.confirm(`${u.name || u.email} kaldırılsın mı? Uygulamaya bir daha giremez; girdiği kayıtlar adıyla birlikte geçmişte kalır.`)
                && run(() => deleteDoc(doc(db, 'users', u.id)))}>Kaldır</button>
          )}
        </div>
      )}
      {mode === 'link' && (
        <div className="editor" style={{ marginTop: 10 }}>
          <span className="label-sm">Bu hesap ekipte kime ait?</span>
          <select className="select" value={link} onChange={(e) => setLink(e.target.value)}>
            <option value="">Kimse</option>
            {team.people.map((p) => <option key={p.key} value={p.key}>{p.name} · {TEAM_ROLES[p.role]}</option>)}
          </select>
          {!isOwnerRow && <div className="text-xs muted mt-8">Hesabın görevi, seçilen kişinin ekipteki görevi olur.</div>}
          <div className="row mt-12">
            <button className="btn btn-primary btn-sm" disabled={busy} onClick={saveLink}>Kaydet</button>
            <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => setMode(null)}>Vazgeç</button>
          </div>
        </div>
      )}
      {msg && <Alert tone={msg.tone} style={{ marginTop: 8 }}>{msg.text}</Alert>}
    </div>
  );
}

function CreateAccount({ team, accounts, adminEmail, onCreated }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ key: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const taken = new Set(accounts.filter((u) => u.active !== false).map(accountKey).filter(Boolean));
  const free = team.people.filter((p) => !taken.has(p.key));

  if (!open) return <button className="btn btn-primary btn-sm" onClick={() => { setOpen(true); setMsg(null); }}>+ Hesap aç</button>;
  const submit = async () => {
    const p = team.byKey[f.key];
    const email = f.email.trim().toLowerCase();
    if (!p || !email) { setMsg({ tone: 'danger', text: 'Kişiyi seç ve e-postasını yaz.' }); return; }
    if (f.password && f.password.length < 6) { setMsg({ tone: 'danger', text: 'Şifre en az 6 karakter olmalı.' }); return; }
    setBusy(true); setMsg(null);
    let uid = null;
    try {
      uid = await createAuthAccount(email, f.password || randomPassword());
      await setDoc(doc(db, 'users', uid), {
        name: p.name, email, role: p.role, personKey: p.key, salesRepKey: p.role === 'rep' ? p.key : null,
        active: true, createdAt: serverTimestamp(), createdBy: adminEmail,
      });
      let text = `${p.name} için hesap açıldı.`;
      if (!f.password) {
        try { await sendSetPasswordMail(email); text += ` ${email} adresine şifre belirleme e-postası gönderildi; gelmezse spam klasörüne baktırın.`; }
        catch (e) { text += ` Ama şifre e-postası gönderilemedi (${errMsg(e)}); listeden tekrar gönderebilirsin.`; }
      } else text += ' Belirlediğin şifreyi kişiye ilet.';
      setMsg({ tone: 'success', text });
      setF({ key: '', email: '', password: '' });
      onCreated();
    } catch (e) {
      setMsg({ tone: 'danger', text: uid ? `Giriş hesabı açıldı ama profil kaydedilemedi (${errMsg(e)}). Firebase Console > Authentication'dan ${email} hesabını silip tekrar dene.` : errMsg(e) });
    } finally { setBusy(false); }
  };
  return (
    <div className="editor">
      <div className="form-grid">
        <div>
          <span className="label-sm">Ekipteki kişi</span>
          <select className="select" value={f.key} onChange={(e) => setF({ ...f, key: e.target.value })}>
            <option value="">Seç</option>
            {free.map((p) => <option key={p.key} value={p.key}>{p.name} · {TEAM_ROLES[p.role]}</option>)}
          </select>
        </div>
        <div>
          <span className="label-sm">E-posta</span>
          <input className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="ornek@firma.com" autoComplete="off" />
        </div>
        <div>
          <span className="label-sm">Şifre (isteğe bağlı)</span>
          <input className="input" type="text" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} placeholder="Boş: e-postayla belirlesin" autoComplete="new-password" />
        </div>
      </div>
      {msg && <Alert tone={msg.tone} style={{ marginTop: 10 }}>{msg.text}</Alert>}
      <div className="row mt-12">
        <button className="btn btn-primary btn-sm" disabled={busy} onClick={submit}>{busy ? 'Hesap açılıyor…' : 'Hesap aç'}</button>
        <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => setOpen(false)}>Kapat</button>
      </div>
    </div>
  );
}

/* ---------- Sayfa ---------- */

export default function UsersPage() {
  const { user } = useAuth();
  const team = useTeam();
  const [accounts, setAccounts] = useState(null);
  const [cdReps, setCdReps] = useState([]);
  const [error, setError] = useState(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    getDocs(collection(db, 'users'))
      .then((snap) => setAccounts(snap.docs.map((d) => ({ id: d.id, ...d.data() }))))
      .catch((e) => setError(e.message));
  }, [reload]);

  // Customer Data'daki temsilci adları (ekiple karşılaştırmak için)
  useEffect(() => {
    getDealerIndex(db).then(({ entries }) => {
      const m = new Map();
      entries.forEach((e) => { if (!e.k) return; const r = m.get(e.k) || { key: e.k, name: e.r || e.k, count: 0 }; r.count++; m.set(e.k, r); });
      setCdReps([...m.values()]);
    }).catch(() => {});
  }, []);

  const sorted = useMemo(() => [...(accounts || [])].sort((a, b) =>
    (a.active === false) - (b.active === false)
    || (normalizeRole(a.role) === 'owner' ? 0 : 1) - (normalizeRole(b.role) === 'owner' ? 0 : 1)
    || (a.name || a.email || '').localeCompare(b.name || b.email || '', 'tr')), [accounts]);
  const refresh = () => setReload((x) => x + 1);
  const withoutAccount = team.people.filter((p) => !(accounts || []).some((u) => accountKey(u) === p.key && u.active !== false));

  return (
    <div className="page-narrow" style={{ maxWidth: 900 }}>
      <PageHeader title="Ekip ve kullanıcılar" back={{ to: '/admin', label: 'Yönetim' }} />
      {error && <Alert tone="danger">Kullanıcılar okunamadı: {error}</Alert>}

      <TeamTree team={team} accounts={accounts || []} adminEmail={user?.email} cdReps={cdReps} onChanged={refresh} />

      {accounts && (
        <Card title={`Hesaplar (${accounts.length})`} className="mt-16" flush
          actions={<span className="text-sm muted" style={{ paddingRight: 16 }}>{withoutAccount.length ? `${withoutAccount.length} kişinin hesabı yok` : 'Herkesin hesabı var'}</span>}>
          <div style={{ padding: '0 16px 12px' }}>
            <CreateAccount team={team} accounts={accounts} adminEmail={user?.email} onCreated={refresh} />
          </div>
          {sorted.map((u) => <AccountRow key={u.id} u={u} team={team} isSelf={u.id === user?.uid} onChanged={refresh} />)}
          <div className="card-footer">
            "Kaldır", kişinin uygulamaya girişini kapatır; girdiği kayıtlar silinmez. Giriş hesabını tamamen silmek istersen Firebase Console &gt; Authentication'dan silebilirsin.
          </div>
        </Card>
      )}
    </div>
  );
}

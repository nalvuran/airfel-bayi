// src/components/RegistrationEditor.jsx
import { useEffect, useState } from 'react';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { getDealerIndex } from '../utils/dealerIndex';
import {
  PHOTO_LABELS, clearFlags, deleteRegistration, loadHistory, moveRegistration, saveRegistrationEdit,
} from '../utils/registrationEdit';
import { clearThumbCache } from '../utils/thumbs';
import { DealerPicker, LocationInput, PhoneInput, YesNo, phoneRest } from './FormFields';
import PhotoInput from './PhotoInput';
import { Photo } from './Photos';
import { Alert, Badge } from './ui';

const fmtDateTime = (v) => {
  const d = v?.toDate ? v.toDate() : v instanceof Date ? v : null;
  return d ? d.toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';
};
const show = (v) => (v === true ? 'Evet' : v === false ? 'Hayır' : v == null || v === '' ? '(boş)' : String(v));
const errMsg = (e) => (e.code === 'permission-denied' ? 'Bu işlem için iznin yok.' : e.message);

/* ---------- Düzenleme paneli ---------- */

export function EditRegistration({ r, onDone, onCancel }) {
  const { user, userProfile } = useAuth();
  const initialRest = phoneRest(r.phone);
  const [f, setF] = useState({
    contactName: r.contactName || '',
    phone: initialRest || '',
    email: r.email || '',
    signRequest: r.signRequest ?? null,
    standRequest: r.standRequest ?? null,
  });
  const [loc, setLoc] = useState(null);
  const [photos, setPhotos] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));

  const save = async () => {
    const changes = {};
    if (f.contactName.trim() !== (r.contactName || '')) {
      if (!f.contactName.trim()) { setError('Görüşülen kişinin adı boş bırakılamaz.'); return; }
      changes.contactName = f.contactName.trim();
    }
    const newPhone = f.phone ? `05${f.phone}` : null;
    if (f.phone !== (initialRest || '')) {
      if (f.phone && f.phone.length !== 9) { setError('Telefon numarasını tamamla (05 sonrası 9 hane).'); return; }
      changes.phone = newPhone;
    }
    const email = f.email.trim().toLowerCase() || null;
    if (email !== (r.email || null)) {
      if (email && !/^\S+@\S+\.\S+$/.test(email)) { setError('E-posta adresini kontrol et.'); return; }
      changes.email = email;
    }
    if (f.signRequest !== (r.signRequest ?? null)) changes.signRequest = f.signRequest;
    if (f.standRequest !== (r.standRequest ?? null)) changes.standRequest = f.standRequest;
    if (loc) changes.location = loc;

    const chosen = Object.fromEntries(Object.entries(photos).filter(([, p]) => p));
    if (!Object.keys(changes).length && !Object.keys(chosen).length) { setError('Değişiklik yapmadın.'); return; }

    setSaving(true); setError('');
    try {
      const res = await saveRegistrationEdit(db, { r, changes, photos: chosen, user, profile: userProfile });
      if (chosen.exterior || chosen.interior) clearThumbCache(r.id);
      onDone(res?.queued);
    } catch (e) { setError(errMsg(e)); } finally { setSaving(false); }
  };

  return (
    <div className="editor">
      <div className="editor-title">Kaydı düzenle</div>
      <div className="stack">
        <div>
          <label className="label" htmlFor={`c-${r.id}`}>Görüşülen kişi</label>
          <input id={`c-${r.id}`} className="input input-lg" value={f.contactName} onChange={(e) => set('contactName')(e.target.value)} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <YesNo label="Tabela talebi" value={f.signRequest} onChange={set('signRequest')} />
          <YesNo label="Stant talebi" value={f.standRequest} onChange={set('standRequest')} />
        </div>
        <div>
          <span className="label">Telefon</span>
          <PhoneInput value={f.phone} onChange={set('phone')} />
          {r.phone && initialRest === null && <div className="text-xs muted mt-8">Kayıtlı numara: {r.phone}. Yeni numara yazarsan onun yerine geçer.</div>}
        </div>
        <div>
          <label className="label" htmlFor={`e-${r.id}`}>E-posta</label>
          <input id={`e-${r.id}`} type="email" className="input input-lg" value={f.email} onChange={(e) => set('email')(e.target.value)} autoCapitalize="off" />
        </div>
        <div>
          <span className="label">Konum</span>
          <div className="text-xs muted mb-12">Değiştirmek istemiyorsan boş bırak.{r.mapsUrl && <> Mevcut: <a href={r.mapsUrl} target="_blank" rel="noreferrer" className="btn-link text-xs">haritada aç</a></>}</div>
          <LocationInput value={loc} onChange={setLoc} />
        </div>
        <div>
          <span className="label">Fotoğraflar</span>
          <div className="text-xs muted mb-12">Sadece değiştirmek istediğin fotoğrafı seç. Eski fotoğraf silinmez, değişiklik geçmişinde saklanır.</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
            {Object.keys(PHOTO_LABELS).map((slot) => (
              <PhotoInput key={slot} label={`${PHOTO_LABELS[slot]}${r.photoFiles?.[slot] ? ' (değiştir)' : ' (ekle)'}`}
                value={photos[slot] || null} disabled={saving} onChange={(p) => setPhotos((x) => ({ ...x, [slot]: p }))} />
            ))}
          </div>
        </div>
      </div>
      {error && <Alert tone="danger" style={{ marginTop: 12 }}>{error}</Alert>}
      <div className="row mt-16">
        <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Kaydediliyor…' : 'Değişiklikleri kaydet'}</button>
        <button className="btn btn-secondary" onClick={onCancel} disabled={saving}>Vazgeç</button>
      </div>
    </div>
  );
}

/* ---------- Sahip işlemleri ---------- */

export function OwnerActions({ r, onChanged, onDeleted }) {
  const { user, userProfile } = useAuth();
  const [mode, setMode] = useState(null); // 'move'
  const [index, setIndex] = useState(null);
  const [target, setTarget] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { if (mode === 'move' && !index) getDealerIndex(db).then(setIndex).catch((e) => setError(e.message)); }, [mode, index]);

  const run = async (fn) => {
    setBusy(true); setError('');
    try { await fn(); } catch (e) { setError(errMsg(e)); } finally { setBusy(false); }
  };

  const doMove = () => run(async () => {
    if (!target) { setError('Taşınacak bayiyi seç.'); return; }
    if (target.i === r.dealerId) { setError('Kayıt zaten bu bayide.'); return; }
    if (!window.confirm(`Kayıt, fotoğraflarıyla birlikte "${target.n}" bayisine taşınsın mı?`)) return;
    await moveRegistration(db, { r, dealer: target, user, profile: userProfile });
    onDeleted(`Kayıt "${target.n}" bayisine taşındı.`);
  });

  const doDelete = () => run(async () => {
    if (!window.confirm('Bu kayıt, fotoğrafları ve değişiklik geçmişiyle birlikte kalıcı olarak silinecek. Emin misin?')) return;
    if (!window.confirm('Bu işlem geri alınamaz. Silmeyi onaylıyor musun?')) return;
    await deleteRegistration(db, { r });
    onDeleted('Kayıt silindi.');
  });

  return (
    <div className="owner-box">
      <div className="text-xs" style={{ fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--muted)' }}>Sahip işlemleri</div>
      <div className="row mt-8" style={{ gap: 16 }}>
        <button className="btn-link text-sm" disabled={busy} onClick={() => setMode(mode === 'move' ? null : 'move')}>Başka bayiye taşı</button>
        {r.needsReview && <button className="btn-link text-sm" disabled={busy} onClick={() => run(async () => { await clearFlags(db, { r, user, profile: userProfile, which: 'review' }); onChanged(); })}>"Kontrol gerekli" işaretini kaldır</button>}
        {r.attention && <button className="btn-link text-sm" disabled={busy} onClick={() => run(async () => { await clearFlags(db, { r, user, profile: userProfile, which: 'attention' }); onChanged(); })}>Dikkat işaretini kaldır</button>}
        <button className="btn-link text-sm" style={{ color: 'var(--danger)' }} disabled={busy} onClick={doDelete}>Kaydı sil</button>
      </div>
      {mode === 'move' && (
        <div className="mt-12">
          {index ? <DealerPicker entries={index.entries} value={target} onChange={setTarget} /> : <div className="text-sm muted">Bayi listesi yükleniyor…</div>}
          <div className="row mt-12">
            <button className="btn btn-primary btn-sm" disabled={busy || !target} onClick={doMove}>{busy ? 'Taşınıyor…' : 'Taşı'}</button>
            <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => { setMode(null); setTarget(null); }}>Vazgeç</button>
          </div>
        </div>
      )}
      {error && <Alert tone="danger" style={{ marginTop: 10 }}>{error}</Alert>}
    </div>
  );
}

/* ---------- Değişiklik geçmişi ---------- */

export function History({ r, onOpenPhoto }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setItems(null);
    loadHistory(db, r.id).then(setItems).catch((e) => setError(e.message));
  }, [open, r.id, r.editCount]);

  if (!r.editCount) return null;
  return (
    <div className="mt-12">
      <button className="btn-link text-sm" onClick={() => setOpen((x) => !x)}>
        {open ? 'Değişiklik geçmişini gizle' : `Değişiklik geçmişi (${r.editCount})`}
      </button>
      {open && (
        <div className="history">
          {error && <Alert tone="danger">{error}</Alert>}
          {!items && !error && <div className="text-sm muted">Yükleniyor…</div>}
          {items?.map((h) => (
            <div key={h.id} className="history-item">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <strong className="text-sm">{h.byName}</strong>
                <span className="text-xs muted num">{fmtDateTime(h.at)}</span>
              </div>
              {h.attention && <div className="mt-8"><Badge tone="warn">Kurulumdan sonra değiştirildi</Badge></div>}
              <ul className="history-list">
                {(h.changes || []).map((c, i) => (
                  <li key={i}>
                    <span className="muted">{c.label}:</span>{' '}
                    {c.field === 'location'
                      ? <>{c.from ? <a href={c.from} target="_blank" rel="noreferrer" className="btn-link text-sm">eski konum</a> : '(yok)'} → {c.to ? <a href={c.to} target="_blank" rel="noreferrer" className="btn-link text-sm">yeni konum</a> : '(yok)'}</>
                      : <><s className="muted">{show(c.from)}</s> → <strong>{show(c.to)}</strong></>}
                  </li>
                ))}
                {(h.photos || []).map((p, i) => (
                  <li key={`p${i}`}>
                    <span className="muted">{p.label} fotoğrafı {p.oldPhotoId ? 'değiştirildi' : 'eklendi'}</span>
                    <div className="history-photos">
                      {p.oldPhotoId && <Photo info={{ photoId: p.oldPhotoId }} label="Eski" onOpen={onOpenPhoto} />}
                      <Photo info={{ photoId: p.newPhotoId }} label="Yeni" onOpen={onOpenPhoto} />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

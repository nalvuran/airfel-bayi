// src/pages/NewRegistrationPage.jsx
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { fold, getDealerIndex } from '../utils/dealerIndex';
import { coordsFromMapsUrl, getGpsPosition, isMapsLink, isShortMapsLink, mapsUrlFor } from '../utils/geo';
import { createRegistration } from '../utils/registrations';
import PhotoInput from '../components/PhotoInput';
import { clearRegistrationsCache } from './RegistrationsPage';

const C = {
  red: '#B91724', redBg: '#fdf0f0', text: '#2b2b2b', muted: '#7a7570',
  border: '#e5e3df', soft: '#f8f7f5', ok: '#1f7a4d', okBg: '#eaf6ef', warn: '#9a6400', warnBg: '#fff6e0',
};
const card = { background: 'white', border: `1px solid ${C.border}`, borderRadius: 12, padding: 18, marginBottom: 14 };
const h2 = { fontSize: 16, margin: '0 0 12px', color: C.text };
const input = {
  border: `1.5px solid ${C.border}`, borderRadius: 8, padding: '11px 12px', fontSize: 16, // 16px: iPhone'da zoom yapmasın
  background: 'white', color: C.text, width: '100%', boxSizing: 'border-box',
};
const lbl = { display: 'block', fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 6 };
const req = <span style={{ color: C.red }}> *</span>;

/* ---------- Bayi seçici ---------- */

function DealerPicker({ entries, value, onChange, myKey }) {
  const [q, setQ] = useState('');
  const results = useMemo(() => {
    const words = fold(q).split(' ').filter(Boolean);
    if (!words.length) return [];
    return entries
      .filter((e) => words.every((w) => e.search.includes(w)))
      .sort((a, b) => (b.k === myKey) - (a.k === myKey) || b.q - a.q)
      .slice(0, 8);
  }, [q, entries, myKey]);

  if (value) {
    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', background: C.soft, borderRadius: 8, padding: '12px 14px' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{value.n}</div>
          <div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>{value.i} · {[value.d, value.c].filter(Boolean).join(', ')}</div>
        </div>
        <button type="button" onClick={() => { onChange(null); setQ(''); }} style={{ background: 'none', border: 'none', color: C.red, fontWeight: 600, fontSize: 14, cursor: 'pointer', whiteSpace: 'nowrap' }}>
          Değiştir
        </button>
      </div>
    );
  }
  return (
    <div>
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Bayi adı, Platform ID veya ilçe yaz" style={input} autoFocus />
      {q && results.length === 0 && <div style={{ fontSize: 13, color: C.muted, marginTop: 8 }}>Eşleşen bayi yok. Kayıt sadece listedeki bayilere girilebilir.</div>}
      {results.length > 0 && (
        <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, marginTop: 8, overflow: 'hidden' }}>
          {results.map((e, i) => (
            <button
              type="button" key={e.i} onClick={() => onChange(e)}
              style={{ display: 'block', width: '100%', textAlign: 'left', background: 'white', border: 'none', borderTop: i ? `1px solid ${C.border}` : 'none', padding: '11px 12px', cursor: 'pointer', color: C.text }}
            >
              <div style={{ fontWeight: 600, fontSize: 14 }}>{e.n}</div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                {e.i} · {[e.d, e.c].filter(Boolean).join(', ')} · {e.k === myKey ? 'senin bayin' : e.r}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- Evet / Hayır ---------- */

function YesNo({ label, value, onChange }) {
  const b = (active) => ({
    flex: 1, padding: '11px 0', fontSize: 15, fontWeight: 600, cursor: 'pointer', borderRadius: 8,
    border: `1.5px solid ${active ? C.red : C.border}`, background: active ? C.redBg : 'white', color: active ? C.red : C.text,
  });
  return (
    <div>
      <span style={lbl}>{label}{req}</span>
      <div style={{ display: 'flex', gap: 10 }}>
        <button type="button" style={b(value === true)} onClick={() => onChange(true)}>Evet</button>
        <button type="button" style={b(value === false)} onClick={() => onChange(false)}>Hayır</button>
      </div>
    </div>
  );
}

/* ---------- Konum ---------- */

function LocationInput({ value, onChange }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [link, setLink] = useState('');

  const useGps = async () => {
    setBusy(true); setError('');
    try {
      const p = await getGpsPosition();
      onChange({ location: { lat: p.lat, lng: p.lng }, locationSource: 'gps', locationAccuracy: p.accuracy, mapsUrl: mapsUrlFor(p) });
      setLink('');
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const onLink = (v) => {
    setLink(v); setError('');
    const url = v.trim();
    if (!url) { onChange(null); return; }
    const c = coordsFromMapsUrl(url);
    if (c) onChange({ location: c, locationSource: 'mapsLink', locationAccuracy: null, mapsUrl: url });
    else if (isMapsLink(url)) onChange({ location: null, locationSource: 'mapsLink', locationAccuracy: null, mapsUrl: url });
    else onChange(null);
  };

  const status = () => {
    if (!value) {
      if (link.trim()) return { tone: C.red, text: 'Bu bir Google Maps linki gibi görünmüyor.' };
      return null;
    }
    if (value.locationSource === 'gps') return { tone: C.ok, text: `✓ GPS konumu alındı (±${value.locationAccuracy} m)` };
    if (value.location) return { tone: C.ok, text: '✓ Linkten konum okundu' };
    return {
      tone: C.warn,
      text: isShortMapsLink(value.mapsUrl)
        ? 'Link kaydedilecek. Kısa linkten koordinat okunamıyor; haritada gösterim için link kullanılacak.'
        : 'Link kaydedilecek, ama içinden koordinat okunamadı.',
    };
  };
  const st = status();

  return (
    <div>
      <button type="button" onClick={useGps} disabled={busy}
        style={{ width: '100%', padding: '12px 0', fontSize: 15, fontWeight: 600, borderRadius: 8, cursor: busy ? 'wait' : 'pointer', border: `1.5px solid ${C.border}`, background: 'white', color: C.text }}>
        {busy ? 'Konum alınıyor…' : '📍 Şu anki konumumu kullan'}
      </button>
      <div style={{ textAlign: 'center', fontSize: 12, color: C.muted, margin: '10px 0' }}>ya da</div>
      <input type="url" value={link} onChange={(e) => onLink(e.target.value)} placeholder="Google Maps linkini yapıştır" style={input} />
      {st && <div style={{ fontSize: 13, color: st.tone, marginTop: 8 }}>{st.text}</div>}
      {value?.mapsUrl && (
        <a href={value.mapsUrl} target="_blank" rel="noreferrer" style={{ display: 'inline-block', fontSize: 13, color: C.red, marginTop: 6 }}>Haritada kontrol et</a>
      )}
      {error && <div style={{ fontSize: 13, color: C.red, marginTop: 8 }}>{error}</div>}
    </div>
  );
}

/* ---------- Sayfa ---------- */

export default function NewRegistrationPage() {
  const { user, userProfile } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const myKey = userProfile?.salesRepKey || null;

  const [index, setIndex] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [dealer, setDealer] = useState(null);
  const [f, setF] = useState({ contactName: '', companyTitle: '', distributor: '', phone: '', email: '', signRequest: null, standRequest: null });
  const [loc, setLoc] = useState(null);
  const [photos, setPhotos] = useState({ exterior: null, interior: null });
  const [errors, setErrors] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    getDealerIndex(db).then(setIndex).catch((e) => setLoadError(e.message));
  }, []);

  // Bayi detayından gelindiyse bayiyi otomatik seç
  useEffect(() => {
    const id = params.get('dealer');
    if (id && index && !dealer) {
      const e = index.entries.find((x) => x.i === id);
      if (e) pickDealer(e);
    }
  }, [index]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const pickDealer = (e) => {
    setDealer(e);
    if (e) setF((x) => ({ ...x, companyTitle: x.companyTitle || e.n, distributor: x.distributor || e.x }));
  };

  const validate = () => {
    const e = [];
    if (!dealer) e.push('Bayi seç');
    if (!f.contactName.trim()) e.push('Görüşülen kişinin adını yaz');
    if (!f.companyTitle.trim()) e.push('Firma ünvanını yaz');
    if (f.signRequest === null) e.push('Tabela talebini seç');
    if (f.standRequest === null) e.push('Stant talebini seç');
    if (!loc) e.push('Konum ekle (GPS ya da Google Maps linki)');
    if (!photos.exterior) e.push('Dış cephe fotoğrafı ekle');
    if (!photos.interior) e.push('Dükkan içi fotoğrafı ekle');
    if (f.email.trim() && !/^\S+@\S+\.\S+$/.test(f.email.trim())) e.push('E-posta adresini kontrol et');
    return e;
  };

  const submit = async () => {
    const e = validate();
    setErrors(e); setSaveError('');
    if (e.length) { window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }); return; }
    setSaving(true);
    try {
      const phoneDigits = f.phone.replace(/\D/g, '');
      await createRegistration(db, {
        user, profile: userProfile, photos,
        fields: {
          dealerId: dealer.i,
          platformId: dealer.i.startsWith('NOID-') ? null : dealer.i,
          dealerName: dealer.n,
          contactName: f.contactName.trim(),
          companyTitle: f.companyTitle.trim(),
          distributor: f.distributor.trim() || null,
          signRequest: f.signRequest,
          standRequest: f.standRequest,
          phone: phoneDigits ? (phoneDigits.length === 10 ? `0${phoneDigits}` : phoneDigits) : null,
          email: f.email.trim().toLowerCase() || null,
          location: loc.location,
          locationSource: loc.locationSource,
          locationAccuracy: loc.locationAccuracy,
          mapsUrl: loc.mapsUrl,
        },
      });
      clearRegistrationsCache();
      navigate(`/dealers/${encodeURIComponent(dealer.i)}`, { state: { saved: true } });
    } catch (err) {
      setSaveError(err.code === 'permission-denied'
        ? 'Kaydetme izni yok. Çıkış yapıp tekrar giriş yap; sorun sürerse yöneticine haber ver.'
        : `Kayıt kaydedilemedi: ${err.message}. İnternet bağlantını kontrol edip tekrar dene; girdiğin bilgiler bu sayfada duruyor.`);
    } finally {
      setSaving(false);
    }
  };

  if (loadError) return <div style={{ ...card, color: C.red, textAlign: 'left' }}>Bayi listesi yüklenemedi: {loadError}</div>;

  return (
    <div style={{ textAlign: 'left', maxWidth: 640, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, color: C.text, margin: '4px 0 16px' }}>Yeni saha kaydı</h1>

      <section style={card}>
        <h2 style={h2}>Bayi{req}</h2>
        {index ? <DealerPicker entries={index.entries} value={dealer} onChange={pickDealer} myKey={myKey} /> : <p style={{ color: C.muted, margin: 0 }}>Bayi listesi yükleniyor…</p>}
      </section>

      <section style={card}>
        <h2 style={h2}>Görüşme</h2>
        <div style={{ display: 'grid', gap: 14 }}>
          <div>
            <label style={lbl}>Görüşülen kişi (ad soyad){req}</label>
            <input value={f.contactName} onChange={(e) => set('contactName')(e.target.value)} style={input} autoComplete="off" />
          </div>
          <div>
            <label style={lbl}>Firma ünvanı{req}</label>
            <input value={f.companyTitle} onChange={(e) => set('companyTitle')(e.target.value)} style={input} />
          </div>
          <div>
            <label style={lbl}>Distribütör</label>
            <input value={f.distributor} onChange={(e) => set('distributor')(e.target.value)} style={input} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <YesNo label="Tabela talebi" value={f.signRequest} onChange={set('signRequest')} />
            <YesNo label="Stant talebi" value={f.standRequest} onChange={set('standRequest')} />
          </div>
          <div>
            <label style={lbl}>Telefon</label>
            <input type="tel" inputMode="tel" value={f.phone} onChange={(e) => set('phone')(e.target.value)} style={input} placeholder="05xx xxx xx xx" />
          </div>
          <div>
            <label style={lbl}>E-posta</label>
            <input type="email" inputMode="email" value={f.email} onChange={(e) => set('email')(e.target.value)} style={input} autoCapitalize="off" />
          </div>
        </div>
      </section>

      <section style={card}>
        <h2 style={h2}>Konum{req}</h2>
        <LocationInput value={loc} onChange={setLoc} />
      </section>

      <section style={card}>
        <h2 style={h2}>Fotoğraflar</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
          <PhotoInput label="Dış cephe" required value={photos.exterior} onChange={(p) => setPhotos((x) => ({ ...x, exterior: p }))} disabled={saving} />
          <PhotoInput label="Dükkan içi" required value={photos.interior} onChange={(p) => setPhotos((x) => ({ ...x, interior: p }))} disabled={saving} />
        </div>
        <p style={{ fontSize: 12, color: C.muted, margin: '12px 0 0' }}>
          Tabela veya stant kurulduktan sonraki fotoğrafları, kaydı kaydettikten sonra bayi sayfasından ekleyebilirsin.
        </p>
      </section>

      {errors.length > 0 && (
        <div style={{ background: C.warnBg, color: C.warn, borderRadius: 8, padding: '12px 14px', fontSize: 14, marginBottom: 14 }}>
          Kaydetmeden önce: {errors.join(', ')}.
        </div>
      )}
      {saveError && <div style={{ background: C.redBg, color: C.red, borderRadius: 8, padding: '12px 14px', fontSize: 14, marginBottom: 14 }}>{saveError}</div>}

      <div style={{ display: 'flex', gap: 12, marginBottom: 32 }}>
        <button type="button" onClick={submit} disabled={saving}
          style={{ flex: 1, padding: '14px 0', fontSize: 16, fontWeight: 700, border: 'none', borderRadius: 10, color: 'white', background: saving ? '#d9d5d0' : C.red, cursor: saving ? 'wait' : 'pointer' }}>
          {saving ? 'Kaydediliyor…' : 'Kaydı kaydet'}
        </button>
        <Link to={dealer ? `/dealers/${encodeURIComponent(dealer.i)}` : '/dealers'}
          style={{ padding: '14px 18px', fontSize: 15, fontWeight: 600, borderRadius: 10, border: `1.5px solid ${C.border}`, color: C.text, textDecoration: 'none', background: 'white' }}>
          Vazgeç
        </Link>
      </div>
    </div>
  );
}

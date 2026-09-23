// src/pages/NewRegistrationPage.jsx
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { fold, getDealerIndex } from '../utils/dealerIndex';
import { coordsFromMapsUrl, getGpsPosition, isMapsLink, isShortMapsLink, mapsUrlFor } from '../utils/geo';
import { createRegistration } from '../utils/registrations';
import PhotoInput from '../components/PhotoInput';
import { Alert, Card, PageHeader, Skeleton } from '../components/ui';
import { clearRegistrationsCache } from './RegistrationsPage';

const Req = () => <span className="req"> *</span>;

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
      <div className="row" style={{ justifyContent: 'space-between', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', flexWrap: 'nowrap' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>{value.n}</div>
          <div className="text-sm muted" style={{ marginTop: 2 }}>{value.i} · {[value.d, value.c].filter(Boolean).join(', ')}</div>
        </div>
        <button type="button" className="btn-link" onClick={() => { onChange(null); setQ(''); }}>Değiştir</button>
      </div>
    );
  }
  return (
    <div>
      <input type="search" className="input input-lg" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Bayi adı, Platform ID veya ilçe yaz" autoFocus />
      {q && results.length === 0 && <div className="text-sm muted mt-8">Eşleşen bayi yok. Kayıt sadece listedeki bayilere girilebilir.</div>}
      {results.length > 0 && (
        <div className="card card-flush mt-8" style={{ boxShadow: 'none' }}>
          {results.map((e) => (
            <button type="button" key={e.i} onClick={() => onChange(e)} className="list-row"
              style={{ width: '100%', textAlign: 'left', background: 'var(--surface)', border: 'none', borderTop: '1px solid var(--border)', cursor: 'pointer' }}>
              <div className="list-row-title" style={{ fontSize: 14 }}>{e.n}</div>
              <div className="list-row-meta">{e.i} · {[e.d, e.c].filter(Boolean).join(', ')} · {e.k === myKey ? 'senin bayin' : e.r}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- Evet / Hayır: seçili Evet yeşil, seçili Hayır kırmızı ---------- */

function YesNo({ label, value, onChange }) {
  const b = (active, yes) => {
    const fg = yes ? 'var(--green)' : 'var(--danger)';
    const bg = yes ? 'var(--green-soft)' : 'var(--danger-soft)';
    return {
      flex: 1, padding: '11px 0', fontSize: 15, fontWeight: 800, cursor: 'pointer', borderRadius: 10,
      border: `1.5px solid ${active ? fg : 'var(--border)'}`, background: active ? bg : 'var(--surface)', color: active ? fg : 'var(--ink)',
      transition: 'background-color .15s, border-color .15s, color .15s',
    };
  };
  return (
    <div>
      <span className="label">{label}<Req /></span>
      <div style={{ display: 'flex', gap: 10 }}>
        <button type="button" style={b(value === true, true)} onClick={() => onChange(true)} aria-pressed={value === true}>Evet</button>
        <button type="button" style={b(value === false, false)} onClick={() => onChange(false)} aria-pressed={value === false}>Hayır</button>
      </div>
    </div>
  );
}

/* ---------- Telefon: "05" sabit, temsilci kalan 9 haneyi girer ---------- */

const fmtPhoneRest = (d) => [d.slice(0, 2), d.slice(2, 5), d.slice(5, 7), d.slice(7, 9)].filter(Boolean).join(' ');

function PhoneInput({ value, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'stretch', border: '1.5px solid var(--border)', borderRadius: 8, background: 'var(--surface)', overflow: 'hidden' }}>
      <span style={{ display: 'flex', alignItems: 'center', padding: '0 4px 0 14px', fontSize: 16, fontWeight: 800, userSelect: 'none' }}>05</span>
      <input
        type="tel" inputMode="numeric" autoComplete="off" className="input input-lg"
        value={fmtPhoneRest(value)}
        onChange={(e) => {
          let d = e.target.value.replace(/\D/g, '');
          // Kopyala-yapıştırda başta gelen 0 / 05 / 905 / +905 kısmını at
          if (d.length > 9) d = d.replace(/^(90)?0?5/, '');
          onChange(d.slice(0, 9));
        }}
        placeholder="XX XXX XX XX"
        style={{ border: 'none', borderRadius: 0, paddingLeft: 2 }}
      />
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

  let status = null;
  if (!value && link.trim()) status = { tone: 'danger', text: 'Bu bir Google Maps linki gibi görünmüyor.' };
  else if (value?.locationSource === 'gps') status = { tone: 'success', text: `✓ GPS konumu alındı (±${value.locationAccuracy} m)` };
  else if (value?.location) status = { tone: 'success', text: '✓ Linkten konum okundu' };
  else if (value) status = {
    tone: 'warn',
    text: isShortMapsLink(value.mapsUrl)
      ? 'Link kaydedilecek. Kısa linkten koordinat okunamıyor; haritada gösterim için link kullanılacak.'
      : 'Link kaydedilecek, ama içinden koordinat okunamadı.',
  };

  return (
    <div>
      <button type="button" className="btn btn-secondary btn-block btn-lg" onClick={useGps} disabled={busy}>
        {busy ? 'Konum alınıyor…' : '📍 Şu anki konumumu kullan'}
      </button>
      <div className="text-xs muted" style={{ textAlign: 'center', margin: '10px 0', fontWeight: 700 }}>ya da</div>
      <input type="url" className="input input-lg" value={link} onChange={(e) => onLink(e.target.value)} placeholder="Google Maps linkini yapıştır" />
      {status && <Alert tone={status.tone} style={{ marginTop: 10, padding: '9px 12px', fontSize: 13 }}>{status.text}</Alert>}
      {value?.mapsUrl && <a href={value.mapsUrl} target="_blank" rel="noreferrer" className="btn-link text-sm" style={{ display: 'inline-block', marginTop: 8 }}>Haritada kontrol et</a>}
      {error && <Alert tone="danger" style={{ marginTop: 10, fontSize: 13 }}>{error}</Alert>}
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

  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const pickDealer = (e) => {
    setDealer(e);
    if (e) setF((x) => ({ ...x, companyTitle: x.companyTitle || e.n, distributor: x.distributor || e.x }));
  };

  // Bayi detayından gelindiyse bayiyi otomatik seç
  useEffect(() => {
    const id = params.get('dealer');
    if (id && index && !dealer) {
      const e = index.entries.find((x) => x.i === id);
      if (e) pickDealer(e);
    }
  }, [index]); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (f.phone && f.phone.length !== 9) e.push('Telefon numarasını tamamla (05 sonrası 9 hane)');
    if (f.email.trim() && !/^\S+@\S+\.\S+$/.test(f.email.trim())) e.push('E-posta adresini kontrol et');
    return e;
  };

  const submit = async () => {
    const e = validate();
    setErrors(e); setSaveError('');
    if (e.length) { window.scrollTo({ top: document.body.scrollHeight }); return; }
    setSaving(true);
    try {
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
          phone: f.phone ? `05${f.phone}` : null,
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

  if (loadError) return <div className="page-narrow"><Alert tone="danger">Bayi listesi yüklenemedi: {loadError}</Alert></div>;

  return (
    <div className="page-narrow">
      <PageHeader title="Yeni saha kaydı" />

      <Card title={<>Bayi<Req /></>}>
        {index ? <DealerPicker entries={index.entries} value={dealer} onChange={pickDealer} myKey={myKey} /> : <Skeleton height={48} radius={8} />}
      </Card>

      <Card title="Görüşme">
        <div className="stack">
          <div>
            <label className="label" htmlFor="f-contact">Görüşülen kişi (ad soyad)<Req /></label>
            <input id="f-contact" className="input input-lg" value={f.contactName} onChange={(e) => set('contactName')(e.target.value)} autoComplete="off" />
          </div>
          <div>
            <label className="label" htmlFor="f-title">Firma ünvanı<Req /></label>
            <input id="f-title" className="input input-lg" value={f.companyTitle} onChange={(e) => set('companyTitle')(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="f-dist">Distribütör</label>
            <input id="f-dist" className="input input-lg" value={f.distributor} onChange={(e) => set('distributor')(e.target.value)} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <YesNo label="Tabela talebi" value={f.signRequest} onChange={set('signRequest')} />
            <YesNo label="Stant talebi" value={f.standRequest} onChange={set('standRequest')} />
          </div>
          <div>
            <span className="label">Telefon</span>
            <PhoneInput value={f.phone} onChange={set('phone')} />
          </div>
          <div>
            <label className="label" htmlFor="f-email">E-posta</label>
            <input id="f-email" type="email" inputMode="email" className="input input-lg" value={f.email} onChange={(e) => set('email')(e.target.value)} autoCapitalize="off" />
          </div>
        </div>
      </Card>

      <Card title={<>Konum<Req /></>}>
        <LocationInput value={loc} onChange={setLoc} />
      </Card>

      <Card title="Fotoğraflar" desc="Tabela veya stant kurulduktan sonraki fotoğrafları, kaydı kaydettikten sonra bayi sayfasından ekleyebilirsin.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14 }}>
          <PhotoInput label="Dış cephe" required value={photos.exterior} onChange={(p) => setPhotos((x) => ({ ...x, exterior: p }))} disabled={saving} />
          <PhotoInput label="Dükkan içi" required value={photos.interior} onChange={(p) => setPhotos((x) => ({ ...x, interior: p }))} disabled={saving} />
        </div>
      </Card>

      <div className="mt-16">
        {errors.length > 0 && <Alert tone="warn">Kaydetmeden önce: {errors.join(', ')}.</Alert>}
        {saveError && <Alert tone="danger">{saveError}</Alert>}
      </div>

      <div className="row mt-16" style={{ marginBottom: 32, flexWrap: 'nowrap' }}>
        <button type="button" className="btn btn-primary btn-lg" style={{ flex: 1 }} onClick={submit} disabled={saving}>
          {saving ? 'Kaydediliyor…' : 'Kaydı kaydet'}
        </button>
        <Link to={dealer ? `/dealers/${encodeURIComponent(dealer.i)}` : '/dealers'} className="btn btn-secondary btn-lg">Vazgeç</Link>
      </div>
    </div>
  );
}

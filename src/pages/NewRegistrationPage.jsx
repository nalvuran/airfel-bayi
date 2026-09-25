// src/pages/NewRegistrationPage.jsx
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { getDealerIndex } from '../utils/dealerIndex';
import { DealerPicker, LocationInput, PhoneInput, Req, YesNo } from '../components/FormFields';
import { createRegistration } from '../utils/registrations';
import PhotoInput from '../components/PhotoInput';
import { BrandPicker, FollowUpField, RequestDraftEditor, brandFields, brandStateFromReg, emptyDraft } from '../components/FeatureFields';
import { getRegistrations } from '../utils/registrationStore';
import { loadOpenFollowUps } from '../utils/followUps';
import { validateRequestDraft } from '../utils/requests';
import { Alert, Card, PageHeader, Skeleton } from '../components/ui';
import { clearRegistrationsCache } from './RegistrationsPage';

/* ---------- Sayfa ---------- */

export default function NewRegistrationPage() {
  const { user, userProfile } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const myKey = userProfile?.salesRepKey || null;

  const [index, setIndex] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [dealer, setDealer] = useState(null);
  const [f, setF] = useState({ contactName: '', phone: '', email: '', signRequest: null, standRequest: null });
  const [loc, setLoc] = useState(null);
  const [photos, setPhotos] = useState({ exterior: null, interior: null });
  const [brands, setBrands] = useState(brandStateFromReg(null));
  const [brandsFrom, setBrandsFrom] = useState(null); // bayinin son kaydının tarihi (hazır gelen markalar için)
  const [drafts, setDrafts] = useState([]);
  const [followUp, setFollowUp] = useState(null);
  const [openFollowUp, setOpenFollowUp] = useState(null);
  const [errors, setErrors] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    getDealerIndex(db).then(setIndex).catch((e) => setLoadError(e.message));
  }, []);

  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const pickDealer = (e) => {
    setDealer(e);
    setBrands(brandStateFromReg(null)); setBrandsFrom(null); setOpenFollowUp(null);
    if (!e) return;
    // Markalar bayinin son kaydından hazır gelsin; temsilci sadece değişeni düzeltsin
    getRegistrations(db).then(({ list }) => {
      const last = list.find((r) => r.dealerId === e.i && Array.isArray(r.brands));
      if (last) { setBrands(brandStateFromReg(last)); setBrandsFrom(last.date); }
    }).catch(() => {});
    loadOpenFollowUps(db).then((l) => setOpenFollowUp(l.find((f) => f.dealerId === e.i) || null)).catch(() => {});
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
    if (f.signRequest === null) e.push('Tabela talebini seç');
    if (f.standRequest === null) e.push('Stant talebini seç');
    if (!loc) e.push('Konum ekle (GPS ya da Google Maps linki)');
    if (!photos.exterior) e.push('Dış cephe fotoğrafı ekle');
    if (!photos.interior) e.push('Dükkan içi fotoğrafı ekle');
    if (f.phone && f.phone.length !== 9) e.push('Telefon numarasını tamamla (05 sonrası 9 hane)');
    if (f.email.trim() && !/^\S+@\S+\.\S+$/.test(f.email.trim())) e.push('E-posta adresini kontrol et');
    drafts.forEach((d, i) => { const m = validateRequestDraft(d); if (m) e.push(`${i + 1}. talep: ${m.replace(/\.$/, '')}`); });
    return e;
  };

  const submit = async () => {
    const e = validate();
    setErrors(e); setSaveError('');
    if (e.length) { window.scrollTo({ top: document.body.scrollHeight }); return; }
    setSaving(true);
    try {
      const { queued } = await createRegistration(db, {
        user, profile: userProfile, photos,
        dealer, requests: drafts, followUpDate: followUp, hadOpenFollowUp: !!openFollowUp,
        fields: {
          dealerId: dealer.i,
          platformId: dealer.i.startsWith('NOID-') ? null : dealer.i,
          dealerName: dealer.n,
          contactName: f.contactName.trim(),
          companyTitle: dealer.n,
          distributor: dealer.x || null,
          signRequest: f.signRequest,
          standRequest: f.standRequest,
          phone: f.phone ? `05${f.phone}` : null,
          email: f.email.trim().toLowerCase() || null,
          location: loc.location,
          locationSource: loc.locationSource,
          locationAccuracy: loc.locationAccuracy,
          mapsUrl: loc.mapsUrl,
          ...brandFields(brands),
          followUpDate: followUp || null,
        },
      });
      clearRegistrationsCache();
      // Bağlantı yoksa bayi sayfası açılamayabilir; kayıt telefondaki listede görünür
      if (queued) navigate('/registrations', { state: { queued: true } });
      else navigate(`/dealers/${encodeURIComponent(dealer.i)}`, { state: { saved: true } });
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
          {dealer && (
            <div className="info-grid" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px' }}>
              <div><div className="info-label">Firma ünvanı</div><div className="info-value">{dealer.n}</div></div>
              <div><div className="info-label">Distribütör</div><div className="info-value">{dealer.x || '-'}</div></div>
            </div>
          )}
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

      <Card title="Bayide hangi markalar var?"
        desc={brandsFrom ? `Bayinin ${brandsFrom.toLocaleDateString('tr-TR')} tarihli kaydından hazır geldi; değişen varsa düzelt.` : 'Bayinin sattığı markaları işaretle.'}>
        <BrandPicker value={brands.brands} other={brands.other} qty={brands.qty} otherQty={brands.otherQty} onChange={setBrands} disabled={saving} />
      </Card>

      <Card title="Bayinin talebi var mı?" desc="Katalog, eğitim, servis sorunu ya da başka bir talep. Yoksa boş bırak.">
        {drafts.map((d) => (
          <RequestDraftEditor key={d.key} draft={d} disabled={saving}
            onChange={(nd) => setDrafts((x) => x.map((y) => (y.key === d.key ? nd : y)))}
            onRemove={() => setDrafts((x) => x.filter((y) => y.key !== d.key))} />
        ))}
        <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: drafts.length ? 12 : 0 }} disabled={saving}
          onClick={() => setDrafts((x) => [...x, emptyDraft()])}>
          + Talep ekle
        </button>
      </Card>

      <Card title="Tekrar uğra (isteğe bağlı)"
        desc={openFollowUp
          ? `Bu bayi için ${openFollowUp.date.split('-').reverse().join('.')} tarihli bir takip vardı; bu kayıtla kapanacak. İstersen yeni bir tarih seç.`
          : 'Bu bayiye tekrar uğraman gereken bir tarih varsa seç; ana sayfanda hatırlatılır.'}>
        <FollowUpField value={followUp} onChange={setFollowUp} dealerName={dealer?.n} disabled={saving} />
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

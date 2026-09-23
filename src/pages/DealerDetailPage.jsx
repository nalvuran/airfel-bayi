// src/pages/DealerDetailPage.jsx
import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { addAfterPhotos } from '../utils/registrations';
import PhotoInput from '../components/PhotoInput';
import DevreyeTable from '../components/DevreyeTable';
import { Photo, Lightbox, SLOT_LABEL } from '../components/Photos';
import { Alert, Badge, Card, Info, PageHeader, Skeleton, StatusBadge } from '../components/ui';
import { clearRegistrationsCache } from './RegistrationsPage';

// Devreye alım rakamlarını tüm kullanıcılara göster. Kısıtlamak gerekirse burayı değiştir.
const SHOW_DEVREYE = true;

const toDate = (v) => (v?.toDate ? v.toDate() : v instanceof Date ? v : null);
const fmtDate = (v, withTime) => {
  const d = toDate(v);
  if (!d) return '-';
  return withTime
    ? d.toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('tr-TR');
};
const yesNo = (v) => (v === true ? <Badge tone="success">Evet</Badge> : v === false ? <Badge>Hayır</Badge> : '-');

/* ---------- Sonrası fotoğrafları ---------- */

function AfterPhotos({ r, onSaved }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [photos, setPhotos] = useState({ exteriorAfter: null, interiorAfter: null });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const missing = ['exteriorAfter', 'interiorAfter'].filter((s) => !r.photoFiles?.[s] && !r.photos?.[s]);
  if (!missing.length) return null;

  const save = async () => {
    if (!missing.some((s) => photos[s])) { setError('En az bir fotoğraf ekle.'); return; }
    setSaving(true); setError('');
    try {
      const toSave = Object.fromEntries(missing.map((s) => [s, photos[s]]));
      await addAfterPhotos(db, { regId: r.id, photos: toSave, user });
      clearRegistrationsCache();
      setOpen(false); setPhotos({ exteriorAfter: null, interiorAfter: null });
      onSaved();
    } catch (e) {
      setError(e.code === 'permission-denied' ? 'Bu kayda fotoğraf ekleme iznin yok.' : `Kaydedilemedi: ${e.message}`);
    } finally { setSaving(false); }
  };

  if (!open) {
    return (
      <button className="btn btn-secondary mt-16" style={{ whiteSpace: 'normal', textAlign: 'center', maxWidth: '100%' }} onClick={() => setOpen(true)}>
        + Sonrası fotoğraf ekle (tabela / stant kurulumu)
      </button>
    );
  }
  return (
    <div className="mt-16" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        {missing.map((s) => (
          <PhotoInput key={s} label={SLOT_LABEL[s]} value={photos[s]} disabled={saving}
            onChange={(p) => setPhotos((x) => ({ ...x, [s]: p }))} />
        ))}
      </div>
      {error && <Alert tone="danger" style={{ marginTop: 10 }}>{error}</Alert>}
      <div className="row mt-12">
        <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Kaydediliyor…' : 'Fotoğrafları kaydet'}</button>
        <button className="btn btn-secondary" onClick={() => { setOpen(false); setError(''); }} disabled={saving}>Vazgeç</button>
      </div>
    </div>
  );
}

/* ---------- Saha kaydı ---------- */

function Registration({ r, onOpen, canEdit, onChanged }) {
  const loc = r.location ? `https://www.google.com/maps?q=${r.location.lat},${r.location.lng}` : r.mapsUrl;
  const slots = Object.keys(SLOT_LABEL).filter((s) => r.photos?.[s] || r.photoFiles?.[s]);

  return (
    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16, marginTop: 16 }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 15 }}>{fmtDate(r.createdAt, true)}</div>
          <div className="text-sm muted" style={{ marginTop: 2 }}>
            {r.salesRep}{r.source === 'legacySheets' && ' · eski sistemden'}
            {r.afterPhotosAt && ` · sonrası fotoğrafı ${fmtDate(r.afterPhotosAt)}`}
          </div>
        </div>
        {r.needsReview && <Badge tone="warn">Kontrol gerekli</Badge>}
      </div>

      <div className="info-grid mt-12">
        <Info label="Görüşülen kişi">{r.contactName}</Info>
        <Info label="Firma ünvanı">{r.companyTitle}</Info>
        <Info label="Distribütör">{r.distributor}</Info>
        <Info label="Tabela talebi">{yesNo(r.signRequest)}</Info>
        <Info label="Stant talebi">{yesNo(r.standRequest)}</Info>
        {r.phone && <Info label="Telefon"><a href={`tel:${r.phone}`} style={{ color: 'var(--red)' }}>{r.phone}</a></Info>}
        {r.email && <Info label="E-posta"><a href={`mailto:${r.email}`} style={{ color: 'var(--red)' }}>{r.email}</a></Info>}
        <Info label="Konum">{loc ? <a href={loc} target="_blank" rel="noreferrer" style={{ color: 'var(--red)' }}>Haritada aç</a> : null}</Info>
      </div>
      {r.needsReview && r.reviewReasons?.length > 0 && <div className="text-xs mt-8" style={{ color: 'var(--amber)' }}>{r.reviewReasons.join('; ')}</div>}

      {slots.length > 0 && (
        <div className="mt-16" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
          {slots.map((s) => (
            <Photo key={s} info={r.photoFiles?.[s]} driveUrl={r.photos?.[s]} label={SLOT_LABEL[s]}
              onOpen={(p) => onOpen({ ...p, label: `${p.label} · ${fmtDate(r.createdAt)}` })} />
          ))}
        </div>
      )}
      {canEdit && <AfterPhotos r={r} onSaved={onChanged} />}
    </div>
  );
}

/* ---------- Sayfa ---------- */

function DetailSkeleton() {
  return (
    <div className="page-narrow" style={{ maxWidth: 1000 }} aria-busy="true">
      <Skeleton width={80} height={14} />
      <Skeleton width="70%" height={26} style={{ marginTop: 16 }} />
      <Skeleton width="45%" height={14} style={{ marginTop: 10, marginBottom: 20 }} />
      <div className="card"><Skeleton width="30%" height={16} /><Skeleton height={80} style={{ marginTop: 14 }} /></div>
      <div className="card"><Skeleton width="30%" height={16} /><Skeleton height={100} style={{ marginTop: 14 }} /></div>
    </div>
  );
}

export default function DealerDetailPage() {
  const { id } = useParams();
  const { user, userRole, userProfile } = useAuth();
  const location = useLocation();
  const [justSaved] = useState(!!location.state?.saved);
  const [reload, setReload] = useState(0);
  const [dealer, setDealer] = useState(undefined);
  const [regs, setRegs] = useState(null);
  const [error, setError] = useState(null);
  const [lightbox, setLightbox] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    Promise.all([
      getDoc(doc(db, 'dealers', id)),
      getDocs(query(collection(db, 'registrations'), where('dealerId', '==', id))),
    ]).then(([d, r]) => {
      if (cancelled) return;
      setDealer(d.exists() ? d.data() : null);
      setRegs(r.docs.map((x) => ({ id: x.id, ...x.data() }))
        .sort((a, b) => (toDate(b.createdAt)?.getTime() ?? 0) - (toDate(a.createdAt)?.getTime() ?? 0)));
    }).catch((e) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [id, reload]);

  const canEdit = (r) => userRole === 'admin' || r.createdByUid === user?.uid ||
    (!!userProfile?.salesRepKey && r.salesRepKey === userProfile.salesRepKey);

  const back = { to: '/dealers', label: 'Bayiler' };
  if (error) return <div className="page"><Link to="/dealers" className="back-link">← Bayiler</Link><Alert tone="danger">Bayi yüklenemedi: {error}</Alert></div>;
  if (dealer === undefined) return <DetailSkeleton />;
  if (dealer === null) return <div className="page"><Link to="/dealers" className="back-link">← Bayiler</Link><Alert tone="warn">Bu kodla bir bayi bulunamadı: {id}</Alert></div>;

  return (
    <div className="page-narrow" style={{ maxWidth: 1000 }}>
      <PageHeader
        back={back}
        title={dealer.name}
        subtitle={
          <span className="row" style={{ gap: 8 }}>
            <span>{dealer.platformId || 'Platform ID yok'} · {[dealer.district, dealer.city].filter(Boolean).join(', ')}</span>
            <StatusBadge status={dealer.status} />
          </span>
        }
      />

      <Card title="Bayi bilgileri">
        <div className="info-grid">
          <Info label="Satış temsilcisi">{dealer.salesRep}</Info>
          <Info label="Bölge müdürü">{dealer.regionManager}</Info>
          <Info label="Bölge">{dealer.region}</Info>
          <Info label="Distribütör">{dealer.distributor}</Info>
          <Info label="Segment">{dealer.sbuSegment}</Info>
          {dealer.currentClass && <Info label="Güncel sınıf">{dealer.currentClass}</Info>}
          <Info label="Açılış tarihi">{fmtDate(dealer.createdDate)}</Info>
          {dealer.sapNo && <Info label="SAP No">{dealer.sapNo}</Info>}
          {dealer.servicesStatus && <Info label="Servis">{dealer.servicesStatus}</Info>}
        </div>
      </Card>

      {SHOW_DEVREYE && (
        <Card title="Devreye alım (adet)">
          <DevreyeTable sales={dealer.sales} />
        </Card>
      )}

      <Card
        title={`Saha kayıtları${regs ? ` (${regs.length})` : ''}`}
        actions={<Link to={`/registrations/new?dealer=${encodeURIComponent(id)}`} className="btn btn-primary btn-sm">+ Yeni kayıt ekle</Link>}
      >
        {justSaved && <Alert tone="success">✓ Kayıt kaydedildi.</Alert>}
        {regs?.length === 0 && <p className="text-sm muted">Bu bayi için henüz saha kaydı yok.</p>}
        {regs?.map((r) => (
          <Registration key={r.id} r={r} onOpen={setLightbox} canEdit={canEdit(r)} onChanged={() => setReload((x) => x + 1)} />
        ))}
      </Card>

      <Lightbox photo={lightbox} onClose={() => setLightbox(null)} />
    </div>
  );
}

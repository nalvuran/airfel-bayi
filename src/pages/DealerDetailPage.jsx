// src/pages/DealerDetailPage.jsx
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';

const C = {
  red: '#BE1E2D', redBg: '#fdf0f0', text: '#2b2b2b', muted: '#7a7570',
  border: '#e5e3df', soft: '#f8f7f5', ok: '#1f7a4d', okBg: '#eaf6ef', warn: '#9a6400', warnBg: '#fff6e0',
};
// Satış rakamlarını tüm kullanıcılara göster. Kısıtlamak gerekirse burayı değiştir.
const SHOW_SALES = true;

const card = { background: 'white', border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, marginBottom: 16 };
const h2 = { fontSize: 16, margin: '0 0 14px', color: C.text };
const fmt = (n) => (n ?? 0).toLocaleString('tr-TR');
const toDate = (v) => (v?.toDate ? v.toDate() : v instanceof Date ? v : null);
const fmtDate = (v, withTime) => {
  const d = toDate(v);
  if (!d) return '-';
  return withTime
    ? d.toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('tr-TR');
};
const SLOT_LABEL = { exterior: 'Dış cephe', interior: 'Dükkan içi', exteriorAfter: 'Dış cephe (sonrası)', interiorAfter: 'Dükkan içi (sonrası)' };

function Field({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: C.muted }}>{label}</div>
      <div style={{ fontSize: 14, color: C.text, marginTop: 2, wordBreak: 'break-word' }}>{children || '-'}</div>
    </div>
  );
}

/* ---------- Fotoğraf: photos/{id} dokümanından yüklenir ---------- */

function Photo({ info, driveUrl, label, onOpen }) {
  const [src, setSrc] = useState(null);
  const [state, setState] = useState(info?.photoId ? 'loading' : 'none');

  useEffect(() => {
    if (!info?.photoId) return undefined;
    let url = null;
    let cancelled = false;
    getDoc(doc(db, 'photos', info.photoId))
      .then((snap) => {
        if (cancelled) return;
        if (!snap.exists()) { setState('missing'); return; }
        const p = snap.data();
        const blob = new Blob([p.data.toUint8Array()], { type: p.contentType || 'image/jpeg' });
        url = URL.createObjectURL(blob);
        setSrc(url); setState('ok');
      })
      .catch(() => { if (!cancelled) setState('error'); });
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [info?.photoId]);

  const box = {
    width: '100%', aspectRatio: '4 / 3', borderRadius: 8, background: C.soft, border: `1px solid ${C.border}`,
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: C.muted, overflow: 'hidden',
  };

  return (
    <figure style={{ margin: 0 }}>
      {state === 'ok' ? (
        <button onClick={() => onOpen(src, label)} style={{ ...box, padding: 0, cursor: 'zoom-in' }} aria-label={`${label} fotoğrafını büyüt`}>
          <img src={src} alt={label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </button>
      ) : (
        <div style={box}>
          {state === 'loading' && 'Yükleniyor…'}
          {state === 'none' && (driveUrl ? <a href={driveUrl} target="_blank" rel="noreferrer" style={{ color: C.red }}>Drive'da aç</a> : 'Fotoğraf yok')}
          {(state === 'missing' || state === 'error') && 'Fotoğraf açılamadı'}
        </div>
      )}
      <figcaption style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>{label}</figcaption>
    </figure>
  );
}

function Lightbox({ photo, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  if (!photo) return null;
  return (
    <div
      onClick={onClose} role="dialog" aria-label={photo.label}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.85)', zIndex: 1000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 16, cursor: 'zoom-out' }}
    >
      <img src={photo.src} alt={photo.label} style={{ maxWidth: '100%', maxHeight: '85vh', borderRadius: 6 }} />
      <div style={{ color: 'white', fontSize: 14, marginTop: 12 }}>{photo.label} · kapatmak için tıkla</div>
    </div>
  );
}

/* ---------- Saha kaydı ---------- */

function Registration({ r, onOpen }) {
  const loc = r.location ? `https://www.google.com/maps?q=${r.location.lat},${r.location.lng}` : r.mapsUrl;
  const slots = Object.keys(SLOT_LABEL).filter((s) => r.photos?.[s] || r.photoFiles?.[s]);
  const yes = (v) => (v === true ? 'Evet' : v === false ? 'Hayır' : '-');

  return (
    <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 16, marginTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{fmtDate(r.createdAt, true)}</div>
          <div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>
            {r.salesRep}{r.source === 'legacySheets' && ' · eski sistemden'}
          </div>
        </div>
        {r.needsReview && (
          <span style={{ alignSelf: 'flex-start', fontSize: 12, background: C.warnBg, color: C.warn, padding: '4px 10px', borderRadius: 20 }}>
            Kontrol gerekli
          </span>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginTop: 12 }}>
        <Field label="Görüşülen kişi">{r.contactName}</Field>
        <Field label="Firma ünvanı">{r.companyTitle}</Field>
        <Field label="Distribütör">{r.distributor}</Field>
        <Field label="Tabela talebi">{yes(r.signRequest)}</Field>
        <Field label="Stant talebi">{yes(r.standRequest)}</Field>
        {r.phone && <Field label="Telefon"><a href={`tel:${r.phone}`} style={{ color: C.red }}>{r.phone}</a></Field>}
        {r.email && <Field label="E-posta"><a href={`mailto:${r.email}`} style={{ color: C.red }}>{r.email}</a></Field>}
        <Field label="Konum">{loc ? <a href={loc} target="_blank" rel="noreferrer" style={{ color: C.red }}>Haritada aç</a> : null}</Field>
      </div>
      {r.needsReview && r.reviewReasons?.length > 0 && (
        <div style={{ fontSize: 12, color: C.warn, marginTop: 10 }}>{r.reviewReasons.join('; ')}</div>
      )}

      {slots.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginTop: 14 }}>
          {slots.map((s) => (
            <Photo key={s} info={r.photoFiles?.[s]} driveUrl={r.photos?.[s]} label={SLOT_LABEL[s]}
              onOpen={(src, label) => onOpen({ src, label: `${label} · ${fmtDate(r.createdAt)}` })} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- Sayfa ---------- */

export default function DealerDetailPage() {
  const { id } = useParams();
  const [dealer, setDealer] = useState(undefined);
  const [regs, setRegs] = useState(null);
  const [error, setError] = useState(null);
  const [lightbox, setLightbox] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setDealer(undefined); setRegs(null); setError(null);
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
  }, [id]);

  const back = <Link to="/dealers" style={{ color: C.red, fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>← Bayiler</Link>;

  if (error) return <div style={{ textAlign: 'left' }}>{back}<div style={{ ...card, marginTop: 16, color: C.red }}>Bayi yüklenemedi: {error}</div></div>;
  if (dealer === undefined) return <div style={{ textAlign: 'left' }}>{back}<p style={{ color: C.muted }}>Yükleniyor…</p></div>;
  if (dealer === null) return <div style={{ textAlign: 'left' }}>{back}<div style={{ ...card, marginTop: 16 }}>Bu kodla bir bayi bulunamadı: {id}</div></div>;

  const s = dealer.sales || {};
  const years = [['FY24', s.fy24], ['FY25', s.fy25], ['FY26', s.fy26]];

  return (
    <div style={{ textAlign: 'left', maxWidth: 1000, margin: '0 auto' }}>
      {back}
      <div style={{ margin: '12px 0 16px' }}>
        <h1 style={{ fontSize: 22, color: C.text, margin: 0, lineHeight: 1.3 }}>{dealer.name}</h1>
        <div style={{ fontSize: 14, color: C.muted, marginTop: 6 }}>
          {dealer.platformId || 'Platform ID yok'} · {[dealer.district, dealer.city].filter(Boolean).join(', ')}
          {' · '}
          <span style={{ color: dealer.status === 'ACTIVE' ? C.ok : C.muted, fontWeight: 600 }}>
            {dealer.status === 'ACTIVE' ? 'Aktif' : dealer.status === 'SUSPEND' ? 'Askıda' : dealer.status}
          </span>
        </div>
      </div>

      <section style={card}>
        <h2 style={h2}>Bayi bilgileri</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
          <Field label="Satış temsilcisi">{dealer.salesRep}</Field>
          <Field label="Bölge müdürü">{dealer.regionManager}</Field>
          <Field label="Bölge">{dealer.region}</Field>
          <Field label="Distribütör">{dealer.distributor}</Field>
          <Field label="Segment">{dealer.sbuSegment}</Field>
          {dealer.currentClass && <Field label="Güncel sınıf">{dealer.currentClass}</Field>}
          <Field label="Açılış tarihi">{fmtDate(dealer.createdDate)}</Field>
          <Field label="İlk giriş">{fmtDate(dealer.firstLoginDate)}</Field>
          {dealer.sapNo && <Field label="SAP No">{dealer.sapNo}</Field>}
          {dealer.servicesStatus && <Field label="Servis">{dealer.servicesStatus}</Field>}
        </div>
      </section>

      {SHOW_SALES && (
        <section style={card}>
          <h2 style={h2}>Satışlar (adet)</h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, minWidth: 420 }}>
              <thead>
                <tr style={{ color: C.muted, fontSize: 12, textAlign: 'right' }}>
                  <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 600 }}>Yıl</th>
                  <th style={{ padding: '6px 8px', fontWeight: 600 }}>Klima (AC)</th>
                  <th style={{ padding: '6px 8px', fontWeight: 600 }}>Kombi (CB)</th>
                  <th style={{ padding: '6px 8px', fontWeight: 600 }}>Toplam</th>
                  <th style={{ padding: '6px 8px', fontWeight: 600 }}>Segment</th>
                </tr>
              </thead>
              <tbody>
                {years.map(([y, v]) => (
                  <tr key={y} style={{ borderTop: `1px solid ${C.border}`, textAlign: 'right' }}>
                    <td style={{ textAlign: 'left', padding: '8px', fontWeight: 600 }}>{y}</td>
                    <td style={{ padding: '8px' }}>{fmt(v?.ac)}</td>
                    <td style={{ padding: '8px' }}>{fmt(v?.cb)}</td>
                    <td style={{ padding: '8px', fontWeight: 700 }}>{fmt(v?.total)}</td>
                    <td style={{ padding: '8px', color: C.muted }}>{v?.segment || '-'}</td>
                  </tr>
                ))}
                <tr style={{ borderTop: `2px solid ${C.border}`, textAlign: 'right' }}>
                  <td style={{ textAlign: 'left', padding: '8px', fontWeight: 600 }}>3 yıl</td>
                  <td colSpan={2} />
                  <td style={{ padding: '8px', fontWeight: 700 }}>{fmt(s.total3y)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section style={card}>
        <h2 style={{ ...h2, marginBottom: 0 }}>Saha kayıtları {regs && `(${regs.length})`}</h2>
        {regs === null && <p style={{ color: C.muted, fontSize: 14 }}>Yükleniyor…</p>}
        {regs?.length === 0 && <p style={{ color: C.muted, fontSize: 14, marginBottom: 0 }}>Bu bayi için henüz saha kaydı yok.</p>}
        {regs?.map((r) => <Registration key={r.id} r={r} onOpen={setLightbox} />)}
      </section>

      <Lightbox photo={lightbox} onClose={() => setLightbox(null)} />
    </div>
  );
}
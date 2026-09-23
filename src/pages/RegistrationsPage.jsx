// src/pages/RegistrationsPage.jsx
// Temsilci: kendi kayıtları ("Kayıtlarım"). Yönetici: tüm kayıtlar ("Kayıtlar").
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { fold, getDealerIndex } from '../utils/dealerIndex';
import { Alert, Empty, PageHeader, Skeleton } from '../components/ui';
import RegistrationCard from '../components/RegistrationCard';
import { PhotoLightbox } from '../components/Photos';
import { useRepProfiles } from '../utils/repProfiles';

const PAGE = 24;
const toDate = (v) => (v?.toDate ? v.toDate() : v instanceof Date ? v : null);

// Oturum boyunca bellekte tut; yeni kayıt girilince sayfa açılışında yenilenir
let cache = { key: null, rows: null, at: 0 };
const CACHE_MS = 60 * 1000;

// Talep edilmiş ama kurulum sonrası fotoğrafı olmayan kayıtlar
const waitingInstall = (r) =>
  (r.signRequest === true || r.standRequest === true) &&
  !r.photoFiles?.exteriorAfter && !r.photoFiles?.interiorAfter && !r.photos?.exteriorAfter && !r.photos?.interiorAfter;

export default function RegistrationsPage() {
  const { user, userRole, userProfile } = useAuth();
  const isAdmin = userRole === 'admin';
  const myKey = userProfile?.salesRepKey || null;

  const [scope, setScope] = useState(isAdmin ? 'all' : 'mine');
  const [rows, setRows] = useState(null);
  const [names, setNames] = useState({});
  const [error, setError] = useState(null);

  const [q, setQ] = useState('');
  const [period, setPeriod] = useState('');
  const [rep, setRep] = useState('');
  const [special, setSpecial] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [showFilters, setShowFilters] = useState(false);
  const [photo, setPhoto] = useState(null);
  const profiles = useRepProfiles(db);

  useEffect(() => {
    const key = `${scope}:${user.uid}`;
    if (cache.key === key && cache.rows && Date.now() - cache.at < CACHE_MS) { setRows(cache.rows); return; }
    setRows(null); setError(null);
    const coll = collection(db, 'registrations');
    const qy = scope === 'all' ? coll
      : myKey ? query(coll, where('salesRepKey', '==', myKey))
        : query(coll, where('createdByUid', '==', user.uid));
    getDocs(qy)
      .then((snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data(), date: toDate(d.data().createdAt) }))
          .sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0));
        cache = { key, rows: list, at: Date.now() };
        setRows(list);
      })
      .catch((e) => setError(e.message));
  }, [scope, myKey, user.uid]);

  useEffect(() => {
    getDealerIndex(db)
      .then((idx) => setNames(Object.fromEntries(idx.entries.map((e) => [e.i, { n: e.n, c: e.c, d: e.d, v: e.v }]))))
      .catch(() => {});
  }, []);

  useEffect(() => { setLimit(PAGE); }, [q, period, rep, special, scope]);

  const reps = useMemo(() => [...new Set((rows ?? []).map((r) => r.salesRep).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr')), [rows]);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const words = fold(q).split(' ').filter(Boolean);
    const since = period ? Date.now() - Number(period) * 86400000 : 0;
    return rows.filter((r) => {
      if (since && (!r.date || r.date.getTime() < since)) return false;
      if (rep && r.salesRep !== rep) return false;
      if (special === 'install' && !waitingInstall(r)) return false;
      if (special === 'review' && !r.needsReview) return false;
      if (words.length) {
        const dn = names[r.dealerId];
        const hay = fold(`${dn?.n ?? ''} ${r.dealerName ?? ''} ${r.companyTitle ?? ''} ${r.contactName ?? ''} ${r.dealerId ?? ''} ${dn?.d ?? ''} ${dn?.c ?? ''}`);
        if (!words.every((w) => hay.includes(w))) return false;
      }
      return true;
    });
  }, [rows, q, period, rep, special, names]);

  const counts = useMemo(() => ({
    install: (rows ?? []).filter(waitingInstall).length,
    review: (rows ?? []).filter((r) => r.needsReview).length,
  }), [rows]);

  const title = scope === 'all' ? 'Kayıtlar' : 'Kayıtlarım';
  const activeFilters = [period, special, rep].filter(Boolean).length;

  return (
    <div className="page" style={{ maxWidth: 1240 }}>
      <PageHeader
        title={title}
        subtitle={rows ? `${filtered.length} / ${rows.length} kayıt` : 'Yükleniyor…'}
        actions={<Link to="/registrations/new" className="btn btn-primary btn-sm">+ Yeni kayıt</Link>}
      />

      <div className="card mb-16">
        {isAdmin && (
          <div className="row mb-12" style={{ gap: 8 }}>
            {[['all', 'Tüm kayıtlar'], ['mine', 'Sadece benimkiler']].map(([k, l]) => (
              <button key={k} className={`pill ${scope === k ? 'active' : ''}`} onClick={() => setScope(k)}>{l}</button>
            ))}
          </div>
        )}
        <input type="search" className="input input-lg" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Bayi, firma, görüşülen kişi veya Platform ID ara" />
        <button type="button" className="filters-toggle mt-12" onClick={() => setShowFilters((x) => !x)} aria-expanded={showFilters}>
          Filtreler {activeFilters > 0 && <span className="count">{activeFilters}</span>}
        </button>
        <div className={`filters-grid filters-collapsible ${showFilters ? 'open' : ''}`}>
          <select className="select" value={period} onChange={(e) => setPeriod(e.target.value)}>
            <option value="">Tüm zamanlar</option>
            <option value="7">Son 7 gün</option>
            <option value="30">Son 30 gün</option>
            <option value="90">Son 3 ay</option>
          </select>
          <select className="select" value={special} onChange={(e) => setSpecial(e.target.value)}>
            <option value="">Tüm kayıtlar</option>
            <option value="install">Kurulum bekleyenler ({counts.install})</option>
            {counts.review > 0 && <option value="review">Kontrol gerekenler ({counts.review})</option>}
          </select>
          {scope === 'all' && (
            <select className="select" value={rep} onChange={(e) => setRep(e.target.value)}>
              <option value="">Tüm temsilciler</option>
              {reps.map((r) => <option key={r}>{r}</option>)}
            </select>
          )}
        </div>
        {special === 'install' && (
          <p className="text-xs muted mt-8">Tabela veya stant talep edilmiş, ama henüz kurulum sonrası fotoğrafı eklenmemiş kayıtlar.</p>
        )}
      </div>

      {error && <Alert tone="danger">Kayıtlar yüklenemedi: {error}</Alert>}
      {!rows && !error && (
        <div className="rc-grid" aria-busy="true">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="rc">
              <Skeleton height={140} radius={0} />
              <div className="rc-body"><Skeleton width="80%" height={16} /><Skeleton width="50%" height={12} style={{ marginTop: 8 }} /><Skeleton height={70} style={{ marginTop: 14 }} /></div>
            </div>
          ))}
        </div>
      )}

      {rows && (filtered.length === 0 ? (
        <div className="card">
          <Empty title={rows.length === 0 ? 'Henüz kayıt yok' : 'Kayıt bulunamadı'}>
            {rows.length === 0 ? '"+ Yeni kayıt" ile ilk kaydını gir.' : 'Bu filtrelere uyan kayıt yok.'}
          </Empty>
        </div>
      ) : (
        <>
          <div className="rc-grid">
            {filtered.slice(0, limit).map((r) => (
              <RegistrationCard key={r.id} r={r} dealer={names[r.dealerId]} repPhoto={profiles[r.salesRepKey]?.url} onOpenPhoto={setPhoto} />
            ))}
          </div>
          {filtered.length > limit && (
            <button className="btn btn-secondary btn-block mt-16" onClick={() => setLimit((l) => l + PAGE)}>
              Daha fazla göster ({filtered.length - limit} kaldı)
            </button>
          )}
        </>
      ))}

      <PhotoLightbox photo={photo} onClose={() => setPhoto(null)} />
    </div>
  );
}

export function clearRegistrationsCache() { cache = { key: null, rows: null, at: 0 }; }

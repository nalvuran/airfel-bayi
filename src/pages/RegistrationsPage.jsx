// src/pages/RegistrationsPage.jsx
// Temsilci: kendi kayıtları ("Kayıtlarım"). Yönetici: tüm kayıtlar ("Kayıtlar").
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { fold, getDealerIndex } from '../utils/dealerIndex';
import { Alert, Badge, Empty, PageHeader, SkeletonRows } from '../components/ui';

const PAGE = 50;
const toDate = (v) => (v?.toDate ? v.toDate() : v instanceof Date ? v : null);
const fmtDate = (d) => (d ? d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-');

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
      .then((idx) => setNames(Object.fromEntries(idx.entries.map((e) => [e.i, { n: e.n, c: e.c, d: e.d }]))))
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
    <div className="page">
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
      {!rows && !error && <SkeletonRows rows={6} />}

      {rows && (filtered.length === 0 ? (
        <div className="card">
          <Empty title={rows.length === 0 ? 'Henüz kayıt yok' : 'Kayıt bulunamadı'}>
            {rows.length === 0 ? '"+ Yeni kayıt" ile ilk kaydını gir.' : 'Bu filtrelere uyan kayıt yok.'}
          </Empty>
        </div>
      ) : (
        <div className="card card-flush">
          {filtered.slice(0, limit).map((r) => {
            const dn = names[r.dealerId];
            const photoCount = Object.values(r.photoFiles || {}).filter(Boolean).length;
            return (
              <Link key={r.id} to={r.dealerId ? `/dealers/${encodeURIComponent(r.dealerId)}` : '#'} className="list-row">
                <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap', alignItems: 'flex-start' }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="list-row-title">{dn?.n || r.dealerName || r.companyTitle || 'Bayi eşleşmemiş'}</div>
                    <div className="list-row-meta">
                      {[r.contactName, dn && [dn.d, dn.c].filter(Boolean).join(', '), scope === 'all' && r.salesRep].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <div className="text-sm muted num" style={{ whiteSpace: 'nowrap', fontWeight: 600 }}>{fmtDate(r.date)}</div>
                </div>
                <div className="row mt-8" style={{ gap: 6 }}>
                  {r.signRequest && <Badge>Tabela talebi</Badge>}
                  {r.standRequest && <Badge>Stant talebi</Badge>}
                  {waitingInstall(r) && <Badge tone="warn">Kurulum bekliyor</Badge>}
                  {r.afterPhotosAt || r.photoFiles?.exteriorAfter || r.photoFiles?.interiorAfter ? <Badge tone="success">Kurulum fotoğrafı var</Badge> : null}
                  {r.needsReview && <Badge tone="danger">Kontrol gerekli</Badge>}
                  <Badge>{photoCount} fotoğraf</Badge>
                  {r.source === 'legacySheets' && <Badge>Eski sistem</Badge>}
                </div>
              </Link>
            );
          })}
          {filtered.length > limit && (
            <button className="list-more" onClick={() => setLimit((l) => l + PAGE)}>Daha fazla göster ({filtered.length - limit} kaldı)</button>
          )}
        </div>
      ))}
    </div>
  );
}

export function clearRegistrationsCache() { cache = { key: null, rows: null, at: 0 }; }

// src/pages/DealersPage.jsx
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { getDealerIndex, getCachedDealerIndex, fold } from '../utils/dealerIndex';
import { Alert, Empty, PageHeader, SkeletonRows, StatusBadge, fmtNum } from '../components/ui';
import { exportDealers } from '../utils/exportExcel';
import { getRegistrations } from '../utils/registrationStore';

const PAGE = 100;
const trSort = (a, b) => a.localeCompare(b, 'tr');

export default function DealersPage() {
  const { userProfile } = useAuth();
  const myKey = userProfile?.salesRepKey || null;

  const [data, setData] = useState(getCachedDealerIndex());
  const [error, setError] = useState(null);

  const [q, setQ] = useState('');
  const [mine, setMine] = useState(!!myKey);
  const [city, setCity] = useState('');
  const [rep, setRep] = useState('');
  const [status, setStatus] = useState('');
  const [segment, setSegment] = useState('');
  const [sort, setSort] = useState('sales');
  const [limit, setLimit] = useState(PAGE);
  const [showFilters, setShowFilters] = useState(false);
  const [exporting, setExporting] = useState(false);

  const onExport = async () => {
    setExporting(true);
    try {
      const { list } = await getRegistrations(db);
      await exportDealers(filtered, list);
    } catch (e) { window.alert(`Excel hazırlanamadı: ${e.message}`); } finally { setExporting(false); }
  };

  useEffect(() => {
    getDealerIndex(db).then(setData).catch((e) => setError(e.message));
  }, []);

  useEffect(() => { setMine(!!myKey); }, [myKey]);
  useEffect(() => { setLimit(PAGE); }, [q, mine, city, rep, status, segment, sort]);

  const options = useMemo(() => {
    const e = data?.entries ?? [];
    const uniq = (f) => [...new Set(e.map(f).filter(Boolean))].sort(trSort);
    return { cities: uniq((x) => x.c), reps: uniq((x) => x.k), segments: uniq((x) => x.g) };
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const words = fold(q).split(' ').filter(Boolean);
    const list = data.entries.filter((e) =>
      (!mine || e.k === myKey) &&
      (!city || e.c === city) &&
      (!rep || e.k === rep) &&
      (!status || e.s === status) &&
      (!segment || e.g === segment) &&
      words.every((w) => e.search.includes(w)));
    return list.sort(sort === 'name' ? (a, b) => trSort(a.n, b.n) : (a, b) => b.q - a.q || trSort(a.n, b.n));
  }, [data, q, mine, myKey, city, rep, status, segment, sort]);

  const anyFilter = q || city || rep || status || segment;
  const activeFilters = [city, rep, status, segment].filter(Boolean).length + (sort !== 'sales' ? 1 : 0);
  const clearAll = () => { setQ(''); setCity(''); setRep(''); setStatus(''); setSegment(''); };

  if (error) return <div className="page"><Alert tone="danger">{error}</Alert></div>;

  if (data && !data.entries.length) {
    return (
      <div className="page">
        <PageHeader title="Bayiler" />
        <Alert tone="warn">Bayi dizini henüz oluşturulmamış. Yönetici, Veri Yükle sayfasındaki "Bayi dizinini oluştur" butonuyla oluşturabilir.</Alert>
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader
        title="Bayiler"
        subtitle={data
          ? `${fmtNum(filtered.length)} / ${fmtNum(data.entries.length)} bayi${data.updatedAt ? ` · liste ${data.updatedAt.toLocaleDateString('tr-TR')} tarihli` : ''}`
          : 'Yükleniyor…'}
        actions={data && filtered.length > 0 ? (
          <button className="btn btn-secondary btn-sm" onClick={onExport} disabled={exporting}>
            {exporting ? 'Hazırlanıyor…' : `Excel'e aktar (${fmtNum(filtered.length)})`}
          </button>
        ) : null}
      />

      <div className="card mb-16">
        <input
          type="search" className="input input-lg" value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Bayi adı, Platform ID veya ilçe ara"
        />
        <div className={`filters-grid filters-collapsible ${showFilters ? 'open' : ''}`}>
          <select className="select" value={city} onChange={(e) => setCity(e.target.value)}>
            <option value="">Tüm iller</option>
            {options.cities.map((x) => <option key={x}>{x}</option>)}
          </select>
          <select className="select" value={rep} onChange={(e) => setRep(e.target.value)} disabled={mine}>
            <option value="">Tüm temsilciler</option>
            {options.reps.map((x) => <option key={x}>{x}</option>)}
          </select>
          <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Aktif ve askıda</option>
            <option value="ACTIVE">Sadece aktif</option>
            <option value="SUSPEND">Sadece askıda</option>
          </select>
          <select className="select" value={segment} onChange={(e) => setSegment(e.target.value)}>
            <option value="">Tüm segmentler</option>
            {options.segments.map((x) => <option key={x}>{x}</option>)}
          </select>
          <select className="select" value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="sales">FY26 devreye alıma göre</option>
            <option value="name">Ada göre (A-Z)</option>
          </select>
        </div>
        <div className="row mt-12" style={{ gap: 16 }}>
          <button type="button" className="filters-toggle" onClick={() => setShowFilters((x) => !x)} aria-expanded={showFilters}>
            Filtreler {activeFilters > 0 && <span className="count">{activeFilters}</span>}
          </button>
          {myKey && (
            <label className="check">
              <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} />
              Sadece benim bayilerim
            </label>
          )}
          {anyFilter && <button type="button" className="btn-link" onClick={clearAll}>Filtreleri temizle</button>}
        </div>
      </div>

      {!data ? <SkeletonRows rows={8} /> : filtered.length === 0 ? (
        <div className="card">
          <Empty title="Bayi bulunamadı">
            Bu aramaya uyan bayi yok.
            {mine && ' "Sadece benim bayilerim" açık; başka bir temsilcinin bayisini arıyorsan işareti kaldır.'}
          </Empty>
        </div>
      ) : (
        <div className="card card-flush">
          {filtered.slice(0, limit).map((e) => (
            <Link key={e.i} to={`/dealers/${encodeURIComponent(e.i)}`} className="list-row">
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: '4px 16px', alignItems: 'center' }}>
                <div style={{ minWidth: 0 }}>
                  <div className="list-row-title">{e.n}</div>
                  <div className="list-row-meta">
                    {e.i.startsWith('NOID-') ? 'Platform ID yok' : e.i} · {[e.d, e.c].filter(Boolean).join(', ')} · {e.r}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="num" style={{ fontSize: 15, fontWeight: 800 }}>
                    {fmtNum(e.q)} <span className="text-xs muted" style={{ fontWeight: 600 }}>FY26</span>
                  </div>
                  <div style={{ marginTop: 4 }}><StatusBadge status={e.s} /></div>
                </div>
              </div>
            </Link>
          ))}
          {filtered.length > limit && (
            <button className="list-more" onClick={() => setLimit((l) => l + PAGE)}>
              {fmtNum(Math.min(PAGE, filtered.length - limit))} bayi daha göster ({fmtNum(filtered.length - limit)} kaldı)
            </button>
          )}
        </div>
      )}
    </div>
  );
}

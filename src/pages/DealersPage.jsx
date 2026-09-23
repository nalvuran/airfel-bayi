// src/pages/DealersPage.jsx
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { getDealerIndex, getCachedDealerIndex, fold } from '../utils/dealerIndex';

const C = {
  red: '#BE1E2D', redBg: '#fdf0f0', text: '#2b2b2b', muted: '#7a7570',
  border: '#e5e3df', soft: '#f8f7f5', ok: '#1f7a4d', okBg: '#eaf6ef', warn: '#9a6400', warnBg: '#fff6e0',
};
const PAGE = 100;

const input = {
  border: `1.5px solid ${C.border}`, borderRadius: 8, padding: '9px 12px',
  fontSize: 14, background: 'white', color: C.text, minWidth: 0,
};

const trSort = (a, b) => a.localeCompare(b, 'tr');
const fmt = (n) => (n ?? 0).toLocaleString('tr-TR');

function StatusBadge({ s }) {
  const active = s === 'ACTIVE';
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 20, whiteSpace: 'nowrap',
      background: active ? C.okBg : C.soft, color: active ? C.ok : C.muted,
    }}>
      {active ? 'Aktif' : s === 'SUSPEND' ? 'Askıda' : s || '-'}
    </span>
  );
}

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
  const clearAll = () => { setQ(''); setCity(''); setRep(''); setStatus(''); setSegment(''); };

  if (error) {
    return <div style={{ background: C.redBg, color: C.red, padding: 16, borderRadius: 8, textAlign: 'left' }}>{error}</div>;
  }
  if (!data) return <p style={{ color: C.muted, padding: 24, textAlign: 'left' }}>Bayiler yükleniyor…</p>;
  if (!data.entries.length) {
    return (
      <div style={{ background: C.warnBg, color: C.warn, padding: 16, borderRadius: 8, textAlign: 'left' }}>
        Bayi dizini henüz oluşturulmamış. Yönetici, Veri Yükle sayfasındaki "Bayi dizinini oluştur" butonuyla oluşturabilir.
      </div>
    );
  }

  return (
    <div style={{ textAlign: 'left', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, margin: '4px 0 16px' }}>
        <h1 style={{ fontSize: 24, color: C.text, margin: 0 }}>Bayiler</h1>
        <span style={{ fontSize: 13, color: C.muted }}>
          {fmt(filtered.length)} / {fmt(data.entries.length)} bayi
          {data.updatedAt && ` · liste ${data.updatedAt.toLocaleDateString('tr-TR')} tarihli`}
        </span>
      </div>

      <div style={{ background: 'white', border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <input
          type="search" value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Bayi adı, Platform ID veya ilçe ara"
          style={{ ...input, width: '100%', boxSizing: 'border-box', fontSize: 15, padding: '11px 14px' }}
        />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginTop: 10 }}>
          <select value={city} onChange={(e) => setCity(e.target.value)} style={input}>
            <option value="">Tüm iller</option>
            {options.cities.map((x) => <option key={x}>{x}</option>)}
          </select>
          <select value={rep} onChange={(e) => setRep(e.target.value)} style={input} disabled={mine}>
            <option value="">Tüm temsilciler</option>
            {options.reps.map((x) => <option key={x}>{x}</option>)}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} style={input}>
            <option value="">Aktif ve askıda</option>
            <option value="ACTIVE">Sadece aktif</option>
            <option value="SUSPEND">Sadece askıda</option>
          </select>
          <select value={segment} onChange={(e) => setSegment(e.target.value)} style={input}>
            <option value="">Tüm segmentler</option>
            {options.segments.map((x) => <option key={x}>{x}</option>)}
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value)} style={input}>
            <option value="sales">FY26 satışa göre</option>
            <option value="name">Ada göre (A-Z)</option>
          </select>
        </div>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
          {myKey && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: C.text, cursor: 'pointer' }}>
              <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} />
              Sadece benim bayilerim
            </label>
          )}
          {anyFilter && (
            <button onClick={clearAll} style={{ background: 'none', border: 'none', color: C.red, fontSize: 14, fontWeight: 600, cursor: 'pointer', padding: 0 }}>
              Filtreleri temizle
            </button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div style={{ background: 'white', border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, color: C.muted, fontSize: 14 }}>
          Bu aramaya uyan bayi yok.
          {mine && ' "Sadece benim bayilerim" açık; başka bir temsilcinin bayisini arıyorsan işareti kaldır.'}
        </div>
      ) : (
        <div style={{ background: 'white', border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
          {filtered.slice(0, limit).map((e, idx) => (
            <Link
              key={e.i} to={`/dealers/${encodeURIComponent(e.i)}`}
              style={{
                display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: '4px 16px', alignItems: 'center',
                padding: '12px 16px', textDecoration: 'none', color: C.text,
                borderTop: idx ? `1px solid ${C.border}` : 'none',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.n}</div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>
                  {e.i.startsWith('NOID-') ? 'Platform ID yok' : e.i} · {[e.d, e.c].filter(Boolean).join(', ')} · {e.r}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{fmt(e.q)} <span style={{ fontSize: 11, fontWeight: 400, color: C.muted }}>FY26</span></div>
                <div style={{ marginTop: 4 }}><StatusBadge s={e.s} /></div>
              </div>
            </Link>
          ))}
          {filtered.length > limit && (
            <button
              onClick={() => setLimit((l) => l + PAGE)}
              style={{ width: '100%', padding: 14, background: C.soft, border: 'none', borderTop: `1px solid ${C.border}`, fontSize: 14, fontWeight: 600, color: C.red, cursor: 'pointer' }}
            >
              {fmt(Math.min(PAGE, filtered.length - limit))} bayi daha göster ({fmt(filtered.length - limit)} kaldı)
            </button>
          )}
        </div>
      )}
    </div>
  );
}
// src/pages/RequestsPage.jsx
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { CATALOG_ITEMS, REQUEST_STATUS, REQUEST_TYPES, TRAINING_TOPICS, requestSummary } from '../utils/catalog';
import { loadRequests, requestAgeDays } from '../utils/requests';
import { getDealerIndex, fold } from '../utils/dealerIndex';
import { exportRequests } from '../utils/exportExcel';
import { Alert, Badge, Empty, PageHeader, SkeletonRows, Stat, fmtNum } from '../components/ui';

const fmtDate = (d) => (d ? d.toLocaleDateString('tr-TR') : '');

export default function RequestsPage() {
  const { user, userProfile, userRole } = useAuth();
  const myKey = userProfile?.salesRepKey || null;
  const [params] = useSearchParams();
  const [list, setList] = useState(null);
  const [dealers, setDealers] = useState(new Map());
  const [error, setError] = useState(null);
  const [status, setStatus] = useState('open');
  const [type, setType] = useState('');
  const [rep, setRep] = useState('');
  const [city, setCity] = useState('');
  const [q, setQ] = useState('');
  const [mine, setMine] = useState(params.get('mine') === '1' || userRole === 'rep');
  const [exporting, setExporting] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    loadRequests(db).then(setList).catch((e) => setError(e.message));
    getDealerIndex(db).then((idx) => setDealers(new Map(idx.entries.map((e) => [e.i, e])))).catch(() => {});
  }, []);

  // "Benim": talebi ben açtım ya da bayi benim
  const isMine = (x) => x.createdByUid === user.uid || (myKey && (x.createdByRepKey === myKey || dealers.get(x.dealerId)?.k === myKey));

  const base = useMemo(() => (list || []).filter((x) => !mine || isMine(x)), [list, mine, dealers]); // eslint-disable-line react-hooks/exhaustive-deps
  const options = useMemo(() => ({
    reps: [...new Set(base.map((x) => x.createdByName).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr')),
    cities: [...new Set(base.map((x) => dealers.get(x.dealerId)?.c).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr')),
  }), [base, dealers]);

  const filtered = useMemo(() => {
    const words = fold(q).split(' ').filter(Boolean);
    return base.filter((x) => {
      if (status && x.status !== status) return false;
      if (type && x.type !== type) return false;
      if (rep && x.createdByName !== rep) return false;
      if (city && dealers.get(x.dealerId)?.c !== city) return false;
      if (words.length) {
        const hay = fold(`${x.dealerName} ${x.dealerId} ${x.text || ''} ${requestSummary(x)}`);
        if (!words.every((w) => hay.includes(w))) return false;
      }
      return true;
    });
  }, [base, status, type, rep, city, q, dealers]);

  // Açık taleplerin özeti
  const summary = useMemo(() => {
    const open = base.filter((x) => x.status === 'open');
    const byType = Object.fromEntries(Object.keys(REQUEST_TYPES).map((k) => [k, open.filter((x) => x.type === k).length]));
    const catalog = Object.fromEntries(Object.keys(CATALOG_ITEMS).map((k) => [k, open.filter((x) => x.type === 'catalog' && x.items?.includes(k)).length]));
    const training = Object.fromEntries(Object.keys(TRAINING_TOPICS).map((k) => [k, open.filter((x) => x.type === 'training' && x.topic === k).length]));
    return { total: open.length, byType, catalog, training };
  }, [base]);

  const activeFilters = [type, rep, city].filter(Boolean).length + (status !== 'open' ? 1 : 0);

  return (
    <div className="page">
      <PageHeader
        title="Talepler"
        subtitle={list ? `${fmtNum(filtered.length)} talep gösteriliyor` : 'Yükleniyor…'}
        actions={(
          <button className="btn btn-secondary btn-sm" disabled={!filtered.length || exporting}
            onClick={async () => { setExporting(true); try { await exportRequests(filtered, dealers); } finally { setExporting(false); } }}>
            {exporting ? 'Hazırlanıyor…' : "Excel'e aktar"}
          </button>
        )}
      />

      {error && <Alert tone="danger">Talepler yüklenemedi: {error}</Alert>}

      {list && (
        <div className="stat-grid mb-16">
          <Stat value={fmtNum(summary.total)} label="Açık talep" tone={summary.total ? 'warn' : undefined} />
          <div className="stat">
            <div className="stat-value">{fmtNum(summary.byType.catalog)}</div>
            <div className="stat-label">Katalog</div>
            <div className="text-xs muted" style={{ marginTop: 6, fontWeight: 600 }}>
              {Object.entries(summary.catalog).filter(([, n]) => n).map(([k, n]) => `${n} ${CATALOG_ITEMS[k].toLocaleLowerCase('tr-TR')}`).join(' · ') || '-'}
            </div>
          </div>
          <div className="stat">
            <div className="stat-value">{fmtNum(summary.byType.training)}</div>
            <div className="stat-label">Eğitim</div>
            <div className="text-xs muted" style={{ marginTop: 6, fontWeight: 600 }}>
              {Object.entries(summary.training).filter(([, n]) => n).map(([k, n]) => `${n} ${TRAINING_TOPICS[k].toLocaleLowerCase('tr-TR')}`).join(' · ') || '-'}
            </div>
          </div>
          <Stat value={fmtNum(summary.byType.service)} label="Servis sorunu" tone={summary.byType.service ? 'danger' : undefined} />
        </div>
      )}

      <div className="card mb-16">
        <div className="row mb-12" style={{ gap: 8 }}>
          {[['open', 'Açık'], ['done', 'Tamamlanan'], ['cancelled', 'İptal'], ['', 'Tümü']].map(([k, l]) => (
            <button key={k || 'all'} className={`pill ${status === k ? 'active' : ''}`} onClick={() => setStatus(k)}>{l}</button>
          ))}
        </div>
        <input type="search" className="input input-lg" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Bayi, Platform ID ya da açıklama ara" />
        <button type="button" className="filters-toggle mt-12" onClick={() => setShowFilters((x) => !x)} aria-expanded={showFilters}>
          Filtreler {activeFilters > 0 && <span className="count">{activeFilters}</span>}
        </button>
        <div className={`filters-grid filters-collapsible ${showFilters ? 'open' : ''}`}>
          <select className="select" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">Tüm türler</option>
            {Object.entries(REQUEST_TYPES).map(([k, t]) => <option key={k} value={k}>{t.label}</option>)}
          </select>
          <select className="select" value={city} onChange={(e) => setCity(e.target.value)}>
            <option value="">Tüm iller</option>
            {options.cities.map((c) => <option key={c}>{c}</option>)}
          </select>
          <select className="select" value={rep} onChange={(e) => setRep(e.target.value)}>
            <option value="">Tüm temsilciler</option>
            {options.reps.map((r) => <option key={r}>{r}</option>)}
          </select>
        </div>
        {myKey && (
          <label className="check mt-12">
            <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} />
            Sadece benim taleplerim ve bayilerim
          </label>
        )}
      </div>

      {!list && !error && <SkeletonRows rows={5} />}
      {list && (filtered.length === 0 ? (
        <div className="card"><Empty title="Talep yok">Bu filtrelere uyan talep bulunamadı.</Empty></div>
      ) : (
        <div className="card card-flush">
          {filtered.map((x) => {
            const d = dealers.get(x.dealerId);
            const st = REQUEST_STATUS[x.status] || REQUEST_STATUS.open;
            return (
              <Link key={x.id} to={`/dealers/${encodeURIComponent(x.dealerId)}`} className="list-row">
                <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap', alignItems: 'flex-start' }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="list-row-title">{requestSummary(x)}</div>
                    <div className="list-row-meta">{x.dealerName}{d ? ` · ${[d.d, d.c].filter(Boolean).join(', ')}` : ''}</div>
                    <div className="list-row-meta">{x.createdByName} · {fmtDate(x.date)}{x.status === 'open' ? ` · ${requestAgeDays(x) === 0 ? 'bugün açıldı' : `${requestAgeDays(x)} gündür açık`}` : x.closedByName ? ` · ${st.label.toLocaleLowerCase('tr-TR')}: ${x.closedByName}` : ''}</div>
                    {x.text && <div className="text-sm mt-8" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.text}</div>}
                  </div>
                  <Badge tone={st.tone}>{st.label}</Badge>
                </div>
              </Link>
            );
          })}
        </div>
      ))}
    </div>
  );
}

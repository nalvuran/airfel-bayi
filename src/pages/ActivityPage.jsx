// src/pages/ActivityPage.jsx — Hareket günlüğü (sadece sahip)
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { ACTIVITY_TYPES, RETENTION_DAYS, loadActivity, purgeOldActivity } from '../utils/activity';
import { fold, getDealerIndex } from '../utils/dealerIndex';
import { useRepProfiles } from '../utils/repProfiles';
import { Alert, Avatar, Empty, PageHeader, SkeletonRows } from '../components/ui';

const GROUPS = [...new Set(Object.values(ACTIVITY_TYPES).map((t) => t.group))];
const dayKey = (d) => d.toISOString().slice(0, 10);
const dayLabel = (d) => {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const x = new Date(d); x.setHours(0, 0, 0, 0);
  const diff = Math.round((t - x) / 86400000);
  if (diff === 0) return 'Bugün';
  if (diff === 1) return 'Dün';
  return d.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' });
};

export default function ActivityPage() {
  const profiles = useRepProfiles(db);
  const [rows, setRows] = useState(null);
  const [cursor, setCursor] = useState({ last: null, more: false });
  const [names, setNames] = useState(new Map());
  const [people0, setPeople0] = useState(new Map()); // uid → ad soyad
  const [error, setError] = useState('');
  const [busyMore, setBusyMore] = useState(false);
  const [who, setWho] = useState('');
  const [group, setGroup] = useState('');
  const [period, setPeriod] = useState('');
  const [q, setQ] = useState('');
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    purgeOldActivity().catch(() => {});
    loadActivity().then((r) => { setRows(r.rows); setCursor({ last: r.last, more: r.more }); }).catch((e) => setError(e.code === 'permission-denied' ? 'İzin hatası. Firestore kurallarını yayınladığından emin ol.' : e.message));
    getDealerIndex(db).then((idx) => setNames(new Map((idx.all || idx.entries).map((e) => [e.i, e.n])))).catch(() => {});
    getDocs(collection(db, 'users')).then((snap) => setPeople0(new Map(snap.docs.map((d) => [d.id, d.data().name || d.data().email])))).catch(() => {});
  }, []);

  const more = async () => {
    setBusyMore(true);
    try { const r = await loadActivity({ after: cursor.last }); setRows((x) => [...x, ...r.rows]); setCursor({ last: r.last, more: r.more }); }
    finally { setBusyMore(false); }
  };

  // Satırlardaki adı hesap listesindeki güncel adla değiştir (giriş anında e-postayla yazılmış eski satırlar için)
  const rowsN = useMemo(() => (rows || []).map((r) => ({ ...r, byName: people0.get(r.byUid) || r.byName })), [rows, people0]);
  const people = useMemo(() => [...new Set(rowsN.map((r) => r.byName).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr')), [rowsN]);
  const filtered = useMemo(() => {
    const since = period ? Date.now() - Number(period) * 86400000 : 0;
    const words = fold(q).split(' ').filter(Boolean);
    return rowsN.filter((r) => {
      if (who && r.byName !== who) return false;
      if (group && ACTIVITY_TYPES[r.type]?.group !== group) return false;
      if (since && (!r.date || r.date.getTime() < since)) return false;
      if (words.length) {
        const hay = fold(`${r.dealerName || names.get(r.dealerId) || ''} ${r.dealerId || ''} ${r.detail || ''} ${ACTIVITY_TYPES[r.type]?.label || r.type}`);
        if (!words.every((w) => hay.includes(w))) return false;
      }
      return true;
    });
  }, [rowsN, who, group, period, q, names]);

  // Son 7 gün: kişi başına işlem sayısı
  const weekly = useMemo(() => {
    const since = Date.now() - 7 * 86400000;
    const m = new Map();
    rowsN.forEach((r) => { if (r.date && r.date.getTime() >= since && r.type !== 'auth.login') m.set(r.byName, (m.get(r.byName) || 0) + 1); });
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [rowsN]);

  const byDay = useMemo(() => {
    const m = new Map();
    filtered.forEach((r) => { const k = r.date ? dayKey(r.date) : 'bekliyor'; if (!m.has(k)) m.set(k, []); m.get(k).push(r); });
    return [...m.entries()];
  }, [filtered]);

  const exportXlsx = async () => {
    setExporting(true);
    try {
      const XLSX = await import('xlsx');
      const data = filtered.map((r) => ({
        'Tarih': r.date || '', 'Kişi': r.byName || '', 'İşlem': ACTIVITY_TYPES[r.type]?.label || r.type,
        'Tür': ACTIVITY_TYPES[r.type]?.group || '', 'Bayi': r.dealerName || names.get(r.dealerId) || '',
        'Platform ID': r.dealerId && !r.dealerId.startsWith('NOID-') ? r.dealerId : '', 'Ayrıntı': r.detail || '',
      }));
      const ws = XLSX.utils.json_to_sheet(data, { cellDates: true, dateNF: 'dd.mm.yyyy hh:mm' });
      ws['!cols'] = [{ wch: 17 }, { wch: 24 }, { wch: 30 }, { wch: 10 }, { wch: 40 }, { wch: 14 }, { wch: 60 }];
      const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Hareketler');
      XLSX.writeFile(wb, `segment-hareket-gunlugu-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } finally { setExporting(false); }
  };

  const keyOf = (name) => Object.values(profiles).find((p) => p.name === name)?.url || null;

  return (
    <div className="page" style={{ maxWidth: 1000 }}>
      <PageHeader title="Hareket Günlüğü" back={{ to: '/admin', label: 'Yönetim' }}
        subtitle={`Uygulamadaki bütün işlemler · son ${RETENTION_DAYS} gün saklanır · sadece sen görürsün`}
        actions={<button className="btn btn-secondary btn-sm" disabled={!filtered.length || exporting} onClick={exportXlsx}>{exporting ? 'Hazırlanıyor…' : "Excel'e aktar"}</button>} />

      {error && <Alert tone="danger">{error}</Alert>}

      {weekly.length > 0 && (
        <div className="card mb-16">
          <div className="text-sm" style={{ fontWeight: 800, marginBottom: 8 }}>Son 7 gün: kişi başına işlem</div>
          <div className="chips" style={{ marginTop: 0 }}>
            {weekly.map(([n, c]) => (
              <button key={n} type="button" className={`chip ${who === n ? 'on' : ''}`} onClick={() => setWho(who === n ? '' : n)}>{n} · {c}</button>
            ))}
          </div>
        </div>
      )}

      <div className="card mb-16">
        <input type="search" className="input input-lg" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Bayi, Platform ID ya da ayrıntı ara" />
        <div className="filters-grid mt-12" style={{ display: 'grid' }}>
          <select className="select" value={who} onChange={(e) => setWho(e.target.value)}>
            <option value="">Herkes</option>
            {people.map((p) => <option key={p}>{p}</option>)}
          </select>
          <select className="select" value={group} onChange={(e) => setGroup(e.target.value)}>
            <option value="">Bütün işlemler</option>
            {GROUPS.map((g) => <option key={g}>{g}</option>)}
          </select>
          <select className="select" value={period} onChange={(e) => setPeriod(e.target.value)}>
            <option value="">Son {RETENTION_DAYS} gün</option>
            <option value="1">Son 24 saat</option>
            <option value="7">Son 7 gün</option>
          </select>
        </div>
      </div>

      {!rows && !error && <SkeletonRows rows={6} />}
      {rows && filtered.length === 0 && <div className="card"><Empty title="Kayıt yok">Bu filtrelere uyan işlem bulunamadı. Günlük, bu özellik eklendiği andan itibaren tutuluyor.</Empty></div>}
      {byDay.map(([k, list]) => (
        <section key={k} className="mb-16">
          <div className="act-day">{k === 'bekliyor' ? 'Gönderilmeyi bekleyen' : dayLabel(list[0].date)} <span className="muted">· {list.length} işlem</span></div>
          <div className="card card-flush">
            {list.map((r) => {
              const t = ACTIVITY_TYPES[r.type];
              const dn = r.dealerName || names.get(r.dealerId);
              return (
                <div key={r.id} className="act-row">
                  <span className="act-time num">{r.date ? r.date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '…'}</span>
                  <Avatar name={r.byName} src={keyOf(r.byName)} size={30} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="act-main"><b>{r.byName}</b> {t ? t.label.charAt(0).toLocaleLowerCase('tr-TR') + t.label.slice(1) : r.type}
                      {dn && <> · {r.dealerId ? <Link to={`/dealers/${encodeURIComponent(r.dealerId)}`}>{dn}</Link> : dn}</>}
                    </div>
                    {r.detail && <div className="act-detail">{r.detail}</div>}
                  </div>
                  <span className={`act-tag g-${(t?.group || '').toLocaleLowerCase('tr-TR')}`}>{t?.group || 'Diğer'}</span>
                </div>
              );
            })}
          </div>
        </section>
      ))}
      {rows && cursor.more && (
        <button className="btn btn-secondary btn-block" onClick={more} disabled={busyMore}>{busyMore ? 'Yükleniyor…' : 'Daha eski işlemleri yükle'}</button>
      )}
    </div>
  );
}

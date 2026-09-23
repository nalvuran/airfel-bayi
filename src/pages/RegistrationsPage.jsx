// src/pages/RegistrationsPage.jsx
// Temsilci: kendi kayıtları ("Kayıtlarım"). Yönetici: tüm kayıtlar ("Kayıtlar").
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { fold, getDealerIndex } from '../utils/dealerIndex';

const C = {
  red: '#BE1E2D', redBg: '#fdf0f0', text: '#2b2b2b', muted: '#7a7570',
  border: '#e5e3df', soft: '#f8f7f5', ok: '#1f7a4d', okBg: '#eaf6ef', warn: '#9a6400', warnBg: '#fff6e0',
};
const PAGE = 50;
const input = {
  border: `1.5px solid ${C.border}`, borderRadius: 8, padding: '9px 12px',
  fontSize: 14, background: 'white', color: C.text, minWidth: 0,
};
const toDate = (v) => (v?.toDate ? v.toDate() : v instanceof Date ? v : null);
const fmtDate = (d) => (d ? d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-');

// Oturum boyunca bellekte tut; yeni kayıt girilince sayfa açılışında yenilenir
let cache = { key: null, rows: null, at: 0 };
const CACHE_MS = 60 * 1000;

function Badge({ children, tone }) {
  const map = { ok: [C.okBg, C.ok], warn: [C.warnBg, C.warn], red: [C.redBg, C.red], soft: [C.soft, C.muted] };
  const [bg, fg] = map[tone] || map.soft;
  return <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 20, background: bg, color: fg, whiteSpace: 'nowrap' }}>{children}</span>;
}

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

  return (
    <div style={{ textAlign: 'left', maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', margin: '4px 0 16px' }}>
        <h1 style={{ fontSize: 24, color: C.text, margin: 0 }}>{title}</h1>
        <Link to="/registrations/new" style={{ background: C.red, color: 'white', borderRadius: 8, padding: '9px 14px', fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>
          + Yeni kayıt
        </Link>
      </div>

      <div style={{ background: 'white', border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
        {isAdmin && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            {[['all', 'Tüm kayıtlar'], ['mine', 'Sadece benimkiler']].map(([k, l]) => (
              <button key={k} onClick={() => setScope(k)} style={{
                padding: '7px 12px', borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                border: `1.5px solid ${scope === k ? C.red : C.border}`, background: scope === k ? C.redBg : 'white', color: scope === k ? C.red : C.text,
              }}>{l}</button>
            ))}
          </div>
        )}
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Bayi, firma, görüşülen kişi veya Platform ID ara"
          style={{ ...input, width: '100%', boxSizing: 'border-box', fontSize: 15, padding: '11px 14px' }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, marginTop: 10 }}>
          <select value={period} onChange={(e) => setPeriod(e.target.value)} style={input}>
            <option value="">Tüm zamanlar</option>
            <option value="7">Son 7 gün</option>
            <option value="30">Son 30 gün</option>
            <option value="90">Son 3 ay</option>
          </select>
          <select value={special} onChange={(e) => setSpecial(e.target.value)} style={input}>
            <option value="">Tüm kayıtlar</option>
            <option value="install">Kurulum bekleyenler ({counts.install})</option>
            {counts.review > 0 && <option value="review">Kontrol gerekenler ({counts.review})</option>}
          </select>
          {scope === 'all' && (
            <select value={rep} onChange={(e) => setRep(e.target.value)} style={input}>
              <option value="">Tüm temsilciler</option>
              {reps.map((r) => <option key={r}>{r}</option>)}
            </select>
          )}
        </div>
        {special === 'install' && (
          <p style={{ fontSize: 12, color: C.muted, margin: '10px 0 0' }}>
            Tabela veya stant talep edilmiş, ama henüz kurulum sonrası fotoğrafı eklenmemiş kayıtlar.
          </p>
        )}
      </div>

      {error && <div style={{ background: C.redBg, color: C.red, padding: 16, borderRadius: 8 }}>Kayıtlar yüklenemedi: {error}</div>}
      {!rows && !error && <p style={{ color: C.muted }}>Kayıtlar yükleniyor…</p>}

      {rows && (
        <>
          <div style={{ fontSize: 13, color: C.muted, marginBottom: 8 }}>{filtered.length} / {rows.length} kayıt</div>
          {filtered.length === 0 ? (
            <div style={{ background: 'white', border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, color: C.muted, fontSize: 14 }}>
              {rows.length === 0 ? 'Henüz kayıt yok. "+ Yeni kayıt" ile ilk kaydını gir.' : 'Bu filtrelere uyan kayıt yok.'}
            </div>
          ) : (
            <div style={{ background: 'white', border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
              {filtered.slice(0, limit).map((r, idx) => {
                const dn = names[r.dealerId];
                const photoCount = Object.values(r.photoFiles || {}).filter(Boolean).length;
                return (
                  <Link key={r.id} to={r.dealerId ? `/dealers/${encodeURIComponent(r.dealerId)}` : '#'}
                    style={{ display: 'block', padding: '12px 16px', textDecoration: 'none', color: C.text, borderTop: idx ? `1px solid ${C.border}` : 'none' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {dn?.n || r.dealerName || r.companyTitle || 'Bayi eşleşmemiş'}
                        </div>
                        <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>
                          {[r.contactName, dn && [dn.d, dn.c].filter(Boolean).join(', '), scope === 'all' && r.salesRep].filter(Boolean).join(' · ')}
                        </div>
                      </div>
                      <div style={{ fontSize: 13, color: C.muted, whiteSpace: 'nowrap' }}>{fmtDate(r.date)}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                      {r.signRequest && <Badge tone="soft">Tabela talebi</Badge>}
                      {r.standRequest && <Badge tone="soft">Stant talebi</Badge>}
                      {waitingInstall(r) && <Badge tone="warn">Kurulum bekliyor</Badge>}
                      {r.afterPhotosAt || r.photoFiles?.exteriorAfter || r.photoFiles?.interiorAfter ? <Badge tone="ok">Kurulum fotoğrafı var</Badge> : null}
                      {r.needsReview && <Badge tone="red">Kontrol gerekli</Badge>}
                      <Badge tone="soft">{photoCount} fotoğraf</Badge>
                      {r.source === 'legacySheets' && <Badge tone="soft">Eski sistem</Badge>}
                    </div>
                  </Link>
                );
              })}
              {filtered.length > limit && (
                <button onClick={() => setLimit((l) => l + PAGE)}
                  style={{ width: '100%', padding: 14, background: C.soft, border: 'none', borderTop: `1px solid ${C.border}`, fontSize: 14, fontWeight: 600, color: C.red, cursor: 'pointer' }}>
                  Daha fazla göster ({filtered.length - limit} kaldı)
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function clearRegistrationsCache() { cache = { key: null, rows: null, at: 0 }; }
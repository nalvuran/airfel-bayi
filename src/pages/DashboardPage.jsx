// src/pages/DashboardPage.jsx
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import { getDealerIndex } from '../utils/dealerIndex';
import { OVERDUE_DAYS, getRegistrations, overdueInstall, waitingInstall } from '../utils/registrationStore';
import { titleCase, useRepProfiles } from '../utils/repProfiles';
import { useThumbs } from '../utils/thumbs';
import VisitMap from '../components/VisitMap';
import { loadRequests } from '../utils/requests';
import { declineLists } from '../utils/decline';
import { BRANDS } from '../utils/catalog';
import { useScope } from '../utils/scope';
import { effectiveLocation, loadDealerLocations } from '../utils/dealerLocations';
import { approxLocation } from '../utils/geoTR';
import { useTeam } from '../utils/team';
import ScopePicker from '../components/ScopePicker';
import { CoverageChart, InstallDonut, ShareGauge, VisitTrendChart } from '../components/DashCharts';
import { Alert, Avatar, Badge, Card, Empty, PageHeader, Skeleton, fmtNum } from '../components/ui';

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const fmtDate = (d) => (d ? d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' }) : '');
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

/* ---------- Rakam kutusu ---------- */

function Tile({ label, value, sub, tone, to }) {
  const body = (
    <>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      {sub && <div className="text-xs muted" style={{ marginTop: 6, fontWeight: 600 }}>{sub}</div>}
      {to && <span className="stat-go" aria-hidden="true">›</span>}
    </>
  );
  return to
    ? <Link to={to} className={`stat stat-link ${tone ? `stat-${tone}` : ''}`}>{body}</Link>
    : <div className={`stat ${tone ? `stat-${tone}` : ''}`}>{body}</div>;
}

function Trend({ now, before }) {
  if (!before && !now) return <span>geçen ayın aynı dönemi: 0</span>;
  const diff = now - before;
  const color = diff > 0 ? 'var(--green)' : diff < 0 ? 'var(--danger)' : 'var(--muted)';
  const arrow = diff > 0 ? '▲' : diff < 0 ? '▼' : '•';
  return (
    <span>
      geçen ayın aynı dönemi: {before}{' '}
      <span style={{ color, fontWeight: 800 }}>{arrow} {diff > 0 ? '+' : ''}{diff}</span>
    </span>
  );
}

/* ---------- Son ziyaretler şeridi ---------- */

function RecentCard({ r, name, repPhoto }) {
  const [ref, thumbs] = useThumbs(db, r.id, !!r.thumbs);
  const url = thumbs && thumbs !== 'none' ? thumbs.exterior || thumbs.interior : null;
  return (
    <Link ref={ref} to={r.dealerId ? `/dealers/${encodeURIComponent(r.dealerId)}` : '#'} className="recent-card">
      <div className="recent-photo">
        {url ? <img src={url} alt="" loading="lazy" /> : r.thumbs && thumbs === null ? <span className="skeleton" style={{ position: 'absolute', inset: 0, borderRadius: 0 }} /> : null}
      </div>
      <div className="recent-body">
        <div className="recent-title">{name}</div>
        <div className="row" style={{ gap: 6, marginTop: 6, flexWrap: 'nowrap' }}>
          <Avatar name={r.salesRep} src={repPhoto} size={20} />
          <span className="text-xs" style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.salesRep}</span>
        </div>
        <div className="text-xs muted num" style={{ marginTop: 4, fontWeight: 600 }}>{fmtDate(r.date)}</div>
      </div>
    </Link>
  );
}

/* ---------- Temsilci kartı ---------- */

function RepCard({ rep }) {
  const cover = pct(rep.visited, rep.active);
  return (
    <div className="rep-card">
      <div className="row" style={{ flexWrap: 'nowrap', gap: 12 }}>
        <Avatar name={rep.name} src={rep.photo} size={46} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>{rep.name}</div>
          <div className="text-xs muted" style={{ fontWeight: 600 }}>{fmtNum(rep.active)} aktif bayi</div>
        </div>
        <div style={{ marginLeft: 'auto', textAlign: 'right', flexShrink: 0 }}>
          <div className="num" style={{ fontSize: 22, fontWeight: 800, lineHeight: 1 }}>{rep.month}</div>
          <div className="text-xs muted" style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>bu ay</div>
        </div>
      </div>
      <div className="progress mt-12" aria-label={`Bayilerin yüzde ${cover}'i ziyaret edildi`}>
        <span style={{ width: `${Math.min(100, cover)}%` }} />
      </div>
      <div className="row mt-8" style={{ justifyContent: 'space-between' }}>
        <span className="text-xs" style={{ fontWeight: 700 }}>%{cover} ziyaret edildi <span className="muted">· {fmtNum(rep.visited)}/{fmtNum(rep.active)}</span></span>
        {rep.overdue > 0
          ? <Badge tone="danger">{rep.overdue} gecikmiş kurulum</Badge>
          : rep.pending > 0 && <Badge tone="warn">{rep.pending} kurulum bekliyor</Badge>}
      </div>
    </div>
  );
}

/* ---------- Sayfa ---------- */

export default function DashboardPage() {
  const profiles = useRepProfiles(db);
  const [regs, setRegs] = useState(null);
  const [offline, setOffline] = useState(false);
  const [index, setIndex] = useState(null);
  const [error, setError] = useState(null);
  const sc = useScope({ rep: 'all', regionManager: 'team', deptManager: 'all', owner: 'all' });
  const scope = sc.scope;
  const team = useTeam();
  const [allReps, setAllReps] = useState(false);
  const [requests, setRequests] = useState(null);
  const [locs, setLocs] = useState(null);
  const [mapFilter, setMapFilter] = useState('all');
  const [declineTab, setDeclineTab] = useState('silent');
  const navigate = useNavigate();

  useEffect(() => {
    getRegistrations(db).then((r) => { setRegs(r.list); setOffline(r.offline); }).catch((e) => setError(e.message));
    getDealerIndex(db).then(setIndex).catch((e) => setError(e.message));
    loadRequests(db).then(setRequests).catch(() => setRequests([]));
    loadDealerLocations(db).then(setLocs).catch(() => setLocs({}));
  }, []);

  // Ana sayfadaki "Düşüşteki bayilerin" kartından gelindiyse o bölüme kaydır
  useEffect(() => {
    if (window.location.hash === '#dusus' && regs && index) {
      setTimeout(() => document.getElementById('dusus')?.scrollIntoView({ block: 'start' }), 100);
    }
  }, [regs, index]);

  const data = useMemo(() => {
    if (!regs || !index) return null;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevSameEnd = new Date(prevStart.getTime() + (now - monthStart));
    const mine = scope !== 'all';

    const dealers = new Map((index.all || index.entries).map((e) => [e.i, e]));
    const scopedRegs = regs.filter(sc.matchReg);
    const scopedDealers = index.entries.filter(sc.matchDealer);
    const visited = new Set(regs.map((r) => r.dealerId).filter(Boolean)); // herhangi biri ziyaret ettiyse
    const active = scopedDealers.filter((e) => e.s === 'ACTIVE');

    const month = scopedRegs.filter((r) => r.date && r.date >= monthStart).length;
    const prevSame = scopedRegs.filter((r) => r.date && r.date >= prevStart && r.date < prevSameEnd).length;
    const pending = scopedRegs.filter(waitingInstall).length;
    const overdue = scopedRegs.filter(overdueInstall).length;
    const activeVisited = active.filter((e) => visited.has(e.i)).length;

    // Haritada her bayinin en son ziyareti
    const latestByDealer = new Map();
    scopedRegs.forEach((r) => { if (r.location && r.dealerId && !latestByDealer.has(r.dealerId)) latestByDealer.set(r.dealerId, r); });
    const recentLimit = new Date(now.getTime() - 30 * 86400000);
    const points = [...latestByDealer.values()].map((r) => ({
      lat: r.location.lat, lng: r.location.lng, dealerId: r.dealerId,
      name: dealers.get(r.dealerId)?.n || r.dealerName || r.companyTitle, rep: r.salesRep, date: r.date,
      recent: r.date && r.date >= recentLimit,
    }));

    // Temsilciler
    const repKeys = (team.reps.length ? team.reps.map((p) => p.key) : [...new Set(index.entries.map((e) => e.k).filter(Boolean))])
      .filter((k) => !sc.repKeys || sc.repKeys.has(k));
    const reps = repKeys.map((k) => {
      const own = index.entries.filter((e) => e.k === k && e.s === 'ACTIVE');
      const rr = regs.filter((r) => r.salesRepKey === k);
      return {
        key: k,
        name: profiles[k]?.name || titleCase(k),
        photo: profiles[k]?.url,
        active: own.length,
        visited: own.filter((e) => visited.has(e.i)).length,
        month: rr.filter((r) => r.date && r.date >= monthStart).length,
        pending: rr.filter(waitingInstall).length,
        overdue: rr.filter(overdueInstall).length,
        managerKey: team.byKey[k]?.managerKey || null,
      };
    }).filter((r) => r.active > 0 || r.month > 0 || team.byKey[r.key])
      .sort((a, b) => b.month - a.month || pct(b.visited, b.active) - pct(a.visited, a.active));

    // Hiç ziyaret edilmemiş, devreye alımı yüksek aktif bayiler
    const priority = active.filter((e) => !visited.has(e.i))
      .sort((a, b) => b.q - a.q || ((b.v?.[2] ?? 0) + (b.v?.[3] ?? 0)) - ((a.v?.[2] ?? 0) + (a.v?.[3] ?? 0)))
      .slice(0, 10);

    // Düşüşteki bayiler (kapsamdaki bayiler içinden)
    const decline = declineLists(scopedDealers);

    // Rakip dağılımı: her bayinin en son marka bilgisi (kayıtlar yeniden eskiye sıralı)
    const brandSeen = new Set();
    const brandCounts = {};
    const brandQty = {};
    let brandDealers = 0;
    let shareAirfel = 0; let shareRival = 0; let shareDealers = 0;
    const scopedIds = mine ? new Set(scopedDealers.map((e) => e.i)) : null;
    regs.forEach((r) => {
      if (!Array.isArray(r.brands) || !r.dealerId || brandSeen.has(r.dealerId)) return;
      if (scopedIds && !scopedIds.has(r.dealerId)) return;
      brandSeen.add(r.dealerId);
      brandDealers++;
      r.brands.forEach((b) => { brandCounts[b] = (brandCounts[b] || 0) + 1; });
      // Adet girilmiş bayilerde: rakiplerin yıllık tahmini ve Airfel'in FY25 devreye alımı
      const rival = Object.values(r.brandQty || {}).reduce((a, n) => a + (n || 0), 0) + (r.brandsOtherQty || 0);
      if (rival > 0) {
        const e = dealers.get(r.dealerId);
        shareAirfel += e?.v ? (e.v[2] || 0) + (e.v[3] || 0) : 0;
        shareRival += rival;
        shareDealers++;
        Object.entries(r.brandQty || {}).forEach(([b, n]) => { brandQty[b] = (brandQty[b] || 0) + (n || 0); });
      }
    });
    const brandRows = BRANDS.map((b) => ({ b, n: brandCounts[b] || 0, q: brandQty[b] || 0 })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n);
    const share = shareDealers ? { dealers: shareDealers, airfel: shareAirfel, rival: shareRival, pct: pct(shareAirfel, shareAirfel + shareRival) } : null;

    // Son 12 haftanın ziyaretleri (pazartesi başlangıçlı); "Tümü"nde bölge ekiplerine göre
    const SHORT = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
    const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const monday = new Date(now); monday.setHours(0, 0, 0, 0); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    const splitTeams = scope === 'all' && team.managers.length > 0;
    const teamOf = (r) => team.byKey[r.salesRepKey]?.managerKey || 'diger';
    const weeks = Array.from({ length: 12 }, (_, i) => {
      const from = new Date(monday); from.setDate(from.getDate() - 7 * (11 - i));
      const to = new Date(from); to.setDate(to.getDate() + 6); to.setHours(23, 59, 59, 999);
      const inWeek = scopedRegs.filter((r) => r.date && r.date >= from && r.date <= to);
      const byTeam = {};
      if (splitTeams) inWeek.forEach((r) => { const k = teamOf(r); byTeam[k] = (byTeam[k] || 0) + 1; });
      return {
        label: `${from.getDate()} ${SHORT[from.getMonth()]}`,
        title: `${from.getDate()} ${SHORT[from.getMonth()]} – ${to.getDate()} ${SHORT[to.getMonth()]}`,
        from: iso(from), to: iso(to), total: inWeek.length, byTeam,
      };
    });
    const trendTeams = splitTeams
      ? [...team.managers.map((m) => ({ key: m.key, name: m.name })), ...(weeks.some((w) => w.byTeam.diger) ? [{ key: 'diger', name: 'Ekip dışı' }] : [])]
      : [];

    // Kurulum durumu
    const hasAfter = (r) => r.photoFiles?.exteriorAfter || r.photoFiles?.interiorAfter || r.photos?.exteriorAfter || r.photos?.interiorAfter;
    const installed = scopedRegs.filter((r) => (r.signRequest === true || r.standRequest === true) && hasAfter(r)).length;

    // Kapsama: temsilci başına ziyaret edilen aktif bayi oranı, müdür ekibinin rengiyle
    const mgrIndex = Object.fromEntries(team.managers.map((m, i) => [m.key, i]));
    const coverage = reps.filter((r) => r.active > 0)
      .map((r) => ({ key: r.key, name: r.name, pct: pct(r.visited, r.active), visited: r.visited, active: r.active, team: mgrIndex[r.managerKey] }))
      .sort((a, b) => b.pct - a.pct);

    return {
      weeks, trendTeams, installed, coverage,
      decline, brandRows, brandDealers, share,
      month, prevSame, pending, overdue, activeVisited, activeTotal: active.length, points, reps, priority,
      recent: scopedRegs.slice(0, 12), total: scopedRegs.length, dealers,
      attention: regs.filter((r) => r.attention),
      monthName: `${MONTHS[now.getMonth()]} ${now.getFullYear()}`,
    };
  }, [regs, index, scope, sc.repKeys, team, profiles]); // eslint-disable-line react-hooks/exhaustive-deps

  // Harita: kapsamdaki aktif bayiler (ve ziyaret edilmiş diğerleri); bilinen konum tam yerinde, bilinmeyen ilçe merkezinde
  const mapData = useMemo(() => {
    if (!data || !regs || !index || !locs) return null;
    const lastReg = new Map(); const lastLocReg = new Map();
    regs.forEach((r) => {
      if (!r.dealerId) return;
      if (!lastReg.has(r.dealerId)) lastReg.set(r.dealerId, r);
      if (r.location?.lat && !lastLocReg.has(r.dealerId)) lastLocReg.set(r.dealerId, r);
    });
    const declineSet = new Set([...data.decline.silent, ...data.decline.declined].map((x) => x.e.i));
    const recentLimit = Date.now() - 30 * 86400000;
    let list = index.entries.filter(sc.matchDealer).filter((e) => e.s === 'ACTIVE' || lastReg.has(e.i));
    if (mapFilter === 'visited') list = list.filter((e) => lastReg.has(e.i));
    if (mapFilter === 'unvisited') list = list.filter((e) => !lastReg.has(e.i));
    if (mapFilter === 'decline') list = list.filter((e) => declineSet.has(e.i));
    const points = []; const groups = new Map();
    list.forEach((e) => {
      const last = lastReg.get(e.i);
      const loc = effectiveLocation(locs[e.i], lastLocReg.get(e.i));
      if (loc) {
        points.push({ lat: loc.lat, lng: loc.lng, dealerId: e.i, name: e.n, rep: last?.salesRep, date: last?.date,
          kind: last ? (last.date && last.date.getTime() >= recentLimit ? 'recent' : 'visited') : 'known' });
        return;
      }
      const ap = approxLocation(e.c, e.d);
      if (!ap) return;
      const key = ap.level === 'district' ? `${e.c}|${e.d}` : e.c;
      if (!groups.has(key)) {
        groups.set(key, { lat: ap.lat, lng: ap.lng, level: ap.level, items: [], city: e.c,
          label: ap.level === 'district' ? `${e.d}, ${e.c}` : e.c, search: ap.level === 'district' ? `${e.d} ${e.c}` : e.c });
      }
      groups.get(key).items.push({ i: e.i, n: e.n, q: e.q });
    });
    const g = [...groups.values()];
    g.forEach((x) => x.items.sort((a, b) => b.q - a.q));
    return { points, groups: g, approxCount: g.reduce((a, x) => a + x.items.length, 0) };
  }, [data, regs, index, locs, mapFilter, sc.scope, sc.repKeys]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <div className="page"><PageHeader title="Dashboard" /><Alert tone="danger">Veriler yüklenemedi: {error}</Alert></div>;

  return (
    <div className="page" style={{ maxWidth: 1240 }}>
      <PageHeader
        title="Dashboard"
        subtitle={data ? data.monthName : 'Yükleniyor…'}
        actions={<ScopePicker scope={scope} options={sc.options} onChange={sc.setScope} />}
      />

      {offline && <Alert tone="warn" style={{ marginBottom: 14 }}>İnternet bağlantısı yok; telefonda kayıtlı son veriler gösteriliyor.</Alert>}

      {!data ? (
        <div className="stat-grid">{Array.from({ length: 4 }, (_, i) => <div key={i} className="stat"><Skeleton width="50%" height={26} /><Skeleton width="70%" height={12} style={{ marginTop: 8 }} /></div>)}</div>
      ) : (
        <>
          <div className="stat-grid">
            <Tile to={`/registrations?period=month&scope=${scope}`} label="Bu ay ziyaret" value={fmtNum(data.month)} sub={<Trend now={data.month} before={data.prevSame} />} />
            <Tile to={`/registrations?special=install&scope=${scope}`} label="Kurulum bekleyen" value={fmtNum(data.pending)} tone={data.pending ? 'warn' : undefined} sub="tabela / stant talebi" />
            <Tile to={`/registrations?special=overdue&scope=${scope}`} label={`${OVERDUE_DAYS} günü geçen kurulum`} value={fmtNum(data.overdue)} tone={data.overdue ? 'danger' : 'success'} sub={data.overdue ? 'kurulum fotoğrafı bekleniyor' : 'gecikmiş kurulum yok'} />
            <Tile to={`/dealers?visit=unvisited&status=ACTIVE&scope=${scope}`} label="Ziyaret edilen aktif bayi" value={`%${pct(data.activeVisited, data.activeTotal)}`} sub={`${fmtNum(data.activeVisited)} / ${fmtNum(data.activeTotal)} bayi · ziyaret edilmeyenler için dokun`} />
            <Tile to={`/registrations?scope=${scope}`} label="Toplam saha kaydı" value={fmtNum(data.total)} sub={sc.options.find((o) => o.value === scope)?.label || ''} />
            {requests && (() => {
              const open = requests.filter((q) => q.status === 'open' && sc.matchRequest(q, data.dealers.get(q.dealerId)?.k));
              const n = (t) => open.filter((q) => q.type === t).length;
              return (
                <Tile to={`/requests${scope === 'mine' ? '?mine=1' : ''}`} label="Açık talep" value={fmtNum(open.length)} tone={open.length ? 'warn' : undefined}
                  sub={open.length ? `${n('catalog')} katalog · ${n('training')} eğitim · ${n('service')} servis` : 'açık talep yok'} />
              );
            })()}
          </div>

          <div className="dash-grid mt-16">
            <section className="card span-2">
              <div className="card-header">
                <div>
                  <h2 className="card-title">Haftalık ziyaretler</h2>
                  <div className="card-desc">Son 12 hafta. Bir çubuğa dokununca o haftanın kayıtları açılır.</div>
                </div>
                <div className="trend-now">
                  <div className="num">{data.weeks[11].total}</div>
                  <div>bu hafta · geçen hafta {data.weeks[10].total}</div>
                </div>
              </div>
              <VisitTrendChart weeks={data.weeks} teams={data.trendTeams}
                onPick={(w) => navigate(`/registrations?from=${w.from}&to=${w.to}&scope=${scope}`)} />
            </section>
            <section className="card">
              <h2 className="card-title">Kurulum durumu</h2>
              <div className="card-desc mb-12">Tabela ve stant talepleri</div>
              <InstallDonut
                center={{ value: fmtNum(data.pending), label: 'bekleyen' }}
                parts={[
                  { key: 'ontime', label: `Bekliyor (${OVERDUE_DAYS} gün içinde)`, value: data.pending - data.overdue, tone: 'amber', to: `special=install` },
                  { key: 'late', label: `Gecikmiş (${OVERDUE_DAYS}+ gün)`, value: data.overdue, tone: 'red', to: 'special=overdue' },
                  { key: 'done', label: 'Kurulumu tamamlanan', value: data.installed, tone: 'green', to: 'special=installed' },
                ]}
                onPick={(x) => navigate(`/registrations?${x.to}&scope=${scope}`)} />
            </section>
            {data.coverage.length > 0 && (
              <section className="card span-2">
                <h2 className="card-title">Temsilcilerin bayi kapsaması</h2>
                <div className="card-desc mb-12">Aktif bayilerinin yüzde kaçı en az bir kez ziyaret edildi. Bir çubuğa dokununca o temsilcinin ziyaret edilmemiş bayileri açılır.</div>
                <CoverageChart
                  rows={data.coverage.map((r) => ({ ...r, team: scope === 'all' ? r.team : undefined }))}
                  onPick={(r) => navigate(`/dealers?rep=${encodeURIComponent(r.key)}&visit=unvisited&status=ACTIVE&scope=all`)} />
              </section>
            )}
            <section className="card">
              <h2 className="card-title">Tahmini pazar payı</h2>
              <div className="card-desc mb-12">Rakip adedi girilmiş bayilerde, Airfel FY25 devreye alımına göre.</div>
              {data.share ? (
                <>
                  <ShareGauge pct={data.share.pct} />
                  <div className="text-xs muted" style={{ fontWeight: 600, textAlign: 'center' }}>
                    {fmtNum(data.share.dealers)} bayi · Airfel {fmtNum(data.share.airfel)} · rakipler ~{fmtNum(data.share.rival)} adet/yıl
                  </div>
                  <div className="mt-12">
                    {data.brandRows.filter((x) => x.b !== 'Airfel').slice(0, 4).map((x) => (
                      <div key={x.b} className="mini-row"><span>{x.b}</span><span className="num">{x.n} bayi{x.q ? ` · ~${fmtNum(x.q)}` : ''}</span></div>
                    ))}
                  </div>
                  <button type="button" className="btn-link text-sm mt-8" onClick={() => document.getElementById('rakip')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Tüm markalar</button>
                </>
              ) : <p className="text-sm muted">Temsilciler ziyaretlerde rakip markaların yıllık adetlerini girdikçe burada tahmini payımız görünecek.</p>}
            </section>
          </div>

          {data.attention.length > 0 && (
            <Card title="Dikkat gerektiren değişiklikler" desc="Kurulum fotoğrafı eklendikten sonra tabela veya stant talebi değiştirilen kayıtlar." className="mt-16">
              {data.attention.map((r) => (
                <Link key={r.id} to={`/dealers/${encodeURIComponent(r.dealerId)}`} className="list-row" style={{ padding: '10px 0' }}>
                  <div className="list-row-title" style={{ fontSize: 14 }}>{data.dealers.get(r.dealerId)?.n || r.dealerName}</div>
                  <div className="list-row-meta">{r.editedByName} · {r.editedAt?.toDate?.().toLocaleDateString('tr-TR')}</div>
                </Link>
              ))}
            </Card>
          )}

          <section className="mt-16">
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
              <h2 className="card-title">Son ziyaretler</h2>
              <Link to="/registrations" className="btn-link text-sm">Tümünü gör</Link>
            </div>
            {data.recent.length === 0 ? <div className="card"><Empty title="Henüz ziyaret yok" /></div> : (
              <div className="recent-strip">
                {data.recent.map((r) => (
                  <RecentCard key={r.id} r={r} name={data.dealers.get(r.dealerId)?.n || r.dealerName || r.companyTitle} repPhoto={profiles[r.salesRepKey]?.url} />
                ))}
              </div>
            )}
          </section>

          <section className="card mt-16">
            <div className="card-header">
              <div>
                <h2 className="card-title">Bayi haritası</h2>
                <div className="card-desc">
                  {mapData ? `${fmtNum(mapData.points.length)} bayi tam konumunda, ${fmtNum(mapData.approxCount)} bayi ilçe merkezinde yaklaşık olarak gösteriliyor.` : 'Yükleniyor…'}
                </div>
              </div>
            </div>
            <div className="row mb-12" style={{ gap: 8 }}>
              {[['all', 'Tümü'], ['visited', 'Ziyaret edilenler'], ['unvisited', 'Hiç ziyaret edilmeyenler'], ['decline', 'Düşüşteki bayiler']].map(([k, l]) => (
                <button key={k} type="button" className={`pill ${mapFilter === k ? 'active' : ''}`} onClick={() => setMapFilter(k)}>{l}</button>
              ))}
            </div>
            {mapData && <VisitMap points={mapData.points} groups={mapData.groups} scope={scope} />}
            <div className="map-legend">
              <span><i style={{ background: '#E5484D' }} />Son 30 günde ziyaret</span>
              <span><i style={{ background: '#8A857F' }} />Daha önce ziyaret</span>
              <span><i style={{ background: '#3B82F6' }} />Konumu kayıtlı, ziyaret yok</span>
              <span><i className="ring" />Konumu bilinmiyor: bölge, il ya da ilçede bayi sayısı (yakınlaştırdıkça ayrılır)</span>
            </div>
          </section>

          {scope !== 'mine' && data.reps.length > 0 && (
            <section className="mt-16">
              <h2 className="card-title" style={{ marginBottom: 10 }}>Temsilciler</h2>
              {(() => {
                const shown = allReps ? data.reps : data.reps.slice(0, 6);
                // Ekip tanımlıysa bölge müdürlerine göre grupla
                const groups = team.managers.length
                  ? team.managers.map((m) => ({ m, list: shown.filter((r) => r.managerKey === m.key) })).filter((g) => g.list.length)
                  : [{ m: null, list: shown }];
                const rest = team.managers.length ? shown.filter((r) => !team.managers.some((m) => m.key === r.managerKey)) : [];
                if (rest.length) groups.push({ m: { name: 'Ekip dışı' }, list: rest });
                return groups.map((g) => (
                  <div key={g.m?.key || g.m?.name || 'all'} className="mb-16">
                    {g.m && <div className="text-sm" style={{ fontWeight: 800, color: 'var(--muted)', margin: '4px 0 8px' }}>{g.m.name}{g.m.key ? ' ekibi' : ''}</div>}
                    <div className="rep-grid">{g.list.map((r) => <RepCard key={r.key} rep={r} />)}</div>
                  </div>
                ));
              })()}
              {data.reps.length > 6 && (
                <button className="btn btn-secondary btn-block" onClick={() => setAllReps((x) => !x)}>
                  {allReps ? 'Daha az göster' : `Tüm temsilciler (${data.reps.length})`}
                </button>
              )}
            </section>
          )}

          <section id="dusus" className="card mt-16" style={{ scrollMarginTop: 80 }}>
            <div className="card-header">
              <div>
                <h2 className="card-title">Düşüşteki bayiler</h2>
                <div className="card-desc">
                  {declineTab === 'silent'
                    ? 'Geçen mali yıl en az 10 adet devreye alım yapmış, bu mali yıl (1 Nisan\'dan beri) hiç yapmamış aktif bayiler.'
                    : 'FY25 devreye alımı FY24\'e göre en az %25 düşmüş aktif bayiler (iki tamamlanmış yıl karşılaştırılıyor).'}
                </div>
              </div>
            </div>
            <div className="row mb-12" style={{ gap: 8 }}>
              <button className={`pill ${declineTab === 'silent' ? 'active' : ''}`} onClick={() => setDeclineTab('silent')}>Bu yıl sessiz ({data.decline.silent.length})</button>
              <button className={`pill ${declineTab === 'declined' ? 'active' : ''}`} onClick={() => setDeclineTab('declined')}>Geçen yıl düşenler ({data.decline.declined.length})</button>
            </div>
            {(declineTab === 'silent' ? data.decline.silent : data.decline.declined).length === 0 ? (
              <Empty>Bu listede bayi yok.</Empty>
            ) : (declineTab === 'silent' ? data.decline.silent : data.decline.declined).slice(0, 10).map((x) => (
              <Link key={x.e.i} to={`/dealers/${encodeURIComponent(x.e.i)}`} className="list-row" style={{ padding: '10px 0' }}>
                <div className="row" style={{ flexWrap: 'nowrap', gap: 12 }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="list-row-title">{x.e.n}</div>
                    <div className="list-row-meta">{[x.e.d, x.e.c].filter(Boolean).join(', ')} · {x.e.r}</div>
                  </div>
                  <div style={{ textAlign: 'right' }} className="num">
                    {declineTab === 'silent'
                      ? <><div style={{ fontWeight: 800 }}>{fmtNum(x.fy25)}</div><div className="text-xs muted">FY25 · FY26: 0</div></>
                      : <><Badge tone="danger">▼ %{Math.abs(x.pct)}</Badge><div className="text-xs muted" style={{ marginTop: 3 }}>{fmtNum(x.fy24)} → {fmtNum(x.fy25)}</div></>}
                  </div>
                </div>
              </Link>
            ))}
          </section>

          <Card id="rakip" title="Rakip marka dağılımı" className="mt-16"
            desc={data.brandDealers ? `Markası işaretlenmiş ${fmtNum(data.brandDealers)} bayide, her markanın kaç bayide satıldığı.` : 'Temsilciler ziyaretlerde markaları işaretledikçe burada dağılım oluşacak.'}>
            {data.share && (
              <div className="share-box mb-16">
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 800 }}>Tahmini pazar payımız</span>
                  <span className="num" style={{ fontWeight: 800, fontSize: 22, color: 'var(--red)' }}>%{data.share.pct}</span>
                </div>
                <div className="progress mt-8"><span style={{ width: `${data.share.pct}%` }} /></div>
                <div className="text-xs muted mt-8" style={{ fontWeight: 600 }}>
                  Rakip adedi girilmiş {fmtNum(data.share.dealers)} bayide: Airfel FY25 devreye alım {fmtNum(data.share.airfel)} adet, rakiplerin yıllık tahmini ~{fmtNum(data.share.rival)} adet.
                </div>
              </div>
            )}
            {data.brandRows.map((x) => (
              <div key={x.b} className="brand-bar">
                <span className="brand-name" style={x.b === 'Airfel' ? { color: 'var(--red)' } : undefined}>{x.b}</span>
                <span className="brand-track"><span style={{ width: `${pct(x.n, data.brandDealers)}%`, background: x.b === 'Airfel' ? 'var(--red)' : 'var(--ink-2)' }} /></span>
                <span className="brand-num num">{x.n} <span className="muted">· %{pct(x.n, data.brandDealers)}</span>{x.q ? <span className="brand-q">~{fmtNum(x.q)}/yıl</span> : null}</span>
              </div>
            ))}
          </Card>

          <Card title="Öncelikli bayiler" desc="FY26 devreye alımı en yüksek olup henüz hiç ziyaret edilmemiş aktif bayiler." className="mt-16" flush>
            {data.priority.length === 0 ? <Empty>Tüm aktif bayiler en az bir kez ziyaret edilmiş.</Empty> : data.priority.map((e, i) => (
              <Link key={e.i} to={`/dealers/${encodeURIComponent(e.i)}`} className="list-row">
                <div className="row" style={{ flexWrap: 'nowrap', gap: 12 }}>
                  <span className="rank">{i + 1}</span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="list-row-title">{e.n}</div>
                    <div className="list-row-meta">{[e.d, e.c].filter(Boolean).join(', ')} · {e.r}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="num" style={{ fontWeight: 800 }}>{fmtNum(e.q)} <span className="text-xs muted">FY26</span></div>
                    {e.v && (
                      <div className="text-xs num" style={{ fontWeight: 700 }}>
                        <span style={{ color: 'var(--kombi)' }}>{fmtNum(e.v[4])} kombi</span> · <span style={{ color: 'var(--klima)' }}>{fmtNum(e.v[5])} klima</span>
                      </div>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </Card>
        </>
      )}
    </div>
  );
}

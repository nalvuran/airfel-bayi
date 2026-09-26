// src/pages/HomePage.jsx
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { db } from '../firebase';
import { useAuth, ROLE_LABELS } from '../contexts/AuthContext';
import { getDealerIndex } from '../utils/dealerIndex';
import { Avatar, Badge, Skeleton, fmtNum } from '../components/ui';
import { useRepProfiles } from '../utils/repProfiles';
import { OVERDUE_DAYS, getRegistrations, overdueInstall, waitingInstall } from '../utils/registrationStore';
import { useLastBackup } from '../utils/backup';
import { fmtDay, followUpState, loadOpenFollowUps } from '../utils/followUps';
import { loadRequests } from '../utils/requests';
import { declineLists } from '../utils/decline';
import { lastSeenPosts, loadPosts } from '../utils/posts';
import { useScope } from '../utils/scope';
import { REQUEST_TYPES, requestSummary } from '../utils/catalog';

/* ---------- Simgeler ---------- */
const I = ({ children }) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>;
const Store = () => <I><path d="M3 9l1.5-5h15L21 9" /><path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0" /><path d="M5 12v9h14v-9" /><path d="M10 21v-5h4v5" /></I>;
const Clip = () => <I><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4h6v3H9z" /><path d="M9 12l2 2 4-4" /></I>;
const Chat = () => <I><path d="M4 5h16v11H9l-5 4z" /><path d="M8 9h8M8 12h5" /></I>;
const Mega = () => <I><path d="M3 10v4h3l7 4V6L6 10z" /><path d="M16 9a3 3 0 0 1 0 6" /><path d="M6 14l1 5h3l-1-4" /></I>;
const Chart = () => <I><path d="M4 20V10" /><path d="M10 20V4" /><path d="M16 20v-7" /><path d="M22 20H2" /></I>;
const Cal = () => <I><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></I>;
const Plus = () => <I><path d="M12 5v14M5 12h14" /></I>;

const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

function HCard({ to, icon, tone, title, desc, badge, footer, children }) {
  return (
    <section className="hcard">
      <Link to={to} className="hcard-head">
        <span className={`hcard-icon ${tone || ''}`}>{icon}</span>
        <span style={{ minWidth: 0, flex: 1 }}>
          <span className="hcard-title">{title}{badge}</span>
          <span className="hcard-desc">{desc}</span>
        </span>
        <span className="hcard-chev" aria-hidden="true">›</span>
      </Link>
      {children && <div className="hcard-body">{children}</div>}
      {footer && <div className="hcard-foot">{footer}</div>}
    </section>
  );
}

function Kpi({ to, value, label, sub, tone }) {
  return (
    <Link to={to} className={`hero-kpi ${tone ? `t-${tone}` : ''}`}>
      <span className="hero-kpi-value num">{value}</span>
      <span className="hero-kpi-label">{label}</span>
      {sub && <span className="hero-kpi-sub">{sub}</span>}
    </Link>
  );
}

export default function HomePage() {
  const { user, userRole, userProfile, personKey, isOwner, canRegister } = useAuth();
  const sc = useScope({ rep: 'mine', owner: 'mine', regionManager: 'team', deptManager: 'all' });
  const profiles = useRepProfiles(db);
  const lastBackup = useLastBackup(isOwner);
  const [index, setIndex] = useState(null);
  const [regs, setRegs] = useState(null);
  const [requests, setRequests] = useState(null);
  const [followUps, setFollowUps] = useState([]);
  const [posts, setPosts] = useState(null);

  useEffect(() => {
    getDealerIndex(db).then(setIndex).catch(() => setIndex({ entries: [] }));
    getRegistrations(db).then(({ list }) => setRegs(list)).catch(() => setRegs([]));
    loadRequests(db).then(setRequests).catch(() => setRequests([]));
    loadPosts(db).then(setPosts).catch(() => setPosts([]));
    if (canRegister) loadOpenFollowUps(db).then(setFollowUps).catch(() => {});
  }, [canRegister]);

  const d = useMemo(() => {
    if (!index || !regs || !requests) return null;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevSameEnd = new Date(prevStart.getTime() + (now - monthStart));
    const dealers = index.entries.filter(sc.matchDealer);
    const dealerSet = new Set(dealers.map((e) => e.i));
    const active = dealers.filter((e) => e.s === 'ACTIVE');
    const visited = new Set(regs.map((r) => r.dealerId).filter(Boolean));
    const mine = regs.filter(sc.matchReg);
    const openReq = requests.filter((q) => q.status === 'open' && sc.matchRequest(q, index.entries.find((e) => e.i === q.dealerId)?.k));
    const decl = declineLists(dealers);
    return {
      dealerCount: dealers.length,
      activeCount: active.length,
      activeVisited: active.filter((e) => visited.has(e.i)).length,
      unvisited: active.filter((e) => !visited.has(e.i)).length,
      month: mine.filter((r) => r.date && r.date >= monthStart).length,
      prevSame: mine.filter((r) => r.date && r.date >= prevStart && r.date < prevSameEnd).length,
      week: mine.filter((r) => r.date && now - r.date < 7 * 86400000).length,
      pending: mine.filter(waitingInstall).length,
      overdue: mine.filter(overdueInstall).length,
      lastVisit: mine[0]?.date || null,
      openReq,
      silent: decl.silent.slice(0, 3),
      declineTotal: decl.silent.length + decl.declined.length,
      myFollowUps: followUps.filter((f) => (f.byUid === user.uid || dealerSet.has(f.dealerId)) && followUpState(f).key !== 'later'),
    };
  }, [index, regs, requests, followUps, sc.scope, sc.repKeys, user.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  const name = userProfile?.name || user?.email || '';
  const first = name.split(' ')[0];
  const seen = lastSeenPosts();
  const newPosts = (posts || []).filter((p) => p.byUid !== user.uid && p.date && p.date.getTime() > seen).length;
  const scopeText = sc.scope === 'mine' ? 'Senin' : sc.scope === 'team' ? 'Ekibinin' : 'Tüm ekibin';
  const q = `scope=${sc.scope}`;
  const diff = d ? d.month - d.prevSame : 0;
  const lateCount = d ? d.myFollowUps.filter((f) => followUpState(f).key === 'late').length : 0;

  return (
    <div className="page" style={{ maxWidth: 1180 }}>
      {/* Karşılama */}
      <section className="home-hero">
        <div className="hero-who">
          <Avatar name={name} src={personKey ? profiles[personKey]?.url : null} size={64} />
          <div style={{ minWidth: 0 }}>
            <h1 className="hero-hi">Merhaba, {first}</h1>
            <div className="hero-meta">
              <span className="role-chip">{ROLE_LABELS[userRole] || 'Temsilci'}</span>
              <span>{d ? `${scopeText} ${fmtNum(d.dealerCount)} bayisi, ${fmtNum(d.activeCount)} aktif` : 'Yükleniyor…'}</span>
            </div>
          </div>
        </div>
        <div className="hero-kpis">
          {!d ? Array.from({ length: 3 }, (_, i) => <div key={i} className="hero-kpi"><Skeleton width="50%" height={28} /><Skeleton width="80%" height={12} style={{ marginTop: 8 }} /></div>) : (
            <>
              <Kpi to={`/registrations?period=month&${q}`} value={fmtNum(d.month)} label="Bu ay ziyaret"
                sub={<span style={{ color: diff > 0 ? 'var(--green)' : diff < 0 ? 'var(--danger)' : undefined }}>{diff > 0 ? '▲' : diff < 0 ? '▼' : '•'} geçen ay aynı dönem {d.prevSame}</span>} />
              <Kpi to={`/registrations?special=install&${q}`} value={fmtNum(d.pending)} label="Kurulum bekleyen" tone={d.pending ? 'amber' : undefined}
                sub={d.overdue ? <span style={{ color: 'var(--danger)' }}>{d.overdue} tanesi {OVERDUE_DAYS} günü geçti</span> : 'gecikmiş yok'} />
              <Kpi to={`/requests${sc.scope === 'mine' ? '?mine=1' : ''}`} value={fmtNum(d.openReq.length)} label="Açık talep" tone={d.openReq.length ? 'red' : undefined}
                sub={d.openReq.length ? `${d.openReq.filter((x) => x.type === 'catalog').length} katalog · ${d.openReq.filter((x) => x.type === 'training').length} eğitim` : 'bekleyen talep yok'} />
            </>
          )}
        </div>
      </section>

      {canRegister && (
        <Link to="/registrations/new" className="home-new"><Plus />Yeni saha kaydı</Link>
      )}

      {/* Hatırlatmalar */}
      {d && canRegister && d.overdue > 0 && (
        <Link to={`/registrations?special=overdue&${q}`} className="reminder reminder-danger">
          <strong>{d.overdue} kurulumun {OVERDUE_DAYS} günü geçti</strong>
          <span>Kurulum yapıldıysa kayda kurulum fotoğrafını ekle.</span>
        </Link>
      )}
      {isOwner && lastBackup.due && (
        <Link to="/admin/backup" className="reminder reminder-warn">
          <strong>{lastBackup.days === null ? 'Henüz hiç yedek alınmadı' : `Son yedek ${lastBackup.days} gün önce alındı`}</strong>
          <span>Verilerin bir kopyasını bilgisayarına indir.</span>
        </Link>
      )}

      <div className="home-grid">
        {d && d.myFollowUps.length > 0 && (
          <HCard to="/dealers" icon={<Cal />} tone="red" title="Takiplerin" desc="Tekrar uğrayacağın bayiler"
            badge={lateCount ? <Badge tone="danger">{lateCount} gecikmiş</Badge> : null}>
            {d.myFollowUps.slice(0, 4).map((f) => {
              const st = followUpState(f);
              return (
                <Link key={f.id} to={`/dealers/${encodeURIComponent(f.dealerId)}`} className="fu-row">
                  <span style={{ minWidth: 0 }}>
                    <span className="fu-name">{f.dealerName}</span>
                    <span className="text-xs muted" style={{ fontWeight: 600 }}>{fmtDay(f.date)}{f.byUid !== user.uid ? ` · ${f.byName}` : ''}</span>
                  </span>
                  <Badge tone={st.tone}>{st.label}</Badge>
                </Link>
              );
            })}
          </HCard>
        )}

        <HCard to={`/dealers?${q}`} icon={<Store />} title={sc.scope === 'mine' ? 'Bayilerim' : 'Bayiler'}
          desc="Bayi ara, devreye alımlarını ve ziyaretlerini gör"
          footer={<Link to={`/dealers?visit=unvisited&status=ACTIVE&${q}`} className="btn-link text-sm">Hiç ziyaret edilmemiş bayiler</Link>}>
          {d ? (
            <div className="mini-stats">
              <Link to={`/dealers?status=ACTIVE&${q}`}><span className="num">{fmtNum(d.activeCount)}</span>Aktif bayi</Link>
              <Link to={`/dealers?visit=visited&status=ACTIVE&${q}`}><span className="num">%{pct(d.activeVisited, d.activeCount)}</span>Ziyaret edildi</Link>
              <Link to={`/dealers?visit=unvisited&status=ACTIVE&${q}`}><span className="num t-amber">{fmtNum(d.unvisited)}</span>Hiç gidilmedi</Link>
            </div>
          ) : <Skeleton height={64} />}
        </HCard>

        <HCard to={`/registrations?${q}`} icon={<Clip />} tone="blue" title={userRole === 'rep' ? 'Kayıtlarım' : 'Kayıtlar'}
          desc="Saha kayıtları ve kurulum takibi"
          footer={d?.lastVisit ? <span className="text-xs muted">Son ziyaret: {d.lastVisit.toLocaleDateString('tr-TR')}</span> : null}>
          {d ? (
            <div className="bars">
              <Link to={`/registrations?period=7&${q}`} className="bar-row"><span>Son 7 gün ziyaret</span><b className="num">{d.week}</b></Link>
              <Link to={`/registrations?special=install&${q}`} className="bar-row">
                <span>Kurulum bekleyen</span><b className="num">{d.pending}</b>
                <i className="bar"><em style={{ width: `${pct(d.pending - d.overdue, Math.max(1, d.pending))}%`, background: 'var(--amber)' }} /></i>
              </Link>
              <Link to={`/registrations?special=overdue&${q}`} className="bar-row">
                <span>{OVERDUE_DAYS} günü geçen</span><b className="num" style={{ color: d.overdue ? 'var(--danger)' : undefined }}>{d.overdue}</b>
                <i className="bar"><em style={{ width: `${pct(d.overdue, Math.max(1, d.pending))}%`, background: 'var(--danger)' }} /></i>
              </Link>
            </div>
          ) : <Skeleton height={80} />}
        </HCard>

        <HCard to={`/requests${sc.scope === 'mine' ? '?mine=1' : ''}`} icon={<Chat />} tone="amber" title="Talepler"
          desc="Katalog, eğitim ve servis talepleri"
          badge={d?.openReq.length ? <Badge tone="warn">{d.openReq.length} açık</Badge> : null}>
          {d && (d.openReq.length === 0 ? <p className="text-sm muted" style={{ margin: 0 }}>Açık talep yok.</p> : (
            <>
              <div className="chips" style={{ marginTop: 0 }}>
                {Object.entries(REQUEST_TYPES).map(([k, t]) => {
                  const n = d.openReq.filter((x) => x.type === k).length;
                  return n ? <span key={k} className="chip" style={{ cursor: 'default' }}>{t.label} {n}</span> : null;
                })}
              </div>
              {d.openReq.slice(0, 2).map((x) => (
                <Link key={x.id} to={`/dealers/${encodeURIComponent(x.dealerId)}`} className="mini-link">
                  <b>{requestSummary(x)}</b><span>{x.dealerName}</span>
                </Link>
              ))}
            </>
          ))}
        </HCard>

        <HCard to="/pano" icon={<Mega />} tone="violet" title="Pano" desc="Duyurular, kampanyalar ve ekipten paylaşımlar"
          badge={newPosts ? <Badge tone="danger">{newPosts} yeni</Badge> : null}>
          {posts && (posts.length === 0 ? <p className="text-sm muted" style={{ margin: 0 }}>Henüz paylaşım yok.</p> : posts.slice(0, 2).map((p) => (
            <Link key={p.id} to="/pano" className="post-mini">
              <Avatar name={p.byName} src={p.byRepKey ? profiles[p.byRepKey]?.url : null} size={30} />
              <span style={{ minWidth: 0 }}>
                <b>{p.pinned && '📌 '}{p.photo && '📷 '}{p.byName}</b>
                <span className="clamp2">{p.text}</span>
              </span>
            </Link>
          )))}
        </HCard>

        <HCard to="/dashboard" icon={<Chart />} tone="green" title="Dashboard" desc="Ziyaret trendi, kurulumlar, kapsama ve rakipler"
          badge={d?.declineTotal ? <Badge tone="danger">{d.declineTotal} düşüşte</Badge> : null}>
          {d && (d.silent.length === 0 ? <p className="text-sm muted" style={{ margin: 0 }}>Bu yıl alımı duran bayi yok.</p> : (
            <>
              <div className="text-xs muted" style={{ fontWeight: 700, marginBottom: 6 }}>Bu yıl hiç almayan, geçen yıl güçlü bayiler</div>
              <div className="mini-table">
                {d.silent.map((x) => (
                  <Link key={x.e.i} to={`/dealers/${encodeURIComponent(x.e.i)}`}>
                    <span className="mt-name">{x.e.n}</span>
                    <span className="mt-city">{x.e.c}</span>
                    <span className="num mt-val">{fmtNum(x.fy25)} <small>FY25</small></span>
                  </Link>
                ))}
              </div>
            </>
          ))}
        </HCard>
      </div>
    </div>
  );
}

// src/pages/HomePage.jsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { db } from '../firebase';
import { useAuth, ROLE_LABELS } from '../contexts/AuthContext';
import { getDealerIndex } from '../utils/dealerIndex';
import { Avatar, fmtNum } from '../components/ui';
import { useRepProfiles } from '../utils/repProfiles';
import { OVERDUE_DAYS, getRegistrations, overdueInstall } from '../utils/registrationStore';
import { useLastBackup } from '../utils/backup';
import { fmtDay, followUpState, loadOpenFollowUps } from '../utils/followUps';
import { loadRequests } from '../utils/requests';
import { declineLists } from '../utils/decline';
import { lastSeenPosts, loadPosts } from '../utils/posts';
import { Badge } from '../components/ui';

function Action({ to, title, desc, primary }) {
  return (
    <Link to={to} className={primary ? 'home-action home-action-primary' : 'home-action'}>
      <div>
        <div className="home-action-title">{title}</div>
        <div className="home-action-desc">{desc}</div>
      </div>
      <span aria-hidden="true" className="home-action-arrow">›</span>
    </Link>
  );
}

export default function HomePage() {
  const { user, userRole, userProfile, isOwner, canRegister } = useAuth();
  const myKey = userProfile?.salesRepKey;
  const [counts, setCounts] = useState(null);
  const [followUps, setFollowUps] = useState([]);
  const [openRequests, setOpenRequests] = useState(0);
  const [decline, setDecline] = useState(null);
  const [posts, setPosts] = useState(null);
  const profiles = useRepProfiles(db);
  const [myOverdue, setMyOverdue] = useState(0);
  const lastBackup = useLastBackup(isOwner);

  useEffect(() => {
    if (!canRegister) return;
    getRegistrations(db).then(({ list }) => {
      setMyOverdue(list.filter((r) => (r.createdByUid === user.uid || (myKey && r.salesRepKey === myKey)) && overdueInstall(r)).length);
    }).catch(() => {});
  }, [canRegister, myKey, user.uid]);

  useEffect(() => {
    getDealerIndex(db).then(({ entries }) => {
      const mine = myKey ? entries.filter((e) => e.k === myKey) : [];
      setCounts({ all: entries.length, mine: mine.length, mineActive: mine.filter((e) => e.s === 'ACTIVE').length });
      const myDealers = new Set(mine.map((e) => e.i));
      if (myKey) {
        const l = declineLists(mine);
        setDecline({ declined: l.declined.length, silent: l.silent.length, top: [...l.silent, ...l.declined].slice(0, 3) });
      }
      // Takiplerim: benim kurduklarım ya da benim bayilerim için kurulanlar (7 gün içindekiler ve gecikenler)
      if (canRegister) {
        loadOpenFollowUps(db).then((list) => setFollowUps(list.filter((f) =>
          (f.byUid === user.uid || myDealers.has(f.dealerId)) && followUpState(f).key !== 'later'))).catch(() => {});
        loadRequests(db).then((list) => setOpenRequests(list.filter((q) => q.status === 'open' &&
          (q.createdByUid === user.uid || myDealers.has(q.dealerId))).length)).catch(() => {});
      }
    }).catch(() => {});
    loadPosts(db).then(setPosts).catch(() => setPosts([]));
  }, [myKey, canRegister, user.uid]);

  const seen = lastSeenPosts();
  const newPosts = (posts || []).filter((p) => p.byUid !== user.uid && p.date && p.date.getTime() > seen).length;
  const lateCount = followUps.filter((f) => followUpState(f).key === 'late').length;

  const name = userProfile?.name || user?.email?.split('@')[0];
  const firstName = (userProfile?.name || '').split(' ')[0] || name;

  return (
    <div className="page-narrow">
      <div className="row" style={{ gap: 14, margin: '6px 0 22px', flexWrap: 'nowrap' }}>
        <Avatar name={name} src={myKey ? profiles[myKey]?.url : null} size={52} />
        <div style={{ minWidth: 0 }}>
          <h1 className="page-title">Merhaba, {firstName}</h1>
          <div className="page-subtitle">
            {counts
              ? myKey
                ? `${fmtNum(counts.mine)} bayin var, ${fmtNum(counts.mineActive)} tanesi aktif.`
                : `Sistemde ${fmtNum(counts.all)} bayi kayıtlı.`
              : ROLE_LABELS[userRole]}
          </div>
        </div>
      </div>

      {myOverdue > 0 && (
        <Link to="/registrations?special=overdue&scope=mine" className="reminder reminder-danger">
          <strong>{myOverdue} kurulumun {OVERDUE_DAYS} günü geçti</strong>
          <span>Kurulum yapıldıysa kayda kurulum fotoğrafını ekle. Listeyi görmek için dokun.</span>
        </Link>
      )}
      {isOwner && lastBackup.due && (
        <Link to="/admin/backup" className="reminder reminder-warn">
          <strong>{lastBackup.days === null ? 'Henüz hiç yedek alınmadı' : `Son yedek ${lastBackup.days} gün önce alındı`}</strong>
          <span>Verilerin bir kopyasını bilgisayarına indirmek için dokun.</span>
        </Link>
      )}

      {followUps.length > 0 && (
        <div className="card mb-16" style={lateCount ? { borderColor: 'var(--danger-border)' } : undefined}>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
            <h2 className="card-title">📅 Takiplerin</h2>
            {lateCount > 0 && <Badge tone="danger">{lateCount} gecikmiş</Badge>}
          </div>
          {followUps.slice(0, 6).map((f) => {
            const st = followUpState(f);
            return (
              <Link key={f.id} to={`/dealers/${encodeURIComponent(f.dealerId)}`} className="fu-row">
                <span style={{ minWidth: 0 }}>
                  <span style={{ fontWeight: 700, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.dealerName}</span>
                  <span className="text-xs muted" style={{ fontWeight: 600 }}>{fmtDay(f.date)}{f.byUid !== user.uid ? ` · ${f.byName}` : ''}</span>
                </span>
                <Badge tone={st.tone}>{st.label}</Badge>
              </Link>
            );
          })}
        </div>
      )}

      <div className="stack">
        {canRegister && <Action to="/registrations/new" primary title="+ Yeni saha kaydı" desc="Bayi ziyaretini fotoğraf ve konumla kaydet" />}
        <Action to="/dealers" title={myKey ? 'Bayilerim' : 'Bayiler'} desc="Bayi ara, devreye alımlarını ve geçmiş kayıtlarını gör" />
        <Action to="/registrations" title={userRole === 'rep' ? 'Kayıtlarım' : 'Kayıtlar'} desc="Saha kayıtları ve kurulum bekleyen talepler" />
        {canRegister && (
          <Action to="/requests?mine=1" title={`Taleplerim${openRequests ? ` · ${openRequests} açık` : ''}`} desc="Katalog, eğitim ve servis talepleri" />
        )}
        {decline && (decline.declined + decline.silent) > 0 && (
          <Link to="/dashboard#dusus" className="home-action">
            <div style={{ minWidth: 0 }}>
              <div className="home-action-title">Düşüşteki bayilerin · {decline.declined + decline.silent}</div>
              <div className="home-action-desc">{decline.silent} bayi bu yıl hiç almadı, {decline.declined} bayi geçen yıl geriledi</div>
            </div>
            <span aria-hidden="true" className="home-action-arrow">›</span>
          </Link>
        )}
        <Link to="/pano" className="home-action" style={{ display: 'block' }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div className="home-action-title">Pano {newPosts > 0 && <Badge tone="danger">{newPosts} yeni</Badge>}</div>
            <span aria-hidden="true" className="home-action-arrow">›</span>
          </div>
          {posts && posts.length > 0 ? posts.slice(0, 2).map((p) => (
            <div key={p.id} className="text-sm" style={{ marginTop: 8, color: 'var(--ink-2)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {p.pinned && '📌 '}{p.photo && '📷 '}<strong>{p.byName}:</strong> {p.text}
            </div>
          )) : <div className="home-action-desc">Duyurular ve ekipten paylaşımlar</div>}
        </Link>
        <Action to="/dashboard" title="Dashboard" desc="Ziyaretler, kurulumlar ve öncelikli bayiler" />
        {isOwner && <Action to="/admin" title="Yönetim" desc="Kullanıcılar, veri yükleme ve temsilci fotoğrafları" />}
      </div>
    </div>
  );
}

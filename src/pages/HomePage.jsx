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
    }).catch(() => {});
  }, [myKey]);

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

      <div className="stack">
        {canRegister && <Action to="/registrations/new" primary title="+ Yeni saha kaydı" desc="Bayi ziyaretini fotoğraf ve konumla kaydet" />}
        <Action to="/dealers" title={myKey ? 'Bayilerim' : 'Bayiler'} desc="Bayi ara, devreye alımlarını ve geçmiş kayıtlarını gör" />
        <Action to="/registrations" title={userRole === 'rep' ? 'Kayıtlarım' : 'Kayıtlar'} desc="Saha kayıtları ve kurulum bekleyen talepler" />
        <Action to="/dashboard" title="Dashboard" desc="Ziyaretler, kurulumlar ve öncelikli bayiler" />
        {isOwner && <Action to="/admin" title="Yönetim" desc="Kullanıcılar, veri yükleme ve temsilci fotoğrafları" />}
      </div>
    </div>
  );
}

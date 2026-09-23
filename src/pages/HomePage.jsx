// src/pages/HomePage.jsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { getDealerIndex } from '../utils/dealerIndex';

const C = { red: '#B91724', redBg: '#fdf0f0', text: '#2b2b2b', muted: '#7a7570', border: '#e5e3df' };

function Action({ to, title, desc, primary }) {
  return (
    <Link to={to} style={{
      display: 'block', textDecoration: 'none', borderRadius: 14, padding: '18px 18px',
      background: primary ? C.red : 'white', color: primary ? 'white' : C.text,
      border: primary ? 'none' : `1px solid ${C.border}`,
      boxShadow: primary ? '0 6px 16px rgba(185,23,36,.25)' : 'none',
    }}>
      <div style={{ fontSize: 17, fontWeight: 700 }}>{title}</div>
      <div style={{ fontSize: 13, marginTop: 4, color: primary ? 'rgba(255,255,255,.85)' : C.muted }}>{desc}</div>
    </Link>
  );
}

export default function HomePage() {
  const { user, userRole, userProfile } = useAuth();
  const isAdmin = userRole === 'admin';
  const myKey = userProfile?.salesRepKey;
  const [counts, setCounts] = useState(null);

  useEffect(() => {
    getDealerIndex(db).then(({ entries }) => {
      const mine = myKey ? entries.filter((e) => e.k === myKey) : [];
      setCounts({ all: entries.length, mine: mine.length, mineActive: mine.filter((e) => e.s === 'ACTIVE').length });
    }).catch(() => {});
  }, [myKey]);

  const firstName = (userProfile?.name || '').split(' ')[0] || user?.email?.split('@')[0];

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', textAlign: 'left' }}>
      <div style={{ margin: '6px 0 20px' }}>
        <h1 style={{ fontSize: 24, color: C.text }}>Merhaba, {firstName}</h1>
        <p style={{ fontSize: 14, color: C.muted, marginTop: 4 }}>
          {counts
            ? myKey
              ? `${counts.mine.toLocaleString('tr-TR')} bayin var, ${counts.mineActive.toLocaleString('tr-TR')} tanesi aktif.`
              : `Sistemde ${counts.all.toLocaleString('tr-TR')} bayi kayıtlı.`
            : 'Airfel Bayi Takip Sistemi'}
        </p>
      </div>

      <div style={{ display: 'grid', gap: 12 }}>
        <Action to="/registrations/new" primary title="+ Yeni saha kaydı" desc="Bayi ziyaretini fotoğraf ve konumla kaydet" />
        <Action to="/dealers" title={myKey ? 'Bayilerim' : 'Bayiler'} desc="Bayi ara, satışlarını ve geçmiş kayıtlarını gör" />
        <Action to="/registrations" title={isAdmin ? 'Kayıtlar' : 'Kayıtlarım'} desc="Girilen kayıtlar ve kurulum bekleyen talepler" />
        {isAdmin && <Action to="/admin" title="Yönetim" desc="Kullanıcılar, veri yükleme ve dashboard" />}
      </div>
    </div>
  );
}

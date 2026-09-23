// src/pages/AdminMenuPage.jsx — telefonda "Yönetim" sekmesi
import { Link } from 'react-router-dom';

const C = { text: '#2b2b2b', muted: '#7a7570', border: '#e5e3df' };
const items = [
  { to: '/dashboard', title: 'Dashboard', desc: 'Temsilci ve bölge bazında özet rakamlar' },
  { to: '/admin/users', title: 'Kullanıcılar', desc: 'Temsilci hesaplarını aç, düzenle, pasif yap' },
  { to: '/admin/sync', title: 'Veri Yükle', desc: 'Customer Data Excel dosyasıyla bayi listesini güncelle' },
];

export default function AdminMenuPage() {
  return (
    <div style={{ maxWidth: 640, margin: '0 auto', textAlign: 'left' }}>
      <h1 style={{ fontSize: 22, color: C.text, margin: '6px 0 16px' }}>Yönetim</h1>
      <div style={{ background: 'white', border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
        {items.map((it, i) => (
          <Link key={it.to} to={it.to} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
            padding: '16px 18px', textDecoration: 'none', color: C.text, borderTop: i ? `1px solid ${C.border}` : 'none',
          }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{it.title}</div>
              <div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>{it.desc}</div>
            </div>
            <span aria-hidden="true" style={{ color: C.muted, fontSize: 20 }}>›</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

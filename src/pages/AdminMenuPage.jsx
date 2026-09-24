// src/pages/AdminMenuPage.jsx — telefonda "Yönetim" sekmesi
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/ui';

const items = [
  { to: '/dashboard', title: 'Dashboard', desc: 'Temsilci ve bölge bazında özet rakamlar' },
  { to: '/admin/users', title: 'Kullanıcılar', desc: 'Hesap aç, rol ver, pasif yap; temsilci fotoğrafları' },
  { to: '/admin/sync', title: 'Veri Yükle', desc: 'Customer Data Excel dosyasıyla bayi listesini güncelle' },
];

export default function AdminMenuPage() {
  return (
    <div className="page-narrow">
      <PageHeader title="Yönetim" />
      <div className="card card-flush">
        {items.map((it) => (
          <Link key={it.to} to={it.to} className="list-row">
            <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
              <div>
                <div className="list-row-title" style={{ fontSize: 16 }}>{it.title}</div>
                <div className="list-row-meta">{it.desc}</div>
              </div>
              <span aria-hidden="true" className="home-action-arrow">›</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

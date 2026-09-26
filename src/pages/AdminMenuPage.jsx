// src/pages/AdminMenuPage.jsx — telefonda "Yönetim" sekmesi
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/ui';
import { useLastBackup } from '../utils/backup';

const items = [
  { to: '/dashboard', title: 'Dashboard', desc: 'Temsilci ve bölge bazında özet rakamlar' },
  { to: '/admin/users', title: 'Ekip ve kullanıcılar', desc: 'Ekip ağacı, görevler, fotoğraflar ve hesaplar' },
  { to: '/admin/sync', title: 'Veri Yükle', desc: 'Customer Data Excel dosyasıyla bayi listesini güncelle' },
  { to: '/admin/backup', title: 'Yedek al', desc: 'Tüm verilerin bir kopyasını bilgisayarına indir', backup: true },
];

export default function AdminMenuPage() {
  const last = useLastBackup(true);
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
                {it.backup && last.loaded && (
                  <div className="text-xs" style={{ marginTop: 4, fontWeight: 700, color: last.due ? 'var(--amber)' : 'var(--green)' }}>
                    {last.days === null ? 'Henüz yedek alınmadı' : `Son yedek: ${last.days === 0 ? 'bugün' : `${last.days} gün önce`}`}
                  </div>
                )}
              </div>
              <span aria-hidden="true" className="home-action-arrow">›</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

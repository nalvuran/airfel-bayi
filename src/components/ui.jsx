// src/components/ui.jsx
// Tüm sayfalarda kullanılan ortak arayüz bileşenleri. Görünüm index.css'teki sınıflardan gelir.
import { Link } from 'react-router-dom';

const cx = (...a) => a.filter(Boolean).join(' ');

export function PageHeader({ title, subtitle, back, actions }) {
  return (
    <>
      {back && <Link to={back.to} className="back-link">← {back.label}</Link>}
      <div className="page-header">
        <div style={{ minWidth: 0 }}>
          <h1 className="page-title">{title}</h1>
          {subtitle && <div className="page-subtitle">{subtitle}</div>}
        </div>
        {actions && <div className="row">{actions}</div>}
      </div>
    </>
  );
}

export function Card({ title, desc, actions, flush, className, children, ...rest }) {
  return (
    <section className={cx('card', flush && 'card-flush', className)} {...rest}>
      {(title || actions) && (
        <div className="card-header" style={flush ? { padding: '14px 16px 0' } : undefined}>
          <div>
            {title && <h2 className="card-title">{title}</h2>}
            {desc && <div className="card-desc">{desc}</div>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Badge({ tone, children }) {
  return <span className={cx('badge', tone && `badge-${tone}`)}>{children}</span>;
}

export function Alert({ tone = 'info', children, style }) {
  if (!children) return null;
  return <div className={`alert alert-${tone}`} role={tone === 'danger' ? 'alert' : undefined} style={style}>{children}</div>;
}

export function Stat({ value, label, tone }) {
  return (
    <div className={cx('stat', tone && `stat-${tone}`)}>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

export function Info({ label, children }) {
  return (
    <div>
      <div className="info-label">{label}</div>
      <div className="info-value">{children || '-'}</div>
    </div>
  );
}

export function Empty({ title, children }) {
  return (
    <div className="empty">
      {title && <div className="empty-title">{title}</div>}
      {children}
    </div>
  );
}

export function Skeleton({ width = '100%', height = 14, radius, style }) {
  return <div className="skeleton" style={{ width, height, borderRadius: radius, ...style }} aria-hidden="true" />;
}

// Liste yüklenirken gösterilen yer tutucu satırlar
export function SkeletonRows({ rows = 6 }) {
  return (
    <div className="card card-flush" aria-busy="true" aria-label="Yükleniyor">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="list-row">
          <Skeleton width={`${55 + ((i * 17) % 35)}%`} height={15} />
          <Skeleton width={`${35 + ((i * 11) % 25)}%`} height={11} style={{ marginTop: 8 }} />
        </div>
      ))}
    </div>
  );
}

const initials = (name) => (name || '?')
  .split(/\s+/).filter(Boolean)
  .map((w) => w[0]).slice(0, 2).join('')
  .toLocaleUpperCase('tr-TR');

export function Avatar({ name, src, size = 36 }) {
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }} title={name}>
      {src ? <img src={src} alt={name || ''} /> : initials(name)}
    </span>
  );
}

// Aktif / Askıda durum rozeti
export function StatusBadge({ status }) {
  if (status === 'ACTIVE') return <Badge tone="success">Aktif</Badge>;
  if (status === 'SUSPEND') return <Badge>Askıda</Badge>;
  return status ? <Badge>{status}</Badge> : null;
}

export const fmtNum = (n) => (n ?? 0).toLocaleString('tr-TR');

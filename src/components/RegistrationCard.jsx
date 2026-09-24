// src/components/RegistrationCard.jsx
// Kayıtlar sayfasındaki fotoğraflı kart (eski sistemdeki kart düzeninden esinlenildi).
import { Link } from 'react-router-dom';
import { db } from '../firebase';
import { useThumbs } from '../utils/thumbs';
import { installWaitDays, overdueInstall, waitingInstall } from '../utils/registrationStore';
import DevreyeTable, { salesFromIndex } from './DevreyeTable';
import { Avatar, Badge } from './ui';

const fmtDateTime = (d) => (d
  ? d.toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '-');

const hasInstallPhoto = (r) => !!(r.photoFiles?.exteriorAfter || r.photoFiles?.interiorAfter);

function Thumb({ url, label, loading, onOpen, canOpen }) {
  return (
    <button
      type="button" className="rc-thumb" onClick={canOpen ? onOpen : undefined} disabled={!canOpen}
      aria-label={canOpen ? `${label} fotoğrafını büyüt` : `${label} fotoğrafı yok`}
    >
      {url ? <img src={url} alt={label} loading="lazy" /> : loading ? <span className="skeleton rc-thumb-fill" /> : <span className="rc-thumb-empty">{canOpen ? 'Önizleme yok' : 'Fotoğraf yok'}</span>}
      <span className="rc-thumb-label">{label}</span>
    </button>
  );
}

function YesNo({ label, value }) {
  return (
    <div className="rc-yesno">
      <span className="muted">{label}</span>
      {value === true ? <Badge tone="success">Evet</Badge> : value === false ? <Badge>Hayır</Badge> : <span className="muted">-</span>}
    </div>
  );
}

export default function RegistrationCard({ r, dealer, repPhoto, onOpenPhoto }) {
  const [ref, thumbs] = useThumbs(db, r.id, !!r.thumbs);
  const t = thumbs && thumbs !== 'none' ? thumbs : {};
  const loadingThumbs = r.thumbs && thumbs === null;
  const sales = salesFromIndex(dealer?.v);
  const loc = r.location ? `https://www.google.com/maps?q=${r.location.lat},${r.location.lng}` : r.mapsUrl;
  const title = dealer?.n || r.dealerName || r.companyTitle || 'Bayi eşleşmemiş';
  const detailUrl = r.dealerId ? `/dealers/${encodeURIComponent(r.dealerId)}` : null;

  const open = (slot, label) => onOpenPhoto({ photoId: r.photoFiles?.[slot]?.photoId, label: `${label} · ${title}` });

  return (
    <article className="rc" ref={ref}>
      <div className="rc-photos">
        <Thumb url={t.exterior} label="Dış cephe" loading={loadingThumbs} canOpen={!!r.photoFiles?.exterior} onOpen={() => open('exterior', 'Dış cephe')} />
        <Thumb url={t.interior} label="Dükkan içi" loading={loadingThumbs} canOpen={!!r.photoFiles?.interior} onOpen={() => open('interior', 'Dükkan içi')} />
      </div>

      <div className="rc-body">
        {detailUrl
          ? <Link to={detailUrl} className="rc-title">{title}</Link>
          : <div className="rc-title">{title}</div>}
        {r.contactName && <div className="rc-contact">{r.contactName}</div>}

        <div className="rc-meta">
          <div className="rc-rep">
            <Avatar name={r.salesRep} src={repPhoto} size={24} />
            <span>{r.salesRep || '-'}</span>
          </div>
          {r.distributor && <div className="rc-line">{r.distributor}</div>}
          <div className="rc-line muted">{[r.dealerId && !r.dealerId.startsWith('NOID-') ? r.dealerId : null, dealer && [dealer.d, dealer.c].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}</div>
        </div>

        {sales && <div className="mt-12"><DevreyeTable sales={sales} compact /></div>}

        <div className="rc-flags">
          <YesNo label="Tabela" value={r.signRequest} />
          <YesNo label="Stant" value={r.standRequest} />
        </div>

        {(waitingInstall(r) || hasInstallPhoto(r) || r.needsReview || r.editCount > 0 || r.attention) && (
          <div className="row" style={{ gap: 6, marginTop: 10 }}>
            {r.attention && <Badge tone="warn">Kurulumdan sonra değiştirildi</Badge>}
            {r.editCount > 0 && <Badge>Düzenlendi</Badge>}
            {waitingInstall(r) && (
              <Badge tone={overdueInstall(r) ? 'danger' : 'warn'}>
                {overdueInstall(r) ? `Kurulum ${installWaitDays(r)} gündür bekliyor` : 'Kurulum bekliyor'}
              </Badge>
            )}
            {hasInstallPhoto(r) && <Badge tone="success">Kurulum fotoğrafı var</Badge>}
            {r.needsReview && <Badge tone="danger">Kontrol gerekli</Badge>}
          </div>
        )}

        <div className="rc-footer">
          <span className="num">{fmtDateTime(r.date)}</span>
          {loc && <a href={loc} target="_blank" rel="noreferrer" className="btn-link text-sm">Haritada aç</a>}
        </div>
      </div>
    </article>
  );
}

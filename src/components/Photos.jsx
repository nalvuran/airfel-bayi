// src/components/Photos.jsx
// Firestore'daki fotoğrafı gösterme ve büyütme (lightbox) bileşenleri.
import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

export const SLOT_LABEL = {
  exterior: 'Dış cephe', interior: 'Dükkan içi',
  exteriorAfter: 'Dış cephe (sonrası)', interiorAfter: 'Dükkan içi (sonrası)',
};

// photos/{photoId} dokümanını okuyup tarayıcıda gösterilebilir bir adrese çevirir
export function usePhotoUrl(photoId) {
  const [state, setState] = useState({ url: null, status: photoId ? 'loading' : 'none' });
  useEffect(() => {
    if (!photoId) { setState({ url: null, status: 'none' }); return undefined; }
    let url = null;
    let cancelled = false;
    setState({ url: null, status: 'loading' });
    getDoc(doc(db, 'photos', photoId))
      .then((snap) => {
        if (cancelled) return;
        if (!snap.exists()) { setState({ url: null, status: 'missing' }); return; }
        const p = snap.data();
        url = URL.createObjectURL(new Blob([p.data.toUint8Array()], { type: p.contentType || 'image/jpeg' }));
        setState({ url, status: 'ok' });
      })
      .catch(() => { if (!cancelled) setState({ url: null, status: 'error' }); });
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [photoId]);
  return state;
}

export function Photo({ info, driveUrl, label, onOpen }) {
  const { url, status } = usePhotoUrl(info?.photoId);
  const box = {
    width: '100%', aspectRatio: '4 / 3', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: 'var(--muted)', overflow: 'hidden', position: 'relative',
  };
  return (
    <figure style={{ margin: 0 }}>
      {status === 'ok' ? (
        <button onClick={() => onOpen({ src: url, label })} style={{ ...box, padding: 0, cursor: 'zoom-in' }} aria-label={`${label} fotoğrafını büyüt`}>
          <img src={url} alt={label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </button>
      ) : status === 'loading' ? (
        <div className="skeleton" style={{ ...box, border: 'none' }} aria-label="Fotoğraf yükleniyor" />
      ) : (
        <div style={box}>
          {status === 'none' && (driveUrl ? <a href={driveUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--red)', fontWeight: 700 }}>Drive'da aç</a> : 'Fotoğraf yok')}
          {(status === 'missing' || status === 'error') && 'Fotoğraf açılamadı'}
        </div>
      )}
      <figcaption className="text-xs muted" style={{ marginTop: 6, fontWeight: 600 }}>{label}</figcaption>
    </figure>
  );
}

export function Lightbox({ photo, onClose }) {
  useEffect(() => {
    if (!photo) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [photo, onClose]);
  if (!photo) return null;
  return (
    <div
      onClick={onClose} role="dialog" aria-modal="true" aria-label={photo.label}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,15,15,.88)', zIndex: 1000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 16, cursor: 'zoom-out' }}
    >
      <img src={photo.src} alt={photo.label} style={{ maxWidth: '100%', maxHeight: '82vh', borderRadius: 8 }} />
      <div style={{ color: '#fff', fontSize: 14, marginTop: 12, fontWeight: 600, textAlign: 'center' }}>{photo.label}</div>
      <div style={{ color: 'rgba(255,255,255,.6)', fontSize: 12, marginTop: 4 }}>Kapatmak için dokun</div>
    </div>
  );
}

// Fotoğrafı kimliğinden yükleyip büyütülmüş olarak gösterir (kayıt kartlarında kullanılır)
export function PhotoLightbox({ photo, onClose }) {
  const { url, status } = usePhotoUrl(photo?.photoId);
  if (!photo) return null;
  if (status === 'ok') return <Lightbox photo={{ src: url, label: photo.label }} onClose={onClose} />;
  return (
    <div onClick={onClose} role="dialog" aria-modal="true"
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,15,15,.88)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700 }}>
      {status === 'loading' ? 'Fotoğraf yükleniyor…' : 'Fotoğraf açılamadı'}
    </div>
  );
}

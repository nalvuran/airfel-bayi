// src/components/PhotoInput.jsx
// Tek bir fotoğraf alanı. input'ta "capture" olmadığı için telefon hem kamerayı hem galeriyi sunar.
import { useEffect, useId, useState } from 'react';
import { compressImage } from '../utils/image';

const C = { red: '#B91724', text: '#2b2b2b', muted: '#7a7570', border: '#e5e3df', soft: '#f8f7f5' };

export default function PhotoInput({ label, value, onChange, required, disabled }) {
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => () => { if (value?.previewUrl) URL.revokeObjectURL(value.previewUrl); }, [value]);

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true); setError('');
    try { onChange(await compressImage(file)); } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  const box = {
    width: '100%', aspectRatio: '4 / 3', borderRadius: 10, overflow: 'hidden', boxSizing: 'border-box',
    border: value ? `1px solid ${C.border}` : `2px dashed ${error ? C.red : C.border}`, background: C.soft,
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    gap: 6, color: C.muted, fontSize: 13, cursor: disabled ? 'default' : 'pointer', textAlign: 'center', padding: 8,
  };

  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 6 }}>
        {label}{required && <span style={{ color: C.red }}> *</span>}
      </div>
      <label htmlFor={id} style={value ? { ...box, padding: 0 } : box}>
        {busy && 'Fotoğraf hazırlanıyor…'}
        {!busy && value && <img src={value.previewUrl} alt={label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
        {!busy && !value && (
          <>
            <span style={{ fontSize: 28, lineHeight: 1 }} aria-hidden="true">📷</span>
            <span>Fotoğraf çek veya galeriden seç</span>
          </>
        )}
      </label>
      <input id={id} type="file" accept="image/*" onChange={onFile} disabled={disabled || busy} style={{ display: 'none' }} />
      {value && !disabled && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 12, color: C.muted }}>
          <span>{Math.round(value.size / 1024)} KB</span>
          <button type="button" onClick={() => onChange(null)} style={{ background: 'none', border: 'none', padding: 0, color: C.red, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            Kaldır
          </button>
        </div>
      )}
      {error && <div style={{ fontSize: 12, color: C.red, marginTop: 6 }}>{error}</div>}
    </div>
  );
}

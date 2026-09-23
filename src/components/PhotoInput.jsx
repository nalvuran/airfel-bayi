// src/components/PhotoInput.jsx
// Tek bir fotoğraf alanı. input'ta "capture" olmadığı için telefon hem kamerayı hem galeriyi sunar.
import { useEffect, useId, useState } from 'react';
import { compressImage } from '../utils/image';


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
    border: value ? '1px solid var(--border)' : `2px dashed ${error ? 'var(--red)' : 'var(--border-strong)'}`, background: 'var(--surface-2)',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    gap: 6, color: 'var(--muted)', fontSize: 13, fontWeight: 600, cursor: disabled ? 'default' : 'pointer', textAlign: 'center', padding: 8,
  };

  return (
    <div>
      <div className="label">{label}{required && <span className="req"> *</span>}</div>
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
        <div className="text-xs muted" style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontWeight: 600 }}>
          <span>{Math.round(value.size / 1024)} KB</span>
          <button type="button" className="btn-link" style={{ fontSize: 12 }} onClick={() => onChange(null)}>
            Kaldır
          </button>
        </div>
      )}
      {error && <div className="text-xs" style={{ color: 'var(--danger)', marginTop: 6, fontWeight: 600 }}>{error}</div>}
    </div>
  );
}

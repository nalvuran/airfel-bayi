// src/components/FormFields.jsx
// Kayıt formunda ve kayıt düzenlemede ortak kullanılan alanlar.
import { useMemo, useState } from 'react';
import { fold } from '../utils/dealerIndex';
import { coordsFromMapsUrl, getGpsPosition, isMapsLink, isShortMapsLink, mapsUrlFor } from '../utils/geo';
import { Alert } from './ui';

export const Req = () => <span className="req"> *</span>;

/* ---------- Bayi seçici ---------- */

export function DealerPicker({ entries, value, onChange, myKey }) {
  const [q, setQ] = useState('');
  const results = useMemo(() => {
    const words = fold(q).split(' ').filter(Boolean);
    if (!words.length) return [];
    return entries
      .filter((e) => words.every((w) => e.search.includes(w)))
      .sort((a, b) => (b.k === myKey) - (a.k === myKey) || b.q - a.q)
      .slice(0, 8);
  }, [q, entries, myKey]);

  if (value) {
    return (
      <div className="row" style={{ justifyContent: 'space-between', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', flexWrap: 'nowrap' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>{value.n}</div>
          <div className="text-sm muted" style={{ marginTop: 2 }}>{value.i} · {[value.d, value.c].filter(Boolean).join(', ')}</div>
        </div>
        <button type="button" className="btn-link" onClick={() => { onChange(null); setQ(''); }}>Değiştir</button>
      </div>
    );
  }
  return (
    <div>
      <input type="search" className="input input-lg" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Bayi adı, Platform ID veya ilçe yaz" autoFocus />
      {q && results.length === 0 && <div className="text-sm muted mt-8">Eşleşen bayi yok. Kayıt sadece listedeki bayilere girilebilir.</div>}
      {results.length > 0 && (
        <div className="card card-flush mt-8" style={{ boxShadow: 'none' }}>
          {results.map((e) => (
            <button type="button" key={e.i} onClick={() => onChange(e)} className="list-row"
              style={{ width: '100%', textAlign: 'left', background: 'var(--surface)', border: 'none', borderTop: '1px solid var(--border)', cursor: 'pointer' }}>
              <div className="list-row-title" style={{ fontSize: 14 }}>{e.n}</div>
              <div className="list-row-meta">{e.i} · {[e.d, e.c].filter(Boolean).join(', ')} · {e.k === myKey ? 'senin bayin' : e.r}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- Evet / Hayır: seçili Evet yeşil, seçili Hayır kırmızı ---------- */

export function YesNo({ label, value, onChange }) {
  const b = (active, yes) => {
    const fg = yes ? 'var(--green)' : 'var(--danger)';
    const bg = yes ? 'var(--green-soft)' : 'var(--danger-soft)';
    return {
      flex: 1, padding: '11px 0', fontSize: 15, fontWeight: 800, cursor: 'pointer', borderRadius: 10,
      border: `1.5px solid ${active ? fg : 'var(--border)'}`, background: active ? bg : 'var(--surface)', color: active ? fg : 'var(--ink)',
      transition: 'background-color .15s, border-color .15s, color .15s',
    };
  };
  return (
    <div>
      <span className="label">{label}<Req /></span>
      <div style={{ display: 'flex', gap: 10 }}>
        <button type="button" style={b(value === true, true)} onClick={() => onChange(true)} aria-pressed={value === true}>Evet</button>
        <button type="button" style={b(value === false, false)} onClick={() => onChange(false)} aria-pressed={value === false}>Hayır</button>
      </div>
    </div>
  );
}

/* ---------- Telefon: "05" sabit, temsilci kalan 9 haneyi girer ---------- */

export const fmtPhoneRest = (d) => [d.slice(0, 2), d.slice(2, 5), d.slice(5, 7), d.slice(7, 9)].filter(Boolean).join(' ');

export function PhoneInput({ value, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'stretch', border: '1.5px solid var(--border)', borderRadius: 8, background: 'var(--surface)', overflow: 'hidden' }}>
      <span style={{ display: 'flex', alignItems: 'center', padding: '0 4px 0 14px', fontSize: 16, fontWeight: 800, userSelect: 'none' }}>05</span>
      <input
        type="tel" inputMode="numeric" autoComplete="off" className="input input-lg"
        value={fmtPhoneRest(value)}
        onChange={(e) => {
          let d = e.target.value.replace(/\D/g, '');
          // Kopyala-yapıştırda başta gelen 0 / 05 / 905 / +905 kısmını at
          if (d.length > 9) d = d.replace(/^(90)?0?5/, '');
          onChange(d.slice(0, 9));
        }}
        placeholder="XX XXX XX XX"
        style={{ border: 'none', borderRadius: 0, paddingLeft: 2 }}
      />
    </div>
  );
}

/* ---------- Konum ---------- */

export function LocationInput({ value, onChange }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [link, setLink] = useState('');

  const useGps = async () => {
    setBusy(true); setError('');
    try {
      const p = await getGpsPosition();
      onChange({ location: { lat: p.lat, lng: p.lng }, locationSource: 'gps', locationAccuracy: p.accuracy, mapsUrl: mapsUrlFor(p) });
      setLink('');
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const onLink = (v) => {
    setLink(v); setError('');
    const url = v.trim();
    if (!url) { onChange(null); return; }
    const c = coordsFromMapsUrl(url);
    if (c) onChange({ location: c, locationSource: 'mapsLink', locationAccuracy: null, mapsUrl: url });
    else if (isMapsLink(url)) onChange({ location: null, locationSource: 'mapsLink', locationAccuracy: null, mapsUrl: url });
    else onChange(null);
  };

  let status = null;
  if (!value && link.trim()) status = { tone: 'danger', text: 'Bu bir Google Maps linki gibi görünmüyor.' };
  else if (value?.locationSource === 'gps') status = { tone: 'success', text: `✓ GPS konumu alındı (±${value.locationAccuracy} m)` };
  else if (value?.location) status = { tone: 'success', text: '✓ Linkten konum okundu' };
  else if (value) status = {
    tone: 'warn',
    text: isShortMapsLink(value.mapsUrl)
      ? 'Link kaydedilecek. Kısa linkten koordinat okunamıyor; haritada gösterim için link kullanılacak.'
      : 'Link kaydedilecek, ama içinden koordinat okunamadı.',
  };

  return (
    <div>
      <button type="button" className="btn btn-secondary btn-block btn-lg" onClick={useGps} disabled={busy}>
        {busy ? 'Konum alınıyor…' : '📍 Şu anki konumumu kullan'}
      </button>
      <div className="text-xs muted" style={{ textAlign: 'center', margin: '10px 0', fontWeight: 700 }}>ya da</div>
      <input type="url" className="input input-lg" value={link} onChange={(e) => onLink(e.target.value)} placeholder="Google Maps linkini yapıştır" />
      {status && <Alert tone={status.tone} style={{ marginTop: 10, padding: '9px 12px', fontSize: 13 }}>{status.text}</Alert>}
      {value?.mapsUrl && <a href={value.mapsUrl} target="_blank" rel="noreferrer" className="btn-link text-sm" style={{ display: 'inline-block', marginTop: 8 }}>Haritada kontrol et</a>}
      {error && <Alert tone="danger" style={{ marginTop: 10, fontSize: 13 }}>{error}</Alert>}
    </div>
  );
}

// Kayıtlı telefonu ("05321234567") PhoneInput'un beklediği 9 haneye çevirir; çözülemezse null
export function phoneRest(phone) {
  const d = String(phone || '').replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('05')) return d.slice(2);
  if (d.length === 10 && d.startsWith('5')) return d.slice(1);
  return null;
}

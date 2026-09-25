// src/components/FeatureFields.jsx
// Marka seçici, talep taslağı düzenleyici ve takip tarihi alanı (kayıt formunda ve bayi sayfasında ortak)
import { useState } from 'react';
import { BRANDS, CATALOG_ITEMS, REQUEST_TYPES, TRAINING_TOPICS } from '../utils/catalog';
import { addToCalendar, todayStr } from '../utils/followUps';
import PhotoInput from './PhotoInput';

export function Chip({ on, onClick, children, disabled }) {
  return (
    <button type="button" className={`chip ${on ? 'on' : ''}`} onClick={onClick} disabled={disabled} aria-pressed={!!on}>
      {children}
    </button>
  );
}

/* ---------- Rakip markalar ---------- */

export function BrandPicker({ value = [], other = '', onChange, disabled }) {
  const toggle = (b) => onChange({ brands: value.includes(b) ? value.filter((x) => x !== b) : [...value, b], other });
  return (
    <div>
      <div className="chips">
        {BRANDS.map((b) => <Chip key={b} on={value.includes(b)} onClick={() => toggle(b)} disabled={disabled}>{b}</Chip>)}
      </div>
      <input className="input mt-8" value={other} disabled={disabled} maxLength={120}
        onChange={(e) => onChange({ brands: value, other: e.target.value })} placeholder="Listede olmayan markalar (isteğe bağlı)" />
    </div>
  );
}

/* ---------- Talep taslağı ---------- */

export const emptyDraft = (type = 'catalog') => ({ key: Math.random().toString(36).slice(2), type, items: [], topic: null, text: '', photo: null });

export function RequestDraftEditor({ draft, onChange, onRemove, disabled }) {
  const set = (patch) => onChange({ ...draft, ...patch });
  return (
    <div className="req-draft">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="chips" style={{ marginBottom: 0 }}>
          {Object.entries(REQUEST_TYPES).map(([k, t]) => (
            <Chip key={k} on={draft.type === k} disabled={disabled} onClick={() => set({ type: k })}>{t.label}</Chip>
          ))}
        </div>
        {onRemove && <button type="button" className="btn-link text-sm" style={{ color: 'var(--muted)' }} onClick={onRemove} disabled={disabled}>Kaldır</button>}
      </div>

      {draft.type === 'catalog' && (
        <div className="mt-12">
          <span className="label-sm">Hangi kataloglar? (birden fazla seçilebilir)</span>
          <div className="chips">
            {Object.entries(CATALOG_ITEMS).map(([k, l]) => (
              <Chip key={k} on={draft.items.includes(k)} disabled={disabled}
                onClick={() => set({ items: draft.items.includes(k) ? draft.items.filter((x) => x !== k) : [...draft.items, k] })}>{l}</Chip>
            ))}
          </div>
        </div>
      )}
      {draft.type === 'training' && (
        <div className="mt-12">
          <span className="label-sm">Eğitim konusu</span>
          <div className="chips">
            {Object.entries(TRAINING_TOPICS).map(([k, l]) => (
              <Chip key={k} on={draft.topic === k} disabled={disabled} onClick={() => set({ topic: k })}>{l}</Chip>
            ))}
          </div>
        </div>
      )}
      <textarea className="input textarea mt-8" rows={2} maxLength={1000} disabled={disabled} value={draft.text}
        onChange={(e) => set({ text: e.target.value })}
        placeholder={draft.type === 'service' ? 'Hangi ürün, sorun ne?' : draft.type === 'other' ? 'Talep nedir?' : 'Not (isteğe bağlı)'} />
      {draft.type === 'service' && (
        <div className="mt-8" style={{ maxWidth: 220 }}>
          <PhotoInput label="Fotoğraf (isteğe bağlı)" value={draft.photo} disabled={disabled} onChange={(p) => set({ photo: p })} />
        </div>
      )}
    </div>
  );
}

/* ---------- Takip tarihi ---------- */

export function FollowUpField({ value, onChange, dealerName, disabled }) {
  const [added, setAdded] = useState(false);
  return (
    <div>
      <div className="row" style={{ flexWrap: 'nowrap' }}>
        <input type="date" className="input input-lg" value={value || ''} min={todayStr()} disabled={disabled}
          onChange={(e) => { onChange(e.target.value || null); setAdded(false); }} style={{ maxWidth: 220 }} />
        {value && <button type="button" className="btn-link text-sm" onClick={() => onChange(null)} disabled={disabled}>Temizle</button>}
      </div>
      {value && dealerName && (
        <button type="button" className="btn btn-secondary btn-sm mt-8" disabled={disabled}
          onClick={() => { addToCalendar({ dealerName, date: value, url: window.location.origin }); setAdded(true); }}>
          📅 Telefonun takvimine ekle
        </button>
      )}
      {added && <div className="text-xs muted mt-8">Takvim açıldı; etkinliği orada kaydetmeyi unutma.</div>}
    </div>
  );
}

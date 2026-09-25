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

// value: seçili markalar, other: listede olmayanlar (metin), qty: { marka: yıllık adet }, otherQty: diğerlerinin adedi
export function BrandPicker({ value = [], other = '', qty = {}, otherQty = null, onChange, disabled }) {
  const emit = (patch) => onChange({ brands: value, other, qty, otherQty, ...patch });
  const toggle = (b) => {
    const on = value.includes(b);
    const nextQty = { ...qty };
    if (on) delete nextQty[b];
    emit({ brands: on ? value.filter((x) => x !== b) : [...value, b], qty: nextQty });
  };
  const num = (v) => { const n = parseInt(String(v).replace(/\D/g, ''), 10); return Number.isFinite(n) && n > 0 ? Math.min(n, 999999) : null; };
  const rivals = value.filter((b) => b !== 'Airfel');
  return (
    <div>
      <div className="chips">
        {BRANDS.map((b) => <Chip key={b} on={value.includes(b)} onClick={() => toggle(b)} disabled={disabled}>{b}</Chip>)}
      </div>
      <input className="input mt-8" value={other} disabled={disabled} maxLength={120}
        onChange={(e) => emit({ other: e.target.value, ...(e.target.value.trim() ? {} : { otherQty: null }) })} placeholder="Listede olmayan markalar (isteğe bağlı)" />
      {(rivals.length > 0 || other.trim()) && (
        <div className="qty-box mt-12">
          <div className="label-sm">Yıllık yaklaşık satış adedi (isteğe bağlı)</div>
          {rivals.map((b) => (
            <label key={b} className="qty-row">
              <span>{b}</span>
              <input className="input" type="text" inputMode="numeric" disabled={disabled} placeholder="adet"
                value={qty[b] ?? ''} onChange={(e) => emit({ qty: { ...qty, [b]: num(e.target.value) } })} />
            </label>
          ))}
          {other.trim() && (
            <label className="qty-row">
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{other.trim()}</span>
              <input className="input" type="text" inputMode="numeric" disabled={disabled} placeholder="adet"
                value={otherQty ?? ''} onChange={(e) => emit({ otherQty: num(e.target.value) })} />
            </label>
          )}
        </div>
      )}
    </div>
  );
}

// Formdaki marka durumunu kayda yazılacak alanlara çevirir (boş adetler atılır)
export function brandFields(b) {
  const qty = {};
  (b.brands || []).forEach((x) => { if (x !== 'Airfel' && b.qty?.[x]) qty[x] = b.qty[x]; });
  return {
    brands: b.brands || [],
    brandsOther: (b.other || '').trim() || null,
    brandQty: qty,
    brandsOtherQty: (b.other || '').trim() && b.otherQty ? b.otherQty : null,
  };
}
// Kayıttan formdaki marka durumuna
export const brandStateFromReg = (r) => ({
  brands: r?.brands || [], other: r?.brandsOther || '', qty: r?.brandQty || {}, otherQty: r?.brandsOtherQty ?? null,
});

// Tahmini pazar payı: Airfel'in son tamamlanan yıl (FY25) devreye alımı / (Airfel + rakiplerin yıllık tahmini)
export function marketShare(airfelQty, reg) {
  const rival = Object.values(reg?.brandQty || {}).reduce((a, n) => a + (n || 0), 0) + (reg?.brandsOtherQty || 0);
  if (!rival) return null;
  const total = airfelQty + rival;
  return { airfel: airfelQty, rival, pct: total ? Math.round((airfelQty / total) * 100) : 0 };
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

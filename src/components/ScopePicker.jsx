// src/components/ScopePicker.jsx — "Benim / Ekibim / Tümü / … ekibi" seçimi
export default function ScopePicker({ scope, options, onChange }) {
  if (options.length <= 1) return null;
  if (options.length <= 3) {
    return (
      <div className="row" style={{ gap: 8 }}>
        {options.map((o) => (
          <button key={o.value} type="button" className={`pill ${scope === o.value ? 'active' : ''}`} onClick={() => onChange(o.value)}>{o.label}</button>
        ))}
      </div>
    );
  }
  return (
    <select className="select" value={scope} onChange={(e) => onChange(e.target.value)} style={{ maxWidth: 260 }} aria-label="Kapsam">
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

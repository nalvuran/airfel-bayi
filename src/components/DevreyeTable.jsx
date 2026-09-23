// src/components/DevreyeTable.jsx
// Devreye alım tablosu: satırlar kombi (kırmızı) ve klima (mavi), sütunlar yıllar.
// Customer Data'da AC = klima, CB = kombi.
const YEARS = [['fy24', '2024'], ['fy25', '2025'], ['fy26', '2026']];
const n = (v) => (v ?? 0).toLocaleString('tr-TR');

function Dot({ color }) {
  return <span aria-hidden="true" style={{ display: 'inline-block', width: 9, height: 9, borderRadius: '50%', background: color, marginRight: 7, verticalAlign: 'middle' }} />;
}

export default function DevreyeTable({ sales, compact, title = 'Devreye alım' }) {
  const s = sales || {};
  const rows = [
    { label: 'Kombi', color: 'var(--kombi)', key: 'cb' },
    { label: 'Klima', color: 'var(--klima)', key: 'ac' },
  ];
  const cell = { padding: compact ? '5px 4px' : '9px 6px', textAlign: 'right' };

  return (
    <div style={{ maxWidth: compact ? undefined : 560, background: compact ? 'var(--surface-2)' : undefined, border: compact ? '1px solid var(--border)' : undefined, borderRadius: 10, padding: compact ? '10px 12px' : 0 }}>
      {compact && <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--faint)', marginBottom: 4 }}>{title}</div>}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: compact ? 13 : 14, fontVariantNumeric: 'tabular-nums' }}>
        <thead>
          <tr style={{ fontSize: compact ? 11 : 12, color: 'var(--muted)' }}>
            <th style={{ ...cell, textAlign: 'left', fontWeight: 700 }}><span className="sr-only">Ürün</span></th>
            {YEARS.map(([, y]) => <th key={y} style={{ ...cell, fontWeight: 700 }}>{y}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} style={{ borderTop: compact ? 'none' : '1px solid var(--border)' }}>
              <td style={{ ...cell, textAlign: 'left', fontWeight: 700, color: r.color, whiteSpace: 'nowrap' }}><Dot color={r.color} />{r.label}</td>
              {YEARS.map(([k]) => (
                <td key={k} style={{ ...cell, fontWeight: 800, color: s[k]?.[r.key] ? r.color : 'var(--faint)' }}>{n(s[k]?.[r.key])}</td>
              ))}
            </tr>
          ))}
          {!compact && (
            <>
              <tr style={{ borderTop: '2px solid var(--border)' }}>
                <td style={{ ...cell, textAlign: 'left', fontWeight: 800 }}>Toplam</td>
                {YEARS.map(([k]) => <td key={k} style={{ ...cell, fontWeight: 800 }}>{n(s[k]?.total)}</td>)}
              </tr>
              <tr style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ ...cell, textAlign: 'left', color: 'var(--muted)', fontWeight: 600 }}>Segment</td>
                {YEARS.map(([k]) => <td key={k} style={{ ...cell, color: 'var(--muted)', fontSize: 12.5, fontWeight: 600 }}>{s[k]?.segment || '-'}</td>)}
              </tr>
            </>
          )}
        </tbody>
      </table>
      {!compact && (
        <div className="text-sm muted mt-12">3 yılın toplamı: <strong className="num" style={{ color: 'var(--ink)' }}>{n(s.total3y)}</strong> adet</div>
      )}
    </div>
  );
}

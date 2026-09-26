// src/components/DashCharts.jsx
// Dashboard grafikleri (Chart.js). Temaya uyar; çubuklara ve dilimlere dokununca ilgili liste açılır.
import { useEffect, useRef } from 'react';
import {
  ArcElement, BarController, BarElement, CategoryScale, Chart, DoughnutController, Legend, LinearScale, Tooltip,
} from 'chart.js';
import { useTheme } from '../utils/theme';

Chart.register(BarController, BarElement, CategoryScale, LinearScale, DoughnutController, ArcElement, Tooltip, Legend);

// Temadaki renkleri CSS değişkenlerinden oku
function palette() {
  const cs = getComputedStyle(document.documentElement);
  const v = (n) => cs.getPropertyValue(n).trim();
  return {
    red: v('--red'), green: v('--green'), amber: v('--amber'), blue: v('--klima'),
    ink: v('--ink'), ink2: v('--ink-2'), muted: v('--muted'), border: v('--border'), surface: v('--surface'), surface2: v('--surface-2'),
  };
}
export const TEAM_COLORS = (p) => [p.red, p.blue, p.green, p.amber, '#A78BFA', '#2DD4BF'];

function useChart(build, deps) {
  const ref = useRef(null);
  const chart = useRef(null);
  const { effective } = useTheme();
  useEffect(() => {
    if (!ref.current) return undefined;
    const p = palette();
    Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
    Chart.defaults.color = p.muted;
    chart.current = new Chart(ref.current, build(p));
    return () => { chart.current?.destroy(); chart.current = null; };
  }, [effective, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps
  return ref;
}

const tooltip = (p) => ({
  backgroundColor: p.surface, titleColor: p.ink, bodyColor: p.ink2, borderColor: p.border, borderWidth: 1,
  padding: 10, cornerRadius: 8, titleFont: { weight: '800' }, bodyFont: { weight: '600' }, displayColors: true, boxPadding: 4,
});
const pointer = (e, els) => { e.native.target.style.cursor = els.length ? 'pointer' : 'default'; };

/* ---------- 1) Haftalık ziyaret trendi ---------- */
// weeks: [{ label, from, to, total, byTeam: { [teamKey]: n } }], teams: [{ key, name }] (boşsa tek renk)
export function VisitTrendChart({ weeks, teams, onPick }) {
  const ref = useChart((p) => {
    const colors = TEAM_COLORS(p);
    const datasets = teams.length
      ? teams.map((t, i) => ({ label: t.name, data: weeks.map((w) => w.byTeam[t.key] || 0), backgroundColor: colors[i % colors.length], borderRadius: 4, maxBarThickness: 34, stack: 's' }))
      : [{ label: 'Ziyaret', data: weeks.map((w) => w.total), backgroundColor: weeks.map((_, i) => (i === weeks.length - 1 ? p.red : `${p.red}99`)), borderRadius: 5, maxBarThickness: 34 }];
    return {
      type: 'bar',
      data: { labels: weeks.map((w) => w.label), datasets },
      options: {
        responsive: true, maintainAspectRatio: false, animation: { duration: 500 },
        onHover: pointer,
        onClick: (_, els) => { if (els.length) onPick(weeks[els[0].index]); },
        plugins: {
          legend: { display: teams.length > 1, position: 'bottom', labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: 'rectRounded', color: p.ink2, font: { weight: '700', size: 12 } } },
          tooltip: { ...tooltip(p), callbacks: { title: (it) => weeks[it[0].dataIndex].title, footer: (it) => (teams.length > 1 ? `Toplam: ${weeks[it[0].dataIndex].total}` : '') } },
        },
        scales: {
          x: { stacked: true, grid: { display: false }, border: { color: p.border }, ticks: { color: p.muted, font: { weight: '700', size: 11 } } },
          y: { stacked: true, beginAtZero: true, grid: { color: p.border }, border: { display: false }, ticks: { precision: 0, color: p.muted, font: { size: 11 } } },
        },
      },
    };
  }, [weeks, teams]);
  return <div className="chart-box" style={{ height: 260 }}><canvas ref={ref} role="img" aria-label="Haftalık ziyaret sayıları" /></div>;
}

/* ---------- 2) Kurulum durumu (halka) ---------- */
// parts: [{ key, label, value, tone }]
export function InstallDonut({ parts, center, onPick }) {
  const ref = useChart((p) => ({
    type: 'doughnut',
    data: {
      labels: parts.map((x) => x.label),
      datasets: [{ data: parts.map((x) => x.value), backgroundColor: parts.map((x) => p[x.tone]), borderColor: p.surface, borderWidth: 3, hoverOffset: 6 }],
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '70%', animation: { duration: 500 },
      onHover: pointer,
      onClick: (_, els) => { if (els.length) onPick(parts[els[0].index]); },
      plugins: { legend: { display: false }, tooltip: tooltip(p) },
    },
  }), [parts]);
  return (
    <div className="donut-wrap">
      <div className="chart-box" style={{ height: 190 }}>
        <canvas ref={ref} role="img" aria-label="Kurulum durumu" />
        <div className="donut-center"><div className="num">{center.value}</div><div>{center.label}</div></div>
      </div>
      <div className="donut-legend">
        {parts.map((x) => (
          <button key={x.key} type="button" onClick={() => onPick(x)}>
            <span className="dot" style={{ background: `var(--${x.tone === 'red' ? 'danger' : x.tone})` }} />
            <span className="lbl">{x.label}</span><span className="val num">{x.value}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------- 3) Temsilci kapsama (yatay çubuk) ---------- */
// rows: [{ key, name, pct, visited, active, color }]
export function CoverageChart({ rows, onPick }) {
  const ref = useChart((p) => ({
    type: 'bar',
    data: {
      labels: rows.map((r) => r.name),
      datasets: [{
        data: rows.map((r) => r.pct),
        backgroundColor: rows.map((r) => (r.team !== undefined ? TEAM_COLORS(p)[r.team % 6] : p.red)), borderRadius: 5, barThickness: 16,
      }],
    },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false, animation: { duration: 500 },
      onHover: pointer,
      onClick: (_, els) => { if (els.length) onPick(rows[els[0].index]); },
      plugins: {
        legend: { display: false },
        tooltip: { ...tooltip(p), callbacks: { label: (it) => ` %${rows[it.dataIndex].pct} · ${rows[it.dataIndex].visited} / ${rows[it.dataIndex].active} aktif bayi` } },
      },
      scales: {
        // Eksen en yüksek orana göre: düşük oranlarda da farklar görünsün
        x: { min: 0, max: Math.min(100, Math.ceil((Math.max(0, ...rows.map((r) => r.pct)) + 5) / 10) * 10), grid: { color: p.border }, border: { display: false }, ticks: { callback: (v) => `%${v}`, color: p.muted, font: { size: 11 } } },
        y: { grid: { display: false }, border: { color: p.border }, ticks: { color: p.ink2, font: { weight: '700', size: 12 } } },
      },
    },
  }), [rows]);
  return <div className="chart-box" style={{ height: Math.max(160, rows.length * 30 + 40) }}><canvas ref={ref} role="img" aria-label="Temsilcilerin bayi ziyaret oranları" /></div>;
}

/* ---------- 4) Tahmini pazar payı (yarım halka) ---------- */
export function ShareGauge({ pct }) {
  const ref = useChart((p) => ({
    type: 'doughnut',
    data: { datasets: [{ data: [pct, 100 - pct], backgroundColor: [p.red, p.surface2], borderWidth: 0 }] },
    options: {
      responsive: true, maintainAspectRatio: false, rotation: -90, circumference: 180, cutout: '74%',
      animation: { duration: 600 }, plugins: { legend: { display: false }, tooltip: { enabled: false } },
    },
  }), [pct]);
  return (
    <div className="chart-box gauge" style={{ height: 130 }}>
      <canvas ref={ref} role="img" aria-label={`Tahmini pazar payı yüzde ${pct}`} />
      <div className="gauge-center"><div className="num">%{pct}</div></div>
    </div>
  );
}

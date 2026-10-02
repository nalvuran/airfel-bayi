// src/components/VisitMap.jsx
// Bayi haritası (Leaflet + OpenStreetMap).
//  - Konumu bilinen bayiler tam yerinde dolu nokta: kırmızı son 30 günde ziyaret, gri daha eski ziyaret,
//    mavi konumu kayıtlı ama hiç ziyaret edilmemiş.
//  - Konumu bilinmeyenler ilçe (yoksa il) merkezinde, sayılı halka olarak gruplanır.
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { REGIONS_TR, approxLocation, regionOf } from '../utils/geoTR';

const DISTRICT_ZOOM = 8; // bu yakınlaştırma ve üstü: ilçe düzeyinde
const REGION_ZOOM = 4;   // bu yakınlaştırma ve altı (telefonda açılış): coğrafi bölge düzeyinde

const TURKEY = [[35.8, 25.6], [42.1, 44.8]];
const fmt = (n) => Number(n || 0).toLocaleString('tr-TR');

function el(tag, css, text) {
  const e = document.createElement(tag);
  if (css) e.style.cssText = css;
  if (text != null) e.textContent = text;
  return e;
}

export default function VisitMap({ points, groups, scope }) {
  const box = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);
  const navigate = useNavigate();
  const [zoom, setZoom] = useState(6);

  useEffect(() => {
    map.current = L.map(box.current, { scrollWheelZoom: false, zoomControl: true, attributionControl: true });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
    }).addTo(map.current);
    map.current.fitBounds(TURKEY);
    layer.current = L.layerGroup().addTo(map.current);
    setZoom(map.current.getZoom());
    map.current.on('zoomend', () => setZoom(map.current.getZoom()));
    return () => { map.current.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    if (!layer.current) return;
    layer.current.clearLayers();
    const go = (path) => (e) => { e.preventDefault(); navigate(path); };

    // Uzaktayken ilçeleri il merkezinde, en uzakta da coğrafi bölgelerde birleştir
    let shown = groups;
    if (zoom <= REGION_ZOOM) {
      const byRegion = new Map();
      groups.forEach((g) => {
        const r = regionOf(g.city) || g.city;
        if (!byRegion.has(r)) {
          const c = REGIONS_TR[r]?.c || [g.lat, g.lng];
          byRegion.set(r, { lat: c[0], lng: c[1], level: 'region', label: REGIONS_TR[r] ? `${r} Bölgesi` : r, items: [] });
        }
        byRegion.get(r).items.push(...g.items);
      });
      shown = [...byRegion.values()];
      shown.forEach((x) => x.items.sort((a, b) => b.q - a.q));
    } else if (zoom < DISTRICT_ZOOM) {
      const byCity = new Map();
      groups.forEach((g) => {
        if (!byCity.has(g.city)) {
          const c = approxLocation(g.city, '');
          byCity.set(g.city, { lat: c?.lat ?? g.lat, lng: c?.lng ?? g.lng, level: 'city', label: g.city, search: g.city, items: [] });
        }
        byCity.get(g.city).items.push(...g.items);
      });
      shown = [...byCity.values()];
      shown.forEach((x) => x.items.sort((a, b) => b.q - a.q));
    }

    // Yaklaşık konumdaki bayiler: il ya da ilçe merkezinde sayılı halka
    shown.forEach((g) => {
      // Halka boyutu yakınlaştırmaya göre: telefonda Türkiye geneli görünümde üst üste binmesin
      const k = Math.sqrt(g.items.length);
      const size = Math.round(g.level === 'region' ? Math.min(52, 30 + k * 0.6) : zoom <= 5 ? Math.min(26, 14 + k * 1.6) : zoom <= 6 ? Math.min(34, 17 + k * 2.4) : Math.min(46, 22 + k * 4));
      const icon = L.divIcon({
        className: 'map-group',
        html: `<span style="width:${size}px;height:${size}px;font-size:${size < 20 ? 9 : size < 26 ? 10.5 : 12}px">${g.items.length.toLocaleString('tr-TR')}</span>`,
        iconSize: [size, size],
      });
      const m = L.marker([g.lat, g.lng], { icon, keyboard: true, title: `${g.label}: ${g.items.length} bayi` });
      const pop = el('div', 'min-width:200px;max-width:240px');
      pop.append(el('div', 'font-weight:800;font-size:13px', g.label));
      pop.append(el('div', 'font-size:12px;color:#767069;margin-bottom:6px', g.level === 'region'
        ? `Konumu bilinmeyen ${fmt(g.items.length)} bayi`
        : `${fmt(g.items.length)} bayi · konum ${g.level === 'district' ? 'ilçe' : 'il'} merkezine göre yaklaşık${g.level === 'city' ? '. İlçelere ayırmak için yakınlaştır.' : ''}`));
      g.items.slice(0, 5).forEach((it) => {
        const a = el('a', 'display:flex;justify-content:space-between;gap:8px;font-size:12px;font-weight:700;color:inherit;text-decoration:none;padding:3px 0;border-top:1px solid rgba(128,128,128,.2)');
        a.href = '#';
        a.append(el('span', 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap', it.n), el('span', 'color:#767069;flex-shrink:0', `${fmt(it.q)} FY26`));
        a.onclick = go(`/dealers/${encodeURIComponent(it.i)}`);
        pop.append(a);
      });
      if (g.level === 'region') {
        const z = el('a', 'display:inline-block;margin-top:6px;font-weight:800;font-size:12px;color:#B91724;text-decoration:none', 'İllere ayırmak için yakınlaştır →');
        z.href = '#';
        z.onclick = (e) => { e.preventDefault(); map.current.closePopup(); map.current.flyTo([g.lat, g.lng], REGION_ZOOM + 2); };
        pop.append(z);
      } else {
        const all = el('a', 'display:inline-block;margin-top:6px;font-weight:800;font-size:12px;color:#B91724;text-decoration:none', g.items.length > 5 ? `Hepsini listede gör (${g.items.length}) →` : 'Listede gör →');
        all.href = '#';
        all.onclick = go(`/dealers?q=${encodeURIComponent(g.search)}&scope=${scope}`);
        pop.append(all);
      }
      m.bindPopup(pop);
      m.addTo(layer.current);
    });

    // Konumu bilinen bayiler: tam yerinde
    points.forEach((p) => {
      const color = p.kind === 'recent' ? '#E5484D' : p.kind === 'visited' ? '#8A857F' : '#3B82F6';
      const m = L.circleMarker([p.lat, p.lng], { radius: 6, weight: 1.5, color: '#fff', fillColor: color, fillOpacity: 0.95 });
      const pop = el('div', 'min-width:170px');
      pop.append(el('div', 'font-weight:800;font-size:13px;margin-bottom:2px', p.name));
      pop.append(el('div', 'font-size:12px;color:#767069', p.date ? `Son ziyaret: ${p.date.toLocaleDateString('tr-TR')}${p.rep ? ` · ${p.rep}` : ''}` : 'Konumu kayıtlı, henüz ziyaret yok'));
      const a = el('a', 'display:inline-block;margin-top:6px;font-weight:800;font-size:12px;color:#B91724;text-decoration:none', 'Bayiyi aç →');
      a.href = '#';
      a.onclick = go(`/dealers/${encodeURIComponent(p.dealerId)}`);
      pop.append(a);
      m.bindPopup(pop);
      m.addTo(layer.current);
    });
  }, [points, groups, scope, navigate, zoom]);

  return <div ref={box} className="visit-map" role="region" aria-label="Bayi haritası" />;
}

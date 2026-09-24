// src/components/VisitMap.jsx
// Ziyaret edilen bayileri Türkiye haritasında gösterir (Leaflet + OpenStreetMap, ücretsiz).
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const TURKEY = [[35.8, 25.6], [42.1, 44.8]];

export default function VisitMap({ points }) {
  const el = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    map.current = L.map(el.current, { scrollWheelZoom: false, zoomControl: true, attributionControl: true });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
    }).addTo(map.current);
    map.current.fitBounds(TURKEY);
    layer.current = L.layerGroup().addTo(map.current);
    return () => { map.current.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    if (!layer.current) return;
    layer.current.clearLayers();
    points.forEach((p) => {
      const m = L.circleMarker([p.lat, p.lng], {
        radius: 6, weight: 1.5, color: '#fff', fillColor: p.recent ? '#B91724' : '#767069', fillOpacity: 0.9,
      });
      const box = document.createElement('div');
      box.style.minWidth = '160px';
      const title = document.createElement('div');
      title.style.cssText = 'font-weight:800;font-size:13px;margin-bottom:2px';
      title.textContent = p.name;
      const meta = document.createElement('div');
      meta.style.cssText = 'font-size:12px;color:#767069';
      meta.textContent = `${p.rep || ''} · ${p.date ? p.date.toLocaleDateString('tr-TR') : ''}`;
      const link = document.createElement('a');
      link.href = '#';
      link.textContent = 'Bayiyi aç →';
      link.style.cssText = 'display:inline-block;margin-top:6px;font-weight:800;font-size:12px;color:#B91724;text-decoration:none';
      link.onclick = (e) => { e.preventDefault(); navigate(`/dealers/${encodeURIComponent(p.dealerId)}`); };
      box.append(title, meta, link);
      m.bindPopup(box);
      m.addTo(layer.current);
    });
  }, [points, navigate]);

  return <div ref={el} className="visit-map" role="region" aria-label="Ziyaret haritası" />;
}

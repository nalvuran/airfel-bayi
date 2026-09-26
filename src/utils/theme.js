// src/utils/theme.js
// Tema tercihi: 'system' (telefonun ayarı), 'light' ya da 'dark'. Bu cihazda hatırlanır.
import { useEffect, useState } from 'react';

const KEY = 'airfel.theme';
const media = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

export function getThemePref() {
  try { return localStorage.getItem(KEY) || 'system'; } catch { return 'system'; }
}
const effective = (pref) => (pref === 'system' ? (media?.matches ? 'dark' : 'light') : pref);

export function applyTheme(pref = getThemePref()) {
  const t = effective(pref);
  document.documentElement.setAttribute('data-theme', t);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', t === 'dark' ? '#1C1B1A' : '#ffffff');
  return t;
}

const listeners = new Set();
export function setThemePref(pref) {
  try { localStorage.setItem(KEY, pref); } catch { /* yok say */ }
  applyTheme(pref);
  listeners.forEach((fn) => fn(pref));
}

// Telefonun ayarı değişirse (ör. akşam otomatik koyu mod) "sistem" tercihinde kendiliğinden uyum
media?.addEventListener?.('change', () => { if (getThemePref() === 'system') applyTheme('system'); });

export function useTheme() {
  const [pref, setPref] = useState(getThemePref());
  useEffect(() => { listeners.add(setPref); return () => { listeners.delete(setPref); }; }, []);
  return { pref, effective: effective(pref), setPref: setThemePref };
}

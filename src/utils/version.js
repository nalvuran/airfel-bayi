// src/utils/version.js
// Uygulamanın adı ve sürümü: her revizyonda sadece APP_VERSION değişir.
export const APP_NAME = 'Segment';
export const APP_VERSION = '1.2';
export const APP_FULL = `${APP_NAME} V${APP_VERSION}`;

// Bu kopyanın derlendiği an (ISO). Her yayında değişir.
// eslint-disable-next-line no-undef
export const APP_BUILD = typeof __BUILD__ !== 'undefined' ? __BUILD__ : 'dev';
// "12.10 15:20" gibi kısa gösterim (Türkiye saati)
export const buildLabel = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso || '';
  return d.toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' }).replace(',', '');
};

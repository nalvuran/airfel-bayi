// src/utils/geo.js
// Google Maps linkinden koordinat çıkarır. Kısa linkler (maps.app.goo.gl) tarayıcıda çözülemez.
export function coordsFromMapsUrl(url) {
    if (!url) return null;
    let u = String(url);
    try { u = decodeURIComponent(u); } catch { /* bozuk kodlama: olduğu gibi dene */ }
    const pats = [
      /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/,
      /[?&](?:q|query|ll|destination)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/,
      /@(-?\d+\.\d+),(-?\d+\.\d+)/,
      /^\s*(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)\s*$/, // doğrudan "41.01, 28.97"
    ];
    for (const p of pats) {
      const m = u.match(p);
      if (m) {
        const lat = +m[1], lng = +m[2];
        if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng };
      }
    }
    return null;
  }
  
  export const isShortMapsLink = (url) => /goo\.gl|maps\.app/i.test(url || '');
  export const isMapsLink = (url) => /google\.[a-z.]+\/maps|maps\.google|goo\.gl|maps\.app/i.test(url || '');
  export const mapsUrlFor = (loc) => `https://www.google.com/maps?q=${loc.lat},${loc.lng}`;
  
  export function getGpsPosition() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) { reject(new Error('Bu cihaz konum almayı desteklemiyor.')); return; }
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: Math.round(p.coords.accuracy) }),
        (e) => reject(new Error(e.code === 1
          ? 'Konum izni verilmedi. Tarayıcı ayarlarından bu siteye konum izni ver ya da Google Maps linki yapıştır.'
          : 'Konum alınamadı. Açık alanda tekrar dene ya da Google Maps linki yapıştır.')),
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 30000 },
      );
    });
  }
// worker/index.js — Cloudflare Worker
// Uygulamanın dosyaları doğrudan statik olarak sunulur; bu kod sadece /api/* adreslerinde çalışır.
//
// /api/resolve-maps?u=<kısa Google Maps bağlantısı>
//   maps.app.goo.gl / goo.gl/maps kısa bağlantılarının yönlendirmesini takip eder ve uzun adresi
//   (gerekirse sayfadaki harita merkezini) döndürür. Sadece Google Maps kısa bağlantılarını kabul eder.

const ALLOWED = (u) => u.protocol === 'https:' && (u.hostname === 'maps.app.goo.gl' || (u.hostname === 'goo.gl' && u.pathname.startsWith('/maps')));
const UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Mobile Safari/537.36';

function coords(text) {
  let s = text;
  try { s = decodeURIComponent(s); } catch { /* olduğu gibi */ }
  const pats = [/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/, /[?&](?:q|query|ll|destination|center)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/, /@(-?\d+\.\d+),(-?\d+\.\d+)/];
  for (const p of pats) {
    const m = s.match(p);
    if (m && Math.abs(+m[1]) <= 90 && Math.abs(+m[2]) <= 180) return { lat: +m[1], lng: +m[2] };
  }
  return null;
}

async function resolve(short) {
  let cur = short;
  for (let i = 0; i < 6; i++) {
    const r = await fetch(cur, { redirect: 'manual', headers: { 'user-agent': UA, 'accept-language': 'tr-TR,tr;q=0.9' } });
    const loc = r.headers.get('location');
    if (!loc) break;
    cur = new URL(loc, cur).toString();
    // Avrupa'daki sunuculardan çerez onayı sayfasına yönlenebilir: asıl adres "continue" parametresinde
    const u = new URL(cur);
    if (u.hostname.startsWith('consent.') && u.searchParams.get('continue')) cur = u.searchParams.get('continue');
    if (coords(cur)) return { url: cur, ...coords(cur) };
  }
  // Adreste koordinat yoksa sayfanın içindeki harita merkezini dene
  try {
    const page = await fetch(cur, { headers: { 'user-agent': UA, 'accept-language': 'tr-TR,tr;q=0.9' } });
    const html = (await page.text()).slice(0, 400000);
    const c = coords(html) || (() => {
      const m = html.match(/\[\[\[\d+(?:\.\d+)?,(-?\d+\.\d+),(-?\d+\.\d+)\]/); // [ölçek, boylam, enlem]
      return m ? { lat: +m[2], lng: +m[1] } : null;
    })();
    if (c && Math.abs(c.lat) <= 90 && Math.abs(c.lng) <= 180) return { url: cur, ...c };
  } catch { /* sayfa okunamadı */ }
  return { url: cur };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/resolve-maps') {
      const json = (body, status = 200) => new Response(JSON.stringify(body), {
        status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': status === 200 ? 'public, max-age=86400' : 'no-store' },
      });
      let target;
      try { target = new URL(url.searchParams.get('u') || ''); } catch { return json({ error: 'Geçersiz bağlantı' }, 400); }
      if (!ALLOWED(target)) return json({ error: 'Sadece Google Maps kısa bağlantıları' }, 400);
      try { return json(await resolve(target.toString())); } catch { return json({ error: 'Bağlantı çözülemedi' }, 502); }
    }
    if (url.pathname.startsWith('/api/')) return new Response('Bulunamadı', { status: 404 });
    return env.ASSETS.fetch(request);
  },
};

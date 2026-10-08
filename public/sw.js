/* Segment (Airfel Bayi Takip) — uygulama dosyalarını telefonda saklar, böylece bağlantı yokken ya da zayıfken de açılır.
   Veriler (bayiler, kayıtlar, fotoğraflar) burada değil, Firebase'in kendi çevrimdışı deposunda tutulur.
   v2: sayfa açılışında ağ 3,5 saniyede cevap vermezse telefondaki kopyayla açılır.
       Sayfa iskeleti (index.html), istediği bütün dosyalar kaydedildikten sonra güncellenir: kopya her zaman eksiksizdir. */
const SHELL = 'airfel-shell-v2'; // v2: yönlendirmeli kopyalar temizlensin
const ASSETS = 'airfel-assets-v1';
const SHELL_FILES = ['/manifest.webmanifest', '/logo.png', '/logo-full.png', '/favicon.png', '/icon-192.png', '/apple-touch-icon.png'];
const MAX_ASSETS = 150;
const NAV_TIMEOUT_MS = 3500;

// Yönlendirmeyle gelmiş bir cevabı temiz bir kopyaya çevir: Safari yönlendirmeli kopyayı sayfa olarak açmaz
async function clean(res) {
  if (!res || !res.redirected) return res;
  return new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers: res.headers });
}

// Sayfa iskeletini, istediği /assets/ dosyalarıyla birlikte kaydet (önce dosyalar, sonra iskelet)
async function saveIndex(res0) {
  const res = await clean(res0);
  const html = await res.clone().text();
  const urls = [...new Set([...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]))];
  const ac = await caches.open(ASSETS);
  for (const u of urls) {
    if (await ac.match(u)) continue;
    const r = await fetch(u);
    if (!r.ok) return; // eksik kalacaksa eski (tutarlı) kopyayı koru
    await ac.put(u, r);
  }
  await (await caches.open(SHELL)).put('/index.html', res);
  trim(ASSETS, MAX_ASSETS);
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL).then((c) => c.addAll(SHELL_FILES.filter((f) => f !== '/index.html' && f !== '/')))
      .then(() => fetch('/', { cache: 'no-store' }).then((r) => (r.ok ? saveIndex(r) : null)).catch(() => {}))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== ASSETS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Firebase, harita vb. dış istekler olduğu gibi geçer
  if (url.pathname.startsWith('/api/')) return; // sunucu yardımcıları her zaman ağdan

  // Sayfa açılışları: önce ağ (yeni sürüm gelsin); ağ hata verirse ya da 3,5 saniyede cevap vermezse
  // telefondaki kopya. Bazı hatlarda adres cevap vermeden bekliyor; uygulama beyaz ekranda kalmasın.
  if (req.mode === 'navigate') {
    const net = fetch(req);
    // Geç gelse de yeni sürüm (dosyalarıyla birlikte) kaydedilsin
    event.waitUntil(net.then((res) => (res.ok && (res.headers.get('content-type') || '').includes('text/html') ? saveIndex(res.clone()) : null)).catch(() => {}));
    event.respondWith((async () => {
      const cached = await clean(await caches.match('/index.html'));
      if (!cached) return net.then(clean).catch(() => caches.match('/index.html').then(clean));
      const res = await Promise.race([net.then(clean).catch(() => null), new Promise((r) => setTimeout(() => r(null), NAV_TIMEOUT_MS))]);
      return res || cached;
    })());
    return;
  }

  // Derlenmiş uygulama dosyaları: adları her sürümde değiştiği için önce telefondaki kopya
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(ASSETS).then((c) => c.put(req, copy)).then(() => trim(ASSETS, MAX_ASSETS));
        }
        return res;
      })),
    );
    return;
  }

  // Diğer dosyalar (logo, simgeler): telefondaki kopyayı hemen ver, arkada güncelle
  event.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(SHELL).then((c) => c.put(req, copy)); }
        return res;
      }).catch(() => hit);
      return hit || net;
    }),
  );
});

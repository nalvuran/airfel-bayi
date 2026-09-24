/* Airfel Bayi Takip — uygulama dosyalarını telefonda saklar, böylece bağlantı yokken de açılır.
   Veriler (bayiler, kayıtlar, fotoğraflar) burada değil, Firebase'in kendi çevrimdışı deposunda tutulur. */
   const SHELL = 'airfel-shell-v1';
   const ASSETS = 'airfel-assets-v1';
   const SHELL_FILES = ['/', '/index.html', '/manifest.webmanifest', '/logo.png', '/logo-full.png', '/favicon.png', '/icon-192.png', '/apple-touch-icon.png'];
   const MAX_ASSETS = 80;
   
   self.addEventListener('install', (event) => {
     event.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
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
   
     // Sayfa açılışları: önce ağ (her zaman güncel sürüm), ağ yoksa telefondaki kopya
     if (req.mode === 'navigate') {
       event.respondWith(
         fetch(req)
           .then((res) => {
             const copy = res.clone();
             caches.open(SHELL).then((c) => c.put('/index.html', copy));
             return res;
           })
           .catch(() => caches.match('/index.html')),
       );
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
   
// src/utils/image.js
// Fotoğrafı yüklemeden önce telefonda küçültür (Firestore'da yer ve kota tasarrufu).
// Eski sistemdeki fotoğraflar ortalama ~50 KB idi; benzer bir boyut hedefliyoruz.
const MAX_DIM = 1280;
const MAX_BYTES = 350 * 1024;

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Bu fotoğraf açılamadı. Farklı bir fotoğraf seç ya da kamerayla çek.'));
    img.src = url;
  });
}

const toBlob = (canvas, q) => new Promise((res) => canvas.toBlob(res, 'image/jpeg', q));

export async function compressImage(file) {
  if (!file.type.startsWith('image/') && !/\.(jpe?g|png|heic|heif|webp)$/i.test(file.name)) {
    throw new Error('Seçilen dosya bir fotoğraf değil.');
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url); // modern tarayıcılar EXIF yönünü kendisi uygular
    let dim = MAX_DIM;
    let q = 0.72;
    for (let i = 0; i < 8; i++) {
      const scale = Math.min(1, dim / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.round(img.naturalWidth * scale);
      const h = Math.round(img.naturalHeight * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); // saydam PNG'ler siyah olmasın
      ctx.drawImage(img, 0, 0, w, h);
      const blob = await toBlob(canvas, q);
      if (!blob) throw new Error('Fotoğraf işlenemedi.');
      if (blob.size <= MAX_BYTES) {
        const bytes = new Uint8Array(await blob.arrayBuffer());
        return { bytes, blob, width: w, height: h, size: blob.size, previewUrl: URL.createObjectURL(blob) };
      }
      if (q > 0.55) q -= 0.08; else dim = Math.round(dim * 0.8);
    }
    throw new Error('Fotoğraf yeterince küçültülemedi.');
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Profil fotoğrafı: ortadan kare kırpar, 320x320 JPEG'e küçültür (~15-30 KB)
export async function squareAvatar(file, size = 320) {
  if (!file.type.startsWith('image/') && !/\.(jpe?g|png|heic|heif|webp)$/i.test(file.name)) {
    throw new Error('Seçilen dosya bir fotoğraf değil.');
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    // Yüzler genelde fotoğrafın üst yarısında olur: dikey fotoğraflarda kırpmayı biraz yukarıdan başlat
    const sx = (img.naturalWidth - side) / 2;
    const sy = img.naturalHeight > img.naturalWidth ? (img.naturalHeight - side) * 0.25 : (img.naturalHeight - side) / 2;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, size, size);
    ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
    let q = 0.82;
    let blob = await toBlob(canvas, q);
    while (blob && blob.size > 60 * 1024 && q > 0.5) { q -= 0.1; blob = await toBlob(canvas, q); }
    if (!blob) throw new Error('Fotoğraf işlenemedi.');
    return { bytes: new Uint8Array(await blob.arrayBuffer()), size: blob.size, previewUrl: URL.createObjectURL(blob) };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Kart önizlemesi: 4:3 oranında ortadan kırpılmış küçük JPEG (~10-20 KB)
export async function makeThumb(source, width = 360) {
  const blob = source instanceof Blob ? source : new Blob([source], { type: 'image/jpeg' });
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImage(url);
    const height = Math.round(width * 3 / 4);
    const target = width / height;
    const iw = img.naturalWidth, ih = img.naturalHeight;
    let sw = iw, sh = ih, sx = 0, sy = 0;
    if (iw / ih > target) { sw = ih * target; sx = (iw - sw) / 2; } else { sh = iw / target; sy = (ih - sh) / 2; }
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, width, height);
    const out = await toBlob(canvas, 0.7);
    if (!out) throw new Error('Önizleme oluşturulamadı.');
    return new Uint8Array(await out.arrayBuffer());
  } finally {
    URL.revokeObjectURL(url);
  }
}

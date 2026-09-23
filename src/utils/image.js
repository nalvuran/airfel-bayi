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
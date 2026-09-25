// src/utils/catalog.js
// Rakip markalar ve talep türleri: listeleri değiştirmek için sadece bu dosyayı düzenlemek yeterli.

export const BRANDS = [
  'Airfel', 'Demirdöküm', 'Vaillant', 'Bosch', 'Baymak', 'ECA', 'Buderus', 'Viessmann',
  'Ariston', 'Protherm', 'Daikin', 'Mitsubishi', 'Arçelik / Beko', 'Vestel', 'Samsung', 'LG',
];

export const REQUEST_TYPES = {
  catalog: { label: 'Katalog', icon: '📘' },
  training: { label: 'Eğitim', icon: '🎓' },
  service: { label: 'Servis sorunu', icon: '🛠' },
  other: { label: 'Diğer', icon: '📝' },
};

// Katalogda birden fazla seçilebilir
export const CATALOG_ITEMS = { kombi: 'Kombi', klima: 'Klima', kazan: 'Kazan', isiPompasi: 'Isı pompası' };
// Eğitimde tek konu seçilir
export const TRAINING_TOPICS = { kombi: 'Kombi', klima: 'Klima', kazan: 'Kazan', isiPompasi: 'Isı pompası', diger: 'Diğer' };

export const REQUEST_STATUS = {
  open: { label: 'Açık', tone: 'warn' },
  done: { label: 'Tamamlandı', tone: 'success' },
  cancelled: { label: 'İptal', tone: undefined },
};

// Bir talebin kısa, okunur özeti: "Katalog: Kombi, Klima" / "Eğitim: Isı pompası"
export function requestSummary(q) {
  const t = REQUEST_TYPES[q.type]?.label || 'Talep';
  if (q.type === 'catalog') return `${t}: ${(q.items || []).map((i) => CATALOG_ITEMS[i] || i).join(', ') || '-'}`;
  if (q.type === 'training') return `${t}: ${TRAINING_TOPICS[q.topic] || q.topic || '-'}`;
  return t;
}

// Takip ve düşüş eşikleri
export const DECLINE_PCT = 25;        // FY25, FY24'e göre en az %25 düşmüşse "düşüşte"
export const DECLINE_MIN_QTY = 10;    // küçük bayilerde gürültü olmasın: önceki yıl en az 10 adet

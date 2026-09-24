// src/utils/exportExcel.js
// Kayıt ve bayi listelerini Excel dosyası olarak indirir. Excel kütüphanesi sadece gerektiğinde yüklenir.
import { installWaitDays, overdueInstall, waitingInstall } from './registrationStore';

const yn = (v) => (v === true ? 'Evet' : v === false ? 'Hayır' : '');
const today = () => new Date().toISOString().slice(0, 10);
const appLink = (dealerId) => (dealerId ? `${window.location.origin}/dealers/${encodeURIComponent(dealerId)}` : '');
const mapsLink = (r) => (r.location ? `https://www.google.com/maps?q=${r.location.lat},${r.location.lng}` : r.mapsUrl || '');

function installStatus(r) {
  if (r.photoFiles?.exteriorAfter || r.photoFiles?.interiorAfter) return 'Kurulum fotoğrafı var';
  if (overdueInstall(r)) return `Gecikmiş (${installWaitDays(r)} gün)`;
  if (waitingInstall(r)) return 'Bekliyor';
  return '';
}

// Devreye alım: dizindeki [kombi24, klima24, kombi25, klima25, kombi26, klima26]
function devreye(v) {
  const a = Array.isArray(v) ? v : [];
  return {
    'Kombi 2024': a[0] ?? '', 'Klima 2024': a[1] ?? '',
    'Kombi 2025': a[2] ?? '', 'Klima 2025': a[3] ?? '',
    'Kombi 2026': a[4] ?? '', 'Klima 2026': a[5] ?? '',
  };
}

async function download(rows, sheetName, fileName) {
  const XLSX = await import('xlsx');
  const ws = XLSX.utils.json_to_sheet(rows, { cellDates: true, dateNF: 'dd.mm.yyyy hh:mm' });
  const headers = rows.length ? Object.keys(rows[0]) : [];
  // Sütun genişlikleri: başlık ve içeriğe göre, 60 karakterle sınırlı
  ws['!cols'] = headers.map((h) => ({
    wch: Math.min(60, Math.max(h.length, ...rows.slice(0, 300).map((r) => {
      const v = r[h];
      return v instanceof Date ? 16 : String(v ?? '').length;
    })) + 2),
  }));
  if (rows.length) ws['!autofilter'] = { ref: ws['!ref'] };
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, fileName, { compression: true });
}

export function exportRegistrations(regs, dealers) {
  const rows = regs.map((r) => {
    const d = dealers.get(r.dealerId);
    return {
      'Tarih': r.date || '',
      'Temsilci': r.salesRep || '',
      'Bayi': d?.n || r.dealerName || r.companyTitle || '',
      'Platform ID': r.dealerId && !r.dealerId.startsWith('NOID-') ? r.dealerId : '',
      'İl': d?.c || '',
      'İlçe': d?.d || '',
      'Distribütör': r.distributor || d?.x || '',
      'Görüşülen kişi': r.contactName || '',
      'Telefon': r.phone || '',
      'E-posta': r.email || '',
      'Tabela talebi': yn(r.signRequest),
      'Stant talebi': yn(r.standRequest),
      'Kurulum durumu': installStatus(r),
      'Konum': mapsLink(r),
      ...devreye(d?.v),
      'Kaynak': r.source === 'legacySheets' ? 'Eski sistem' : 'Uygulama',
      'Düzenlendi': r.editCount ? `Evet (${r.editCount})` : '',
      'Kontrol gerekli': r.needsReview ? 'Evet' : '',
      'Uygulamada aç': appLink(r.dealerId),
    };
  });
  return download(rows, 'Kayıtlar', `airfel-kayitlar-${today()}.xlsx`);
}

export function exportDealers(entries, regs) {
  const visits = new Map();
  regs.forEach((r) => {
    if (!r.dealerId) return;
    const v = visits.get(r.dealerId) || { count: 0, last: null };
    v.count += 1;
    if (r.date && (!v.last || r.date > v.last)) v.last = r.date;
    visits.set(r.dealerId, v);
  });
  const rows = entries.map((e) => {
    const v = visits.get(e.i);
    return {
      'Platform ID': e.i.startsWith('NOID-') ? '' : e.i,
      'Bayi': e.n,
      'Durum': e.s === 'ACTIVE' ? 'Aktif' : e.s === 'SUSPEND' ? 'Askıda' : e.s,
      'İl': e.c,
      'İlçe': e.d,
      'Segment': e.g,
      'Temsilci': e.r,
      'Distribütör': e.x,
      ...devreye(e.v),
      'FY26 toplam': e.q,
      'FY26 segment': e.f,
      'Ziyaret sayısı': v?.count || 0,
      'Son ziyaret': v?.last || '',
      'Uygulamada aç': appLink(e.i),
    };
  });
  return download(rows, 'Bayiler', `airfel-bayiler-${today()}.xlsx`);
}

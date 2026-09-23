// src/utils/importers.js
// Excel dosyalarını okuyup Firestore'a yazılacak kayıtlara dönüştürür.
// Firebase'e bağımlı değildir; sadece düz JS nesneleri üretir.
import * as XLSX from 'xlsx';
import { coordsFromMapsUrl } from './geo';

/* ---------- yardımcılar ---------- */

const trUpper = (s) => (s == null ? '' : String(s).trim().toLocaleUpperCase('tr-TR'));
// Aynı kişinin farklı yazılışları -> tek standart isim (anahtarlar büyük harf)
export const REP_ALIASES = {
  'DOĞUKAN ERİLLİ': 'ÖZER DOĞUKAN ERİLLİ',
};
const repKey = (s) => {
  const k = trUpper(s).replace(/\s+/g, ' ');
  return REP_ALIASES[k] ?? k;
};

const clean = (v) => {
  if (v == null) return null;
  if (typeof v === 'string') {
    const t = v.trim();
    return t === '' ? null : t;
  }
  return v;
};
const num = (v) => {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

// FNV-1a: tarayıcıda senkron, sabit (deterministik) kısa hash
function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36).padStart(7, '0');
}

// Excel seri tarihini yerel saatle Date'e çevirir (xlsx'in saat dilimi kaymalarından kaçınmak için)
function excelSerialToDate(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date) return v;
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  // Excel gün 0 = 1899-12-30; UTC üzerinden bileşenleri alıp yerel saatle kuruyoruz
  const ms = Math.round(v * 86400) * 1000;
  const u = new Date(Date.UTC(1899, 11, 30) + ms);
  return new Date(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate(),
    u.getUTCHours(), u.getUTCMinutes(), u.getUTCSeconds());
}

// "7.06.2026 19:16:15" veya "07.06.2026 23:53:02" biçimi
function parseTrDateTime(v) {
  if (v == null) return null;
  if (typeof v === 'number') return excelSerialToDate(v);
  const m = String(v).trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!m) return null;
  const [, d, mo, y, H = '0', M = '0', S = '0'] = m;
  return new Date(+y, +mo - 1, +d, +H, +M, +S);
}

function readSheet(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: null, raw: true });
  // başlıklardaki baş/son boşlukları temizle
  return rows.map((r) => {
    const o = {};
    for (const k of Object.keys(r)) o[k.trim()] = r[k];
    return o;
  });
}

function checkHeaders(rows, required) {
  const have = new Set(rows.length ? Object.keys(rows[0]) : []);
  return required.filter((h) => !have.has(h));
}

/* ---------- 1) Customer Data -> dealers ---------- */

export const CUSTOMER_REQUIRED = [
  'PLATFORM ID', 'CUSTOMER NAME', 'STATUS', 'CITY', 'SALES REP.',
  'FY26 Total Sales Qty', 'DISTRIBUTOR NAME',
];

function salesYear(r, fy) {
  return {
    ac: num(r[`${fy} AC Sales Qty`]) ?? 0,
    cb: num(r[`${fy} CB Sales Qty`]) ?? 0,
    total: num(r[`${fy} Total Sales Qty`]) ?? 0,
    segment: clean(r[`${fy} Sales Segment`]),
  };
}

export function parseCustomerData(arrayBuffer) {
  const rows = readSheet(arrayBuffer);
  const missing = checkHeaders(rows, CUSTOMER_REQUIRED);
  if (missing.length) return { error: `Dosyada şu sütunlar bulunamadı: ${missing.join(', ')}. Doğru dosyayı seçtiğinden emin ol.` };

  const dealers = [];
  const skipped = [];
  const usedIds = new Set();
  const noIdCounter = {};
  let noIdCount = 0;
  const dupIds = [];

  rows.forEach((r, i) => {
    const excelRow = i + 2;
    const name = clean(r['CUSTOMER NAME']);
    if (!name) {
      // "Total", boş satır, "Filtre uygulanmadı" gibi rapor artıkları
      skipped.push({ excelRow, reason: 'Müşteri adı yok (özet/boş satır)', value: clean(r['SAP NO']) });
      return;
    }

    let platformId = clean(r['PLATFORM ID']);
    let id;
    if (platformId) {
      platformId = trUpper(platformId);
      id = platformId;
      if (usedIds.has(id)) {
        dupIds.push({ excelRow, id });
        return; // aynı ID ikinci kez: ilkini koru
      }
    } else {
      const key = [trUpper(name), trUpper(r['CITY']), trUpper(r['DISTRICT'])].join('|');
      const base = `NOID-${hash(key)}`;
      noIdCounter[base] = (noIdCounter[base] || 0) + 1;
      id = noIdCounter[base] === 1 ? base : `${base}-${noIdCounter[base]}`;
      noIdCount++;
    }
    usedIds.add(id);

    const sap = clean(r['SAP NO']);
    dealers.push({
      id,
      data: {
        platformId: platformId || null,
        hasPlatformId: !!platformId,
        sapNo: sap == null ? null : String(sap),
        name,
        nameKey: trUpper(name),
        status: clean(r['STATUS']),
        department: clean(r['DEPARTMENT']),
        rsgSegment: clean(r['RSG SEGMENT']),
        sbuSegment: clean(r['SBU SEGMENT']),
        servicesStatus: clean(r['SERVICES STATUS']),
        currentClass: clean(r['FY26 AIRFEL CURRENT CLSS']),
        createdDate: excelSerialToDate(r['CREATION DATE']),
        firstLoginDate: excelSerialToDate(r['F.LOGIN DATE']),
        sales: {
          fy24: salesYear(r, 'FY24'),
          fy25: salesYear(r, 'FY25'),
          fy26: salesYear(r, 'FY26'),
          fy25vsFy24: num(r['FY25 vs FY24']),
          total3y: num(r['FY24-FY26 Total Sales Qty']) ?? 0,
        },
        distributor: clean(r['DISTRIBUTOR NAME']),
        region: clean(r['DTAS REGION']),
        city: clean(r['CITY']),
        district: clean(r['DISTRICT']),
        salesRep: clean(r['SALES REP.']),
        salesRepKey: repKey(r['SALES REP.']),
        regionManager: clean(r['REGION MANAGER']),
      },
    });
  });

  return {
    dealers,
    skipped,
    stats: {
      totalRows: rows.length,
      dealers: dealers.length,
      withPlatformId: dealers.length - noIdCount,
      withoutPlatformId: noIdCount,
      skipped: skipped.length,
      duplicateIds: dupIds,
    },
  };
}

/* ---------- 2) Eski sistem (Google Sheets) -> registrations ---------- */

export const LEGACY_REQUIRED = [
  'TARİH', 'SATIŞ TEMSİLCİSİ', 'FİRMA ÜNVANI', 'PLATFORM ID',
  'TABELA TALEBİ', 'STANT TALEBİ', 'DIŞ CEPHE FOTO', 'DÜKKAN İÇİ FOTO',
];

const yesNo = (v) => {
  const t = trUpper(v);
  if (t === 'EVET') return true;
  if (t === 'HAYIR') return false;
  return null;
};

// Konum yardımcıları ortak dosyada; eski kodların kırılmaması için buradan da dışa veriliyor
export { coordsFromMapsUrl };

const normPhone = (v) => {
  if (v == null) return null;
  const d = String(v).replace(/\D/g, '');
  if (!d) return null;
  if (d.length === 10) return `0${d}`;
  return d;
};

export function parseLegacy(arrayBuffer, knownDealerIds) {
  const rows = readSheet(arrayBuffer);
  const missing = checkHeaders(rows, LEGACY_REQUIRED);
  if (missing.length) return { error: `Dosyada şu sütunlar bulunamadı: ${missing.join(', ')}. Eski sistemden alınan dosyayı seçtiğinden emin ol.` };

  const records = [];
  const idCounter = {};
  const coordStats = { sheet: 0, link: 0, none: 0 };

  rows.forEach((r, i) => {
    const excelRow = i + 2;
    const reasons = [];

    const rawDate = clean(r['TARİH']);
    const date = parseTrDateTime(rawDate);
    if (!date) reasons.push('Tarih okunamadı');

    const rawPid = clean(r['PLATFORM ID']);
    let platformId = rawPid ? trUpper(rawPid) : null;
    let dealerId = null;
    if (!platformId) {
      reasons.push('Platform ID yok');
    } else {
      const base = platformId.match(/^C-\d{8}/)?.[0] ?? platformId;
      if (knownDealerIds?.has(platformId)) dealerId = platformId;
      else if (knownDealerIds?.has(base)) { dealerId = base; reasons.push(`Platform ID "${platformId}" → "${base}" olarak eşlendi, kontrol et`); }
      else reasons.push('Platform ID bayi listesinde yok');
    }

    // Konum: önce tablodaki koordinat, yoksa linkten çıkar
    const mapsUrl = clean(r['MAPS LİNKİ']);
    let location = null;
    let locationSource = null;
    const lat = num(r['ENLEM']), lng = num(r['BOYLAM']);
    if (lat != null && lng != null) { location = { lat, lng }; locationSource = 'sheet'; coordStats.sheet++; }
    else {
      const c = coordsFromMapsUrl(mapsUrl);
      if (c) { location = c; locationSource = 'mapsLink'; coordStats.link++; }
      else coordStats.none++;
    }

    const rep = clean(r['SATIŞ TEMSİLCİSİ']);
    const company = clean(r['FİRMA ÜNVANI']);

    // Sabit doküman ID: aynı dosya tekrar aktarılırsa kopya oluşmaz
    const key = [rawDate, trUpper(rep), trUpper(company), platformId].join('|');
    const base = `legacy-${hash(key)}`;
    idCounter[base] = (idCounter[base] || 0) + 1;
    const id = idCounter[base] === 1 ? base : `${base}-${idCounter[base]}`;

    records.push({
      id,
      excelRow,
      data: {
        createdAt: date,
        rawDate: rawDate == null ? null : String(rawDate),
        salesRep: rep,
        salesRepKey: repKey(rep),
        distributor: clean(r['DİSTRİBÜTÖR']),
        contactName: clean(r['AD SOYAD']),
        companyTitle: company,
        platformId,
        dealerId,
        signRequest: yesNo(r['TABELA TALEBİ']),
        standRequest: yesNo(r['STANT TALEBİ']),
        location,
        locationSource,
        mapsUrl,
        photos: {
          exterior: clean(r['DIŞ CEPHE FOTO']),
          interior: clean(r['DÜKKAN İÇİ FOTO']),
          exteriorAfter: clean(r['Dış Sonrası Foto']),
          interiorAfter: clean(r['İçi Sonrası Foto']),
        },
        photoStorage: 'googleDrive',
        phone: normPhone(r['Telefon']),
        email: clean(r['E-Mail']),
        source: 'legacySheets',
        legacyRow: excelRow,
        needsReview: reasons.length > 0,
        reviewReasons: reasons,
      },
    });
  });

  // Aynı bayiye birden fazla kayıt: hepsi korunur, sadece bilgi amaçlı sayılır
  const perDealer = {};
  records.forEach((r) => { if (r.data.dealerId) perDealer[r.data.dealerId] = (perDealer[r.data.dealerId] || 0) + 1; });
  const multiVisitDealers = Object.values(perDealer).filter((n) => n > 1).length;

  return {
    records,
    stats: {
      totalRows: rows.length,
      records: records.length,
      matched: records.filter((r) => r.data.dealerId).length,
      needsReview: records.filter((r) => r.data.needsReview).length,
      multiVisitDealers,
      coords: coordStats,
      photoLinks: records.reduce((n, r) => n + Object.values(r.data.photos).filter(Boolean).length, 0),
    },
  };
}
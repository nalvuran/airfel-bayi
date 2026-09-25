// src/utils/decline.js
// Düşüşteki bayiler. Customer Data'da sadece yıllık rakamlar var ve mali yıl 1 Nisan'da başlıyor;
// bu yüzden devam eden FY26'yı tam yılla kıyaslamıyoruz (mevsimsellik yanıltır). Adil iki kıyas:
//  - Geçen yıl düşenler: FY25 (tam yıl) FY24'e (tam yıl) göre belirgin düşmüş
//  - Bu yıl sessiz: FY25'te belli bir adedin üzerinde almış, FY26'da (1 Nisan'dan beri) hiç almamış
import { DECLINE_MIN_QTY, DECLINE_PCT } from './catalog';

const tot = (v, y) => (Array.isArray(v) ? (v[y * 2] || 0) + (v[y * 2 + 1] || 0) : 0); // 0: FY24, 1: FY25, 2: FY26

export function yearTotals(e) { return { fy24: tot(e.v, 0), fy25: tot(e.v, 1), fy26: tot(e.v, 2) }; }

export function declineInfo(e) {
  const { fy24, fy25, fy26 } = yearTotals(e);
  const pct = fy24 > 0 ? Math.round(((fy25 - fy24) / fy24) * 100) : null;
  return {
    fy24, fy25, fy26, pct,
    declined: fy24 >= DECLINE_MIN_QTY && pct !== null && pct <= -DECLINE_PCT,
    silent: fy25 >= DECLINE_MIN_QTY && fy26 === 0,
  };
}

export function declineLists(entries) {
  const active = entries.filter((e) => e.s === 'ACTIVE' && Array.isArray(e.v));
  const withInfo = active.map((e) => ({ e, ...declineInfo(e) }));
  return {
    declined: withInfo.filter((x) => x.declined).sort((a, b) => (b.fy24 - b.fy25) - (a.fy24 - a.fy25)),
    silent: withInfo.filter((x) => x.silent).sort((a, b) => b.fy25 - a.fy25),
  };
}

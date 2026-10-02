// src/utils/text.js
// Başlık biçimi: her kelimenin ilk harfi Türkçe kurala göre büyük (i → İ, ı → I).
// TDK kuralına göre bağlaçlar ve soru eki küçük kalır: "Ekip ve Kullanıcılar", "Bayinin Talebi Var mı?"
// Parantez içi açıklamalar olduğu gibi kalır: "Fotoğraf (isteğe bağlı)".
// Zaten büyük harfle başlayan kelimelere dokunulmaz (FY26, Customer Data, E-posta).
const SMALL = new Set(['ve', 'ile', 'veya', 'ya', 'da', 'de', 'ki', 'mı', 'mi', 'mu', 'mü', 'ya da']);

export function trTitle(s) {
  if (typeof s !== 'string') return s;
  let depth = 0;
  let first = true;
  return s.split(/(\s+)/).map((w) => {
    if (/^\s+$/.test(w) || !w) return w;
    const startDepth = depth;
    for (const ch of w) { if (ch === '(') depth++; if (ch === ')') depth = Math.max(0, depth - 1); }
    const isFirst = first; first = false;
    if (startDepth > 0 || w.startsWith('(')) return w;
    const core = w.replace(/[?.,:;!"“”]+$/, '').toLocaleLowerCase('tr-TR');
    if (!isFirst && SMALL.has(core)) return w;
    const i = [...w].findIndex((ch) => /\p{L}/u.test(ch));
    if (i < 0) return w;
    const chars = [...w];
    if (/\p{Ll}/u.test(chars[i])) chars[i] = chars[i].toLocaleUpperCase('tr-TR');
    return chars.join('');
  }).join('');
}

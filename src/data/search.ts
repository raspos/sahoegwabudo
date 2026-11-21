import type { Country } from './types';

const CHO = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];

export function initials(s: string) {
  let out = '';
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    out += c >= 0xac00 && c <= 0xd7a3 ? CHO[Math.floor((c - 0xac00) / 588)] : ch;
  }
  return out;
}

const norm = (s: string) => s.toLowerCase().replace(/[\s.\-'’·]/g, '');

/** 한국어·영어·별칭·ISO 코드·초성으로 국가 검색. 앞부분 일치를 우선한다. */
export function searchCountries(countries: Country[], query: string, limit = 8): Country[] {
  const q = norm(query);
  if (!q) return [];
  const onlyCho = /^[ㄱ-ㅎ]+$/.test(q);
  const scored: { c: Country; s: number }[] = [];
  for (const c of countries) {
    const names = [c.name_ko, c.name_en, c.official_ko, c.official_en, ...c.aliases].map(norm);
    let s = 0;
    if (onlyCho) {
      const ini = norm(initials(c.name_ko));
      if (ini.startsWith(q)) s = 3;
      else if (ini.includes(q)) s = 1;
    } else {
      if (c.iso3.toLowerCase() === q || c.iso2.toLowerCase() === q) s = 5;
      for (const n of names) {
        if (n === q) s = Math.max(s, 6);
        else if (n.startsWith(q)) s = Math.max(s, 4);
        else if (n.includes(q)) s = Math.max(s, 2);
      }
    }
    if (s) scored.push({ c, s });
  }
  return scored
    .sort((a, b) => b.s - a.s || a.c.name_ko.length - b.c.name_ko.length || a.c.name_ko.localeCompare(b.c.name_ko, 'ko'))
    .slice(0, limit)
    .map((x) => x.c);
}

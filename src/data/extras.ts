import { useEffect, useState } from 'react';

/** 도감을 열 때만 불러오는 추가 자료 (수출·농산물·자연환경) */
export interface TradeProduct { hs: string; name_ko: string; name_en: string; value: number; share: number }
export interface TradePartner { iso3: string | null; code: number; name_en: string; name_ko?: string | null; value: number; share: number }
export interface TradeCountry {
  year: number; total: number; hs_sum_ratio: number | null;
  products: TradeProduct[]; unspecified_share: number; partner_unspecified_share: number; partners: TradePartner[];
}
export interface AgriItem { item: string; name_en: string; name_ko: string; tonnes: number; rank: number; of: number; world_share: number | null; flag: string | null }
export interface AgriCountry { representative: AgriItem[]; by_tonnes: AgriItem[]; livestock: { name_ko: string; head: number }[] }
export interface NatureCountry {
  cells: number; approx?: boolean; koppen: { id: number; code: string; share: number | null }[]; koppen_note?: string;
  landforms: { name_ko: string | null; name_en: string; kind: string; kind_ko: string; share_of_region: number; share_of_country: number }[];
  rivers: { name: string; km_in_country: number }[];
  peaks: { name_ko: string | null; name_en: string; elevation_m: number }[];
}
export interface Extras {
  trade: { meta: { retrieved_at: string; by_year: Record<string, number> }; countries: Record<string, TradeCountry> } | null;
  agri: { meta: { year: number; accessed: string }; countries: Record<string, AgriCountry> } | null;
  nature: { meta: { approx_countries: string[] }; countries: Record<string, NatureCountry> } | null;
}

let cache: Promise<Extras> | null = null;

export function loadExtras(base = import.meta.env.BASE_URL): Promise<Extras> {
  if (!cache) {
    const get = (p: string) => fetch(`${base}data/${p}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    cache = Promise.all([get('trade.json'), get('agri.json'), get('nature.json')]).then(([trade, agri, nature]) => ({ trade, agri, nature }));
  }
  return cache;
}

export function useExtras(): Extras | null {
  const [ex, setEx] = useState<Extras | null>(null);
  useEffect(() => {
    let alive = true;
    loadExtras().then((e) => alive && setEx(e));
    return () => { alive = false; };
  }, []);
  return ex;
}

/** Köppen-Geiger 기후형 한국어 이름 (교과서 용어 기준) */
export const KOPPEN_KO: Record<string, string> = {
  Af: '열대 우림 기후', Am: '열대 몬순 기후', Aw: '사바나 기후',
  BWh: '사막 기후(더운)', BWk: '사막 기후(추운)', BSh: '스텝 기후(더운)', BSk: '스텝 기후(추운)',
  Csa: '지중해성 기후(여름 더움)', Csb: '지중해성 기후(여름 따뜻함)', Csc: '여름 건조 온대 기후(여름 서늘함)',
  Cwa: '온대 겨울 건조 기후(여름 더움)', Cwb: '온대 겨울 건조 기후(여름 따뜻함)', Cwc: '온대 겨울 건조 기후(여름 서늘함)',
  Cfa: '온난 습윤 기후', Cfb: '서안 해양성 기후', Cfc: '서안 해양성 기후(여름 서늘함)',
  Dsa: '냉대 여름 건조 기후(여름 더움)', Dsb: '냉대 여름 건조 기후(여름 따뜻함)', Dsc: '냉대 여름 건조 기후(여름 서늘함)', Dsd: '냉대 여름 건조 기후(겨울 매우 추움)',
  Dwa: '냉대 겨울 건조 기후(여름 더움)', Dwb: '냉대 겨울 건조 기후(여름 따뜻함)', Dwc: '냉대 겨울 건조 기후(여름 서늘함)', Dwd: '냉대 겨울 건조 기후(겨울 매우 추움)',
  Dfa: '냉대 습윤 기후(여름 더움)', Dfb: '냉대 습윤 기후(여름 따뜻함)', Dfc: '냉대 습윤 기후(여름 서늘함)', Dfd: '냉대 습윤 기후(겨울 매우 추움)',
  ET: '툰드라 기후', EF: '빙설 기후',
};

/** 기후 대분류 색 (Beck et al. 범례 계열을 지도책 톤으로 낮춤) */
export function koppenColor(code: string): string {
  const g = code[0];
  if (g === 'A') return '#4f8a6b';
  if (g === 'B') return code.startsWith('BW') ? '#d8b26a' : '#c9b98a';
  if (g === 'C') return code[1] === 's' ? '#c7c26b' : code[1] === 'w' ? '#9fbf7a' : '#86b08a';
  if (g === 'D') return code[1] === 'f' ? '#6f97a8' : code[1] === 'w' ? '#8a8fb8' : '#a58aa8';
  return code === 'ET' ? '#a7a9a4' : '#d6dadb';
}

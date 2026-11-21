import type { Indicator } from './types';

const nf = (d: number) => new Intl.NumberFormat('ko-KR', { maximumFractionDigits: d, minimumFractionDigits: d });

/** 큰 수를 '5,168만', '1조 8,724억' 처럼 읽기 쉽게 */
export function koreanUnits(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1e12) {
    const jo = Math.floor(abs / 1e12);
    const eok = Math.round((abs - jo * 1e12) / 1e8);
    if (eok >= 10000) return `${sign}${(jo + 1).toLocaleString('ko-KR')}조`;
    return `${sign}${jo.toLocaleString('ko-KR')}조${eok ? ` ${eok.toLocaleString('ko-KR')}억` : ''}`;
  }
  if (abs >= 1e8) {
    const eok = Math.floor(abs / 1e8);
    const man = Math.round((abs - eok * 1e8) / 1e4);
    if (man >= 10000) return `${sign}${(eok + 1).toLocaleString('ko-KR')}억`;
    return `${sign}${eok.toLocaleString('ko-KR')}억${man ? ` ${man.toLocaleString('ko-KR')}만` : ''}`;
  }
  if (abs >= 1e4) return `${sign}${Math.round(abs / 1e4).toLocaleString('ko-KR')}만`;
  return `${sign}${Math.round(abs).toLocaleString('ko-KR')}`;
}

/** 지표 값을 단위와 함께 표시 */
export function fmtValue(ind: Indicator, v: number | undefined, opts: { short?: boolean } = {}): string {
  if (v === undefined || v === null || Number.isNaN(v)) return '자료 없음';
  switch (ind.indicator_id) {
    case 'population':
      return opts.short ? `${koreanUnits(v)}명` : `${nf(0).format(v)}명`;
    case 'gdp':
      return `${koreanUnits(v)} 달러`;
    case 'gdp_pc':
      return `${nf(0).format(v)} 달러`;
    case 'gdp_pc_ppp':
    case 'productivity':
      return `${nf(0).format(v)} 국제달러`;
    case 'area':
      return v < 100 ? `${nf(2).format(v)}km²` : `${nf(0).format(v)}km²`;
    case 'density':
      return `${nf(v < 10 ? 1 : 0).format(v)}명/km²`;
    case 'fertility':
      return `${nf(2).format(v)}명`;
    case 'life_exp':
      return `${nf(1).format(v)}세`;
    case 'fifa_men':
    case 'fifa_women':
      return `${nf(opts.short ? 0 : 2).format(v)}점`;
    case 'olympic_medals':
    case 'olympic_gold':
      return `${nf(0).format(v)}개`;
    default:
      return `${nf(ind.digits).format(v)}%`;
  }
}

export const fmtInt = (n: number) => nf(0).format(n);

/** 조사(이/가, 은/는, 을/를, 과/와) 선택 */
export function josa(word: string, pair: '이가' | '은는' | '을를' | '과와' | '으로로'): string {
  const ch = word.charCodeAt(word.length - 1);
  let batchim = false;
  let rieul = false;
  if (ch >= 0xac00 && ch <= 0xd7a3) {
    const jong = (ch - 0xac00) % 28;
    batchim = jong !== 0;
    rieul = jong === 8;
  } else if (/[0-9]$/.test(word)) {
    batchim = /[013678]$/.test(word);
    rieul = /[178]$/.test(word);
  }
  const [a, b] = pair === '으로로' ? ['으로', '로'] : [pair[0], pair[1]];
  if (pair === '으로로') return word + (batchim && !rieul ? a : b);
  return word + (batchim ? a : b);
}

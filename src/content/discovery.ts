import type { Dataset } from '../data/engine';
import type { Country, IndicatorId } from '../data/types';
import { fmtValue, josa } from '../data/format';

const HIGH: Partial<Record<IndicatorId, string>> = {
  population: '많아요', area: '넓어요', density: '높아요', gdp: '커요', gdp_pc: '높아요',
  life_exp: '길어요', fertility: '높아요', urban: '높아요', internet: '높아요',
};
const LOW: Partial<Record<IndicatorId, string>> = {
  population: '적어요', area: '좁아요', density: '낮아요', gdp: '작아요', gdp_pc: '낮아요',
  life_exp: '짧아요', fertility: '낮아요', urban: '낮아요', internet: '낮아요',
};

export interface Discovery { country: Country; indicator: IndicatorId; text: string }

/** 날짜마다 하나씩 바뀌는 '오늘의 발견'. 세계 상위·하위 10위 안에 드는 실제 통계만 고른다. */
export function discoveryFacts(ds: Dataset): Discovery[] {
  const out: Discovery[] = [];
  for (const iid of Object.keys(HIGH) as IndicatorId[]) {
    const r = ds.ranking(iid);
    const n = r.rows.length;
    const ind = r.indicator;
    r.rows.forEach((row, i) => {
      const top = row.rank <= 10;
      const bottomPos = n - i; // 1 = 가장 낮음
      const bottom = bottomPos <= 10 && !top;
      if (!top && !bottom) return;
      const ord = top ? (row.rank === 1 ? '가장' : `${row.rank}번째로`) : bottomPos === 1 ? '가장' : `${bottomPos}번째로`;
      const pred = top ? HIGH[iid] : LOW[iid];
      const v = fmtValue(ind, row.value, { short: true });
      out.push({
        country: row.country,
        indicator: iid,
        text: `${josa(ind.name_ko, '이가')} ${josa(v, '으로로')} ${n}개국 가운데 ${ord} ${pred} (${r.year}년)`,
      });
    });
  }
  return out;
}

export function todaysDiscovery(ds: Dataset, date: Date): Discovery | undefined {
  const facts = discoveryFacts(ds);
  if (!facts.length) return undefined;
  const day = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 864e5);
  // 연속한 날에 같은 지표가 이어지지 않도록 큰 소수로 섞는다
  return facts[(day * 7919) % facts.length];
}

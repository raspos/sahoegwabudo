import type { Dataset } from '../data/engine';
import type { IndicatorId } from '../data/types';

/** 같은 해의 농림어업·산업·서비스업·제조업 비중 (셋이 모두 있는 가장 최근 해). 세 값의 합은 100이 아니다(생산물세 등). */
export function sectorSharesOf(ds: Dataset, cid: string) {
  const ids: IndicatorId[] = ['agri_va', 'industry_va', 'services_va'];
  const years = ds.series(cid, 'services_va').map(([y]) => y).reverse();
  for (const y of years) {
    const v = ids.map((i) => ds.value(cid, i, y));
    if (v.every((x) => x !== undefined)) {
      const [agri, industry, services] = v as number[];
      return { year: y, agri, industry, services, manufacturing: ds.value(cid, 'manufacturing', y), other: 100 - agri - industry - services };
    }
  }
  return undefined;
}

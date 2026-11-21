import type { IndicatorId } from './types';

/** 단계 구분도 색. 경계값은 읽기 쉬운 반올림 값으로 고정해 해마다 같은 범례를 쓴다. */
export interface Scale {
  thresholds: number[];
  colors: string[]; // thresholds.length + 1
  labels: string[];
}

const WARM = ['#F3E7C6', '#E8D29C', '#DCB872', '#CB9A52', '#B67D3E', '#9A6131', '#7A4727', '#57311D'];
const SAGE = ['#EFF0D6', '#D9E2B5', '#BCCF93', '#9CB777', '#7C9E5F', '#5E834B', '#43683A', '#2C4C2A'];
const CLAY = ['#F1E5D3', '#E5CBAE', '#D6AE89', '#C48F69', '#AE7252', '#93573F', '#743F2F', '#552B22'];
const DIVERGE = ['#5A7F86', '#8EADAE', '#C9D6CB', '#EFE6C9', '#E3C08E', '#C98F59', '#A2603A', '#743A24'];

const fmt = (n: number) => (n >= 1e12 ? `${n / 1e12}조` : n >= 1e8 ? `${n / 1e8}억` : n >= 1e4 ? `${n / 1e4}만` : `${n}`);

function mk(thresholds: number[], colors: string[], unit: (n: number) => string): Scale {
  const labels = colors.map((_, i) =>
    i === 0 ? `${unit(thresholds[0])} 미만` : i === thresholds.length ? `${unit(thresholds[i - 1])} 이상` : `${unit(thresholds[i - 1])}–${unit(thresholds[i])}`,
  );
  return { thresholds, colors, labels };
}

export const SCALES: Record<IndicatorId, Scale> = {
  population: mk([1e6, 5e6, 1e7, 3e7, 5e7, 1e8, 3e8], WARM, (n) => fmt(n)),
  area: mk([1e3, 3e4, 1e5, 3e5, 1e6, 3e6, 7e6], CLAY, (n) => fmt(n)),
  density: mk([10, 25, 50, 100, 200, 500, 1000], WARM, (n) => `${n}`),
  gdp: mk([1e10, 5e10, 1e11, 5e11, 1e12, 3e12, 1e13], SAGE, (n) => fmt(n)),
  gdp_pc: mk([1000, 2500, 5000, 10000, 20000, 40000, 70000], SAGE, (n) => n.toLocaleString('ko-KR')),
  gdp_growth: mk([-3, 0, 1, 2, 3, 5, 7], DIVERGE, (n) => `${n}`),
  inflation: mk([0, 2, 3, 5, 8, 15, 30], WARM, (n) => `${n}`),
  fertility: mk([1.2, 1.5, 1.8, 2.1, 2.5, 3.5, 4.5], CLAY, (n) => `${n}`),
  life_exp: mk([60, 65, 70, 74, 77, 80, 83], SAGE, (n) => `${n}`),
  urban: mk([20, 35, 50, 60, 70, 80, 90], CLAY, (n) => `${n}`),
  manufacturing: mk([5, 8, 11, 14, 17, 20, 25], WARM, (n) => `${n}`),
  internet: mk([20, 40, 55, 70, 80, 90, 95], SAGE, (n) => `${n}`),
  agri_va: mk([2, 5, 10, 15, 20, 30, 40], SAGE, (n) => `${n}`),
  industry_va: mk([15, 20, 25, 30, 35, 45, 55], WARM, (n) => `${n}`),
  services_va: mk([40, 45, 50, 55, 60, 65, 70], CLAY, (n) => `${n}`),
  gdp_pc_ppp: mk([2500, 5000, 10000, 20000, 35000, 55000, 80000], SAGE, (n) => n.toLocaleString('ko-KR')),
  exports_gdp: mk([15, 25, 35, 50, 70, 100, 150], WARM, (n) => `${n}`),
  productivity: mk([5000, 10000, 20000, 40000, 70000, 100000, 140000], SAGE, (n) => n.toLocaleString('ko-KR')),
  resource_rents: mk([1, 2, 5, 10, 15, 25, 35], WARM, (n) => `${n}`),
  tourism_exports: mk([2, 5, 10, 15, 25, 40, 60], CLAY, (n) => `${n}`),
  forest: mk([5, 10, 20, 30, 40, 55, 70], SAGE, (n) => `${n}`),
  arable: mk([2, 5, 10, 15, 20, 30, 45], CLAY, (n) => `${n}`),
  fifa_men: mk([1000, 1100, 1200, 1300, 1400, 1550, 1700], SAGE, (n) => n.toLocaleString('ko-KR')),
  fifa_women: mk([1100, 1250, 1400, 1550, 1700, 1850, 1950], SAGE, (n) => n.toLocaleString('ko-KR')),
  olympic_medals: mk([1, 5, 20, 50, 150, 400, 800], WARM, (n) => n.toLocaleString('ko-KR')),
  olympic_gold: mk([1, 3, 10, 30, 80, 200, 400], WARM, (n) => n.toLocaleString('ko-KR')),
};

export function colorFor(scale: Scale, v: number | undefined): string {
  if (v === undefined) return 'url(#nodata)';
  let i = 0;
  while (i < scale.thresholds.length && v >= scale.thresholds[i]) i++;
  return scale.colors[i];
}

export function binOf(scale: Scale, v: number): number {
  let i = 0;
  while (i < scale.thresholds.length && v >= scale.thresholds[i]) i++;
  return i;
}

/** 기본 정치 지도 색 (Natural Earth MAPCOLOR7: 이웃 나라가 같은 색이 되지 않도록 배정된 번호) */
export const POLITICAL = ['#D9CD9A', '#BFC79A', '#E0BE8E', '#C9B08A', '#D3D2A8', '#CDB993', '#B9BE8E'];
export const UNLISTED = '#E2DAC4';

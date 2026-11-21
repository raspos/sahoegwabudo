import type { Dataset } from '../data/engine';
import type { IndicatorId } from '../data/types';
import { fmtValue, josa } from '../data/format';

/** 콘텐츠 문장에 넣는 숫자는 모두 데이터에서 가져온다 (본문에 수치를 직접 적지 않는다) */
export function val(ds: Dataset, cid: string, iid: IndicatorId, mode: 'ref' | 'latest' = 'ref') {
  const ind = ds.indicator(iid);
  const r = mode === 'ref' ? ds.refValue(cid, iid) : ds.latest(cid, iid);
  return r ? { text: fmtValue(ind, r.value, { short: true }), year: r.year, value: r.value } : undefined;
}

/** '194개국 가운데 13위' / '가장 높은' 등. sort 방향 기준 순위 */
export function rankText(ds: Dataset, cid: string, iid: IndicatorId) {
  const r = ds.rankOf(cid, iid);
  if (!r) return '순위 자료 없음';
  return `${r.of}개국 가운데 ${r.rank}위`;
}

/** 아래에서 몇 번째인지 (낮을수록 눈에 띄는 지표용) */
export function lowRankText(ds: Dataset, cid: string, iid: IndicatorId) {
  const r = ds.ranking(iid);
  const row = r.rows.find((x) => x.country.id === cid);
  if (!row) return '순위 자료 없음';
  const minV = r.rows[r.rows.length - 1].value;
  if (row.value === minV) return `${r.rows.length}개국 가운데 가장 낮습니다`;
  const fromBottom = r.rows.filter((x) => x.value < row.value).length + 1;
  return `${r.rows.length}개국 가운데 낮은 쪽에서 ${fromBottom}번째입니다`;
}

export function valueIn(ds: Dataset, cid: string, iid: IndicatorId, year: number) {
  const v = ds.value(cid, iid, year);
  return v === undefined ? '자료 없음' : fmtValue(ds.indicator(iid), v, { short: true });
}

/** 시계열에서 최댓값과 그 연도 */
export function peak(ds: Dataset, cid: string, iid: IndicatorId) {
  const s = ds.series(cid, iid);
  if (!s.length) return undefined;
  let best = s[0];
  for (const p of s) if (p[1] > best[1]) best = p;
  const last = s[s.length - 1];
  return { year: best[0], value: best[1], lastYear: last[0], last: last[1], text: fmtValue(ds.indicator(iid), best[1], { short: true }) };
}

export const name = (ds: Dataset, cid: string) => ds.country(cid)?.name_ko ?? cid;
export const ga = (w: string) => josa(w, '이가');
export const eun = (w: string) => josa(w, '은는');
export const ro = (w: string) => josa(w, '으로로');

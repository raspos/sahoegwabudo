import type { Country, Indicator, IndicatorId, Observations, Ranking, RankRow } from './types';

/**
 * 공통 데이터 엔진. 지도·도감·랭킹·게임이 모두 이 객체로 값을 읽는다.
 *
 * 순위 원칙
 *  - 한 순위표는 한 기준연도의 값만 쓴다. 나라마다 다른 최신 연도를 섞지 않는다.
 *  - 기준연도 값이 없는 나라는 순위에서 제외한다 (0으로 채우지 않는다).
 *  - 동률은 같은 순위를 주고 다음 순위는 건너뛴다 (1, 2, 2, 4). 동률 판정은 원자료 값 그대로 비교한다.
 */
export class Dataset {
  readonly countries: Country[];
  readonly byId: Map<string, Country>;
  readonly indicators: Indicator[];
  readonly indicatorById: Map<IndicatorId, Indicator>;
  private readonly obs: Observations;
  private rankCache = new Map<string, Ranking>();

  constructor(countries: Country[], indicators: Indicator[], obs: Observations) {
    this.countries = countries;
    this.byId = new Map(countries.map((c) => [c.id, c]));
    this.indicators = indicators;
    this.indicatorById = new Map(indicators.map((i) => [i.indicator_id, i]));
    this.obs = obs;
  }

  country(id: string) {
    return this.byId.get(id);
  }

  indicator(id: IndicatorId): Indicator {
    const ind = this.indicatorById.get(id);
    if (!ind) throw new Error(`unknown indicator ${id}`);
    return ind;
  }

  series(cid: string, iid: IndicatorId): [number, number][] {
    return this.obs[iid]?.[cid] ?? [];
  }

  /** 특정 연도의 값. 없으면 undefined (자료 없음). */
  value(cid: string, iid: IndicatorId, year: number): number | undefined {
    const s = this.series(cid, iid);
    for (const [y, v] of s) if (y === year) return v;
    return undefined;
  }

  /** 해당 나라의 가장 최근 값과 연도. 순위에는 쓰지 않는다. */
  latest(cid: string, iid: IndicatorId): { year: number; value: number } | undefined {
    const s = this.series(cid, iid);
    if (!s.length) return undefined;
    const [year, value] = s[s.length - 1];
    return { year, value };
  }

  /** 기준연도 값 (순위와 같은 연도). */
  refValue(cid: string, iid: IndicatorId) {
    const ind = this.indicator(iid);
    const v = this.value(cid, iid, ind.ref_year);
    return v === undefined ? undefined : { year: ind.ref_year, value: v };
  }

  ranking(iid: IndicatorId, year?: number): Ranking {
    const indicator = this.indicator(iid);
    const y = year ?? indicator.ref_year;
    const key = `${iid}:${y}`;
    const hit = this.rankCache.get(key);
    if (hit) return hit;
    const items: { country: Country; value: number }[] = [];
    const excluded: Country[] = [];
    for (const c of this.countries) {
      const v = this.value(c.id, iid, y);
      if (v === undefined) excluded.push(c);
      else items.push({ country: c, value: v });
    }
    const rows = competitionRank(items, indicator.sort === 'desc');
    const r: Ranking = { indicator, year: y, rows, excluded };
    this.rankCache.set(key, r);
    return r;
  }

  /** 방향을 바꾼 순위표 (예: 출산율이 가장 낮은 나라). 동률 규칙은 같다. */
  rankingDir(iid: IndicatorId, dir: 'desc' | 'asc'): Ranking {
    const base = this.ranking(iid);
    if (dir === base.indicator.sort) return base;
    const rows = competitionRank(base.rows.map((r) => ({ country: r.country, value: r.value })), dir === 'desc');
    return { ...base, rows };
  }

  /** 기준연도 순위. 그 해 값이 없으면 undefined. */
  rankOf(cid: string, iid: IndicatorId) {
    const r = this.ranking(iid);
    const row = r.rows.find((x) => x.country.id === cid);
    return row ? { rank: row.rank, of: r.rows.length, year: r.year, value: row.value } : undefined;
  }
}

export function competitionRank<T extends { country: Country; value: number }>(items: T[], descending: boolean): RankRow[] {
  const sorted = [...items].sort((a, b) =>
    a.value === b.value ? a.country.id.localeCompare(b.country.id) : descending ? b.value - a.value : a.value - b.value,
  );
  const rows: RankRow[] = [];
  let prev: number | undefined;
  let prevRank = 0;
  sorted.forEach((it, i) => {
    if (it.value !== prev) {
      prevRank = i + 1;
      prev = it.value;
    }
    rows.push({ country: it.country, value: it.value, rank: prevRank });
  });
  return rows;
}

export async function loadDataset(base: string): Promise<Dataset> {
  const get = (p: string) => fetch(`${base}data/${p}`).then((r) => {
    if (!r.ok) throw new Error(`${p}: ${r.status}`);
    return r.json();
  });
  const [countries, indicators, obs] = await Promise.all([
    get('countries.json'), get('indicators.json'), get('observations.json'),
  ]);
  return new Dataset(countries, indicators, obs);
}

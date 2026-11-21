import type { Dataset } from '../data/engine';
import type { Country, IndicatorId } from '../data/types';
import { continentName } from '../data/types';
import { fmtValue, josa } from '../data/format';

export type Rng = () => number;

/** 재현 가능한 난수 (테스트용 시드) */
export function seeded(seed: number): Rng {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

export function shuffle<T>(arr: T[], rng: Rng): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ───────────────────── GAME 01. 세계지도 챌린지 ─────────────────────
export type Level = 'beginner' | 'intermediate' | 'advanced';
export const LEVELS: { id: Level; name: string; desc: string }[] = [
  { id: 'beginner', name: '초급', desc: '인구 3천만 명 이상이거나 면적 100만km² 이상인 나라' },
  { id: 'intermediate', name: '중급', desc: '인구 300만 명 이상인 나머지 나라' },
  { id: 'advanced', name: '고급', desc: '작은 나라와 섬나라까지 모든 나라' },
];

export function levelOf(ds: Dataset, c: Country): Level {
  const pop = ds.refValue(c.id, 'population')?.value ?? 0;
  const area = ds.refValue(c.id, 'area')?.value ?? 0;
  if (pop >= 3e7 || area >= 1e6) return 'beginner';
  if (pop >= 3e6) return 'intermediate';
  return 'advanced';
}

export interface MapQuestion {
  target: Country;
  prompt: string;
}

export function mapQuestions(ds: Dataset, level: Level, rng: Rng, n = 10, mapIds?: Set<string>): MapQuestion[] {
  const pool = ds.countries.filter((c) => {
    if (mapIds && !mapIds.has(c.id)) return false;
    const l = levelOf(ds, c);
    return level === 'advanced' ? true : l === level;
  });
  // 고급은 작은 나라 비중을 높인다
  const ordered = level === 'advanced'
    ? [...shuffle(pool.filter((c) => levelOf(ds, c) === 'advanced'), rng).slice(0, Math.ceil(n * 0.7)),
       ...shuffle(pool.filter((c) => levelOf(ds, c) !== 'advanced'), rng)]
    : shuffle(pool, rng);
  const picked = shuffle(ordered.slice(0, n), rng);
  return picked.map((target) => ({
    target,
    prompt: `${continentName(target.continent)}에 있는 ${josa(target.name_ko, '을를')} 찾아보세요.`,
  }));
}

/** 오답 횟수에 따른 힌트. 정답 이름을 직접 알려 주지 않는다 */
export function mapHint(ds: Dataset, c: Country, wrongCount: number): string {
  if (wrongCount <= 1) {
    // 지역 이름에 나라 이름이 들어 있으면(예: 오스트레일리아·뉴질랜드) 정답이 드러나므로 반구로 알려 준다
    if (c.region_ko.includes(c.name_ko)) return `${continentName(c.continent)}에서도 ${c.latlng[0] >= 0 ? '북반구' : '남반구'}, ${c.latlng[1] >= 160 ? '동쪽 끝' : '서쪽'}에 있어요.`;
    return `${c.region_ko} 지역에 있어요.`;
  }
  const nb = c.borders.map((b) => ds.country(b)?.name_ko).filter(Boolean) as string[];
  if (nb.length) {
    const list = nb.length > 3 ? `${nb.slice(0, 3).join('·')} 등` : nb.join('·');
    return `${josa(list, '과와')} 국경을 맞대고 있어요.`;
  }
  return c.landlocked ? '바다와 닿지 않은 내륙국이에요.' : '이웃 나라와 땅으로 맞닿지 않은 섬나라예요. 지도의 작은 점도 살펴보세요.';
}

export const MAP_POINTS = [10, 6, 3, 0];

// ───────────────────── GAME 02. 세계 랭킹 배틀 ─────────────────────
export const BATTLE_INDICATORS: IndicatorId[] = ['population', 'area', 'density', 'gdp', 'gdp_pc', 'life_exp', 'fertility', 'urban', 'internet'];

export const MORE_PHRASE: Record<IndicatorId, string> = {
  population: '인구가 더 많은', area: '국토 면적이 더 넓은', density: '인구밀도가 더 높은', gdp: 'GDP가 더 큰',
  gdp_pc: '1인당 GDP가 더 높은', gdp_growth: '경제성장률이 더 높은', inflation: '소비자물가 상승률이 더 높은',
  fertility: '합계출산율이 더 높은', life_exp: '기대수명이 더 긴', urban: '도시화율이 더 높은',
  manufacturing: '제조업 비중이 더 높은', internet: '인터넷 이용률이 더 높은',
};

export const BIGGER: Record<IndicatorId, string> = {
  population: '많습니다', area: '넓습니다', density: '높습니다', gdp: '큽니다', gdp_pc: '높습니다',
  gdp_growth: '높습니다', inflation: '높습니다', fertility: '높습니다', life_exp: '깁니다', urban: '높습니다',
  manufacturing: '높습니다', internet: '높습니다',
};

export const CONCEPT: Record<IndicatorId, string> = {
  population: '인구는 그 나라에 사는 모든 사람의 수예요.',
  area: '여기서 국토 면적은 호수·강 같은 내수면을 뺀 육지 면적이에요.',
  density: '인구밀도는 인구를 육지 면적으로 나눈 값이에요. 인구가 많아도 땅이 넓으면 밀도는 낮을 수 있어요.',
  gdp: 'GDP는 한 나라에서 1년 동안 만들어 낸 물건과 서비스의 가치를 모두 더한 값이에요. 나라 경제의 크기를 보여 줘요.',
  gdp_pc: '1인당 GDP는 GDP를 인구로 나눈 값이에요. 인구가 적은 나라도 높을 수 있어요.',
  gdp_growth: '경제성장률은 물가 변화를 뺀 실질 GDP가 1년 전보다 몇 % 늘었는지 보여 줘요.',
  inflation: '소비자물가 상승률은 사람들이 사는 물건과 서비스의 값이 1년 동안 몇 % 올랐는지 보여 줘요.',
  fertility: '합계출산율은 여성 한 명이 평생 낳을 것으로 예상되는 아이 수예요. 약 2.1명이면 인구가 유지된다고 봐요.',
  life_exp: '기대수명은 그해 태어난 아이가 평균 몇 살까지 살 것으로 예상되는지 나타내요.',
  urban: '도시화율은 전체 인구 가운데 도시에 사는 사람의 비율이에요.',
  manufacturing: '제조업 비중은 GDP 가운데 공장에서 물건을 만드는 산업이 차지하는 몫이에요.',
  internet: '인터넷 이용률은 최근 석 달 안에 인터넷을 쓴 사람의 비율이에요.',
};

export interface BattleQuestion {
  key: string;
  indicator: IndicatorId;
  year: number;
  a: Country;
  b: Country;
  va: number;
  vb: number;
  answer: string; // 값이 더 큰 나라 id
  prompt: string;
}

/** 두 나라 비교 문제 하나. 같은 기준연도 값만 쓰고, 차이가 5% 미만이면 만들지 않는다 */
export function makeBattle(ds: Dataset, iid: IndicatorId, a: Country, b: Country): BattleQuestion | undefined {
  const ind = ds.indicator(iid);
  const va = ds.value(a.id, iid, ind.ref_year);
  const vb = ds.value(b.id, iid, ind.ref_year);
  if (va === undefined || vb === undefined || a.id === b.id) return undefined;
  if (Math.abs(va - vb) / Math.max(Math.abs(va), Math.abs(vb)) < 0.05) return undefined;
  const [x, y] = a.id < b.id ? [a, b] : [b, a];
  return {
    key: `${iid}:${x.id}:${y.id}`,
    indicator: iid,
    year: ind.ref_year,
    a, b, va, vb,
    answer: va > vb ? a.id : b.id,
    prompt: `${josa(a.name_ko, '과와')} ${b.name_ko} 중 ${MORE_PHRASE[iid]} 나라는?`,
  };
}

export function battleQuestions(ds: Dataset, rng: Rng, n = 10, exclude = new Set<string>()): BattleQuestion[] {
  // 아이들도 아는 나라가 많이 나오도록 인구 500만 명 이상 나라와 이야기가 있는 나라를 우선한다
  const familiar = ds.countries.filter((c) => (ds.refValue(c.id, 'population')?.value ?? 0) >= 5e6);
  const out: BattleQuestion[] = [];
  const used = new Set(exclude);
  const appear = new Map<string, number>();
  let guard = 0;
  while (out.length < n && guard++ < 5000) {
    const iid = BATTLE_INDICATORS[Math.floor(rng() * BATTLE_INDICATORS.length)];
    const a = familiar[Math.floor(rng() * familiar.length)];
    const sameCont = rng() < 0.6;
    const pool = sameCont ? familiar.filter((c) => c.continent === a.continent && c.id !== a.id) : familiar;
    const b = pool[Math.floor(rng() * pool.length)];
    if (!a || !b) continue;
    if ((appear.get(a.id) ?? 0) >= 2 || (appear.get(b.id) ?? 0) >= 2) continue;
    if (out.filter((q) => q.indicator === iid).length >= 2) continue;
    const q = makeBattle(ds, iid, a, b);
    if (!q || used.has(q.key)) continue;
    used.add(q.key);
    appear.set(a.id, (appear.get(a.id) ?? 0) + 1);
    appear.set(b.id, (appear.get(b.id) ?? 0) + 1);
    out.push(q);
  }
  return out;
}

export function battleExplain(ds: Dataset, q: BattleQuestion) {
  const ind = ds.indicator(q.indicator);
  return {
    a: fmtValue(ind, q.va, { short: q.indicator === 'population' }),
    b: fmtValue(ind, q.vb, { short: q.indicator === 'population' }),
    concept: CONCEPT[q.indicator],
    ratio: Math.max(q.va, q.vb) / Math.min(q.va, q.vb),
  };
}

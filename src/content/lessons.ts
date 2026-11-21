import type { Dataset } from '../data/engine';
import type { Country, IndicatorId } from '../data/types';
import { continentName, CONTINENTS } from '../data/types';
import { fmtValue, josa } from '../data/format';
import { makeBattle, type BattleQuestion, type Rng, shuffle } from '../games/questions';
import { name } from './helpers';

/**
 * 탐구 노트: 탐험 → 발견 → 이해 → 도전 → 복습.
 * 질문을 던지고(발견), 실제 통계로 직접 비교하게 한 뒤(이해), 확인 문제(도전)를 맞히면 학습 완료로 기록한다.
 * 본문 숫자는 모두 데이터에서 계산한다.
 */
export type Field = '지리' | '인구' | '경제';

export interface CheckQuestion {
  prompt: string;
  options: { id: string; label: string }[];
  answer: string;
  explain: string;
}

export interface Lesson {
  id: string;
  field: Field;
  question: string;
  indicators: IndicatorId[];
  /** 나란히 비교할 두 순위표 (상위 10개국) */
  compare?: [IndicatorId, IndicatorId];
  body: (ds: Dataset) => string[];
  check: (ds: Dataset, rng: Rng) => CheckQuestion | undefined;
}

const top = (ds: Dataset, iid: IndicatorId, n = 10) => ds.ranking(iid).rows.slice(0, n);
const bottom = (ds: Dataset, iid: IndicatorId, n = 10) => ds.ranking(iid).rows.slice(-n).reverse();
const v = (ds: Dataset, iid: IndicatorId, value: number) => fmtValue(ds.indicator(iid), value, { short: true });
const list = (cs: Country[]) => cs.map((c) => c.name_ko).join(', ');

function fromBattle(ds: Dataset, q: BattleQuestion | undefined): CheckQuestion | undefined {
  if (!q) return undefined;
  const ind = ds.indicator(q.indicator);
  return {
    prompt: q.prompt,
    options: [{ id: q.a.id, label: q.a.name_ko }, { id: q.b.id, label: q.b.name_ko }],
    answer: q.answer,
    explain: `${q.a.name_ko} ${fmtValue(ind, q.va, { short: true })}, ${q.b.name_ko} ${fmtValue(ind, q.vb, { short: true })} (${q.year}년, World Bank)`,
  };
}

/** 지표 순위의 위쪽 그룹과 아래쪽 그룹에서 한 나라씩 골라 비교 문제를 만든다 */
function contrast(ds: Dataset, iid: IndicatorId, rng: Rng, hiPool: Country[], loPool: Country[]) {
  for (let i = 0; i < 40; i++) {
    const a = hiPool[Math.floor(rng() * hiPool.length)];
    const b = loPool[Math.floor(rng() * loPool.length)];
    const q = a && b ? makeBattle(ds, iid, ...(rng() < 0.5 ? [a, b] as const : [b, a] as const)) : undefined;
    if (q) return fromBattle(ds, q);
  }
  return undefined;
}

const big = (ds: Dataset) => ds.countries.filter((c) => (ds.refValue(c.id, 'population')?.value ?? 0) >= 5e6);

export const LESSONS: Lesson[] = [
  // ─────────── 지리 ───────────
  {
    id: 'area-vs-population', field: '지리', question: '땅이 넓으면 인구도 많을까?',
    indicators: ['area', 'population'], compare: ['area', 'population'],
    body: (ds) => {
      const A = top(ds, 'area').map((r) => r.country), P = new Set(top(ds, 'population').map((r) => r.country.id));
      const both = A.filter((c) => P.has(c.id));
      return [
        `국토 면적 상위 10개국 가운데 인구도 상위 10위 안에 드는 나라는 ${both.length}개국(${list(both)})입니다.`,
        `나머지 나라들은 땅은 넓지만 사막·얼음·높은 산처럼 사람이 살기 어려운 곳이 많습니다. 반대로 방글라데시처럼 땅은 크지 않아도 강이 만든 기름진 평야에 아주 많은 사람이 사는 나라도 있습니다.`,
      ];
    },
    check: (ds, rng) => {
      const A = new Set(top(ds, 'area', 15).map((r) => r.country.id));
      const P = new Set(top(ds, 'population', 15).map((r) => r.country.id));
      const wideFew = top(ds, 'area', 15).map((r) => r.country).filter((c) => !P.has(c.id));
      const smallMany = top(ds, 'population', 15).map((r) => r.country).filter((c) => !A.has(c.id));
      return contrast(ds, 'population', rng, smallMany, wideFew);
    },
  },
  {
    id: 'landlocked', field: '지리', question: '바다가 없는 나라는 몇 개일까?',
    indicators: ['area'],
    body: (ds) => {
      const ll = ds.countries.filter((c) => c.landlocked);
      const byCont = CONTINENTS.map((k) => ({ k, n: ll.filter((c) => c.continent === k.id).length })).filter((x) => x.n);
      const double = ll.filter((c) => c.borders.length && c.borders.every((b) => ds.country(b)?.landlocked));
      const biggest = ds.ranking('area').rows.find((r) => r.country.landlocked);
      return [
        `195개국 가운데 바다와 닿지 않은 내륙국은 ${ll.length}개국입니다. 대륙별로는 ${byCont.map((x) => `${x.k.name} ${x.n}`).join(', ')}개국입니다.`,
        biggest ? `가장 넓은 내륙국은 ${biggest.country.name_ko}(${v(ds, 'area', biggest.value)})입니다.` : '',
        double.length ? `이웃 나라마저 모두 내륙국이라 바다에 가려면 국경을 두 번 넘어야 하는 '이중 내륙국'도 있습니다: ${list(double)}.` : '',
        '바다가 없으면 배로 물건을 실어 나르기 어려워, 이웃 나라의 항구와 철도·도로를 빌려 써야 합니다.',
      ].filter(Boolean);
    },
    check: (ds, rng) => {
      const ll = shuffle(ds.countries.filter((c) => c.landlocked && (ds.refValue(c.id, 'population')?.value ?? 0) > 2e6), rng)[0];
      if (!ll) return undefined;
      const others = shuffle(ds.countries.filter((c) => !c.landlocked && c.continent === ll.continent && c.borders.length), rng).slice(0, 3);
      const options = shuffle([ll, ...others], rng).map((c) => ({ id: c.id, label: c.name_ko }));
      return { prompt: '다음 중 바다와 닿지 않은 내륙국은?', options, answer: ll.id, explain: `${ll.name_ko}의 이웃 나라: ${ll.borders.map((b) => name(ds, b)).join(', ')}` };
    },
  },
  {
    id: 'borders', field: '지리', question: '가장 많은 나라와 국경을 맞댄 나라는?',
    indicators: ['area'],
    body: (ds) => {
      const sorted = [...ds.countries].sort((a, b) => b.borders.length - a.borders.length);
      const max = sorted[0].borders.length;
      const champs = sorted.filter((c) => c.borders.length === max);
      const islands = ds.countries.filter((c) => c.borders.length === 0 && c.borders_outside.length === 0);
      return [
        `195개국 목록 안에서 가장 많은 나라와 땅으로 국경을 맞댄 나라는 ${list(champs)}로, 각각 ${max}개국과 맞닿아 있습니다.`,
        `반대로 땅으로 맞닿은 이웃이 하나도 없는 나라는 ${islands.length}개국입니다. 일본·필리핀·뉴질랜드처럼 대부분 섬나라입니다.`,
        '국경이 많을수록 교류할 이웃이 많지만, 지켜야 할 경계도 길어집니다.',
      ];
    },
    check: (ds, rng) => {
      const c = shuffle(ds.countries.filter((x) => x.borders.length >= 3 && (ds.refValue(x.id, 'population')?.value ?? 0) > 5e6), rng)[0];
      if (!c) return undefined;
      const right = ds.country(shuffle(c.borders, rng)[0])!;
      const wrong = shuffle(ds.countries.filter((x) => x.continent === c.continent && x.id !== c.id && !c.borders.includes(x.id)), rng).slice(0, 3);
      return {
        prompt: `${josa(c.name_ko, '과와')} 국경을 맞댄 나라는?`,
        options: shuffle([right, ...wrong], rng).map((x) => ({ id: x.id, label: x.name_ko })),
        answer: right.id,
        explain: `${c.name_ko}의 이웃 나라: ${c.borders.map((b) => name(ds, b)).join(', ')}`,
      };
    },
  },
  {
    id: 'tiny-countries', field: '지리', question: '세계에서 가장 작은 나라들은 어디일까?',
    indicators: ['area', 'density'], compare: ['area', 'density'],
    body: (ds) => {
      const small = bottom(ds, 'area', 5);
      return [
        `World Bank 면적 자료에서 가장 작은 다섯 나라는 ${small.map((r) => `${r.country.name_ko}(${v(ds, 'area', r.value)})`).join(', ')}입니다.`,
        '세계에서 가장 작은 나라로 알려진 바티칸 시국은 World Bank 통계에 들어 있지 않아 이 순위에서 빠져 있습니다. 지도에서는 이탈리아 로마 안의 작은 점으로 찾을 수 있습니다.',
        '작은 나라는 대부분 섬이나 도시 하나 크기의 나라입니다. 그래서 인구밀도 순위 위쪽에도 자주 보입니다.',
      ];
    },
    check: (ds, rng) => {
      const small = bottom(ds, 'area', 25).map((r) => r.country);
      const mid = ds.ranking('area').rows.slice(-60, -30).map((r) => r.country);
      return contrast(ds, 'area', rng, mid, small);
    },
  },
  // ─────────── 인구 ───────────
  {
    id: 'population-vs-density', field: '인구', question: '인구가 가장 많은 나라가 인구밀도도 가장 높을까?',
    indicators: ['population', 'density'], compare: ['population', 'density'],
    body: (ds) => {
      const p1 = top(ds, 'population', 1)[0], d1 = top(ds, 'density', 1)[0];
      const p1d = ds.rankOf(p1.country.id, 'density');
      const d1p = ds.rankOf(d1.country.id, 'population');
      return [
        `인구 1위는 ${p1.country.name_ko}(${v(ds, 'population', p1.value)})이지만, 인구밀도 순위는 ${p1d ? `${p1d.of}개국 가운데 ${p1d.rank}위` : '자료 없음'}입니다.`,
        `인구밀도 1위는 ${d1.country.name_ko}(${v(ds, 'density', d1.value)})이고, 이 나라의 인구 순위는 ${d1p ? `${d1p.rank}위` : '자료 없음'}입니다.`,
        '인구밀도는 인구를 땅 넓이로 나눈 값입니다. 사람이 많아도 땅이 넓으면 밀도는 낮고, 사람이 적어도 땅이 아주 좁으면 밀도는 높습니다. 두 순위표를 나란히 놓고 보면 겹치는 나라가 생각보다 적습니다.',
      ];
    },
    check: (ds, rng) => contrast(ds, 'density', rng, top(ds, 'density', 30).map((r) => r.country).filter((c) => big(ds).includes(c)), top(ds, 'area', 20).map((r) => r.country)),
  },
  {
    id: 'replacement-fertility', field: '인구', question: '합계출산율 2.1명은 무슨 뜻일까?',
    indicators: ['fertility'],
    body: (ds) => {
      const r = ds.ranking('fertility');
      const below = r.rows.filter((x) => x.value < 2.1).length;
      const r0 = ds.ranking('fertility', 2000);
      const below0 = r0.rows.filter((x) => x.value < 2.1).length;
      const low = r.rows[r.rows.length - 1];
      return [
        '부모 두 사람이 아이 둘을 낳으면 다음 세대 인구가 비슷하게 유지됩니다. 어른이 되기 전에 세상을 떠나는 아이도 있으므로, 실제로는 평균 2.1명 정도가 필요하다고 봅니다. 이를 \'대체 출산율\'이라고 합니다.',
        `${r.year}년 자료가 있는 ${r.rows.length}개국 가운데 ${below}개국이 2.1명보다 낮습니다. 2000년에는 ${r0.rows.length}개국 가운데 ${below0}개국이었습니다.`,
        `가장 낮은 나라는 ${low.country.name_ko}(${v(ds, 'fertility', low.value)})입니다.`,
      ];
    },
    check: (ds, rng) => contrast(ds, 'fertility', rng, top(ds, 'fertility', 30).map((r) => r.country), bottom(ds, 'fertility', 30).map((r) => r.country)),
  },
  {
    id: 'life-expectancy-gap', field: '인구', question: '기대수명은 왜 나라마다 다를까?',
    indicators: ['life_exp'],
    body: (ds) => {
      const r = ds.ranking('life_exp');
      const hi = r.rows[0], lo = r.rows[r.rows.length - 1];
      const avg = CONTINENTS.map((k) => {
        const xs = r.rows.filter((x) => x.country.continent === k.id);
        return { k, m: xs.reduce((s, x) => s + x.value, 0) / xs.length, n: xs.length };
      });
      return [
        `${r.year}년 기대수명이 가장 긴 나라는 ${hi.country.name_ko}(${v(ds, 'life_exp', hi.value)}), 가장 짧은 나라는 ${lo.country.name_ko}(${v(ds, 'life_exp', lo.value)})로 ${Math.round(hi.value - lo.value)}년 넘게 차이 납니다.`,
        `대륙별로 나라들의 기대수명을 단순 평균하면 ${avg.map((a) => `${a.k.name} ${a.m.toFixed(1)}세`).join(', ')}입니다.`,
        '깨끗한 물과 위생, 충분한 영양, 예방접종과 병원, 그리고 전쟁이나 재해가 없는 안정된 사회가 기대수명을 늘립니다. 특히 어린 아이의 사망을 줄이면 기대수명이 크게 늘어납니다.',
      ];
    },
    check: (ds, rng) => contrast(ds, 'life_exp', rng, top(ds, 'life_exp', 40).map((r) => r.country), bottom(ds, 'life_exp', 40).map((r) => r.country)),
  },
  {
    id: 'urbanization', field: '인구', question: '세계 사람들은 도시에 얼마나 살까?',
    indicators: ['urban'],
    body: (ds) => {
      const r = ds.ranking('urban');
      const over80 = r.rows.filter((x) => x.value >= 80).length;
      const under30 = r.rows.filter((x) => x.value < 30).length;
      const kor = ds.rankOf('KOR', 'urban');
      return [
        `${r.year}년 도시화율이 80% 이상인 나라는 ${over80}개국, 30%에 못 미치는 나라는 ${under30}개국입니다.`,
        kor ? `대한민국의 도시화율은 ${v(ds, 'urban', kor.value)}로 ${kor.of}개국 가운데 ${kor.rank}위입니다.` : '',
        '일자리와 학교, 병원이 도시에 모이면서 사람들이 농촌을 떠나 도시로 옮겨 갑니다. 다만 \'도시\'를 정하는 기준은 나라마다 조금씩 다르다는 점도 기억해 두세요.',
      ].filter(Boolean);
    },
    check: (ds, rng) => contrast(ds, 'urban', rng, top(ds, 'urban', 50).map((r) => r.country).filter((c) => big(ds).includes(c)), bottom(ds, 'urban', 50).map((r) => r.country).filter((c) => big(ds).includes(c))),
  },
  // ─────────── 경제 ───────────
  {
    id: 'gdp-vs-per-capita', field: '경제', question: 'GDP와 1인당 GDP는 무엇이 다를까?',
    indicators: ['gdp', 'gdp_pc'], compare: ['gdp', 'gdp_pc'],
    body: (ds) => {
      const g = top(ds, 'gdp', 5).map((r) => r.country), p = top(ds, 'gdp_pc', 5).map((r) => r.country);
      const chnPc = ds.rankOf('CHN', 'gdp_pc'), chnG = ds.rankOf('CHN', 'gdp');
      return [
        `GDP 상위 5개국은 ${list(g)}입니다. 1인당 GDP 상위 5개국은 ${list(p)}입니다.`,
        chnG && chnPc ? `중국은 GDP로는 ${chnG.rank}위지만, 인구가 많아 1인당 GDP로는 ${chnPc.rank}위입니다.` : '',
        'GDP는 나라 경제 전체의 크기이고, 1인당 GDP는 그것을 인구로 나눈 값입니다. 인구가 적은 부자 나라는 1인당 GDP가 높게 나옵니다. 어떤 질문에 답하려는지에 따라 알맞은 지표를 골라야 합니다.',
      ].filter(Boolean);
    },
    check: (ds, rng) => contrast(ds, 'gdp_pc', rng, top(ds, 'gdp_pc', 30).map((r) => r.country), top(ds, 'population', 15).map((r) => r.country)),
  },
  {
    id: 'growth-vs-wealth', field: '경제', question: '경제성장률이 높으면 부자 나라일까?',
    indicators: ['gdp_growth', 'gdp_pc'], compare: ['gdp_growth', 'gdp_pc'],
    body: (ds) => {
      const g = top(ds, 'gdp_growth', 10);
      const pcRanks = g.map((r) => ds.rankOf(r.country.id, 'gdp_pc')?.rank).filter((x): x is number => x !== undefined).sort((a, b) => a - b);
      const med = pcRanks[Math.floor(pcRanks.length / 2)];
      const n = ds.ranking('gdp_pc').rows.length;
      return [
        `${ds.indicator('gdp_growth').ref_year}년 경제성장률 상위 10개국은 ${list(g.map((r) => r.country))}입니다.`,
        med ? `이 나라들의 1인당 GDP 순위를 줄 세우면 가운데 값이 ${n}개국 가운데 ${med}위입니다.` : '',
        '경제성장률은 1년 사이에 경제가 얼마나 커졌는지를 보여 주는 \'속도\'이고, 1인당 GDP는 지금 도달한 \'높이\'입니다. 경제 규모가 작을수록 같은 변화에도 비율이 크게 움직이기 쉽고, 한 해의 성장률은 자원 개발이나 재해 같은 사건에 크게 흔들리기도 합니다.',
      ].filter(Boolean);
    },
    check: (ds, rng) => contrast(ds, 'gdp_growth', rng, top(ds, 'gdp_growth', 30).map((r) => r.country).filter((c) => big(ds).includes(c)), top(ds, 'gdp_pc', 30).map((r) => r.country)),
  },
  {
    id: 'inflation', field: '경제', question: '물가가 오른다는 것은 무슨 뜻일까?',
    indicators: ['inflation'],
    body: (ds) => {
      const r = ds.ranking('inflation');
      const sorted = [...r.rows].sort((a, b) => a.value - b.value);
      const med = sorted[Math.floor(sorted.length / 2)];
      const over10 = r.rows.filter((x) => x.value >= 10).length;
      const neg = r.rows.filter((x) => x.value < 0).length;
      return [
        '소비자물가 상승률은 사람들이 사는 물건과 서비스의 값이 1년 사이에 몇 % 올랐는지 보여 줍니다. 물가가 오르면 같은 돈으로 살 수 있는 것이 줄어듭니다.',
        `${r.year}년 자료가 있는 ${r.rows.length}개국을 줄 세우면 가운데 값은 ${v(ds, 'inflation', med.value)}입니다. 10% 이상 오른 나라는 ${over10}개국, 오히려 물가가 내려간 나라는 ${neg}개국입니다.`,
        '많은 나라의 중앙은행은 물가가 1년에 2% 안팎으로 천천히 오르도록 금리를 조절합니다.',
      ];
    },
    check: (ds, rng) => contrast(ds, 'inflation', rng, top(ds, 'inflation', 30).map((r) => r.country).filter((c) => big(ds).includes(c)), bottom(ds, 'inflation', 60).map((r) => r.country).filter((c) => big(ds).includes(c))),
  },
  {
    id: 'internet-and-income', field: '경제', question: '인터넷을 쓰는 사람의 비율은 소득과 관계가 있을까?',
    indicators: ['internet', 'gdp_pc'], compare: ['gdp_pc', 'internet'],
    body: (ds) => {
      const y = ds.indicator('internet').ref_year;
      const pairs = ds.countries
        .map((c) => ({ c, i: ds.value(c.id, 'internet', y), g: ds.value(c.id, 'gdp_pc', y) }))
        .filter((x): x is { c: Country; i: number; g: number } => x.i !== undefined && x.g !== undefined)
        .sort((a, b) => b.g - a.g);
      const q = Math.floor(pairs.length / 4);
      const mean = (xs: { i: number }[]) => xs.reduce((s, x) => s + x.i, 0) / xs.length;
      return [
        `${y}년 인터넷 이용률과 1인당 GDP가 모두 있는 ${pairs.length}개국을 1인당 GDP 순으로 4등분했습니다.`,
        `1인당 GDP가 가장 높은 4분의 1 나라들의 인터넷 이용률 평균은 ${mean(pairs.slice(0, q)).toFixed(1)}%, 가장 낮은 4분의 1은 ${mean(pairs.slice(-q)).toFixed(1)}%입니다.`,
        '소득이 높은 나라일수록 통신망과 기기를 갖추기 쉬워 이용률이 높습니다. 하지만 두 값이 함께 움직인다고 해서 하나가 다른 하나의 원인이라고 바로 말할 수는 없습니다.',
      ];
    },
    check: (ds, rng) => contrast(ds, 'internet', rng, top(ds, 'internet', 40).map((r) => r.country).filter((c) => big(ds).includes(c)), bottom(ds, 'internet', 40).map((r) => r.country).filter((c) => big(ds).includes(c))),
  },
];

export const lessonsFor = (iid: IndicatorId) => LESSONS.filter((l) => l.indicators.includes(iid));
export const FIELD_ORDER: Field[] = ['지리', '인구', '경제'];
export const continentOf = continentName;

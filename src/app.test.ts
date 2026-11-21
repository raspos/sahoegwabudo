import { describe, expect, it, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { feature } from 'topojson-client';
import { Dataset, competitionRank } from './data/engine';
import type { Country, IndicatorId } from './data/types';
import { searchCountries } from './data/search';
import { battleQuestions, makeBattle, mapHint, mapQuestions, seeded, levelOf, BATTLE_INDICATORS } from './games/questions';
import { journal, parseJournal } from './store/journal';
import { STORIES } from './content/stories';
import { LESSONS } from './content/lessons';
import { discoveryFacts } from './content/discovery';
import { buildGeo, type MapProps } from './map/geo';
import { colorFor, SCALES } from './data/scales';
import type { Feature, Geometry } from 'geojson';

const load = (f: string) => JSON.parse(readFileSync(resolve(__dirname, '../public/data', f), 'utf-8'));
const countries: Country[] = load('countries.json');
const indicators = load('indicators.json');
const obs = load('observations.json');
const ds = new Dataset(countries, indicators, obs);
const topo = load('world.topo.json');
const fc = feature(topo, topo.objects[Object.keys(topo.objects)[0]]) as unknown as { features: Feature<Geometry, MapProps>[] };
const geo = buildGeo(fc.features);

describe('국가 목록', () => {
  it('유엔 회원국 193 + 옵서버 2 = 195개국', () => {
    expect(countries).toHaveLength(195);
    expect(countries.filter((c) => c.status === 'member')).toHaveLength(193);
    expect(countries.filter((c) => c.status === 'observer').map((c) => c.id).sort()).toEqual(['PSE', 'VAT']);
  });
  it('코드 중복이 없다 (ISO3, ISO2, M49)', () => {
    for (const k of ['iso3', 'iso2', 'm49'] as const) expect(new Set(countries.map((c) => c[k])).size).toBe(195);
  });
  it('땅 국경은 양쪽이 서로를 이웃으로 갖는다 (스리랑카-인도는 이웃 아님)', () => {
    const by = new Map(countries.map((c) => [c.id, c]));
    for (const c of countries) for (const b of c.borders) expect(by.get(b)!.borders, `${c.id}->${b}`).toContain(c.id);
    expect(by.get('LKA')!.borders).toEqual([]);
  });
  it('195개국 모두 지도 영역과 연결되고 도감 경로가 있다', () => {
    const missing = countries.filter((c) => !geo.byId.has(c.id));
    expect(missing.map((c) => c.id)).toEqual([]);
  });
  it('지도 영역 수와 국가 수는 같지 않아도 된다 (목록 밖 지역 포함)', () => {
    expect(geo.shapes.length).toBeGreaterThan(195);
    expect(geo.shapes.filter((s) => !s.props.listed).every((s) => !ds.country(s.id) || s.id === 'ATA')).toBe(true);
  });
  it('작은 나라(싱가포르·바티칸·몰디브 등)는 클릭용 점 표시 대상이다', () => {
    for (const id of ['SGP', 'VAT', 'MDV', 'MCO', 'SMR', 'LIE', 'NRU', 'TUV']) expect(geo.byId.get(id)?.small, id).toBe(true);
  });
  it('한국어·영어·별칭·초성 검색', () => {
    expect(searchCountries(countries, '우루과이')[0].id).toBe('URY');
    expect(searchCountries(countries, 'netherlands')[0].id).toBe('NLD');
    expect(searchCountries(countries, '한국')[0].id).toBe('KOR');
    expect(searchCountries(countries, 'USA')[0].id).toBe('USA');
    expect(searchCountries(countries, '바티칸')[0].id).toBe('VAT');
    expect(searchCountries(countries, 'ㅁㄱ').map((c) => c.id)).toContain('MNG');
  });
});

describe('통계와 순위', () => {
  it('12개 지표, 모든 지표에 기준연도·출처', () => {
    expect(indicators).toHaveLength(12);
    for (const i of indicators) {
      expect(i.ref_year).toBeGreaterThanOrEqual(2020);
      expect(i.source_url).toMatch(/^https:\/\/data\.worldbank\.org\/indicator\//);
      expect(i.ref_count).toBeGreaterThanOrEqual(150);
    }
  });
  it('순위표는 기준연도 값만 쓰고 결측 국가는 제외한다', () => {
    for (const i of indicators) {
      const r = ds.ranking(i.indicator_id);
      expect(r.rows.length + r.excluded.length).toBe(195);
      for (const row of r.rows) expect(ds.value(row.country.id, i.indicator_id, r.year)).toBe(row.value);
      for (const c of r.excluded) expect(ds.value(c.id, i.indicator_id, r.year)).toBeUndefined();
    }
  });
  it('바티칸은 통계가 없어 순위에서 빠지고 0으로 채워지지 않는다', () => {
    expect(ds.latest('VAT', 'population')).toBeUndefined();
    expect(ds.ranking('population').rows.find((r) => r.country.id === 'VAT')).toBeUndefined();
    expect(colorFor(SCALES.density, ds.refValue('VAT', 'density')?.value)).toBe('url(#nodata)');
  });
  it('순위는 값 순서와 일치하고 동률은 같은 순위 (1,2,2,4)', () => {
    for (const i of indicators) {
      const rows = ds.ranking(i.indicator_id).rows;
      for (let k = 1; k < rows.length; k++) {
        expect(rows[k - 1].value).toBeGreaterThanOrEqual(rows[k].value);
        if (rows[k].value === rows[k - 1].value) expect(rows[k].rank).toBe(rows[k - 1].rank);
        else expect(rows[k].rank).toBe(k + 1);
      }
    }
    const fake = (id: string, value: number) => ({ country: { id } as Country, value });
    expect(competitionRank([fake('A', 5), fake('B', 3), fake('C', 3), fake('D', 1)], true).map((r) => r.rank)).toEqual([1, 2, 2, 4]);
  });
  it('방향을 바꾼 순위 (출산율 낮은 순)', () => {
    const asc = ds.rankingDir('fertility', 'asc').rows;
    expect(asc[0].value).toBe(Math.min(...asc.map((r) => r.value)));
    expect(asc[0].rank).toBe(1);
  });
  it('지도 색은 실제 값에 따른 단계와 일치한다', () => {
    const kor = ds.refValue('KOR', 'density')!.value;
    const sc = SCALES.density;
    const bin = sc.thresholds.filter((t) => kor >= t).length;
    expect(colorFor(sc, kor)).toBe(sc.colors[bin]);
  });
});

describe('세계 랭킹 배틀', () => {
  it('10문제, 중복 없음, 같은 기준연도, 정답은 실제로 값이 큰 나라', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const qs = battleQuestions(ds, seeded(seed));
      expect(qs).toHaveLength(10);
      expect(new Set(qs.map((q) => q.key)).size).toBe(10);
      for (const q of qs) {
        const ind = ds.indicator(q.indicator);
        expect(q.year).toBe(ind.ref_year);
        expect(ds.value(q.a.id, q.indicator, q.year)).toBe(q.va);
        expect(ds.value(q.b.id, q.indicator, q.year)).toBe(q.vb);
        expect(q.answer).toBe(q.va > q.vb ? q.a.id : q.b.id);
        expect(Math.abs(q.va - q.vb) / Math.max(q.va, q.vb)).toBeGreaterThanOrEqual(0.05);
      }
    }
  });
  it('값이 없거나 거의 같은 나라끼리는 문제를 만들지 않는다', () => {
    expect(makeBattle(ds, 'population', ds.country('VAT')!, ds.country('ITA')!)).toBeUndefined();
    expect(makeBattle(ds, 'population', ds.country('KOR')!, ds.country('KOR')!)).toBeUndefined();
  });
  it('예시 문제: 한국과 일본 면적, 프랑스와 독일 인구', () => {
    const q1 = makeBattle(ds, 'area', ds.country('KOR')!, ds.country('JPN')!)!;
    expect(q1.answer).toBe('JPN');
    const q2 = makeBattle(ds, 'population', ds.country('FRA')!, ds.country('DEU')!)!;
    expect(q2.answer).toBe('DEU');
    expect(BATTLE_INDICATORS.length).toBeGreaterThan(5);
  });
});

describe('세계지도 챌린지', () => {
  it('단계별 10문제, 중복 없음, 모든 문제가 지도에 있음', () => {
    for (const lv of ['beginner', 'intermediate', 'advanced'] as const) {
      for (let s = 1; s < 10; s++) {
        const qs = mapQuestions(ds, lv, seeded(s), 10, new Set(geo.byId.keys()));
        expect(qs).toHaveLength(10);
        expect(new Set(qs.map((q) => q.target.id)).size).toBe(10);
        if (lv !== 'advanced') for (const q of qs) expect(levelOf(ds, q.target)).toBe(lv);
      }
    }
  });
  it('힌트에 정답 국가명이 들어가지 않는다', () => {
    for (const c of countries) for (const n of [1, 2]) {
      const words = mapHint(ds, c, n).split(/[·\s]|등과|과 |와 /).map((w) => w.replace(/(과|와|에)$/, ''));
      expect(words).not.toContain(c.name_ko);
    }
  });
  it('문제 문장은 대륙과 나라 이름을 알려 준다', () => {
    const q = mapQuestions(ds, 'beginner', seeded(3))[0];
    expect(q.prompt).toContain(q.target.name_ko);
  });
});

describe('콘텐츠', () => {
  it('이야기: 6개국 이상, 각 2개 이상의 장면, 빈 숫자(undefined) 없음', () => {
    const cs = new Set(STORIES.map((s) => s.country));
    for (const id of ['KOR', 'JPN', 'CHN', 'USA', 'NLD', 'MNG']) expect(cs.has(id)).toBe(true);
    for (const s of STORIES) {
      const p = s.panels(ds);
      expect(p.length).toBeGreaterThanOrEqual(2);
      for (const x of p) {
        expect(x.text).not.toMatch(/undefined|NaN|null/);
        expect(x.text.length).toBeGreaterThan(30);
      }
    }
  });
  it('탐구 노트 10개 이상, 지리·인구·경제 고르게, 본문과 확인 문제가 만들어진다', () => {
    expect(LESSONS.length).toBeGreaterThanOrEqual(10);
    for (const f of ['지리', '인구', '경제']) expect(LESSONS.filter((l) => l.field === f).length).toBeGreaterThanOrEqual(3);
    for (const l of LESSONS) {
      for (const p of l.body(ds)) expect(p).not.toMatch(/undefined|NaN/);
      for (let s = 1; s < 8; s++) {
        const c = l.check(ds, seeded(s));
        expect(c, l.id).toBeDefined();
        expect(c!.options.map((o) => o.id)).toContain(c!.answer);
        expect(new Set(c!.options.map((o) => o.id)).size).toBe(c!.options.length);
      }
    }
  });
  it('오늘의 발견 문장', () => {
    const f = discoveryFacts(ds);
    expect(f.length).toBeGreaterThan(50);
    for (const x of f) expect(x.text).not.toMatch(/undefined|NaN/);
  });
});

describe('탐험일지', () => {
  beforeEach(() => journal._load(null));
  it('방문과 학습 완료는 따로 기록된다', () => {
    journal.visit('KOR');
    expect(journal.get().visited.KOR).toBeTruthy();
    expect(journal.get().learned.KOR).toBeUndefined();
    journal.learn('KOR', 'capital');
    expect(journal.get().learned.KOR.via).toBe('capital');
  });
  it('최근 방문은 중복 없이 최신 순', () => {
    ['KOR', 'JPN', 'KOR', 'CHN'].forEach((id) => journal.visit(id));
    expect(journal.get().recent).toEqual(['CHN', 'KOR', 'JPN']);
  });
  it('최고 기록 갱신', () => {
    expect(journal.recordGame('battle', 60)).toBe(true);
    expect(journal.recordGame('battle', 40)).toBe(false);
    expect(journal.get().games.battle).toMatchObject({ best: 60, plays: 2 });
  });
  it('깨진 저장값은 빈 일지로 시작한다', () => {
    expect(parseJournal('{bad json').visited).toEqual({});
    expect(parseJournal(JSON.stringify({ version: 9 })).visited).toEqual({});
  });
});

void (null as unknown as IndicatorId);

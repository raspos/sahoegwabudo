import { describe, expect, it, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { feature } from 'topojson-client';
import { Dataset, competitionRank } from './data/engine';
import type { Country, IndicatorId } from './data/types';
import { searchCountries } from './data/search';
import { battleQuestions, makeBattle, mapHint, mapQuestions, seeded, levelOf, BATTLE_INDICATORS } from './games/questions';
import { journal, parseJournal } from './store/journal';
import { STORIES, ALL_STORIES } from './content/stories';
import { ECONOMY_PROFILES } from './content/economy';
import { sectorSharesOf } from './content/sectors';
import { ECON_STORIES } from './content/econStories';
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
  it('기존 12개 지표와 기준연도는 그대로이고, 신규 10개 지표가 더해졌다', () => {
    const core = ['population', 'area', 'density', 'gdp', 'gdp_pc', 'gdp_growth', 'inflation', 'fertility', 'life_exp', 'urban', 'manufacturing', 'internet'];
    const refYears: Record<string, number> = { population: 2025, area: 2024, density: 2024, gdp: 2025, gdp_pc: 2025, gdp_growth: 2025, inflation: 2025, fertility: 2024, life_exp: 2024, urban: 2025, manufacturing: 2024, internet: 2024 };
    expect(indicators.slice(0, 12).map((i: { indicator_id: string }) => i.indicator_id)).toEqual(core);
    for (const i of indicators.slice(0, 12)) expect(i.ref_year, i.indicator_id).toBe(refYears[i.indicator_id]);
    expect(indicators).toHaveLength(22);
    for (const code of ['NV.AGR.TOTL.ZS', 'NV.IND.TOTL.ZS', 'NV.SRV.TOTL.ZS', 'NY.GDP.PCAP.PP.CD', 'NE.EXP.GNFS.ZS'])
      expect(indicators.map((i: { source_code: string }) => i.source_code)).toContain(code);
  });
  it('모든 지표에 기준연도·출처', () => {
    for (const i of indicators) {
      if (i.rank) expect(i.ref_year, i.indicator_id).toBeGreaterThanOrEqual(2020); // 순위에 쓰지 않는 지표(관광·자원 지대)는 오래된 해일 수 있다
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

describe('PHASE 2: 경제·자연환경 자료', () => {
  const trade = load('trade.json');
  const agri = load('agri.json');
  const nature = load('nature.json');
  const ex = { trade, agri, nature };
  it('수출: 비중은 같은 해 TOTAL 대비, 큰 순서, 상대국에 World·지역 미상 없음, HS 합계 ≈ TOTAL', () => {
    expect(Object.keys(trade.countries).length).toBeGreaterThanOrEqual(150);
    for (const [cid, t] of Object.entries<any>(trade.countries)) {
      expect(ds.country(cid), cid).toBeDefined();
      expect(Math.abs(t.hs_sum_ratio - 1)).toBeLessThan(0.02);
      for (let i = 1; i < t.products.length; i++) expect(t.products[i - 1].value).toBeGreaterThanOrEqual(t.products[i].value);
      for (const p of t.products) { expect(p.share).toBeLessThanOrEqual(1); expect(p.name_ko).toBeTruthy(); expect(p.hs).toMatch(/^\d\d$/); }
      for (const p of t.partners) { expect([0, 899, 837, 838, 839]).not.toContain(p.code); expect(p.iso3).not.toBe(cid); }
    }
    expect(trade.countries.AUT.partners[0].iso3).toBe('DEU');
  });
  it('농산물: 중국은 본토(M49 156) 기준, 순위·톤수 정합, 1차 생산물만', () => {
    expect(agri.meta.year).toBeGreaterThanOrEqual(2022);
    expect(agri.countries.CHN).toBeDefined();
    for (const a of Object.values<any>(agri.countries)) {
      for (const i of a.representative) { expect(i.rank).toBeLessThanOrEqual(15); expect(i.tonnes).toBeGreaterThanOrEqual(10000); }
      for (let k = 1; k < a.by_tonnes.length; k++) expect(a.by_tonnes[k - 1].tonnes).toBeGreaterThanOrEqual(a.by_tonnes[k].tonnes);
      for (const i of [...a.representative, ...a.by_tonnes]) { expect(i.name_ko).toBeTruthy(); expect(i.name_en.toLowerCase()).not.toMatch(/oil|cheese|butter|offal/); }
    }
    expect(agri.countries.SAU.representative[0].name_en).toBe('Dates');
  });
  it('기후: 195개국 모두 기후형이 있고, 비율 합은 1 이하, 오스트리아는 알프스가 국토 절반 이상', () => {
    for (const c of countries) {
      const n = nature.countries[c.id];
      expect(n?.koppen.length, c.id).toBeGreaterThan(0);
      const sum = n.koppen.reduce((s: number, k: any) => s + (k.share ?? 0), 0);
      expect(sum).toBeLessThanOrEqual(1.0001);
    }
    const alps = nature.countries.AUT.landforms.find((l: any) => l.name_en === 'Alps');
    expect(alps.share_of_country).toBeGreaterThan(0.5);
    expect(nature.countries.SAU.koppen[0].code).toBe('BWh');
    expect(nature.countries.VAT.approx).toBe(true);
  });
  it('산업 구조: 같은 해 값만 쓰고, 세 비중 합은 100% 이하로 두며 다시 맞추지 않는다', () => {
    const s = sectorSharesOf(ds, 'AUT')!;
    expect(ds.value('AUT', 'agri_va', s.year)).toBe(s.agri);
    expect(ds.value('AUT', 'services_va', s.year)).toBe(s.services);
    expect(s.agri + s.industry + s.services).toBeLessThanOrEqual(100.5);
    if (s.manufacturing !== undefined) expect(s.manufacturing).toBeLessThanOrEqual(s.industry);
  });
  it('편집 사실은 모두 출처(발행처·주소·시점)가 있다 — 8개국 프로필', () => {
    expect(ECONOMY_PROFILES.map((p) => p.country).sort()).toEqual(['AUT', 'BRA', 'KOR', 'MNG', 'NLD', 'NOR', 'SAU', 'SGP']);
    for (const p of ECONOMY_PROFILES) for (const f of [...p.facts, ...p.specialties]) {
      expect(f.source, f.text).toBeTruthy();
      expect(f.url).toMatch(/^https:\/\//);
      expect(f.period).toBeTruthy();
    }
  });
  it('경제 이야기: 오스트리아 3편 이상(각 3~4장면), 8개국 모두 이야기, 빈 숫자 없음', () => {
    expect(ECON_STORIES.filter((s) => s.country === 'AUT').length).toBeGreaterThanOrEqual(3);
    for (const cid of ['AUT', 'KOR', 'NLD', 'NOR', 'SAU', 'MNG', 'SGP', 'BRA']) expect(ALL_STORIES.some((s) => s.country === cid && ECON_STORIES.includes(s))).toBe(true);
    for (const s of ECON_STORIES) {
      const panels = s.panels(ds, ex as never);
      expect(panels.length, s.id).toBeGreaterThanOrEqual(3);
      expect(panels.length).toBeLessThanOrEqual(4);
      for (const p of panels) expect(p.text, s.id).not.toMatch(/undefined|NaN|null|\?%/);
    }
  });
  it('특산물(C): 공식 등록부 항목만, 모든 항목에 주소나 등록 번호, 100개국 이상', () => {
    const sp = load('specialties.json');
    const cs = Object.entries<any>(sp.countries);
    expect(cs.filter(([, v]) => v.unesco.length || v.gi.length).length).toBeGreaterThanOrEqual(100);
    for (const [cid, v] of cs) {
      expect(ds.country(cid), cid).toBeDefined();
      for (const u of v.unesco) { expect(u.url).toMatch(/^https:\/\/ich\.unesco\.org\/en\/(RL|USL)\/\d{5}$/); expect(['food', 'craft']).toContain(u.kind); }
      for (const g of v.gi) { expect(g.file).toMatch(/^(PDO|PGI|GI|PGI-|PDO-)?/); expect(g.file).toBeTruthy(); expect(g.category_ko).toBeTruthy(); }
      expect(v.gi.length).toBeLessThanOrEqual(6);
      expect(v.gi_total).toBeGreaterThanOrEqual(v.gi.length);
    }
    expect(sp.countries.KOR.unesco.map((u: any) => u.id)).toContain('00881');
    expect(sp.countries.AUT.gi.length).toBeGreaterThan(0);
    expect(JSON.stringify(sp.countries.AUT)).not.toMatch(/Lipizzan/);
  });
  it('오스트리아 수출 이야기의 상품군 순서가 원자료와 일치한다', () => {
    const story = ECON_STORIES.find((s) => s.id === 'aut-exports')!;
    const text = story.panels(ds, ex as never)[0].text;
    const top = trade.countries.AUT.products.slice(0, 4).map((p: any) => p.name_ko.replace(/\(.*\)$/, ''));
    let last = -1;
    for (const n of top) { const i = text.indexOf(n); expect(i).toBeGreaterThan(last); last = i; }
  });
});

void (null as unknown as IndicatorId);

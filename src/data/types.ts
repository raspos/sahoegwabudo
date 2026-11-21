export type ContinentId = 'asia' | 'europe' | 'africa' | 'north_america' | 'south_america' | 'oceania';

export const CONTINENTS: { id: ContinentId; name: string }[] = [
  { id: 'asia', name: '아시아' },
  { id: 'europe', name: '유럽' },
  { id: 'africa', name: '아프리카' },
  { id: 'north_america', name: '북아메리카' },
  { id: 'south_america', name: '남아메리카' },
  { id: 'oceania', name: '오세아니아' },
];

export const continentName = (id: ContinentId) => CONTINENTS.find((c) => c.id === id)?.name ?? id;

export interface Country {
  id: string;
  iso2: string;
  iso3: string;
  m49: string;
  status: 'member' | 'observer';
  name_ko: string;
  official_ko: string;
  name_en: string;
  official_en: string;
  aliases: string[];
  continent: ContinentId;
  region_ko: string;
  region_en: string;
  capital_ko: string[];
  capital_en: string[];
  capital_note: string | null;
  currencies: { code: string; name_en: string; symbol?: string; name_ko?: string | null }[];
  languages_en: string[];
  languages_ko: string[];
  borders: string[];
  borders_outside: string[];
  landlocked: boolean;
  latlng: [number, number];
}

export type IndicatorId =
  | 'population' | 'area' | 'density' | 'gdp' | 'gdp_pc' | 'gdp_growth'
  | 'inflation' | 'fertility' | 'life_exp' | 'urban' | 'manufacturing' | 'internet';

export interface Indicator {
  indicator_id: IndicatorId;
  source_code: string;
  name_ko: string;
  name_en: string;
  unit: string;
  unit_en: string;
  sort: 'desc' | 'asc';
  digits: number;
  category: string;
  definition_en: string;
  source: string;
  source_org: string;
  source_url: string;
  update_frequency: string;
  retrieved_at: string;
  ref_year: number;
  ref_count: number;
  latest_year: number;
  coverage_by_year: Record<string, number>;
  missing_all_years: string[];
}

/** observations[indicator][country] = [[year, value], ...] (오름차순, 결측 연도는 없음) */
export type Observations = Record<string, Record<string, [number, number][]>>;

export interface RankRow {
  country: Country;
  value: number;
  rank: number;
}

export interface Ranking {
  indicator: Indicator;
  year: number;
  rows: RankRow[];           // 1위부터
  excluded: Country[];       // 기준연도 값이 없는 나라
}

import { useEffect, useState } from 'react';
import type { Dataset } from '../data/engine';
import type { Extras } from '../data/extras';
import { KOPPEN_KO } from '../data/extras';
import type { IndicatorId } from '../data/types';
import { fmtValue } from '../data/format';

/**
 * 나라 이야기 콘텐츠 (public/data/stories/{지역}.json).
 * 본문 속 통계는 토큰으로 적어 데이터 엔진에서 읽는다. 데이터가 갱신되면 숫자·순위도 함께 바뀐다.
 *   {{n:ISO}}            나라 이름
 *   {{v:ISO:지표}}        기준연도 값 + (연도)
 *   {{vr:ISO:지표}}       기준연도 값 + (연도, n개국 중 k위)
 *   {{r:ISO:지표}}        n개국 중 k위
 *   {{y:지표}}            기준연도
 *   {{ex:ISO}}           상품 수출 1위 상품군과 비중 (UN Comtrade 연도)
 *   {{p1:ISO}}           최대 수출 상대와 비중
 *   {{ag:ISO:영문품목}}   FAOSTAT 품목 세계 순위 (예: {{ag:BRA:Coffee, green}})
 *   {{cl:ISO}}           가장 넓은 기후형과 비율
 *   {{lf:ISO:영문지형}}   지형이 국토에서 차지하는 비율 (예: {{lf:AUT:Alps}})
 * 역사적 연도처럼 바뀌지 않는 사실은 본문에 그대로 쓰고 sources 에 근거를 적는다.
 */
export type StoryCategory = 'geo' | 'economy' | 'history' | 'culture' | 'resources' | 'curious';
export const CATEGORY_KO: Record<StoryCategory, string> = {
  geo: '지리·자연', economy: '경제·산업', history: '역사', culture: '문화·생활', resources: '특산물·자원', curious: '흥미로운 사실',
};

export interface StorySource { label: string; url: string; accessed?: string }
export interface StoryDoc {
  id: string;
  country: string;
  title: string;
  category: StoryCategory;
  panels: string[];
  indicators?: IndicatorId[];
  related?: string[];
  next?: { country: string; why: string };
  sources: StorySource[];
  reviewed: string;
}

export const STORY_REGIONS = ['asia', 'europe', 'africa', 'americas', 'oceania'] as const;
let cache: Promise<StoryDoc[]> | null = null;

export function loadStoryDocs(base = import.meta.env.BASE_URL): Promise<StoryDoc[]> {
  if (!cache) {
    cache = Promise.all(STORY_REGIONS.map((r) => fetch(`${base}data/stories/${r}.json`).then((x) => (x.ok ? x.json() : [])).catch(() => [])))
      .then((parts) => parts.flat() as StoryDoc[]);
  }
  return cache;
}

export function useStoryDocs(): StoryDoc[] | null {
  const [docs, setDocs] = useState<StoryDoc[] | null>(null);
  useEffect(() => {
    let alive = true;
    loadStoryDocs().then((d) => alive && setDocs(d));
    return () => { alive = false; };
  }, []);
  return docs;
}

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

/** 토큰을 실제 값으로 바꾼다. 풀 수 없는 토큰은 [자료 없음] 으로 남겨 감사에서 잡히게 한다 */
export function renderStoryText(text: string, ds: Dataset, ex: Extras | null): string {
  return text.replace(/\{\{(\w+):([^}]+)\}\}/g, (all, kind: string, arg: string) => {
    const [a, b] = arg.split(':');
    const miss = '[자료 없음]';
    try {
      switch (kind) {
        case 'n': return ds.country(a)?.name_ko ?? miss;
        case 'y': return String(ds.indicator(a as IndicatorId).ref_year);
        case 'v': case 'vr': case 'r': {
          const ind = ds.indicator(b as IndicatorId);
          const v = ds.refValue(a, b as IndicatorId);
          if (!v) return miss;
          const rk = ds.rankOf(a, b as IndicatorId);
          if (kind === 'r') return rk ? `${rk.of}개국 중 ${rk.rank}위` : miss;
          const val = fmtValue(ind, v.value, { short: true });
          return kind === 'v' ? `${val}(${v.year}년)` : `${val}(${v.year}년${rk ? `, ${rk.of}개국 중 ${rk.rank}위` : ''})`;
        }
        case 'ex': {
          const t = ex?.trade?.countries[a];
          if (!t) return miss;
          return `${t.products[0].name_ko.replace(/\(.*\)$/, '')}(상품 수출의 ${pct(t.products[0].share)}, ${t.year}년)`;
        }
        case 'p1': {
          const t = ex?.trade?.countries[a];
          const p = t?.partners[0];
          if (!t || !p) return miss;
          return `${(p.iso3 && ds.country(p.iso3)?.name_ko) || p.name_ko || p.name_en}(${pct(p.share)}, ${t.year}년)`;
        }
        case 'ag': {
          const g = ex?.agri?.countries[a];
          const it = [...(g?.representative ?? []), ...(g?.by_tonnes ?? [])].find((x) => x.name_en === b);
          return it ? `${it.name_ko} 생산 세계 ${it.rank}위(${ex?.agri?.meta.year}년)` : miss;
        }
        case 'cl': {
          const k = ex?.nature?.countries[a]?.koppen.find((x) => x.share);
          return k ? `${KOPPEN_KO[k.code]} ${Math.round(k.share! * 100)}%` : miss;
        }
        case 'lf': {
          const l = ex?.nature?.countries[a]?.landforms.find((x) => x.name_en.toLowerCase() === b.toLowerCase());
          return l ? `약 ${Math.round(l.share_of_country * 100)}%` : miss;
        }
        default: return all;
      }
    } catch {
      return miss;
    }
  });
}

/** 본문에 쓰인 토큰 목록 (감사용) */
export function tokensOf(doc: StoryDoc): string[] {
  return doc.panels.flatMap((p) => [...p.matchAll(/\{\{(\w+):([^}]+)\}\}/g)].map((m) => m[0]));
}

import type { Dataset } from '../data/engine';
import type { Extras } from '../data/extras';
import { CATEGORY_KO, renderStoryText, tokensOf, type StoryCategory, type StoryDoc } from './storyStore';
import { storiesFor } from './stories';

export const MAJOR30 = ['KOR', 'PRK', 'JPN', 'CHN', 'IND', 'IDN', 'VNM', 'THA', 'SGP', 'SAU', 'AUT', 'DEU', 'FRA', 'GBR', 'ITA', 'CHE', 'NLD', 'NOR',
  'USA', 'CAN', 'MEX', 'BRA', 'ARG', 'CHL', 'EGY', 'ZAF', 'ETH', 'KEN', 'AUS', 'NZL'];

const LEGACY_KEEP = new Set(['kor-economy', 'kor-population', 'jpn-quake', 'jpn-aging', 'chn-population', 'chn-factory', 'chn-huline', 'usa-economy',
  'usa-states', 'nld-lowland', 'nld-agri', 'mng-sparse', 'mng-nomad', 'sgp-port', 'aut-income', 'aut-exports', 'aut-alps']);

export interface AuditIssue { kind: string; id: string; detail: string }
export interface Audit {
  countries: number; withStories: number; without: string[]; under2: string[]; major30Under4: string[];
  total: number; jsonStories: number; legacyStories: number; average: number;
  byCategory: Record<string, number>; perCountry: Record<string, number>;
  sourced: number; needsReview: number; issues: AuditIssue[];
}

function shingles(t: string, n = 4) {
  const s = new Set<string>();
  for (let i = 0; i + n <= t.length; i++) s.add(t.slice(i, i + n));
  return s;
}
function jaccard(a: Set<string>, b: Set<string>) {
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter || 1);
}

export function auditStories(docs: StoryDoc[], ds: Dataset, ex: Extras): Audit {
  const issues: AuditIssue[] = [];
  const ids = new Set(ds.countries.map((c) => c.id));
  const indIds = new Set(ds.indicators.map((i) => i.indicator_id));
  const perCountry: Record<string, number> = Object.fromEntries(ds.countries.map((c) => [c.id, 0]));
  const byCategory: Record<string, number> = Object.fromEntries(Object.keys(CATEGORY_KO).map((k) => [k, 0]));

  // 기존 코드 이야기 (틀 이야기 7편 제외)
  let legacy = 0;
  for (const c of ds.countries) for (const s of storiesFor(c.id)) if (LEGACY_KEEP.has(s.id)) { perCountry[c.id]++; legacy++; }
  const legacyCat: Record<string, StoryCategory> = { 'kor-economy': 'economy', 'kor-population': 'culture', 'jpn-quake': 'geo', 'jpn-aging': 'culture', 'chn-population': 'history', 'chn-factory': 'economy', 'chn-huline': 'geo', 'usa-economy': 'economy', 'usa-states': 'history', 'nld-lowland': 'geo', 'nld-agri': 'economy', 'mng-sparse': 'geo', 'mng-nomad': 'culture', 'sgp-port': 'economy', 'aut-income': 'economy', 'aut-exports': 'economy', 'aut-alps': 'geo' };
  for (const id of LEGACY_KEEP) byCategory[legacyCat[id]]++;

  const seenId = new Map<string, number>(), seenTitle = new Map<string, number>();
  let sourced = 0;
  const names = ds.countries.map((c) => c.name_ko).sort((a, b) => b.length - a.length);
  const norm = (d: StoryDoc) => {
    let t = d.panels.join(' ').replace(/\{\{[^}]+\}\}/g, ' ').replace(/[0-9.,%]+/g, ' ');
    for (const n of names) t = t.split(n).join(' ');
    return t.replace(/\s+/g, ' ');
  };
  const sh = docs.map((d) => shingles(norm(d)));

  docs.forEach((d, i) => {
    seenId.set(d.id, (seenId.get(d.id) ?? 0) + 1);
    seenTitle.set(d.title, (seenTitle.get(d.title) ?? 0) + 1);
    if (!ids.has(d.country)) issues.push({ kind: '잘못된 국가 코드', id: d.id, detail: d.country });
    else perCountry[d.country]++;
    if (!(d.category in CATEGORY_KO)) issues.push({ kind: '분야 오류', id: d.id, detail: d.category });
    else byCategory[d.category]++;
    for (const r of [...(d.related ?? []), ...(d.next ? [d.next.country] : [])]) if (!ids.has(r)) issues.push({ kind: '관련 국가 링크 오류', id: d.id, detail: r });
    for (const iid of d.indicators ?? []) if (!indIds.has(iid)) issues.push({ kind: '없는 지표', id: d.id, detail: iid });
    for (const tk of tokensOf(d)) {
      const m = tk.match(/\{\{(\w+):([^}]+)\}\}/)!;
      const [a, b] = m[2].split(':');
      if (['v', 'vr', 'r'].includes(m[1]) && !indIds.has(b as never)) issues.push({ kind: '없는 지표', id: d.id, detail: tk });
      if (m[1] === 'y' && !indIds.has(a as never)) issues.push({ kind: '없는 지표', id: d.id, detail: tk });
      if (['n', 'v', 'vr', 'r', 'ex', 'p1', 'ag', 'cl', 'lf'].includes(m[1]) && !ids.has(a)) issues.push({ kind: '잘못된 국가 코드', id: d.id, detail: tk });
    }
    const rendered = d.panels.map((p) => renderStoryText(p, ds, ex)).join(' ');
    if (rendered.includes('[자료 없음]')) issues.push({ kind: '풀리지 않은 통계', id: d.id, detail: tokensOf(d).filter((t) => renderStoryText(t, ds, ex) === '[자료 없음]').join(' ') });
    if (/TODO|TBD|XXX|lorem|\?\?\?|미완성|작성 중/i.test(d.title + rendered)) issues.push({ kind: '미완성 문구', id: d.id, detail: '' });
    if (d.panels.length < 3 || d.panels.length > 4) issues.push({ kind: '장면 수', id: d.id, detail: String(d.panels.length) });
    if (!/[?？]$/.test(d.title.trim())) issues.push({ kind: '질문형 제목 아님', id: d.id, detail: d.title });
    if (d.sources.length && d.sources.every((s) => s.label && /^https:\/\//.test(s.url))) sourced++;
    else issues.push({ kind: '출처 누락', id: d.id, detail: '' });
    for (let j = 0; j < i; j++) {
      if (docs[j].country === d.country) continue;
      const sim = jaccard(sh[i], sh[j]);
      if (sim > 0.45) issues.push({ kind: '내용 유사', id: d.id, detail: `${docs[j].id} ${sim.toFixed(2)}` });
    }
  });
  for (const [k, n] of seenId) if (n > 1) issues.push({ kind: '이야기 ID 중복', id: k, detail: String(n) });
  for (const [k, n] of seenTitle) if (n > 1) issues.push({ kind: '제목 중복', id: k, detail: String(n) });

  const total = docs.length + legacy;
  const without = Object.entries(perCountry).filter(([, n]) => n === 0).map(([k]) => k);
  const reviewIds = new Set(issues.map((x) => x.id));
  return {
    countries: ds.countries.length, withStories: ds.countries.length - without.length, without,
    under2: Object.entries(perCountry).filter(([, n]) => n < 2).map(([k]) => k),
    major30Under4: MAJOR30.filter((k) => perCountry[k] < 4),
    total, jsonStories: docs.length, legacyStories: legacy, average: Math.round((total / ds.countries.length) * 100) / 100,
    byCategory, perCountry, sourced: sourced + legacy, needsReview: docs.filter((d) => reviewIds.has(d.id)).length, issues,
  };
}

export function auditMarkdown(a: Audit, ds: Dataset): string {
  const L: string[] = ['# 나라 이야기 감사 보고서', '', `생성: ${new Date().toISOString().slice(0, 10)}`, '',
    '| 항목 | 값 |', '|---|---|',
    `| 전체 국가 수 | ${a.countries} |`, `| 이야기 보유 국가 수 | ${a.withStories} |`, `| 이야기 없는 국가 수 | ${a.without.length} |`,
    `| 전체 이야기 수 | ${a.total} (JSON ${a.jsonStories} + 기존 코드 ${a.legacyStories}) |`, `| 국가당 평균 이야기 수 | ${a.average} |`,
    `| 2편 미만 국가 | ${a.under2.length} |`, `| 주요 30개국 중 4편 미만 | ${a.major30Under4.length} ${a.major30Under4.join(' ')} |`,
    `| 출처가 확인된 이야기 수 | ${a.sourced} |`, `| 검증이 필요한 이야기 수 | ${a.needsReview} |`, '',
    '## 분야별 이야기 수', '', ...Object.entries(a.byCategory).map(([k, n]) => `- ${CATEGORY_KO[k as StoryCategory]}: ${n}`), '',
    '## 검사에서 걸린 항목', '', a.issues.length ? '| 종류 | 이야기 | 내용 |\n|---|---|---|\n' + a.issues.map((x) => `| ${x.kind} | ${x.id} | ${x.detail} |`).join('\n') : '없음', '',
    '## 나라별 이야기 수', '', '| 나라 | 수 |', '|---|---|',
    ...ds.countries.map((c) => `| ${c.name_ko} (${c.id}) | ${a.perCountry[c.id]} |`)];
  return L.join('\n') + '\n';
}

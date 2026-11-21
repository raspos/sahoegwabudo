import type { Dataset } from '../data/engine';
import type { IndicatorId } from '../data/types';
import { continentName } from '../data/types';
import { fmtValue, josa, koreanUnits } from '../data/format';
import { KOPPEN_KO } from '../data/extras';
import { shuffle, type Rng } from '../games/questions';
import { sectorSharesOf } from '../content/sectors';
import type { Answer, Clue, Ctx, Evidence, GameState, MissionNode, Puzzle, Resolution } from './types';

const name = (ds: Dataset, id: string) => ds.country(id)?.name_ko ?? id;
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
function need<T>(v: T | undefined | null, what: string): T {
  if (v === undefined || v === null) throw new Error(`필수 자료 없음: ${what}`);
  return v;
}
const ref = (ds: Dataset, cid: string, iid: IndicatorId) => ds.refValue(cid, iid)?.value;
const factText = (ds: Dataset, cid: string, iid: IndicatorId) => {
  const ind = ds.indicator(iid), v = need(ref(ds, cid, iid), `${cid} ${iid}`);
  const r = ds.rankOf(cid, iid);
  return `${name(ds, cid)} ${ind.name_ko} ${fmtValue(ind, v, { short: true })}${r ? ` (세계 ${r.rank}위/${r.of})` : ''}`;
};
export const ev = (ds: Dataset, cid: string, iid: IndicatorId, tags: string[]): Evidence => ({
  id: `${cid}:${iid}`, text: factText(ds, cid, iid), source: `World Bank WDI ${ds.indicator(iid).ref_year}`, tags, country: cid,
});

interface Base { id: string; title: string; country: string; brief: (s: GameState, c: Ctx) => string; next: (s: GameState) => string }

// ═════════ ① 국가 발견: 단서를 사서 지도에서 찾기 ═════════
export function discoverMission(o: Base & { target: string; evidence: (c: Ctx) => Evidence[] }): MissionNode {
  const COSTS = [0, 4, 4, 6, 6, 8];
  return {
    type: 'mission', id: o.id, title: o.title, country: o.country, brief: o.brief, next: o.next,
    build: (c) => {
      const { ds, ex } = c;
      const t = need(ds.country(o.target), o.target);
      const n = ex.nature?.countries[t.id];
      const tr = ex.trade?.countries[t.id];
      const clues: string[] = [`${continentName(t.continent)}에 있는 나라입니다.`];
      if (n?.koppen.length) clues.push(`국토의 기후: ${n.koppen.filter((k) => k.share).slice(0, 2).map((k) => `${KOPPEN_KO[k.code]} ${Math.round(k.share! * 100)}%`).join(', ') || KOPPEN_KO[n.koppen[0].code]}.`);
      clues.push(t.landlocked ? `바다와 닿지 않은 내륙국이고, 땅으로 ${t.borders.length}개 나라와 맞닿아 있습니다.` : t.borders.length ? `바다와 닿아 있고, 땅으로 ${t.borders.length}개 나라와 맞닿아 있습니다.` : '땅으로 맞닿은 이웃 나라가 없습니다.');
      if (tr) clues.push(`상품 수출 1위 상품군은 ${tr.products[0].name_ko.replace(/\(.*\)$/, '')}(${pct(tr.products[0].share)}, ${tr.year}년)입니다.`);
      const lf = n?.landforms[0];
      if (lf?.name_ko) clues.push(`대표 지형: ${lf.name_ko}(${lf.kind_ko}).`);
      else if (n?.peaks[0]?.name_ko) clues.push(`가장 높은 산: ${n.peaks[0].name_ko}(${n.peaks[0].elevation_m.toLocaleString('ko-KR')}m).`);
      if (t.borders.length) clues.push(`이웃 나라: ${t.borders.map((b) => name(ds, b)).join(', ')}.`);
      return { kind: 'discover', target: t.id, continent: t.continent, maxTries: 3, clues: clues.map((text, i): Clue => ({ text, cost: COSTS[Math.min(i, COSTS.length - 1)] })) };
    },
    resolve: (p, a, s, c) => {
      if (p.kind !== 'discover' || a.kind !== 'discover') throw new Error('bad answer');
      const idx = a.guesses.indexOf(p.target);
      const tries = idx < 0 ? 99 : idx + 1;
      const free = s.flags.freeClue ? 1 : 0;
      const bought = p.clues.slice(1, 1 + a.cluesBought);
      const spent = bought.reduce((sum, cl) => sum + cl.cost, 0) - (free && bought.length ? bought[0].cost : 0);
      const outcome = tries <= 2 ? 'success' : tries === 3 ? 'partial' : 'fail';
      const all = o.evidence(c);
      const nm = name(c.ds, p.target);
      return {
        outcome,
        evidence: outcome === 'fail' ? all.slice(0, 1) : all,
        cost: { funds: -spent, days: outcome === 'fail' ? -2 : 0 },
        flags: { freeClue: false, [`found:${p.target}`]: outcome !== 'fail' },
        message: outcome === 'fail'
          ? `${josa(nm, '을를')} 찾지 못해 현지 안내인을 따라가느라 이틀이 더 걸렸습니다. 조사 자료도 일부만 얻었습니다.`
          : `${tries}번 만에 ${josa(nm, '을를')} 찾았습니다. ${all.map((e) => e.text).join(' / ')}`,
      };
    },
  };
}

// ═════════ ② 경제 조사: 나라와 주력 수출품 짝짓기 ═════════
export function economyMission(o: Base & { pool: string[]; must?: string; tags?: string[] }): MissionNode {
  return {
    type: 'mission', id: o.id, title: o.title, country: o.country, brief: o.brief, next: o.next,
    build: (c, rng) => {
      const tr = c.ex.trade?.countries ?? {};
      const avail = o.pool.filter((x) => tr[x]?.products.length);
      const pick: string[] = o.must ? [o.must] : [];
      for (const x of shuffle(avail.filter((y) => y !== o.must), rng)) {
        if (pick.length >= 3) break;
        if (!pick.some((y) => tr[y].products[0].hs === tr[x].products[0].hs)) pick.push(x);
      }
      if (pick.length < 3) throw new Error(`${o.id}: 수출 1위가 서로 다른 나라 3개를 고를 수 없음`);
      const items = shuffle(pick.map((x) => ({ key: tr[x].products[0].hs, label: tr[x].products[0].name_ko.replace(/\(.*\)$/, ''),
        detail: `HS ${tr[x].products[0].hs}` })), rng);
      const answer = Object.fromEntries(pick.map((x) => [tr[x].products[0].hs, x]));
      return { kind: 'economy', countries: shuffle(pick, rng), items, answer, year: Math.max(...pick.map((x) => tr[x].year)) };
    },
    resolve: (p, a, _s, c) => {
      if (p.kind !== 'economy' || a.kind !== 'economy') throw new Error('bad answer');
      const tr = c.ex.trade!.countries;
      const right = p.items.filter((it) => a.assign[it.key] === p.answer[it.key]);
      const outcome = right.length === 3 ? 'success' : right.length === 2 ? 'partial' : 'fail';
      const evidence: Evidence[] = right.map((it) => {
        const cid = p.answer[it.key], t = tr[cid];
        return { id: `${cid}:top-export`, text: `${name(c.ds, cid)} 상품 수출 1위: ${it.label} ${pct(t.products[0].share)}`, source: `UN Comtrade ${t.year}`, tags: o.tags ?? ['trade', 'industry'], country: cid };
      });
      if (outcome === 'success' && o.must) {
        const t = tr[o.must], p0 = t.partners[0];
        evidence.push({ id: `${o.must}:top-partner`, text: `${name(c.ds, o.must)}의 최대 수출 상대: ${(p0.iso3 && name(c.ds, p0.iso3)) || p0.name_ko || p0.name_en} ${pct(p0.share)}`, source: `UN Comtrade ${t.year}`, tags: ['trade', 'partners'], country: o.must });
      }
      return {
        outcome, evidence, cost: { funds: 0, days: outcome === 'fail' ? -1 : 0 },
        message: p.items.map((it) => `${name(c.ds, p.answer[it.key])} → ${it.label}${a.assign[it.key] === p.answer[it.key] ? ' ✓' : ' ✗'}`).join(' · ')
          + (outcome === 'success' && o.must ? ' 수출 상대국 자료도 함께 확보했습니다.' : ''),
      };
    },
  };
}

// ═════════ ③ 지리 탐험: 조건을 지키며 땅으로 이어진 경로 찾기 ═════════
export interface RouteRule { label: string; ind?: IndicatorId; min?: number; climate?: string; tags: string[] }
function bfs(ds: Dataset, start: string, goal: string, ok: (x: string) => boolean): string[] | undefined {
  const prev = new Map<string, string>([[start, '']]);
  const q = [start];
  while (q.length) {
    const x = q.shift()!;
    if (x === goal) break;
    for (const y of ds.country(x)?.borders ?? []) {
      if (prev.has(y) || (y !== goal && !ok(y))) continue;
      prev.set(y, x);
      q.push(y);
    }
  }
  if (!prev.has(goal)) return undefined;
  const path = [goal];
  while (path[0] !== start) path.unshift(prev.get(path[0])!);
  return path;
}
function ruleOk(c: Ctx, r: RouteRule, x: string) {
  if (r.ind) { const v = ref(c.ds, x, r.ind); return v !== undefined && v >= (r.min ?? 0); }
  if (r.climate) return (c.ex.nature?.countries[x]?.koppen ?? []).some((k) => k.code.startsWith(r.climate!) && (k.share ?? 1) >= 0.2);
  return true;
}
export function routeMission(o: Base & { start: string; goal: string; rules: RouteRule[] }): MissionNode {
  const choose = (c: Ctx, rng: Rng) => {
    const free = bfs(c.ds, o.start, o.goal, () => true);
    if (!free) throw new Error(`${o.id}: 땅길 없음`);
    for (const r of shuffle(o.rules, rng)) {
      const path = bfs(c.ds, o.start, o.goal, (x) => ruleOk(c, r, x));
      if (!path || path.length > 7) continue;
      const freeBreaks = free.slice(1, -1).some((x) => !ruleOk(c, r, x));
      if (freeBreaks || path.length > free.length) return { r, path, free };
    }
    const r = o.rules[0];
    const path = need(bfs(c.ds, o.start, o.goal, (x) => ruleOk(c, r, x)), `${o.id} 경로`);
    return { r, path, free };
  };
  return {
    type: 'mission', id: o.id, title: o.title, country: o.country, brief: o.brief, next: o.next,
    build: (c, rng) => {
      const { r, path, free } = choose(c, rng);
      const allowed = c.ds.countries.map((x) => x.id).filter((x) => ruleOk(c, r, x));
      return { kind: 'route', start: o.start, goal: o.goal, rule: r.label, ruleIndicator: r.ind, allowed, optimal: path.length - 1, unconstrained: free.length - 1 };
    },
    resolve: (p, a, _s, c) => {
      if (p.kind !== 'route' || a.kind !== 'route') throw new Error('bad answer');
      const ds = c.ds;
      if (a.gaveUp) return { outcome: 'fail', evidence: [], cost: { funds: -12, days: -2 }, flags: {}, location: p.goal, message: '본부에 연락해 길 안내를 받았습니다. 안내비와 이틀이 들었습니다.' };
      const path = a.path;
      const valid = path[0] === p.start && path[path.length - 1] === p.goal && path.every((x, i) => i === 0 || ds.country(path[i - 1])?.borders.includes(x));
      const transit = path.slice(1, -1);
      const bad = transit.filter((x) => !p.allowed.includes(x));
      const steps = path.length - 1;
      const outcome: Resolution['outcome'] = !valid ? 'fail' : bad.length === 0 && steps <= p.optimal + 1 ? 'success' : bad.length <= 1 ? 'partial' : 'fail';
      const evidence: Evidence[] = p.ruleIndicator && valid
        ? transit.filter((x) => p.allowed.includes(x) && ref(ds, x, p.ruleIndicator!) !== undefined).slice(0, 2).map((x) => ev(ds, x, p.ruleIndicator!, ['route', ...(o.rules.find((r) => r.label === p.rule)?.tags ?? [])]))
        : [];
      return {
        outcome, evidence, cost: { funds: -2 * steps, days: -steps }, location: valid ? p.goal : undefined,
        message: `${path.map((x) => name(ds, x)).join(' → ')} (${steps}구간). 조건에 맞는 가장 짧은 길은 ${p.optimal}구간입니다.${bad.length ? ` 조건을 어긴 곳: ${bad.map((x) => name(ds, x)).join(', ')}.` : ''}`,
      };
    },
  };
}

// ═════════ ④ 국가 비교: 자료 열람에 돈이 드는 조건 추리 ═════════
export function compareMission(o: Base & { pool: string[]; target: IndicatorId; filter: IndicatorId; extra?: IndicatorId; tags: string[] }): MissionNode {
  return {
    type: 'mission', id: o.id, title: o.title, country: o.country, brief: o.brief, next: o.next,
    build: (c, rng) => {
      const ds = c.ds;
      const cols = [o.target, o.filter, ...(o.extra ? [o.extra] : [])];
      const avail = o.pool.filter((x) => cols.every((i) => ref(ds, x, i) !== undefined));
      for (let tryN = 0; tryN < 40; tryN++) {
        const cand = shuffle(avail, rng).slice(0, 4);
        if (cand.length < 4) break;
        const fv = cand.map((x) => ref(ds, x, o.filter)!).sort((a, b) => a - b);
        const thr = Math.round(((fv[1] + fv[2]) / 2) * 10) / 10;   // 두 나라는 조건을 넘고 두 나라는 못 넘게
        const pass = cand.filter((x) => ref(ds, x, o.filter)! >= thr);
        const tv = pass.map((x) => ({ x, v: ref(ds, x, o.target)! })).sort((a, b) => b.v - a.v);
        if (pass.length !== 2 || tv[0].v / tv[1].v < 1.05) continue;
        const best = cand.map((x) => ({ x, v: ref(ds, x, o.target)! })).sort((a, b) => b.v - a.v)[0].x;
        if (best === tv[0].x) continue;   // 조건을 안 봐도 맞힐 수 있으면 다시
        const f = ds.indicator(o.filter), t = ds.indicator(o.target);
        return {
          kind: 'compare', candidates: cand, revealCost: 5,
          columns: cols.map((id) => ({ id, label: ds.indicator(id).name_ko })),
          criteria: `${f.name_ko}이(가) ${fmtValue(f, thr, { short: true })} 이상인 나라 가운데 ${t.name_ko}이(가) 가장 높은 나라`,
          answer: tv[0].x,
        };
      }
      throw new Error(`${o.id}: 조건이 하나로 정해지는 후보 4개를 고를 수 없음`);
    },
    resolve: (p, a, s, c) => {
      if (p.kind !== 'compare' || a.kind !== 'compare') throw new Error('bad answer');
      const freeOne = s.flags.freeReveal && a.revealed.length ? 1 : 0;
      const cost = (a.revealed.length - freeOne) * p.revealCost;
      const ok = a.pick === p.answer;
      const evidence = ok ? [ev(c.ds, p.answer, o.target, o.tags), ev(c.ds, p.answer, o.filter, o.tags)] : [];
      return {
        outcome: ok ? 'success' : 'fail', evidence, cost: { funds: -cost, days: ok ? 0 : -1 },
        flags: { freeReveal: false, [`${o.id}:answer`]: p.answer },
        message: ok ? `정답은 ${name(c.ds, p.answer)}. ${evidence.map((e) => e.text).join(' / ')}` : `조건에 맞는 나라는 ${name(c.ds, p.answer)}였습니다. 잘못 짚은 곳을 다시 확인하느라 하루가 더 걸렸습니다.`,
      };
    },
  };
}

// ═════════ ⑤ 순위 추리: 다섯 나라를 순서대로 놓기 ═════════
export function rankMission(o: Base & ({ mode: 'indicator'; pool: string[]; indicator: IndicatorId } | { mode: 'partners'; of: string }) & { tags: string[] }): MissionNode {
  return {
    type: 'mission', id: o.id, title: o.title, country: o.country, brief: o.brief, next: o.next,
    build: (c, rng): Puzzle => {
      const ds = c.ds;
      if (o.mode === 'partners') {
        const t = need(c.ex.trade?.countries[o.of], `${o.of} 수출 자료`);
        const ps = t.partners.slice(0, 5);
        if (ps.length < 4) throw new Error(`${o.id}: 상대국 부족`);
        return { kind: 'rank', label: `${name(ds, o.of)} 상품 수출 상대국 비중`, year: t.year, source: `UN Comtrade ${t.year}`,
          items: shuffle(ps.map((p) => ({ key: String(p.code), label: (p.iso3 && name(ds, p.iso3)) || p.name_ko || p.name_en, value: p.share, display: `${pct(p.share)} (${koreanUnits(p.value)} 달러)` })), rng) };
      }
      const ind = ds.indicator(o.indicator);
      const avail = shuffle(o.pool.filter((x) => ref(ds, x, o.indicator) !== undefined), rng);
      const pick: string[] = [];
      for (const x of avail) {
        const v = ref(ds, x, o.indicator)!;
        if (pick.every((y) => { const w = ref(ds, y, o.indicator)!; return Math.abs(v - w) / Math.max(v, w) >= 0.05; })) pick.push(x);
        if (pick.length === 5) break;
      }
      if (pick.length < 5) throw new Error(`${o.id}: 차이가 5% 넘는 다섯 나라를 고를 수 없음`);
      return { kind: 'rank', label: ind.name_ko, year: ind.ref_year, source: `World Bank WDI ${ind.ref_year}`,
        items: shuffle(pick.map((x) => ({ key: x, label: name(ds, x), value: ref(ds, x, o.indicator)!, display: fmtValue(ind, ref(ds, x, o.indicator)!, { short: true }) })), rng) };
    },
    resolve: (p, a) => {
      if (p.kind !== 'rank' || a.kind !== 'rank') throw new Error('bad answer');
      const truth = [...p.items].sort((x, y) => y.value - x.value).map((x) => x.key);
      const right = a.order.filter((k, i) => truth[i] === k).length;
      const outcome = right >= 4 ? 'success' : right >= 2 ? 'partial' : 'fail';
      const top = p.items.find((x) => x.key === truth[0])!;
      const evidence: Evidence[] = outcome === 'fail' ? [] : [{
        id: `${o.id}:rank`, text: `${p.label} 순위: ${truth.map((k) => { const it = p.items.find((x) => x.key === k)!; return `${it.label} ${it.display}`; }).join(' > ')}`,
        source: p.source, tags: o.tags, country: o.mode === 'partners' ? o.of : (o.mode === 'indicator' ? top.key : undefined),
      }];
      return {
        outcome, evidence, cost: { funds: outcome === 'success' ? 5 : 0, days: outcome === 'fail' ? -1 : 0 },
        flags: { rankHint: false },
        message: `맞은 자리 ${right}/5. 실제 순서: ${truth.map((k) => p.items.find((x) => x.key === k)!.label).join(' > ')}.${outcome === 'success' ? ' 본부가 정확한 분석에 보너스 5를 보냈습니다.' : ''}`,
      };
    },
  };
}

/** 산업 구조 조사 자료 (같은 해 세 비중) */
export function sectorEvidence(ds: Dataset, cid: string, tags: string[]): Evidence {
  const s = need(sectorSharesOf(ds, cid), `${cid} 산업 구조`);
  return { id: `${cid}:sectors`, text: `${name(ds, cid)} 산업 구조: 서비스업 ${s.services.toFixed(1)}%, 산업 ${s.industry.toFixed(1)}%${s.manufacturing !== undefined ? `(제조업 ${s.manufacturing.toFixed(1)}%)` : ''}, 농림어업 ${s.agri.toFixed(1)}%`, source: `World Bank WDI ${s.year}`, tags, country: cid };
}

/** 보고서·사건에서 쓰는 '판단용' 답 형태 검사 */
export const isAnswerFor = (p: Puzzle, a: Answer) => p.kind === a.kind;

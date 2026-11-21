import { seeded, type Rng } from '../games/questions';
import type { Answer, Campaign, Ctx, Evidence, GameEvent, GameState, Node, Puzzle, Resolution, Resources } from './types';
import { EVENTS } from './events';

/** 노드마다 고정된 난수 (저장 후 다시 열어도 같은 퍼즐) */
export function nodeRng(s: GameState, nodeId: string): Rng {
  let h = s.seed >>> 0;
  for (const ch of nodeId) h = Math.imul(h ^ ch.charCodeAt(0), 2654435761) >>> 0;
  return seeded(h || 1);
}

/** 두 나라 대표 지점 사이 거리(km). 수도가 아니라 나라 중심 근처 점이므로 게임 비용 계산에만 쓴다 */
export function distanceKm(c: Ctx, a: string, b: string): number {
  const A = c.ds.country(a)?.latlng, B = c.ds.country(b)?.latlng;
  if (!A || !B) return 0;
  const R = 6371, toR = Math.PI / 180;
  const dLat = (B[0] - A[0]) * toR, dLon = (B[1] - A[1]) * toR;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(A[0] * toR) * Math.cos(B[0] * toR) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** 이동 비용: 가까우면 싸고 멀면 비싸다. 땅으로 붙은 이웃은 기차로 더 싸다 */
export function travelCost(c: Ctx, s: GameState, to: string): Resources {
  if (!to || to === s.location) return { funds: 0, days: 0 };
  const neighbor = c.ds.country(s.location)?.borders.includes(to);
  const km = distanceKm(c, s.location, to);
  let funds = Math.round((neighbor ? 3 : 6) + km / (neighbor ? 300 : 250));
  const days = Math.max(1, Math.round(km / 2500) + (neighbor ? 0 : 1));
  if (s.flags.halfTravel) funds = Math.ceil(funds / 2);
  return { funds: -funds, days: -days };
}

export function newGame(camp: Campaign, seed = Math.floor(Math.random() * 1e9)): GameState {
  return {
    v: 1, campaign: camp.id, node: camp.start, location: camp.startLocation,
    funds: camp.startResources.funds, days: camp.startResources.days,
    evidence: [], flags: {}, visited: [camp.startLocation], outcomes: {}, seenEvents: [], seed,
    log: [{ node: 'start', title: camp.title, text: camp.intro }], path: [],
  };
}

export const has = (s: GameState, id: string) => s.evidence.some((e) => e.id === id);
export const successes = (s: GameState) => Object.values(s.outcomes).filter((o) => o === 'success').length;
export const outOfResources = (s: GameState) => s.funds <= 0 || s.days <= 0;

function addEvidence(list: Evidence[], add: Evidence[]) {
  const ids = new Set(list.map((e) => e.id));
  return [...list, ...add.filter((e) => !ids.has(e.id))];
}

function applyCost(s: GameState, cost: Resources): GameState {
  return { ...s, funds: s.funds + cost.funds, days: s.days + cost.days };
}

/** 다음 노드로 이동. 자원이 바닥나면 보고서로 보내고(조기 귀환), 그 사이 사건이 끼어들 수 있다 */
export function goTo(camp: Campaign, c: Ctx, s: GameState, next: string): GameState {
  const reportId = Object.values(camp.nodes).find((n) => n.type === 'report')!.id;
  if (outOfResources(s) && next !== reportId && next !== 'ending') {
    return { ...s, node: reportId, flags: { ...s.flags, earlyReturn: true },
      log: [...s.log, { node: 'return', title: '조기 귀환', text: '탐험 자금이나 일정이 바닥나 본부로 돌아가 지금까지의 자료로 보고서를 씁니다.' }] };
  }
  const ev = pickEvent(camp, c, s, next);
  if (ev) return { ...s, node: `event:${ev.id}`, pendingNext: next, seenEvents: [...s.seenEvents, ev.id] };
  return { ...s, node: next, pendingNext: undefined };
}

/** 사건: 임무 사이에 가끔(조건이 맞고 아직 안 본 것 중에서) 끼어든다. 보고서·엔딩 직전에는 없다 */
export function pickEvent(camp: Campaign, c: Ctx, s: GameState, next: string): GameEvent | undefined {
  const target = camp.nodes[next];
  if (!target || target.type === 'report') return undefined;
  const rng = nodeRng(s, `ev:${next}:${s.seenEvents.length}`);
  if (rng() > 0.55) return undefined;
  const pool = EVENTS.filter((e) => !s.seenEvents.includes(e.id) && e.when(s, c));
  return pool.length ? pool[Math.floor(rng() * pool.length)] : undefined;
}

export function currentNode(camp: Campaign, s: GameState): Node | undefined {
  return camp.nodes[s.node];
}

export function currentEvent(s: GameState): GameEvent | undefined {
  return s.node.startsWith('event:') ? EVENTS.find((e) => `event:${e.id}` === s.node) : undefined;
}

/** 지금 노드의 퍼즐 (자원·위치에 따라 만들어지는 것도 있어 상태를 받는다) */
export function puzzleFor(camp: Campaign, c: Ctx, s: GameState): Puzzle {
  const ev = currentEvent(s);
  if (ev) return { kind: 'event', event: ev.id };
  if (s.node === 'ending') return { kind: 'ending' };
  const n = currentNode(camp, s);
  if (!n) throw new Error(`없는 노드: ${s.node}`);
  if (n.type === 'mission') return n.build(c, nodeRng(s, n.id), s);
  if (n.type === 'decide') return { kind: 'decide', options: n.options(s, c) };
  return { kind: 'report', question: n.question, pick: 3 };
}

/** 임무 장소로 이동하는 비용 (임무를 시작할 때 낸다) */
export function enterMission(camp: Campaign, c: Ctx, s: GameState): GameState {
  const n = currentNode(camp, s);
  if (!n || n.type !== 'mission' || s.flags[`entered:${n.id}`]) return s;
  const cost = travelCost(c, s, n.country);
  const moved = applyCost({ ...s, location: n.country, visited: s.visited.includes(n.country) ? s.visited : [...s.visited, n.country],
    flags: { ...s.flags, [`entered:${n.id}`]: true, halfTravel: cost.funds !== 0 ? false : s.flags.halfTravel } }, cost);
  return cost.funds || cost.days
    ? { ...moved, log: [...moved.log, { node: n.id, title: `${c.ds.country(n.country)?.name_ko ?? n.country}(으)로 이동`, text: `탐험 자금 ${-cost.funds}, 일정 ${-cost.days}일을 썼습니다.` }] }
    : moved;
}

/** 답을 내면 결과를 기록하고 다음 노드로 */
export function answer(camp: Campaign, c: Ctx, s: GameState, a: Answer): { state: GameState; res?: Resolution } {
  const ev = currentEvent(s);
  if (ev && a.kind === 'event') {
    const ch = ev.choices[a.choice];
    let st = applyCost({ ...s, flags: { ...s.flags, ...(ch.flags ?? {}) } }, ch.cost);
    st = { ...st, log: [...st.log, { node: ev.id, title: ev.title, text: ch.result, fiction: true }] };
    return { state: goTo(camp, c, st, s.pendingNext ?? camp.start) };
  }
  const n = currentNode(camp, s);
  if (!n) return { state: s };
  if (n.type === 'decide' && a.kind === 'decide') {
    const opt = n.options(s, c).find((o) => o.id === a.option && o.available);
    if (!opt) return { state: s };
    let st = applyCost({ ...s, path: [...s.path, opt.id], flags: { ...s.flags, ...(opt.setFlags ?? {}) } }, opt.cost);
    st = { ...st, log: [...st.log, { node: n.id, title: n.title, text: `선택: ${opt.label}` }] };
    return { state: goTo(camp, c, st, opt.next) };
  }
  if (n.type === 'mission') {
    const p = n.build(c, nodeRng(s, n.id), s);
    const res = n.resolve(p, a, s, c);
    let st = applyCost({ ...s, outcomes: { ...s.outcomes, [n.id]: res.outcome }, evidence: addEvidence(s.evidence, res.evidence),
      flags: { ...s.flags, ...(res.flags ?? {}) },
      ...(res.location ? { location: res.location, visited: s.visited.includes(res.location) ? s.visited : [...s.visited, res.location] } : {}) }, res.cost);
    st = { ...st, log: [...st.log, { node: n.id, title: n.title, text: res.message, outcome: res.outcome }] };
    return { state: goTo(camp, c, st, n.next(st)), res };
  }
  if (n.type === 'report' && a.kind === 'report') {
    const picked = s.evidence.filter((e) => a.evidence.includes(e.id)).slice(0, 3);
    const score = reportScore(camp, picked);
    let st: GameState = { ...s, reportScore: score, flags: { ...s.flags, reportEvidence: picked.map((e) => e.id).join(',') } };
    st = { ...st, ending: camp.pickEnding(st), node: 'ending' };
    return { state: st };
  }
  return { state: s };
}

export function reportScore(camp: Campaign, picked: Evidence[]): number {
  return picked.reduce((sum, e) => sum + Math.max(...e.tags.map((t) => camp.relevance[t] ?? 0), -1), 0);
}

/** 최고 기록 점수: 보고서 점수 + 성공 임무 + 남은 자원 */
export function finalScore(s: GameState): number {
  return (s.reportScore ?? 0) * 10 + successes(s) * 5 + Math.max(0, s.funds) / 5 + Math.max(0, s.days);
}

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Dataset } from '../data/engine';
import type { Extras } from '../data/extras';
import { answer, enterMission, newGame, puzzleFor, currentNode } from './engine';
import { CAMPAIGNS } from './campaigns';
import { EVENTS } from './events';
import type { Answer, Campaign, Ctx, GameState, Puzzle } from './types';
import { seeded } from '../games/questions';

const load = (f: string) => JSON.parse(readFileSync(resolve(__dirname, '../../public/data', f), 'utf-8'));
const ds = new Dataset(load('countries.json'), load('indicators.json'), load('observations.json'));
const ex: Extras = { trade: load('trade.json'), agri: load('agri.json'), nature: load('nature.json'), specialties: load('specialties.json') };
const ctx: Ctx = { ds, ex };

type Strategy = 'good' | 'bad' | 'random';

function bfsPath(p: Extract<Puzzle, { kind: 'route' }>): string[] {
  const prev = new Map<string, string>([[p.start, '']]);
  const q = [p.start];
  while (q.length) {
    const x = q.shift()!;
    for (const y of ds.country(x)?.borders ?? []) {
      if (prev.has(y) || (y !== p.goal && !p.allowed.includes(y))) continue;
      prev.set(y, x); q.push(y);
    }
  }
  const path = [p.goal];
  while (path[0] !== p.start) path.unshift(prev.get(path[0])!);
  return path;
}

function solve(camp: Campaign, s: GameState, p: Puzzle, st: Strategy, rng: () => number): Answer {
  const good = st === 'good' || (st === 'random' && rng() < 0.5);
  switch (p.kind) {
    case 'discover': return good ? { kind: 'discover', guesses: [p.target], cluesBought: 1 } : { kind: 'discover', guesses: ['FJI', 'ISL', 'CHL'], cluesBought: 3 };
    case 'economy': return { kind: 'economy', assign: good ? p.answer : Object.fromEntries(p.items.map((it, i) => [it.key, p.countries[(i + 1) % 3]])) };
    case 'route': return good ? { kind: 'route', path: bfsPath(p) } : { kind: 'route', path: [], gaveUp: true };
    case 'compare': return { kind: 'compare', pick: good ? p.answer : p.candidates.find((x) => x !== p.answer)!, revealed: good ? [p.columns[1].id] : p.columns.map((c) => c.id) };
    case 'rank': { const o = [...p.items].sort((a, b) => b.value - a.value).map((x) => x.key); return { kind: 'rank', order: good ? o : [...o].reverse() }; }
    case 'report': {
      const sorted = [...s.evidence].sort((a, b) => Math.max(...b.tags.map((t) => camp.relevance[t] ?? 0)) - Math.max(...a.tags.map((t) => camp.relevance[t] ?? 0)));
      return { kind: 'report', evidence: (good ? sorted : [...sorted].reverse()).slice(0, 3).map((e) => e.id) };
    }
    case 'event': return { kind: 'event', choice: good ? 0 : (EVENTS.find((e) => e.id === p.event)!.choices.length - 1) };
    default: throw new Error(`no solver for ${p.kind}`);
  }
}

interface Walk { ending: string; kinds: Set<string>; steps: number; path: string[]; state: GameState }

/** 선택 노드에서는 갈 수 있는 모든 선택지로 갈라져 끝까지 간다 */
function walkAll(camp: Campaign, seed: number, st: Strategy): Walk[] {
  const out: Walk[] = [];
  const rng = seeded(seed + 7);
  const go = (s0: GameState, kinds: Set<string>, steps: number) => {
    let s = s0;
    while (s.node !== 'ending') {
      if (steps++ > 80) throw new Error(`무한 진행: ${camp.id} ${s.node}`);
      s = enterMission(camp, ctx, s);
      const p = puzzleFor(camp, ctx, s);
      if (p.kind === 'decide') {
        const avail = p.options.filter((o) => o.available);
        expect(avail.length, `막힌 선택: ${s.node} 자금 ${s.funds}`).toBeGreaterThan(0);
        kinds.add('decide');
        for (const o of avail) {
          const r = answer(camp, ctx, s, { kind: 'decide', option: o.id });
          expect(r.state).not.toBe(s);
          go(r.state, new Set(kinds), steps);
        }
        return;
      }
      if (currentNode(camp, s)?.type === 'mission') kinds.add(p.kind);
      const r = answer(camp, ctx, s, solve(camp, s, p, st, rng));
      expect(r.state, `진행 안 됨: ${s.node}`).not.toBe(s);
      s = r.state;
    }
    out.push({ ending: s.ending!, kinds, steps, path: s.path, state: s });
  };
  go(newGame(camp, seed), new Set(), 0);
  return out;
}

describe('세계 탐험가: 구조 검증', () => {
  for (const camp of CAMPAIGNS) {
    it(`${camp.title}: 모든 갈래·전략·시드에서 엔딩에 닿고, 한 판에 6가지 임무 유형을 모두 만난다`, () => {
      const endings = new Set<string>();
      let walks = 0, early = 0, full = 0;
      for (const seed of [1, 2, 3, 11, 42]) {
        for (const st of ['good', 'bad', 'random'] as Strategy[]) {
          for (const w of walkAll(camp, seed, st)) {
            walks++;
            endings.add(w.ending);
            // 자원이 바닥나 조기 귀환한 판은 '조기 귀환' 엔딩으로 끝나므로 유형 검사에서 뺀다
            if (w.state.flags.earlyReturn) { early++; expect(w.ending.endsWith('-early') || (w.state.reportScore ?? 0) >= 7).toBe(true); continue; }
            full++;
            for (const k of ['discover', 'economy', 'route', 'compare', 'rank', 'decide']) expect(w.kinds.has(k), `${camp.id} ${w.path} ${k}`).toBe(true);
            expect(camp.endings.map((e) => e.id)).toContain(w.ending);
          }
        }
      }
      expect(walks).toBeGreaterThanOrEqual(15);
      expect(full).toBeGreaterThan(early);
      expect(endings.size, [...endings].join(',')).toBeGreaterThanOrEqual(3);
    });
    it(`${camp.title}: 임무 8개 이상, 서로 다른 갈래로 가는 첫 선택`, () => {
      const missions = Object.values(camp.nodes).filter((n) => n.type === 'mission');
      expect(missions.length).toBeGreaterThanOrEqual(8);
      const first = Object.values(camp.nodes).find((n) => n.type === 'decide')!;
      const s = newGame(camp, 5);
      const nexts = new Set((first as any).options(s, ctx).map((o: any) => o.next));
      expect(nexts.size).toBeGreaterThanOrEqual(3);
    });
  }
  it('사건 20개 이상, 모두 선택지가 있고 통계 수치를 지어내지 않는다(숫자는 게임 자원뿐)', () => {
    expect(EVENTS.length).toBeGreaterThanOrEqual(20);
    expect(new Set(EVENTS.map((e) => e.id)).size).toBe(EVENTS.length);
    for (const e of EVENTS) {
      expect(e.choices.length).toBeGreaterThan(0);
      expect(e.text + e.choices.map((c) => c.result).join('')).not.toMatch(/GDP|인구|%|톤/);
    }
  });
  it('정답만으로 길이 열리지 않는다: 독일 갈래는 상대국 자료나 정보비가 필요하다', () => {
    const camp = CAMPAIGNS[0];
    const s = { ...newGame(camp, 3), node: 'eu-route-choice' };
    const opts = (camp.nodes['eu-route-choice'] as any).options(s, ctx);
    expect(opts.find((o: any) => o.id === 'deu').available).toBe(false);
    expect(opts.find((o: any) => o.id === 'deu-paid').cost.funds).toBeLessThan(0);
  });
  it('실패해도 진행 가능: 모두 틀리는 전략에서도 엔딩에 닿고, 엔딩이 잘하는 전략과 다르다', () => {
    for (const camp of CAMPAIGNS) {
      const bad = walkAll(camp, 9, 'bad').map((w) => w.ending);
      const good = walkAll(camp, 9, 'good').map((w) => w.ending);
      expect(bad.length).toBeGreaterThan(0);
      expect(new Set(good).has(`${camp.id === 'europe-economy' ? 'eu' : 'as'}-best`)).toBe(true);
      expect(bad.some((e) => !e.endsWith('-best'))).toBe(true);
    }
  });
  it('같은 시드면 같은 퍼즐, 다른 시드면 다른 퍼즐이 나올 수 있다', () => {
    const camp = CAMPAIGNS[0];
    const p = (seed: number) => JSON.stringify(puzzleFor(camp, ctx, { ...newGame(camp, seed), node: 'eu-peer' }));
    expect(p(1)).toBe(p(1));
    expect(new Set([1, 2, 3, 4, 5, 6].map(p)).size).toBeGreaterThan(1);
  });
});

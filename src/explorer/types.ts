import type { Dataset } from '../data/engine';
import type { Extras } from '../data/extras';
import type { IndicatorId } from '../data/types';
import type { Rng } from '../games/questions';

/** 게임 속 자원 (실제 경제 통계와 무관한 가상의 값) */
export interface Resources { funds: number; days: number }

/** 조사 자료: 실제 데이터에서 만든 사실 + 보고서 채점용 관련성 태그 */
export interface Evidence {
  id: string;
  text: string;
  source: string;           // 예: 'UN Comtrade 2024'
  tags: string[];           // 예: ['trade', 'industry']
  country?: string;
}

export type Outcome = 'success' | 'partial' | 'fail';

export interface LogEntry { node: string; title: string; text: string; outcome?: Outcome; fiction?: boolean }

export interface GameState {
  v: 1;
  campaign: string;
  node: string;             // 지금 보여 줄 노드 (임무·선택·사건·보고서·엔딩)
  pendingNext?: string;     // 사건이 끼어들었을 때 사건 다음에 갈 노드
  location: string;         // 지금 머무는 나라
  funds: number;
  days: number;
  evidence: Evidence[];
  flags: Record<string, number | boolean | string>;
  visited: string[];
  outcomes: Record<string, Outcome>;
  seenEvents: string[];
  seed: number;
  log: LogEntry[];
  path: string[];           // 고른 경로(선택 노드의 선택지 id)
  ending?: string;
  reportScore?: number;
}

export interface Ctx { ds: Dataset; ex: Extras }

// ───────── 퍼즐 (노드마다 seed 로 다시 만들 수 있게 직렬화 가능한 값만) ─────────
export interface Clue { text: string; cost: number }
export type Puzzle =
  | { kind: 'discover'; target: string; clues: Clue[]; maxTries: number; continent: string }
  | { kind: 'economy'; countries: string[]; items: { key: string; label: string; detail: string }[]; answer: Record<string, string>; year: number }
  | { kind: 'route'; start: string; goal: string; rule: string; ruleIndicator?: IndicatorId; allowed: string[]; optimal: number; unconstrained: number }
  | { kind: 'compare'; candidates: string[]; columns: { id: IndicatorId; label: string }[]; criteria: string; answer: string; revealCost: number }
  | { kind: 'rank'; items: { key: string; label: string; value: number; display: string }[]; label: string; year: number; source: string }
  | { kind: 'decide'; options: DecisionOption[] }
  | { kind: 'report'; question: string; pick: number }
  | { kind: 'event'; event: string }
  | { kind: 'ending' };

export interface DecisionOption {
  id: string;
  label: string;
  detail: string;
  country?: string;
  cost: Resources;
  available: boolean;
  lockedReason?: string;
  next: string;
  setFlags?: Record<string, number | boolean | string>;
}

/** 플레이어의 답 */
export type Answer =
  | { kind: 'discover'; guesses: string[]; cluesBought: number }
  | { kind: 'economy'; assign: Record<string, string> }
  | { kind: 'route'; path: string[]; gaveUp?: boolean }
  | { kind: 'compare'; pick: string; revealed: IndicatorId[] }
  | { kind: 'rank'; order: string[] }
  | { kind: 'decide'; option: string }
  | { kind: 'report'; evidence: string[] }
  | { kind: 'event'; choice: number };

export interface Resolution {
  outcome: Outcome;
  message: string;            // 결과 설명 (교육 내용)
  evidence: Evidence[];
  cost: Resources;            // 음수 = 소모
  flags?: Record<string, number | boolean | string>;
  location?: string;          // 경로 임무처럼 끝난 뒤 머무는 곳이 바뀌는 경우
}

export interface MissionNode {
  type: 'mission';
  id: string;
  title: string;
  country: string;            // 임무 장소 (이동 비용 계산)
  brief: (s: GameState, c: Ctx) => string;
  build: (c: Ctx, rng: Rng, s: GameState) => Puzzle;
  resolve: (p: Puzzle, a: Answer, s: GameState, c: Ctx) => Resolution;
  next: (s: GameState) => string;
}
export interface DecisionNode {
  type: 'decide';
  id: string;
  title: string;
  brief: (s: GameState, c: Ctx) => string;
  options: (s: GameState, c: Ctx) => DecisionOption[];
}
export interface ReportNode { type: 'report'; id: string; title: string; question: string; brief: (s: GameState, c: Ctx) => string }
export type Node = MissionNode | DecisionNode | ReportNode;

export interface EventChoice { label: string; cost: Resources; result: string; flags?: Record<string, number | boolean | string> }
export interface GameEvent {
  id: string;
  title: string;
  text: string;               // 가상의 사건 설명
  when: (s: GameState, c: Ctx) => boolean;
  choices: EventChoice[];
}

export interface Ending { id: string; title: string; text: (s: GameState, c: Ctx) => string }

export interface Campaign {
  id: string;
  title: string;
  region: string;
  question: string;
  intro: string;
  start: string;
  startLocation: string;
  startResources: Resources;
  nodes: Record<string, Node>;
  /** 보고서 채점: 태그별 점수 (음수 = 질문과 관련 없는 자료) */
  relevance: Record<string, number>;
  endings: Ending[];
  pickEnding: (s: GameState) => string;
}

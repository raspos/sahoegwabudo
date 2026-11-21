import { useSyncExternalStore } from 'react';

/**
 * 나의 탐험일지. 로그인 없이 브라우저 LocalStorage 에 저장한다.
 * 방문(visited)과 학습 완료(learned)는 분리한다.
 *  - 방문: 나라 도감을 연 적이 있음
 *  - 학습 완료: 그 나라에 관한 확인 문제나 게임 문제를 맞힘 (열어보기만으로는 완료되지 않음)
 */
export interface GameRecord {
  best: number;
  plays: number;
  lastPlayed: string;
}

export interface JournalState {
  version: 1;
  visited: Record<string, string>;        // countryId → 처음 방문한 날짜
  recent: string[];                       // 최근 방문 (최신 먼저, 최대 12)
  learned: Record<string, { at: string; via: string }>;
  lessons: Record<string, string>;        // 읽고 확인한 탐구 노트 id → 날짜
  stories: Record<string, string>;        // 읽은 이야기 id → 날짜
  games: Record<string, GameRecord>;      // 'map:beginner' 등
  topics: Record<string, number>;         // 배틀에서 맞힌 지표별 횟수
  explorer: ExplorerRecord;               // 세계 탐험가 (PHASE 3에 추가, 옛 저장값에는 없을 수 있음)
}

export interface ExplorerCampaignRecord {
  plays: number;
  best: number;
  endings: string[];              // 본 엔딩
  missionsDone: string[];         // 한 번이라도 끝낸 임무
  lastPath: string[];             // 마지막 판의 선택 경로
  lastPlayed: string;
}
export interface ExplorerRecord {
  save: unknown | null;           // 진행 중인 판 (GameState)
  campaigns: Record<string, ExplorerCampaignRecord>;
  discovered: string[];           // 게임에서 찾아낸 나라 (방문·학습 기록과 따로 둔다)
  evidence: string[];             // 확보한 조사 자료 id
}

const KEY = 'sahoegwabudo.journal.v1';

export const emptyJournal = (): JournalState => ({
  version: 1, visited: {}, recent: [], learned: {}, lessons: {}, stories: {}, games: {}, topics: {},
  explorer: { save: null, campaigns: {}, discovered: [], evidence: [] },
});

interface Storage { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }

function storage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function parseJournal(raw: string | null): JournalState {
  if (!raw) return emptyJournal();
  try {
    const j = JSON.parse(raw);
    if (j?.version !== 1) return emptyJournal();
    // 마이그레이션: PHASE 3 이전 저장값에는 explorer 가 없다. 다른 기록은 그대로 두고 빈 탐험 기록만 더한다.
    const base = emptyJournal();
    return { ...base, ...j, explorer: { ...base.explorer, ...(j.explorer ?? {}) } };
  } catch {
    return emptyJournal();
  }
}

let state: JournalState = parseJournal(storage()?.getItem(KEY) ?? null);
export let storageAvailable = (() => {
  try {
    const s = storage();
    if (!s) return false;
    s.setItem(KEY + '.probe', '1');
    s.removeItem(KEY + '.probe');
    return true;
  } catch {
    return false;
  }
})();
const listeners = new Set<() => void>();

function commit(next: JournalState) {
  state = next;
  try {
    storage()?.setItem(KEY, JSON.stringify(next));
  } catch {
    storageAvailable = false;
  }
  listeners.forEach((l) => l());
}

const today = () => new Date().toISOString().slice(0, 10);

export const journal = {
  get: () => state,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  visit(id: string) {
    const recent = [id, ...state.recent.filter((x) => x !== id)].slice(0, 12);
    if (state.recent[0] === id && state.visited[id]) return;
    commit({ ...state, visited: state.visited[id] ? state.visited : { ...state.visited, [id]: today() }, recent });
  },
  learn(id: string, via: string) {
    if (state.learned[id]) return;
    commit({ ...state, learned: { ...state.learned, [id]: { at: today(), via } } });
  },
  readLesson(id: string) {
    if (state.lessons[id]) return;
    commit({ ...state, lessons: { ...state.lessons, [id]: today() } });
  },
  readStory(id: string) {
    if (state.stories[id]) return;
    commit({ ...state, stories: { ...state.stories, [id]: today() } });
  },
  practiceTopic(iid: string) {
    commit({ ...state, topics: { ...state.topics, [iid]: (state.topics[iid] ?? 0) + 1 } });
  },
  explorerSave(save: unknown | null) {
    commit({ ...state, explorer: { ...state.explorer, save } });
  },
  explorerFinish(o: { campaign: string; ending: string; score: number; missions: string[]; path: string[]; discovered: string[]; evidence: string[] }): boolean {
    const prev = state.explorer.campaigns[o.campaign];
    const rec: ExplorerCampaignRecord = {
      plays: (prev?.plays ?? 0) + 1,
      best: Math.max(prev?.best ?? 0, Math.round(o.score)),
      endings: [...new Set([...(prev?.endings ?? []), o.ending])],
      missionsDone: [...new Set([...(prev?.missionsDone ?? []), ...o.missions])],
      lastPath: o.path,
      lastPlayed: today(),
    };
    commit({ ...state, explorer: {
      save: null,
      campaigns: { ...state.explorer.campaigns, [o.campaign]: rec },
      discovered: [...new Set([...state.explorer.discovered, ...o.discovered])],
      evidence: [...new Set([...state.explorer.evidence, ...o.evidence])],
    } });
    return !prev || Math.round(o.score) > prev.best;
  },
  /** 게임 결과 기록. 최고 기록이 갱신되면 true */
  recordGame(key: string, score: number): boolean {
    const prev = state.games[key];
    const best = Math.max(prev?.best ?? 0, score);
    commit({ ...state, games: { ...state.games, [key]: { best, plays: (prev?.plays ?? 0) + 1, lastPlayed: today() } } });
    return !prev || score > prev.best;
  },
  reset() {
    commit(emptyJournal());
  },
  /** 테스트용 */
  _load(raw: string | null) {
    state = parseJournal(raw);
  },
};

export function useJournal(): JournalState {
  return useSyncExternalStore(journal.subscribe, journal.get, journal.get);
}

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
}

const KEY = 'sahoegwabudo.journal.v1';

export const emptyJournal = (): JournalState => ({
  version: 1, visited: {}, recent: [], learned: {}, lessons: {}, stories: {}, games: {}, topics: {},
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
    return { ...emptyJournal(), ...j };
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

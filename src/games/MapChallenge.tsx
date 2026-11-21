import { useCallback, useMemo, useRef, useState } from 'react';
import { useData } from '../App';
import { WorldMap, type WorldMapHandle } from '../map/WorldMap';
import type { MapShape } from '../map/geo';
import { LEVELS, MAP_POINTS, mapHint, mapQuestions, type Level, type MapQuestion } from './questions';
import { POLITICAL, UNLISTED } from '../data/scales';
import { journal, useJournal } from '../store/journal';
import { continentName } from '../data/types';
import { josa } from '../data/format';
import { Flag } from '../components/common';

interface Result { q: MapQuestion; wrong: string[]; points: number; revealed: boolean }

const MAX_WRONG = 3;

export function MapChallenge() {
  const { ds, geo } = useData();
  const j = useJournal();
  const mapRef = useRef<WorldMapHandle>(null);
  const [level, setLevel] = useState<Level | null>(null);
  const [qs, setQs] = useState<MapQuestion[]>([]);
  const [idx, setIdx] = useState(0);
  const [wrong, setWrong] = useState<string[]>([]);
  const [hints, setHints] = useState(0);
  const [state, setState] = useState<'ask' | 'right' | 'revealed'>('ask');
  const [results, setResults] = useState<Result[]>([]);
  const [done, setDone] = useState(false);
  const [newBest, setNewBest] = useState(false);
  const [review, setReview] = useState<string | null>(null);

  const mapIds = useMemo(() => new Set(geo.byId.keys()), [geo]);

  const start = (l: Level) => {
    setLevel(l);
    setQs(mapQuestions(ds, l, Math.random, 10, mapIds));
    setIdx(0); setWrong([]); setHints(0); setState('ask'); setResults([]); setDone(false); setReview(null);
    setTimeout(() => mapRef.current?.reset(), 0);
  };

  const q = qs[idx];

  const finishQuestion = (revealed: boolean, wrongList: string[]) => {
    const points = revealed ? 0 : MAP_POINTS[Math.min(wrongList.length, MAP_POINTS.length - 1)];
    setResults((r) => [...r, { q, wrong: wrongList, points, revealed }]);
    if (!revealed && wrongList.length <= 1) journal.learn(q.target.id, 'map-challenge');
  };

  const onPick = (id: string) => {
    if (done || !q || state !== 'ask') return;
    if (id === q.target.id) {
      setState('right');
      finishQuestion(false, wrong);
      return;
    }
    if (wrong.includes(id)) return;
    const next = [...wrong, id];
    setWrong(next);
    if (next.length >= MAX_WRONG) {
      setState('revealed');
      finishQuestion(true, next);
      mapRef.current?.zoomToCountry(q.target.id);
    }
  };

  const next = () => {
    if (idx + 1 >= qs.length) {
      const total = results.reduce((s, r) => s + r.points, 0);
      setNewBest(journal.recordGame(`map:${level}`, total));
      setDone(true);
      mapRef.current?.reset();
      return;
    }
    setIdx(idx + 1); setWrong([]); setHints(0); setState('ask');
    mapRef.current?.reset();
  };

  const fillFor = useCallback((s: MapShape) => (s.props.listed ? POLITICAL[(s.props.mc ?? 1) % POLITICAL.length] : UNLISTED), []);
  const classFor = useCallback((s: MapShape) => {
    if (done) {
      const r = results.find((x) => x.q.target.id === s.id);
      if (!r) return undefined;
      return r.revealed ? 'res-miss' : r.wrong.length ? 'res-late' : 'res-first';
    }
    if (!q) return undefined;
    if (s.id === q.target.id && state !== 'ask') return state === 'right' ? 'pick-right' : 'pick-reveal';
    if (wrong.includes(s.id)) return 'pick-wrong';
    return undefined;
  }, [q, wrong, state, done, results]);

  // 문제를 푸는 동안에는 나라 이름이 보이지 않게 한다 (답을 고른 뒤에만 이름 표시)
  const tooltip = useCallback((s: MapShape) => {
    const c = ds.country(s.id);
    if (!done && state === 'ask' && !wrong.includes(s.id)) return null;
    return <div className="tip"><strong>{c?.name_ko ?? s.props.ne_name_ko}</strong></div>;
  }, [ds, done, state, wrong]);

  const total = results.reduce((s, r) => s + r.points, 0);

  if (!level) {
    return (
      <div className="page game">
        <header className="page-head">
          <p className="kicker">GAME 01</p>
          <h1>세계지도 챌린지</h1>
          <p className="lede">문제로 나온 나라를 지도에서 찾아 누르세요. 한 번에 맞히면 10점, 두 번째 6점, 세 번째 3점입니다. 세 번 틀리면 정답을 보여 줍니다.</p>
        </header>
        <div className="levels">
          {LEVELS.map((l) => (
            <button key={l.id} type="button" className="level" onClick={() => start(l.id)}>
              <strong>{l.name}</strong>
              <span>{l.desc}</span>
              <small>최고 기록 {j.games[`map:${l.id}`]?.best ?? '–'}점</small>
            </button>
          ))}
        </div>
        <p className="muted small">키보드: 지도를 선택한 뒤 화살표로 나라를 옮기고 Enter 로 고릅니다. +, − 로 확대·축소합니다.</p>
      </div>
    );
  }

  const target = q?.target;
  const lastWrong = wrong.length ? ds.country(wrong[wrong.length - 1]) : undefined;
  const levelName = LEVELS.find((l) => l.id === level)!.name;

  return (
    <div className="page game game--map">
      <div className="game-bar">
        <span className="gb-title">세계지도 챌린지 · {levelName}</span>
        {!done && <span className="gb-prog">{idx + 1} / {qs.length}</span>}
        <span className="gb-score">{total}점</span>
      </div>

      {!done && q && (
        <div className="prompt" aria-live="polite">
          <p className="prompt-q">{q.prompt}</p>
          {state === 'ask' && (
            <>
              {lastWrong && <p className="fb fb-wrong">그곳은 {lastWrong.name_ko}입니다. 다시 찾아보세요. ({MAX_WRONG - wrong.length}번 남음)</p>}
              {hints > 0 && <p className="fb fb-hint">힌트: {mapHint(ds, q.target, hints)}</p>}
              <div className="prompt-tools">
                <button type="button" className="tab" onClick={() => mapRef.current?.zoomToContinent(q.target.continent)}>{continentName(q.target.continent)} 확대</button>
                {wrong.length > 0 && hints < 2 && <button type="button" className="tab" onClick={() => setHints(hints + 1)}>힌트 보기</button>}
              </div>
            </>
          )}
          {state !== 'ask' && target && (
            <div className={`fb ${state === 'right' ? 'fb-right' : 'fb-reveal'}`}>
              <p>
                <Flag iso2={target.iso2} />
                <strong>{state === 'right' ? '정답! ' : '정답은 여기예요. '}</strong>
                {target.name_ko}{josa(target.name_ko, '은는').slice(target.name_ko.length)} {target.region_ko}에 있는 나라로, {target.borders.length ? `${target.borders.map((b) => ds.country(b)?.name_ko).join('·')}${josa(ds.country(target.borders[target.borders.length - 1])?.name_ko ?? '', '과와').slice(-1)} 이웃해 있습니다.` : '땅으로 맞닿은 이웃 나라가 없습니다.'}
                {' '}수도는 {target.capital_ko[0]}입니다.
              </p>
              <p className="fb-actions">
                <a href={`#/country/${target.id}`} target="_blank" rel="noreferrer">{target.name_ko} 도감 (새 탭)</a>
                <button type="button" className="btn" onClick={next}>{idx + 1 >= qs.length ? '결과 보기' : '다음 문제'}</button>
              </p>
            </div>
          )}
        </div>
      )}

      {done && (
        <section className="results" aria-live="polite">
          <h2>{total}점 <small>/ {qs.length * 10}점</small>{newBest && <span className="stamp">최고 기록</span>}</h2>
          <p className="muted">초록은 한 번에, 황토는 여러 번 만에 찾은 나라, 붉은색은 정답을 본 나라입니다.</p>
          <ol className="res-list">
            {results.map((r) => (
              <li key={r.q.target.id} className={r.revealed ? 'miss' : r.wrong.length ? 'late' : 'first'}>
                <button type="button" className="linkish" onClick={() => { setReview(r.q.target.id); mapRef.current?.zoomToCountry(r.q.target.id); }}>
                  {r.q.target.name_ko}
                </button>
                <span>{r.revealed ? '정답 확인' : r.wrong.length ? `${r.wrong.length + 1}번 만에` : '한 번에'} · {r.points}점</span>
                {r.wrong.length > 0 && <small>고른 곳: {r.wrong.map((w) => ds.country(w)?.name_ko).join(', ')}</small>}
                <a href={`#/country/${r.q.target.id}`}>도감</a>
              </li>
            ))}
          </ol>
          <p className="fb-actions">
            <button type="button" className="btn" onClick={() => start(level)}>다시 하기</button>
            <button type="button" className="tab" onClick={() => setLevel(null)}>단계 고르기</button>
            <a href="#/play">도전하기 처음으로</a>
          </p>
        </section>
      )}

      <div className="game-map">
        <WorldMap
          ref={mapRef}
          geo={geo}
          fillFor={fillFor}
          classFor={classFor}
          selected={done ? review : null}
          onSelect={onPick}
          tooltip={tooltip}
          ariaLabel="세계지도 챌린지 지도. 화살표 키로 나라를 옮기고 Enter 로 고릅니다."
          announce={(s) => ds.country(s.id)?.region_ko ?? ''}
        />
        <div className="zoom-ctl" role="group" aria-label="지도 확대·축소">
          <button type="button" onClick={() => mapRef.current?.zoomBy(1.8)} aria-label="확대">+</button>
          <button type="button" onClick={() => mapRef.current?.zoomBy(1 / 1.8)} aria-label="축소">−</button>
          <button type="button" onClick={() => mapRef.current?.reset()} aria-label="세계 전체 보기" className="zc-reset">전체</button>
        </div>
      </div>
    </div>
  );
}

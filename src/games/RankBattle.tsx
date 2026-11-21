import { useState } from 'react';
import { useData } from '../App';
import { battleExplain, battleQuestions, BIGGER, type BattleQuestion } from './questions';
import { josa } from '../data/format';
import { journal, useJournal } from '../store/journal';
import { Flag } from '../components/common';

interface Result { q: BattleQuestion; picked: string; right: boolean }

export function RankBattle() {
  const { ds } = useData();
  const j = useJournal();
  const [qs, setQs] = useState<BattleQuestion[]>(() => battleQuestions(ds, Math.random));
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [done, setDone] = useState(false);
  const [newBest, setNewBest] = useState(false);
  const [started, setStarted] = useState(false);

  const q = qs[idx];
  const score = results.filter((r) => r.right).length * 10;

  const pick = (id: string) => {
    if (picked) return;
    setPicked(id);
    const right = id === q.answer;
    setResults((r) => [...r, { q, picked: id, right }]);
    if (right) journal.practiceTopic(q.indicator);
  };
  const next = () => {
    if (idx + 1 >= qs.length) {
      setNewBest(journal.recordGame('battle', score));
      setDone(true);
      return;
    }
    setIdx(idx + 1);
    setPicked(null);
  };
  const restart = () => {
    setQs(battleQuestions(ds, Math.random));
    setIdx(0); setPicked(null); setResults([]); setDone(false); setStarted(true);
  };

  if (!started) {
    return (
      <div className="page game">
        <header className="page-head">
          <p className="kicker">GAME 02</p>
          <h1>세계 랭킹 배틀</h1>
          <p className="lede">두 나라 가운데 값이 더 큰 나라를 고르세요. 모든 문제는 World Bank 통계의 같은 기준연도 값으로 만듭니다. 한 문제 10점, 모두 10문제입니다.</p>
        </header>
        <button type="button" className="btn btn-lg" onClick={() => setStarted(true)}>시작하기</button>
        <p className="muted small">최고 기록 {j.games['battle']?.best ?? '–'}점</p>
      </div>
    );
  }

  if (done) {
    const wrong = results.filter((r) => !r.right);
    const countries = [...new Map(results.flatMap((r) => [r.q.a, r.q.b]).map((c) => [c.id, c])).values()];
    const topics = [...new Set(results.map((r) => ds.indicator(r.q.indicator).name_ko))];
    return (
      <div className="page game">
        <section className="results">
          <h1>{score}점 <small>/ {qs.length * 10}점</small>{newBest && <span className="stamp">최고 기록</span>}</h1>
          <p>이번 판에서 만난 지표: {topics.join(', ')}</p>
          {wrong.length > 0 ? (
            <>
              <h2>틀린 문제 다시 보기</h2>
              <ol className="res-list battle-review">
                {wrong.map((r) => <ReviewItem key={r.q.key} r={r} />)}
              </ol>
            </>
          ) : <p>모두 맞혔어요.</p>}
          <h2>이번 판의 나라</h2>
          <p className="country-chips">{countries.map((c) => <a key={c.id} href={`#/country/${c.id}`}><Flag iso2={c.iso2} size="sm" />{c.name_ko}</a>)}</p>
          <p className="fb-actions">
            <button type="button" className="btn" onClick={restart}>다시 하기</button>
            <a href="#/play">도전하기 처음으로</a>
          </p>
        </section>
      </div>
    );
  }

  if (!q) return <div className="page"><p>문제를 만들 수 없습니다.</p></div>;
  const ex = battleExplain(ds, q);
  const ind = ds.indicator(q.indicator);
  const maxV = Math.max(q.va, q.vb);

  return (
    <div className="page game game--battle">
      <div className="game-bar">
        <span className="gb-title">세계 랭킹 배틀</span>
        <span className="gb-prog">{idx + 1} / {qs.length}</span>
        <span className="gb-score">{score}점</span>
      </div>
      <h2 className="battle-q">{q.prompt}</h2>
      <div className="duel">
        {[{ c: q.a, v: q.va, t: ex.a }, { c: q.b, v: q.vb, t: ex.b }].map(({ c, v, t }) => {
          const isAns = c.id === q.answer;
          const cls = picked ? (isAns ? 'is-answer' : picked === c.id ? 'is-wrong' : 'is-other') : '';
          return (
            <button key={c.id} type="button" className={`side ${cls}`} onClick={() => pick(c.id)} disabled={!!picked} aria-describedby={picked ? `v-${c.id}` : undefined}>
              <Flag iso2={c.iso2} size="lg" />
              <span className="side-name">{c.name_ko}</span>
              <span className="side-en">{c.name_en}</span>
              {picked && (
                <span className="side-val" id={`v-${c.id}`}>
                  <b>{t}</b>
                  <span className="side-bar"><i style={{ width: `${(v / maxV) * 100}%` }} /></span>
                </span>
              )}
            </button>
          );
        })}
      </div>
      {picked && (
        <div className={`fb ${picked === q.answer ? 'fb-right' : 'fb-wrong'}`} aria-live="polite">
          <p><strong>{picked === q.answer ? '정답!' : '아쉬워요.'}</strong> {ds.country(q.answer)?.name_ko}의 {josa(ind.name_ko, '이가')} {ex.ratio >= 1.95 ? `약 ${ex.ratio >= 10 ? Math.round(ex.ratio).toLocaleString('ko-KR') : ex.ratio.toFixed(1)}배` : '더'} {BIGGER[q.indicator]}. <small>({q.year}년, World Bank)</small></p>
          <p className="concept">{ex.concept}</p>
          <p className="fb-actions">
            <a href={`#/rankings/${q.indicator}/${q.answer}`} target="_blank" rel="noreferrer">{ind.name_ko} 세계 랭킹 (새 탭)</a>
            <button type="button" className="btn" onClick={next} autoFocus>{idx + 1 >= qs.length ? '결과 보기' : '다음 문제'}</button>
          </p>
        </div>
      )}
    </div>
  );
}

function ReviewItem({ r }: { r: Result }) {
  const { ds } = useData();
  const ex = battleExplain(ds, r.q);
  return (
    <li className="miss">
      <p className="rv-q">{r.q.prompt}</p>
      <p>정답 <b>{ds.country(r.q.answer)?.name_ko}</b> · {r.q.a.name_ko} {ex.a} / {r.q.b.name_ko} {ex.b} <small>({r.q.year}년)</small></p>
      <p className="concept">{ex.concept}</p>
      <p><a href={`#/country/${r.q.a.id}`}>{r.q.a.name_ko} 도감</a> · <a href={`#/country/${r.q.b.id}`}>{r.q.b.name_ko} 도감</a></p>
    </li>
  );
}

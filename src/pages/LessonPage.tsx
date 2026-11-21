import { useMemo, useState } from 'react';
import { useData } from '../App';
import { LESSONS } from '../content/lessons';
import { journal, useJournal } from '../store/journal';
import { Flag } from '../components/common';
import { fmtValue } from '../data/format';
import type { IndicatorId } from '../data/types';
import { BOARDS } from './RankingsPage';

export function LessonPage({ id }: { id?: string }) {
  const { ds } = useData();
  const j = useJournal();
  const lesson = LESSONS.find((l) => l.id === id);
  const [seed, setSeed] = useState(1);
  const [picked, setPicked] = useState<string | null>(null);
  const body = useMemo(() => (lesson ? lesson.body(ds) : []), [lesson, ds]);
  const check = useMemo(() => (lesson ? lesson.check(ds, Math.random) : undefined), [lesson, ds, seed]);
  if (!lesson) return <div className="page"><p>탐구 노트를 찾을 수 없습니다. <a href="#/play">목록으로</a></p></div>;
  const i = LESSONS.indexOf(lesson);
  const next = LESSONS[(i + 1) % LESSONS.length];
  const right = !!picked && !!check && picked === check.answer;

  return (
    <div className="page lesson">
      <nav className="book-nav"><a href="#/play">← 탐구 노트</a><span className="muted">{lesson.field}</span></nav>
      <article>
        <h1 className="lesson-q">{lesson.question}</h1>
        <div className="lesson-body">{body.map((p, k) => <p key={k}>{p}</p>)}</div>

        {lesson.compare && <CompareTables a={lesson.compare[0]} b={lesson.compare[1]} />}

        {check && (
          <section className="check check--lesson">
            <h2>확인 문제</h2>
            <p className="check-q">{check.prompt}</p>
            <div className="check-opts">
              {check.options.map((o) => (
                <button key={o.id} type="button" disabled={!!picked}
                  className={`opt ${picked && o.id === check.answer ? 'right' : picked === o.id ? 'wrong' : ''}`}
                  onClick={() => { setPicked(o.id); if (o.id === check.answer) journal.readLesson(lesson.id); }}>
                  {o.label}
                </button>
              ))}
            </div>
            {picked && (
              <p className="check-res" role="status">
                {right ? '맞아요. 탐험일지에 이 탐구 노트를 완료로 기록했어요. ' : '아쉬워요. 정답을 확인하고 다른 문제에 도전해 보세요. '}
                {check.explain}
              </p>
            )}
            {picked && <button type="button" className="tab" onClick={() => { setPicked(null); setSeed(seed + 1); }}>다른 문제</button>}
          </section>
        )}

        <footer className="lesson-foot">
          {j.lessons[lesson.id] && <span className="stamp">완료</span>}
          {lesson.indicators.map((iid) => <a key={iid} href={`#/rankings/${iid}`}>{ds.indicator(iid).name_ko} 세계 랭킹</a>)}
          <a href="#/play/battle">세계 랭킹 배틀</a>
          <a href={`#/lesson/${next.id}`}>다음 노트: {next.question}</a>
        </footer>
      </article>
    </div>
  );
}

function CompareTables({ a, b }: { a: IndicatorId; b: IndicatorId }) {
  const { ds } = useData();
  const ra = ds.rankingDir(a, BOARDS.find((x) => x.id === a)?.defaultDir ?? 'desc').rows.slice(0, 10);
  const rb = ds.rankingDir(b, BOARDS.find((x) => x.id === b)?.defaultDir ?? 'desc').rows.slice(0, 10);
  const inB = new Set(rb.map((r) => r.country.id));
  const inA = new Set(ra.map((r) => r.country.id));
  const col = (iid: IndicatorId, rows: typeof ra, other: Set<string>) => {
    const ind = ds.indicator(iid);
    return (
      <div className="cmp-col">
        <h3>{ind.name_ko} 상위 10 <small>{ind.ref_year}년</small></h3>
        <ol>
          {rows.map((r) => (
            <li key={r.country.id} className={other.has(r.country.id) ? 'shared' : ''}>
              <span className="rk-rank">{r.rank}</span>
              <Flag iso2={r.country.iso2} size="sm" />
              <a href={`#/country/${r.country.id}`}>{r.country.name_ko}</a>
              <span className="rk-val">{fmtValue(ind, r.value, { short: true })}</span>
            </li>
          ))}
        </ol>
      </div>
    );
  };
  return (
    <section className="cmp" aria-label="두 순위표 비교">
      <h2>직접 비교하기</h2>
      <p className="muted small">양쪽 순위표에 모두 있는 나라는 밑줄로 표시했습니다.</p>
      <div className="cmp-cols">{col(a, ra, inB)}{col(b, rb, inA)}</div>
    </section>
  );
}

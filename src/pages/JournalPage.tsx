import { useCallback, useState } from 'react';
import { useData } from '../App';
import { journal, storageAvailable, useJournal } from '../store/journal';
import { WorldMap } from '../map/WorldMap';
import type { MapShape } from '../map/geo';
import { CONTINENTS } from '../data/types';
import { Flag } from '../components/common';
import { LESSONS } from '../content/lessons';
import { ALL_STORIES as STORIES } from '../content/stories';
import { LEVELS } from '../games/questions';
import { CAMPAIGNS } from '../explorer/campaigns';

export function JournalPage() {
  const { ds, geo } = useData();
  const j = useJournal();
  const [confirm, setConfirm] = useState(false);
  const visited = Object.keys(j.visited).filter((id) => ds.country(id));
  const learned = Object.keys(j.learned).filter((id) => ds.country(id));
  const pct = Math.round((visited.length / ds.countries.length) * 1000) / 10;

  const fillFor = useCallback((s: MapShape) => {
    if (!s.props.listed) return 'var(--j-unlisted)';
    if (j.learned[s.id]) return 'var(--j-learned)';
    if (j.visited[s.id]) return 'var(--j-visited)';
    return 'var(--j-none)';
  }, [j]);
  const tooltip = useCallback((s: MapShape) => {
    const c = ds.country(s.id);
    if (!c) return null;
    return <div className="tip"><strong>{c.name_ko}</strong><p className="tip-note">{j.learned[c.id] ? `학습 완료 ${j.learned[c.id].at}` : j.visited[c.id] ? `방문 ${j.visited[c.id]}` : '아직 가 보지 않은 나라'}</p></div>;
  }, [ds, j]);

  const topics = Object.entries(j.topics).sort((a, b) => b[1] - a[1]);

  return (
    <div className="page journal">
      <header className="page-head">
        <h1>나의 탐험일지</h1>
        <p className="lede">
          <span className="big-num">{visited.length}</span> / {ds.countries.length}개국 방문 ({pct}%)
          <span className="sep">·</span> 학습 완료 <b>{learned.length}</b>개국
        </p>
      </header>

      <div className="journal-map">
        <WorldMap geo={geo} fillFor={fillFor} tooltip={tooltip} onSelect={(id) => (window.location.hash = `#/country/${id}`)} ariaLabel="탐험 지도: 방문한 나라와 학습한 나라" />
        <p className="j-key"><i className="k-l" />학습 완료 <i className="k-v" />방문 <i className="k-n" />아직</p>
      </div>

      <div className="journal-cols">
        <section>
          <h2>대륙별 탐험</h2>
          <table className="j-table">
            <thead><tr><th scope="col">대륙</th><th scope="col">방문</th><th scope="col">학습</th></tr></thead>
            <tbody>
              {CONTINENTS.map((c) => {
                const all = ds.countries.filter((x) => x.continent === c.id);
                return (
                  <tr key={c.id}>
                    <th scope="row">{c.name}</th>
                    <td>{all.filter((x) => j.visited[x.id]).length} / {all.length}</td>
                    <td>{all.filter((x) => j.learned[x.id]).length}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="muted small">나라 도감을 열면 '방문', 그 나라의 확인 문제나 세계지도 챌린지 문제를 맞히면 '학습 완료'로 기록됩니다.</p>
        </section>

        <section>
          <h2>최근 방문한 나라</h2>
          {j.recent.length ? (
            <ul className="recent">
              {j.recent.filter((id) => ds.country(id)).map((id) => {
                const c = ds.country(id)!;
                return <li key={id}><a href={`#/country/${id}`}><Flag iso2={c.iso2} size="sm" />{c.name_ko}</a>{j.learned[id] && <span className="read-mark">학습</span>}</li>;
              })}
            </ul>
          ) : <p className="muted">아직 방문한 나라가 없습니다. <a href="#/">세계지도</a>에서 나라를 눌러 보세요.</p>}
        </section>

        <section>
          <h2>게임 최고 기록</h2>
          <dl className="records">
            {LEVELS.map((l) => (
              <div key={l.id}><dt>세계지도 챌린지 {l.name}</dt><dd>{j.games[`map:${l.id}`] ? `${j.games[`map:${l.id}`].best}점 (${j.games[`map:${l.id}`].plays}판)` : '–'}</dd></div>
            ))}
            <div><dt>세계 랭킹 배틀</dt><dd>{j.games.battle ? `${j.games.battle.best}점 (${j.games.battle.plays}판)` : '–'}</dd></div>
          </dl>
        </section>

        <section>
          <h2>세계 탐험가</h2>
          {Object.keys(j.explorer.campaigns).length || j.explorer.save ? (
            <dl className="records">
              {CAMPAIGNS.map((c) => { const r = j.explorer.campaigns[c.id]; return (
                <div key={c.id}><dt>{c.title}</dt><dd>{r ? `최고 ${r.best}점 · 결말 ${r.endings.length}/${c.endings.length} · 임무 ${r.missionsDone.length}개 · 마지막 경로 ${r.lastPath.join('→') || '—'}` : '–'}</dd></div>
              ); })}
              {j.explorer.save ? <div><dt>진행 중</dt><dd>{CAMPAIGNS.find((c) => c.id === (j.explorer.save as { campaign: string }).campaign)?.title} · 자금 {(j.explorer.save as { funds: number }).funds} · {(j.explorer.save as { days: number }).days}일</dd></div> : null}
              <div><dt>게임에서 찾아낸 나라</dt><dd>{j.explorer.discovered.map((id) => ds.country(id)?.name_ko).join(', ') || '–'}</dd></div>
              <div><dt>확보한 조사 자료</dt><dd>{j.explorer.evidence.length}개</dd></div>
            </dl>
          ) : <p className="muted">아직 탐험을 떠나지 않았습니다. <a href="#/explorer">세계 탐험가</a></p>}
        </section>

        <section>
          <h2>배운 주제</h2>
          <ul className="topic-list">
            {LESSONS.filter((l) => j.lessons[l.id]).map((l) => <li key={l.id}><a href={`#/lesson/${l.id}`}>{l.question}</a> <small>탐구 노트</small></li>)}
            {STORIES.filter((s) => j.stories[s.id]).map((s) => <li key={s.id}><a href={`#/country/${s.country}`}>{s.question}</a> <small>{ds.country(s.country)?.name_ko} 이야기 · 읽음</small></li>)}
            {topics.map(([iid, n]) => <li key={iid}>{ds.indicatorById.get(iid as never)?.name_ko} <small>배틀 정답 {n}회</small></li>)}
          </ul>
          {!Object.keys(j.lessons).length && !Object.keys(j.stories).length && !topics.length && <p className="muted">탐구 노트와 나라 이야기를 읽고, 배틀에서 정답을 맞히면 여기에 쌓입니다.</p>}
        </section>
      </div>

      <footer className="journal-foot">
        <p className="muted small">
          탐험일지는 로그인 없이 이 브라우저에만 저장됩니다. 브라우저 방문 기록·사이트 데이터를 지우거나 다른 기기에서 열면 기록이 보이지 않습니다.
          {!storageAvailable && ' 지금 브라우저는 저장소를 쓸 수 없어 이번 방문의 기록이 창을 닫으면 사라집니다.'}
        </p>
        {confirm ? (
          <p>기록을 모두 지울까요? <button type="button" className="btn" onClick={() => { journal.reset(); setConfirm(false); }}>지우기</button> <button type="button" className="tab" onClick={() => setConfirm(false)}>그만두기</button></p>
        ) : <button type="button" className="tab" onClick={() => setConfirm(true)}>기록 초기화</button>}
      </footer>
    </div>
  );
}

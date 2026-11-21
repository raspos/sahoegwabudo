import { MapChallenge } from '../games/MapChallenge';
import { RankBattle } from '../games/RankBattle';
import { LESSONS, FIELD_ORDER } from '../content/lessons';
import { useJournal } from '../store/journal';
import { LEVELS } from '../games/questions';

export function PlayPage({ game }: { game?: string }) {
  if (game === 'map') return <MapChallenge />;
  if (game === 'battle') return <RankBattle />;
  return <PlayHub />;
}

function PlayHub() {
  const j = useJournal();
  return (
    <div className="page play-hub">
      <header className="page-head">
        <h1>도전하기</h1>
        <p className="lede">지도와 숫자로 익힌 것을 확인해 보세요. 한 판은 10문제입니다.</p>
      </header>
      <div className="games">
        <a className="game-entry" href="#/play/map">
          <span className="ge-no">GAME 01</span>
          <h2>세계지도 챌린지</h2>
          <p>문제로 나온 나라를 지도에서 찾아 누르세요. 작은 나라는 지도 위 동그라미로 표시됩니다.</p>
          <p className="ge-best">{LEVELS.map((l) => `${l.name} ${j.games[`map:${l.id}`]?.best ?? '–'}`).join(' · ')}점</p>
        </a>
        <a className="game-entry" href="#/play/battle">
          <span className="ge-no">GAME 02</span>
          <h2>세계 랭킹 배틀</h2>
          <p>두 나라 가운데 인구·면적·기대수명 같은 값이 더 큰 나라를 고르세요. 답을 고르면 실제 숫자가 공개됩니다.</p>
          <p className="ge-best">최고 기록 {j.games['battle']?.best ?? '–'}점</p>
        </a>
      </div>
      <section className="lesson-list">
        <h2>탐구 노트</h2>
        <p className="muted">질문을 읽고 두 순위표를 직접 비교한 뒤, 확인 문제를 풀어 보세요.</p>
        {FIELD_ORDER.map((f) => (
          <div key={f} className="lesson-field">
            <h3>{f}</h3>
            <ol>
              {LESSONS.filter((l) => l.field === f).map((l) => (
                <li key={l.id}>
                  <a href={`#/lesson/${l.id}`}>{l.question}</a>
                  {j.lessons[l.id] && <span className="read-mark">완료</span>}
                </li>
              ))}
            </ol>
          </div>
        ))}
      </section>
    </div>
  );
}

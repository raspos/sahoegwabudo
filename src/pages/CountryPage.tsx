import { useEffect } from 'react';
import { go, useData } from '../App';
import { Dossier } from './Dossier';
import { journal } from '../store/journal';

export function CountryPage({ id }: { id: string }) {
  const { ds } = useData();
  const c = ds.country(id);
  useEffect(() => {
    if (c) journal.visit(c.id);
    if (c) document.title = `${c.name_ko} · 사회과부도`;
    return () => { document.title = '사회과부도'; };
  }, [c]);
  if (!c) return <div className="page"><p>찾는 나라가 없습니다. <a href="#/atlas">나라 도감 목록</a></p></div>;
  // 같은 대륙 안에서 가나다순 앞뒤 나라
  const same = ds.countries.filter((x) => x.continent === c.continent).sort((a, b) => a.name_ko.localeCompare(b.name_ko, 'ko'));
  const i = same.findIndex((x) => x.id === c.id);
  const prev = same[(i - 1 + same.length) % same.length], next = same[(i + 1) % same.length];
  return (
    <div className="page page--book">
      <nav className="book-nav" aria-label="도감 넘기기">
        <a href="#/atlas">← 찾아보기</a>
        <span>
          <a href={`#/country/${prev.id}`}>‹ {prev.name_ko}</a>
          <a href={`#/country/${next.id}`}>{next.name_ko} ›</a>
        </span>
        <button type="button" className="btn-text" onClick={() => go(`map/${c.id}`)}>지도에서 보기</button>
      </nav>
      <Dossier id={c.id} />
    </div>
  );
}

import { useMemo, useState } from 'react';
import { go, useData } from '../App';
import { CountrySearch, Flag } from '../components/common';
import { CONTINENTS, type ContinentId } from '../data/types';
import { initials } from '../data/search';
import { STORY_COUNTRIES } from '../content/stories';
import { useJournal } from '../store/journal';

/** 나라 도감 찾아보기: 대륙별·가나다순 색인 */
export function AtlasIndex() {
  const { ds } = useData();
  const j = useJournal();
  const [cont, setCont] = useState<ContinentId | 'all'>('all');
  const groups = useMemo(() => {
    const list = ds.countries.filter((c) => cont === 'all' || c.continent === cont)
      .sort((a, b) => a.name_ko.localeCompare(b.name_ko, 'ko'));
    const by = new Map<string, typeof list>();
    for (const c of list) {
      const k = initials(c.name_ko[0]);
      const key = ['ㄲ', 'ㄸ', 'ㅃ', 'ㅆ', 'ㅉ'].includes(k) ? ({ ㄲ: 'ㄱ', ㄸ: 'ㄷ', ㅃ: 'ㅂ', ㅆ: 'ㅅ', ㅉ: 'ㅈ' } as Record<string, string>)[k] : k;
      by.set(key, [...(by.get(key) ?? []), c]);
    }
    return [...by.entries()];
  }, [ds, cont]);
  const total = groups.reduce((s, [, l]) => s + l.length, 0);

  return (
    <div className="page atlas-index">
      <header className="page-head">
        <h1>나라 도감</h1>
        <p className="lede">유엔 회원국 193개국과 옵서버 국가 2곳, 모두 {ds.countries.length}개국의 도감입니다.</p>
        <div className="index-tools">
          <CountrySearch countries={ds.countries} onPick={(c) => go(`country/${c.id}`)} placeholder="나라 이름으로 바로 펼치기" />
          <div className="cr-row" role="radiogroup" aria-label="대륙">
            <button type="button" role="radio" aria-checked={cont === 'all'} className={`tab ${cont === 'all' ? 'on' : ''}`} onClick={() => setCont('all')}>전체</button>
            {CONTINENTS.map((c) => (
              <button key={c.id} type="button" role="radio" aria-checked={cont === c.id} className={`tab ${cont === c.id ? 'on' : ''}`} onClick={() => setCont(c.id)}>{c.name}</button>
            ))}
          </div>
        </div>
      </header>
      <p className="index-count">{total}개국 · <span className="key-story">이야기</span> 표시는 나라 이야기가 있는 도감</p>
      <div className="index-cols">
        {groups.map(([k, list]) => (
          <section key={k} className="index-group">
            <h2>{k}</h2>
            <ul>
              {list.map((c) => (
                <li key={c.id} className={j.learned[c.id] ? 'is-learned' : j.visited[c.id] ? 'is-visited' : ''}>
                  <a href={`#/country/${c.id}`}>
                    <Flag iso2={c.iso2} size="sm" />
                    <span className="ix-name">{c.name_ko}</span>
                    {STORY_COUNTRIES.includes(c.id) && <span className="key-story">이야기</span>}
                    <span className="ix-en">{c.name_en}</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

import { createContext, useContext, useEffect, useState } from 'react';
import { loadDataset, type Dataset } from './data/engine';
import { loadGeo, type Geo } from './map/geo';
import { MapPage } from './pages/MapPage';
import { AtlasIndex } from './pages/AtlasIndex';
import { CountryPage } from './pages/CountryPage';
import { RankingsPage } from './pages/RankingsPage';
import { PlayPage } from './pages/PlayPage';
import { JournalPage } from './pages/JournalPage';
import { LessonPage } from './pages/LessonPage';
import { ViewCount } from './components/ViewCount';

interface Ctx { ds: Dataset; geo: Geo }
const DataCtx = createContext<Ctx | null>(null);
export const useData = () => {
  const c = useContext(DataCtx);
  if (!c) throw new Error('data not loaded');
  return c;
};

/** 해시 라우터: GitHub Pages 에서 새로고침·직접 링크가 모두 동작하도록 #/경로 를 쓴다 */
export function useRoute(): string[] {
  const read = () => decodeURIComponent(window.location.hash.replace(/^#\/?/, '')).split('/').filter(Boolean);
  const [r, setR] = useState(read);
  useEffect(() => {
    const on = () => setR(read());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return r;
}

export const go = (path: string, replace = false) => {
  const h = '#/' + path.replace(/^\//, '');
  if (replace) window.history.replaceState(null, '', h), window.dispatchEvent(new HashChangeEvent('hashchange'));
  else window.location.hash = h;
};

const NAV = [
  { path: '', match: ['', 'map'], label: '세계지도' },
  { path: 'atlas', match: ['atlas', 'country'], label: '나라 도감' },
  { path: 'rankings', match: ['rankings'], label: '세계 랭킹' },
  { path: 'play', match: ['play', 'lesson'], label: '도전하기' },
  { path: 'journal', match: ['journal'], label: '나의 탐험일지', short: '탐험일지' },
];

export function App() {
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const route = useRoute();
  const base = import.meta.env.BASE_URL;

  useEffect(() => {
    Promise.all([loadDataset(base), loadGeo(base)])
      .then(([ds, geo]) => setCtx({ ds, geo }))
      .catch((e) => setErr(String(e)));
  }, [base]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route[0]]);

  const head = route[0] ?? '';
  let page: JSX.Element | null = null;
  if (ctx) {
    if (head === '' || head === 'map') page = <MapPage countryId={route[1]} />;
    else if (head === 'atlas') page = <AtlasIndex />;
    else if (head === 'country' && route[1]) page = <CountryPage id={route[1]} />;
    else if (head === 'rankings') page = <RankingsPage indicatorId={route[1]} focus={route[2]} />;
    else if (head === 'play') page = <PlayPage game={route[1]} />;
    else if (head === 'lesson') page = <LessonPage id={route[1]} />;
    else if (head === 'journal') page = <JournalPage />;
    else page = <MapPage />;
  }

  return (
    <div className={`app ${head === '' || head === 'map' ? 'app--map' : ''}`}>
      <header className="masthead">
        <a className="brand" href="#/">
          <span className="brand-name">사회과부도</span>
          <span className="brand-motto">세계를 펼치다. 숫자로 발견하다.</span>
        </a>
        <nav className="mainnav" aria-label="주 메뉴">
          {NAV.map((n) => (
            <a key={n.label} href={`#/${n.path}`} aria-current={n.match.includes(head) ? 'page' : undefined}>
              {'short' in n ? <><span className="nav-long">{n.label}</span><span className="nav-short">{n.short}</span></> : n.label}
            </a>
          ))}
        </nav>
      </header>
      <main id="main">
        {err && <p className="load-error">자료를 불러오지 못했습니다. 잠시 뒤 다시 열어 주세요. ({err})</p>}
        {!ctx && !err && <p className="loading">지도를 펼치는 중…</p>}
        {ctx && <DataCtx.Provider value={ctx}>{page}</DataCtx.Provider>}
      </main>
      {head !== '' && head !== 'map' && !(head === 'play' && route[1] === 'explorer') && (
        <footer className="site-foot">
          © 2026 <a href="https://raspos.github.io/databrew/" target="_blank" rel="noopener noreferrer">databrew</a> · 독립 데이터저널리즘 프로젝트<ViewCount />
        </footer>
      )}
    </div>
  );
}

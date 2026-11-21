import { useMemo, useState } from 'react';
import { go, useData } from '../App';
import { Flag } from '../components/common';
import { continentName, type Country, type IndicatorId } from '../data/types';
import { fmtValue, josa } from '../data/format';
import { storiesFor } from '../content/stories';
import { useStoryDocs } from '../content/storyStore';
import { StoriesSection, storiesForCountry } from './StoriesSection';
import { lessonsFor } from '../content/lessons';
import { journal, useJournal } from '../store/journal';
import { shuffle, seeded } from '../games/questions';
import type { Dataset } from '../data/engine';
import type { Geo } from '../map/geo';
import { MAP_W } from '../map/geo';
import { POLITICAL, UNLISTED } from '../data/scales';
import { useExtras } from '../data/extras';
import { EconomySection } from './EconomySection';
import { NatureSection } from './NatureSection';

const HEADLINE: IndicatorId[] = ['population', 'area', 'gdp', 'gdp_pc'];
const ALL: IndicatorId[] = ['population', 'area', 'density', 'gdp', 'gdp_pc', 'gdp_growth', 'inflation', 'fertility', 'life_exp', 'urban', 'manufacturing', 'internet'];

export function Dossier({ id, compact, onClose }: { id: string; compact?: boolean; onClose?: () => void }) {
  const { ds, geo } = useData();
  const c = ds.country(id);
  const j = useJournal();
  const ex = useExtras();
  const docs = useStoryDocs();
  if (!c) return <p className="empty">이 나라를 찾을 수 없습니다.</p>;
  const stories = storiesFor(c.id);
  const learned = j.learned[c.id];

  return (
    <article className={`dossier ${compact ? 'dossier--compact' : 'dossier--full'}`} aria-labelledby={`dz-${c.id}`}>
      <header className="dz-head">
        <div className="dz-flag"><Flag iso2={c.iso2} size="lg" title={`${c.name_ko} 국기`} /></div>
        <div className="dz-title">
          <p className="dz-kicker">{continentName(c.continent)}{c.region_ko !== continentName(c.continent) && <> · {c.region_ko}</>}</p>
          <h1 id={`dz-${c.id}`}>{c.name_ko}</h1>
          <p className="dz-en">{c.name_en}{c.official_ko !== c.name_ko && <> · {c.official_ko}</>}</p>
          {c.status === 'observer' && <p className="dz-status">유엔 비회원 옵서버 국가</p>}
        </div>
        <div className="dz-actions">
          {learned ? <span className="stamp" title={`${learned.at} 학습 완료`}>학습 완료</span> : j.visited[c.id] ? <span className="stamp stamp--light">방문</span> : null}
          {compact && <a className="btn-text" href={`#/country/${c.id}`}>펼쳐 읽기</a>}
          {onClose && <button type="button" className="btn-close" onClick={onClose} aria-label="도감 닫기">×</button>}
        </div>
      </header>

      <div className="dz-body">
        <section className="dz-sec dz-where">
          <h2><span className="no">1</span>어디에 있을까?</h2>
          <Locator geo={geo} ds={ds} c={c} />
          <p className="dz-neighbors">
            {c.borders.length ? (
              <>이웃 나라 {c.borders.map((b, i) => (
                <span key={b}>{i > 0 && ', '}<a href={`#/${compact ? 'map' : 'country'}/${b}`}>{ds.country(b)?.name_ko}</a></span>
              ))}</>
            ) : '땅으로 맞닿은 이웃 나라가 없습니다.'}
            {c.landlocked && <> · 바다와 닿지 않은 내륙국</>}
          </p>
        </section>

        <section className="dz-sec dz-nature">
          <h2><span className="no">2</span>자연환경</h2>
          <NatureSection ds={ds} c={c} ex={ex} />
        </section>

        <section className="dz-sec">
          <h2><span className="no">3</span>기본 정보</h2>
          <dl className="facts">
            <dt>수도</dt><dd>{c.capital_ko.join(', ') || '—'}{c.capital_note && <small className="note"> {c.capital_note}</small>}</dd>
            <dt>대륙·지역</dt><dd>{continentName(c.continent)}{c.region_ko !== continentName(c.continent) && <> · {c.region_ko}</>}</dd>
            <dt>국토 면적</dt><dd><Val ds={ds} cid={c.id} iid="area" /></dd>
            <dt>인구</dt><dd><Val ds={ds} cid={c.id} iid="population" /></dd>
            <dt>통화</dt><dd>{c.currencies.map((x) => `${x.name_ko ?? x.name_en} (${x.code})`).join(', ') || '—'}</dd>
            <dt>주요 언어</dt><dd>{c.languages_ko.join(', ') || '—'}</dd>
            <dt>국가 코드</dt><dd className="mono">{c.iso3} · {c.iso2} · M49 {c.m49}</dd>
          </dl>
        </section>

        <section className="dz-sec">
          <h2><span className="no">4</span>숫자로 보는 {c.name_ko}</h2>
          <div className="headline-nums">
            {HEADLINE.map((iid) => {
              const ind = ds.indicator(iid);
              const l = ds.latest(c.id, iid);
              return (
                <div key={iid} className="hn">
                  <span className="hn-label">{ind.name_ko}</span>
                  <span className="hn-val">{l ? fmtValue(ind, l.value, { short: iid === 'population' }) : '자료 없음'}</span>
                  <span className="hn-year">{l ? `${l.year}년` : ''}</span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="dz-sec">
          <h2><span className="no">5</span>세계에서 몇 위일까?</h2>
          <RankStrips ds={ds} c={c} compact={compact} />
        </section>

        <section className="dz-sec dz-econ">
          <h2><span className="no">6</span>이 나라는 뭘로 먹고살까?</h2>
          <EconomySection ds={ds} c={c} ex={ex} compact={compact} />
        </section>

        <section className="dz-sec dz-stories">
          <h2><span className="no">7</span>{c.name_ko}의 이야기</h2>
          <StoriesSection c={c} ds={ds} ex={ex} docs={docs} compact={compact} />
        </section>

        <section className="dz-sec">
          <h2><span className="no">8</span>비슷한 나라와 비교하기</h2>
          <Similar ds={ds} c={c} compact={compact} />
        </section>

        <section className="dz-sec dz-learn">
          <h2><span className="no">9</span>배우고 도전하기</h2>
          <CapitalCheck ds={ds} c={c} />
          <ul className="dz-links">
            {[...new Set((docs ? storiesForCountry(c.id, docs, ds, ex) : []).flatMap((s) => s.indicators))].flatMap(lessonsFor).filter((l, i, a) => a.indexOf(l) === i).slice(0, 3).map((l) => (
              <li key={l.id}><a href={`#/lesson/${l.id}`}>{l.question}</a></li>
            ))}
            <li><a href="#/play/map">세계지도 챌린지로 {continentName(c.continent)} 나라 찾기</a></li>
            <li><a href="#/play/battle">세계 랭킹 배틀</a></li>
          </ul>
        </section>

        <details className="dz-sources">
          <summary>자료 출처</summary>
          <p>통계: World Bank World Development Indicators (각 지표 기준연도 표시). 국가 정보: mledoze/countries, 한국어 명칭 Wikidata. 지도: Natural Earth.</p>
          {stories.flatMap((s) => s.notes ?? []).map((n) => <p key={n}>{n}</p>)}
        </details>
      </div>
    </article>
  );
}

function Val({ ds, cid, iid }: { ds: Dataset; cid: string; iid: IndicatorId }) {
  const ind = ds.indicator(iid);
  const l = ds.latest(cid, iid);
  if (!l) return <span className="nodata">자료 없음</span>;
  return <>{fmtValue(ind, l.value)} <small className="yr">{l.year}년</small></>;
}

/** 순위를 수직선 위의 점으로. 왼쪽이 1위 */
function RankStrips({ ds, c, compact }: { ds: Dataset; c: Country; compact?: boolean }) {
  return (
    <ol className="strips">
      {ALL.map((iid) => {
        const ind = ds.indicator(iid);
        const r = ds.rankOf(c.id, iid);
        const pos = r ? (r.of === 1 ? 0 : (r.rank - 1) / (r.of - 1)) : null;
        return (
          <li key={iid}>
            <a className="strip" href={`#/rankings/${iid}/${c.id}`} aria-label={`${ind.name_ko} 순위표에서 보기`}>
              <span className="st-name">{ind.name_ko}</span>
              <span className="st-line" aria-hidden>{pos !== null && <i style={{ left: `${pos * 100}%` }} />}</span>
              <span className="st-rank">{r ? <><b>{r.rank}</b>위<small>/{r.of}</small></> : <span className="nodata">자료 없음</span>}</span>
              {!compact && <span className="st-val">{r ? fmtValue(ind, r.value, { short: true }) : ''}</span>}
            </a>
          </li>
        );
      })}
    </ol>
  );
}

function Similar({ ds, c, compact }: { ds: Dataset; c: Country; compact?: boolean }) {
  const sims = useMemo(() => {
    const p = ds.refValue(c.id, 'population')?.value, g = ds.refValue(c.id, 'gdp_pc')?.value, a = ds.refValue(c.id, 'area')?.value;
    if (!p || !a) return [];
    return ds.countries
      .filter((x) => x.id !== c.id)
      .map((x) => {
        const xp = ds.refValue(x.id, 'population')?.value, xg = ds.refValue(x.id, 'gdp_pc')?.value, xa = ds.refValue(x.id, 'area')?.value;
        if (!xp || !xa) return null;
        let d = Math.abs(Math.log(xp / p)) + Math.abs(Math.log(xa / a)) * 0.6;
        d += g && xg ? Math.abs(Math.log(xg / g)) : 1.5;
        if (x.continent !== c.continent) d += 0.4;
        return { x, d };
      })
      .filter(Boolean)
      .sort((u, v) => u!.d - v!.d)
      .slice(0, 3)
      .map((u) => u!.x);
  }, [ds, c]);
  if (!sims.length) return <p className="muted">비교할 통계가 부족합니다.</p>;
  const rows: IndicatorId[] = ['population', 'area', 'gdp_pc', 'life_exp', 'fertility'];
  const cols = [c, ...sims];
  return (
    <div className="table-scroll">
      <table className="compare">
        <caption className="sr-only">{c.name_ko}와 비슷한 나라 비교</caption>
        <thead>
          <tr><th scope="col" />{cols.map((x) => (
            <th key={x.id} scope="col" className={x.id === c.id ? 'me' : ''}>
              {x.id === c.id ? x.name_ko : <a href={`#/${compact ? 'map' : 'country'}/${x.id}`}>{x.name_ko}</a>}
            </th>
          ))}</tr>
        </thead>
        <tbody>
          {rows.map((iid) => {
            const ind = ds.indicator(iid);
            return (
              <tr key={iid}>
                <th scope="row">{ind.name_ko}<small>{ind.ref_year}</small></th>
                {cols.map((x) => <td key={x.id} className={x.id === c.id ? 'me' : ''}>{fmtValue(ind, ds.refValue(x.id, iid)?.value, { short: true })}</td>)}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** 확인 문제: 맞히면 이 나라 '학습 완료' */
function CapitalCheck({ ds, c }: { ds: Dataset; c: Country }) {
  const [picked, setPicked] = useState<string | null>(null);
  const opts = useMemo(() => {
    const rng = seeded(c.id.charCodeAt(0) * 31 + c.id.charCodeAt(1) * 7 + c.id.charCodeAt(2));
    const others = shuffle(ds.countries.filter((x) => x.continent === c.continent && x.id !== c.id && x.capital_ko.length), rng).slice(0, 3);
    return shuffle([c, ...others], rng).map((x) => ({ id: x.id, label: x.capital_ko[0] }));
  }, [ds, c]);
  if (!c.capital_ko.length) return null;
  const done = picked !== null;
  const right = picked === c.id;
  return (
    <div className="check">
      <p className="check-q"><b>확인 문제</b> {c.name_ko}의 수도는 어디일까요?</p>
      <div className="check-opts" role="group" aria-label="보기">
        {opts.map((o) => (
          <button
            key={o.id}
            type="button"
            className={`opt ${picked && o.id === c.id ? 'right' : picked === o.id ? 'wrong' : ''}`}
            disabled={done}
            onClick={() => {
              setPicked(o.id);
              if (o.id === c.id) journal.learn(c.id, 'capital');
            }}
          >{o.label}</button>
        ))}
      </div>
      {picked && (
        <p className="check-res" role="status">
          {right ? `맞아요. ${c.name_ko}의 수도는 ${c.capital_ko.join(', ')}입니다. 탐험일지에 학습 완료로 기록했어요.` : `${josa(opts.find((o) => o.id === picked)!.label, '은는')} ${ds.country(picked)?.name_ko}의 수도예요. ${c.name_ko}의 수도는 ${c.capital_ko[0]}입니다. 다음에 다시 도전해 보세요.`}
        </p>
      )}
    </div>
  );
}

/** 위치도: 이 나라와 이웃 나라 주변만 잘라 보여 준다 */
function Locator({ geo, ds, c }: { geo: Geo; ds: Dataset; c: Country }) {
  const box = useMemo(() => {
    const me = geo.byId.get(c.id);
    if (!me) return null;
    let [[x0, y0], [x1, y1]] = me.bounds;
    if (x1 - x0 > MAP_W * 0.55) {
      const [cx, cy] = me.label;
      [x0, y0, x1, y1] = [cx - 25, cy - 15, cx + 25, cy + 15];
    }
    const w = Math.max(x1 - x0, 14), h = Math.max(y1 - y0, 9);
    const padX = Math.max(w * 0.9, 18), padY = Math.max(h * 0.9, 12);
    let vx = (x0 + x1) / 2 - w / 2 - padX, vy = (y0 + y1) / 2 - h / 2 - padY;
    let vw = w + padX * 2, vh = h + padY * 2;
    // 가로세로 비율을 3:2 정도로 맞춘다
    if (vw / vh < 1.5) { const nw = vh * 1.5; vx -= (nw - vw) / 2; vw = nw; } else { const nh = vw / 1.5; vy -= (nh - vh) / 2; vh = nh; }
    return { vx, vy, vw, vh, me };
  }, [geo, c]);
  if (!box) return null;
  const nb = new Set(c.borders);
  return (
    <svg className="locator" viewBox={`${box.vx} ${box.vy} ${box.vw} ${box.vh}`} role="img" aria-label={`${c.name_ko}의 위치`}>
      <rect x={box.vx} y={box.vy} width={box.vw} height={box.vh} className="loc-sea" />
      {geo.shapes.map((s, i) => (
        <path key={i} d={s.d} className={s.id === c.id ? 'loc-me' : nb.has(s.id) ? 'loc-nb' : 'loc-land'}
          fill={s.id === c.id ? undefined : s.props.listed ? POLITICAL[(s.props.mc ?? 1) % POLITICAL.length] : UNLISTED} />
      ))}
      {box.me.small && <circle cx={box.me.label[0]} cy={box.me.label[1]} r={box.vw / 40} className="loc-ring" />}
      {c.borders.length <= 6 && c.borders.map((b) => {
        const s = geo.byId.get(b);
        if (!s) return null;
        const [x, y] = s.label;
        if (x < box.vx || x > box.vx + box.vw || y < box.vy || y > box.vy + box.vh) return null;
        return <text key={b} x={x} y={y} className="loc-label" fontSize={box.vw / 44} textAnchor="middle">{ds.country(b)?.name_ko}</text>;
      })}
    </svg>
  );
}

export function goCountry(id: string) {
  go(`country/${id}`);
}

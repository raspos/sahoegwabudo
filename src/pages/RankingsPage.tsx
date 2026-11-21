import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { go, useData } from '../App';
import { WorldMap, type WorldMapHandle } from '../map/WorldMap';
import type { MapShape } from '../map/geo';
import { CONTINENTS, type ContinentId, type IndicatorId } from '../data/types';
import { colorFor, SCALES, UNLISTED } from '../data/scales';
import { Flag, Legend } from '../components/common';
import { fmtValue } from '../data/format';
import { lessonsFor } from '../content/lessons';
import { CONCEPT } from '../games/questions';

interface Board { id: IndicatorId; desc: string; asc: string; defaultDir: 'desc' | 'asc' }
export const BOARDS: Board[] = [
  { id: 'population', desc: '인구가 가장 많은 나라', asc: '인구가 가장 적은 나라', defaultDir: 'desc' },
  { id: 'area', desc: '면적이 가장 넓은 나라', asc: '면적이 가장 좁은 나라', defaultDir: 'desc' },
  { id: 'density', desc: '인구밀도가 가장 높은 나라', asc: '인구밀도가 가장 낮은 나라', defaultDir: 'desc' },
  { id: 'gdp', desc: 'GDP가 가장 큰 나라', asc: 'GDP가 가장 작은 나라', defaultDir: 'desc' },
  { id: 'gdp_pc', desc: '1인당 GDP가 가장 높은 나라', asc: '1인당 GDP가 가장 낮은 나라', defaultDir: 'desc' },
  { id: 'life_exp', desc: '기대수명이 가장 긴 나라', asc: '기대수명이 가장 짧은 나라', defaultDir: 'desc' },
  { id: 'fertility', desc: '출산율이 가장 높은 나라', asc: '출산율이 가장 낮은 나라', defaultDir: 'asc' },
  { id: 'gdp_growth', desc: '경제성장률이 가장 높은 나라', asc: '경제성장률이 가장 낮은 나라', defaultDir: 'desc' },
  { id: 'inflation', desc: '물가가 가장 많이 오른 나라', asc: '물가가 가장 적게 오른 나라', defaultDir: 'desc' },
  { id: 'urban', desc: '도시화율이 가장 높은 나라', asc: '도시화율이 가장 낮은 나라', defaultDir: 'desc' },
  { id: 'manufacturing', desc: '제조업 비중이 가장 높은 나라', asc: '제조업 비중이 가장 낮은 나라', defaultDir: 'desc' },
  { id: 'internet', desc: '인터넷 이용률이 가장 높은 나라', asc: '인터넷 이용률이 가장 낮은 나라', defaultDir: 'desc' },
  { id: 'gdp_pc_ppp', desc: '구매력 기준 1인당 GDP가 가장 높은 나라', asc: '구매력 기준 1인당 GDP가 가장 낮은 나라', defaultDir: 'desc' },
  { id: 'productivity', desc: '취업자 1명당 GDP가 가장 높은 나라', asc: '취업자 1명당 GDP가 가장 낮은 나라', defaultDir: 'desc' },
  { id: 'agri_va', desc: '농림어업 비중이 가장 높은 나라', asc: '농림어업 비중이 가장 낮은 나라', defaultDir: 'desc' },
  { id: 'industry_va', desc: '산업(광공업·건설) 비중이 가장 높은 나라', asc: '산업 비중이 가장 낮은 나라', defaultDir: 'desc' },
  { id: 'services_va', desc: '서비스업 비중이 가장 높은 나라', asc: '서비스업 비중이 가장 낮은 나라', defaultDir: 'desc' },
  { id: 'exports_gdp', desc: 'GDP 대비 수출이 가장 많은 나라', asc: 'GDP 대비 수출이 가장 적은 나라', defaultDir: 'desc' },
  { id: 'forest', desc: '산림 비율이 가장 높은 나라', asc: '산림 비율이 가장 낮은 나라', defaultDir: 'desc' },
  { id: 'arable', desc: '경작지 비율이 가장 높은 나라', asc: '경작지 비율이 가장 낮은 나라', defaultDir: 'desc' },
];

export function RankingsPage({ indicatorId, focus }: { indicatorId?: string; focus?: string }) {
  const { ds, geo } = useData();
  const board = BOARDS.find((b) => b.id === indicatorId) ?? BOARDS[0];
  const ind = ds.indicator(board.id);
  const [dir, setDir] = useState<'desc' | 'asc'>(board.defaultDir);
  const [q, setQ] = useState('');
  const [cont, setCont] = useState<ContinentId | 'all'>('all');
  const [sel, setSel] = useState<string | null>(focus && ds.country(focus) ? focus : 'KOR');
  const mapRef = useRef<WorldMapHandle>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const scrollReq = useRef(!!focus);

  useEffect(() => { setDir(board.defaultDir); }, [board]);
  useEffect(() => { if (focus && ds.country(focus)) { setSel(focus); scrollReq.current = true; } }, [focus, ds]);

  const ranking = useMemo(() => ds.rankingDir(board.id, dir), [ds, board, dir]);
  const max = useMemo(() => Math.max(...ranking.rows.map((r) => Math.abs(r.value))), [ranking]);
  const rows = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return ranking.rows.filter((r) => (cont === 'all' || r.country.continent === cont) &&
      (!qq || r.country.name_ko.includes(qq) || r.country.name_en.toLowerCase().includes(qq) || r.country.aliases.some((a) => a.toLowerCase().includes(qq))));
  }, [ranking, q, cont]);
  const ties = useMemo(() => {
    const n = new Map<number, number>();
    ranking.rows.forEach((r) => n.set(r.rank, (n.get(r.rank) ?? 0) + 1));
    return n;
  }, [ranking]);

  useEffect(() => {
    if (!sel || !scrollReq.current) return;
    scrollReq.current = false;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-row="${sel}"]`);
    if (el && listRef.current) listRef.current.scrollTop = el.offsetTop - listRef.current.clientHeight / 2;
  }, [sel, board, dir, cont]);

  const pickOnMap = useCallback((id: string) => { scrollReq.current = true; setSel(id); }, []);
  const fillFor = useCallback((s: MapShape) => (s.props.listed ? colorFor(SCALES[board.id], ds.refValue(s.id, board.id)?.value) : UNLISTED), [ds, board]);
  const tooltip = useCallback((s: MapShape) => {
    const c = ds.country(s.id);
    if (!c) return <div className="tip"><strong>{s.props.ne_name_ko || s.props.ne_name_en}</strong><p className="tip-note">195개국 기본 목록 밖의 지역</p></div>;
    const r = ranking.rows.find((x) => x.country.id === c.id);
    return (
      <div className="tip">
        <div className="tip-head"><Flag iso2={c.iso2} /><strong>{c.name_ko}</strong></div>
        <p className="tip-metric">{ind.name_ko} <b>{fmtValue(ind, r?.value)}</b></p>
        <p className="tip-metric">{r ? `${ranking.rows.length}개국 중 ${r.rank}위` : `${ranking.year}년 순위 제외`}</p>
      </div>
    );
  }, [ds, ranking, ind]);

  const selRow = sel ? ranking.rows.find((r) => r.country.id === sel) : undefined;
  const lessons = lessonsFor(board.id);

  return (
    <div className="page rankings">
      <header className="rk-head">
        <h1>세계 랭킹</h1>
        <div className="rk-boards" role="tablist" aria-label="랭킹 주제">
          {BOARDS.map((b) => (
            <a key={b.id} role="tab" aria-selected={b.id === board.id} className={`board ${b.id === board.id ? 'on' : ''}`} href={`#/rankings/${b.id}`}>
              {ds.indicator(b.id).name_ko}
            </a>
          ))}
        </div>
      </header>

      <div className="rk-grid">
        <section className="rk-list" aria-label="순위표">
          <div className="rk-title">
            <h2>세계에서 {dir === 'desc' ? board.desc : board.asc}</h2>
            <p className="rk-meta">
              <span>{ind.name_ko}</span><span>{ranking.year}년</span><span>단위 {ind.unit}</span><span>{ranking.rows.length}개국 비교</span>
              <a href={ind.source_url} target="_blank" rel="noreferrer">World Bank WDI</a>
            </p>
          </div>
          <div className="rk-tools">
            <input type="search" placeholder="나라 찾기" value={q} onChange={(e) => setQ(e.target.value)} aria-label="순위표에서 나라 찾기" />
            <select value={cont} onChange={(e) => setCont(e.target.value as ContinentId | 'all')} aria-label="대륙 필터">
              <option value="all">모든 대륙</option>
              {CONTINENTS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button type="button" className="tab" onClick={() => setDir(dir === 'desc' ? 'asc' : 'desc')} aria-label="정렬 방향 바꾸기">
              {dir === 'desc' ? '높은 순 ↓' : '낮은 순 ↑'}
            </button>
          </div>
          <ol className="rk-rows" ref={listRef}>
            {rows.map((r) => (
              <li key={r.country.id} data-row={r.country.id} className={`${r.country.id === 'KOR' ? 'is-kor' : ''} ${r.country.id === sel ? 'is-sel' : ''}`}>
                <button type="button" onClick={() => { setSel(r.country.id); mapRef.current?.zoomToCountry(r.country.id); }} aria-pressed={r.country.id === sel}>
                  <span className="rk-rank">{r.rank}{(ties.get(r.rank) ?? 0) > 1 && <small title="공동 순위">공동</small>}</span>
                  <Flag iso2={r.country.iso2} size="sm" />
                  <span className="rk-name">{r.country.name_ko}</span>
                  <span className="rk-bar" aria-hidden><i style={{ width: `${Math.max(0.6, (Math.abs(r.value) / max) * 100)}%` }} className={r.value < 0 ? 'neg' : ''} /></span>
                  <span className="rk-val">{fmtValue(ind, r.value, { short: true })}</span>
                </button>
              </li>
            ))}
            {!rows.length && <li className="rk-empty">조건에 맞는 나라가 없습니다.</li>}
          </ol>
          <details className="rk-notes">
            <summary>지표 설명과 순위 기준</summary>
            <p>{CONCEPT[board.id]}</p>
            <p className="def-en">{ind.definition_en.split('\n')[0]}</p>
            <p>모든 나라를 {ranking.year}년 값 하나로 비교합니다. 이 해에 값이 없는 나라({ranking.excluded.length}개국)는 순위에서 뺐습니다{ranking.excluded.length ? `: ${ranking.excluded.map((c) => c.name_ko).join(', ')}` : ''}.</p>
            <p>값이 같으면 같은 순위를 주고, 다음 순위는 그 수만큼 건너뜁니다(1, 2, 2, 4위). 비교는 반올림 전 원자료 값으로 합니다.</p>
            <p>출처: {ind.source} ({ind.source_code}), 원자료 기관: {ind.source_org.split(/[,;]/)[0]}. 받은 날 {ind.retrieved_at}.</p>
          </details>
        </section>

        <section className="rk-map" aria-label="순위 지도">
          <WorldMap
            ref={mapRef}
            geo={geo}
            fillFor={fillFor}
            selected={sel}
            onSelect={pickOnMap}
            tooltip={tooltip}
            ariaLabel={`${ind.name_ko} 지도`}
            announce={(s) => ds.country(s.id)?.name_ko ?? ''}
            legendSlot={<Legend scale={SCALES[board.id]} indicator={ind} />}
          />
          {sel && ds.country(sel) && (
            <div className="rk-focus">
              <Flag iso2={ds.country(sel)!.iso2} />
              <strong>{ds.country(sel)!.name_ko}</strong>
              <span>{selRow ? <>{fmtValue(ind, selRow.value)} · <b>{selRow.rank}위</b> / {ranking.rows.length}</> : `${ranking.year}년 자료 없음`}</span>
              <button type="button" className="btn-text" onClick={() => go(`country/${sel}`)}>도감 열기</button>
            </div>
          )}
          {lessons.length > 0 && (
            <div className="rk-think">
              <p className="think-label">생각해 보기</p>
              {lessons.slice(0, 2).map((l) => <a key={l.id} href={`#/lesson/${l.id}`}>{l.question}</a>)}
              <a className="think-play" href="#/play/battle">세계 랭킹 배틀로 확인하기</a>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

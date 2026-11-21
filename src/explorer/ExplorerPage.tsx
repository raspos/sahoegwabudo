import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './explorer.css';
import { useData } from '../App';
import { WorldMap, type WorldMapHandle } from '../map/WorldMap';
import type { MapShape } from '../map/geo';
import { POLITICAL, UNLISTED } from '../data/scales';
import { Flag } from '../components/common';
import { useExtras } from '../data/extras';
import { fmtValue } from '../data/format';
import { journal, useJournal } from '../store/journal';
import { CAMPAIGNS, campaignById } from './campaigns';
import { answer, currentEvent, currentNode, enterMission, finalScore, newGame, puzzleFor, successes } from './engine';
import type { Answer, Campaign, Ctx, GameState, Puzzle, Resolution } from './types';
import type { IndicatorId } from '../data/types';

const KIND_KO: Record<string, string> = { discover: '국가 발견', economy: '경제 조사', route: '지리 탐험', compare: '국가 비교', rank: '순위 추리', decide: '탐험 결정', report: '보고서', event: '가상 사건' };

export function ExplorerPage({ campaignId }: { campaignId?: string }) {
  const { ds } = useData();
  const ex = useExtras();
  const j = useJournal();
  const saved = j.explorer.save as GameState | null;
  const [state, setState] = useState<GameState | null>(() => (saved && (!campaignId || saved.campaign === campaignId) ? saved : null));

  if (!ex) return <div className="page"><p className="loading">탐험 장비를 꾸리는 중…</p></div>;
  const ctx: Ctx = { ds, ex };
  const camp = state ? campaignById(state.campaign) : undefined;

  if (!state || !camp) {
    return (
      <div className="page explorer-hub">
        <header className="page-head">
          <p className="kicker">세계 탐험가</p>
          <h1>탐험 본부</h1>
          <p className="lede">조사원이 되어 세계지도를 누비며 나라 경제의 비밀을 밝혀 보세요. 탐험 자금과 일정은 한정되어 있고, 고른 길에 따라 만나는 임무와 결말이 달라집니다.</p>
        </header>
        {saved && campaignById(saved.campaign) && (
          <p className="explorer-continue">진행 중인 탐험: <b>{campaignById(saved.campaign)!.title}</b> (자금 {saved.funds}, 일정 {saved.days}일)
            <button type="button" className="btn" onClick={() => setState(saved)}>이어서 하기</button></p>
        )}
        <div className="games">
          {CAMPAIGNS.map((c) => {
            const rec = j.explorer.campaigns[c.id];
            return (
              <div key={c.id} className="game-entry campaign-entry">
                <span className="ge-no">{c.region}</span>
                <h2>{c.title}</h2>
                <p>{c.question}</p>
                <p className="ge-best">{rec ? `${rec.plays}번 탐험 · 최고 ${rec.best}점 · 본 결말 ${rec.endings.length}/${c.endings.length}` : '아직 떠나지 않은 탐험'}</p>
                <button type="button" className="btn" onClick={() => { const s = newGame(c); journal.explorerSave(s); setState(s); }}>
                  {rec ? '새로 출발' : '출발'}
                </button>
              </div>
            );
          })}
        </div>
        <p className="muted small">게임 속 탐험 자금·일정은 가상의 값입니다. 단서와 조사 자료의 숫자는 World Bank·UN Comtrade 등 실제 통계에서 가져옵니다.</p>
      </div>
    );
  }
  return <Game camp={camp} ctx={ctx} state={state} setState={(s) => { setState(s); journal.explorerSave(s && s.node !== 'ending' ? s : null); }} />;
}

function Game({ camp, ctx, state, setState }: { camp: Campaign; ctx: Ctx; state: GameState; setState: (s: GameState | null) => void }) {
  const { ds, geo } = useData() as ReturnType<typeof useData>;
  const mapRef = useRef<WorldMapHandle>(null);
  const [result, setResult] = useState<{ res?: Resolution; title: string; fiction?: boolean; text?: string } | null>(null);
  const [tab, setTab] = useState<'mission' | 'map'>('mission');
  const [focus, setFocus] = useState<string | null>(null);
  // 퍼즐마다 지도에서 모으는 입력
  const [guesses, setGuesses] = useState<string[]>([]);
  const [route, setRoute] = useState<string[]>([]);
  const [clues, setClues] = useState(0);

  const s = useMemo(() => enterMission(camp, ctx, state), [camp, ctx, state]);
  useEffect(() => { if (s !== state) setState(s); }, [s, state, setState]);
  const p: Puzzle = useMemo(() => puzzleFor(camp, ctx, s), [camp, ctx, s]);
  const node = currentNode(camp, s);
  const evnt = currentEvent(s);

  useEffect(() => {
    setGuesses([]); setClues(0); setFocus(null);
    setRoute(p.kind === 'route' ? [p.start] : []);
    if (p.kind === 'route') setTimeout(() => mapRef.current?.zoomToCountry(p.start), 50);
    else if (p.kind === 'discover') setTimeout(() => mapRef.current?.zoomToContinent(p.continent as never), 50);
  }, [s.node]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = (a: Answer) => {
    const title = evnt ? evnt.title : node?.title ?? '';
    const r = answer(camp, ctx, s, a);
    setResult({ res: r.res, title, fiction: !!evnt, text: evnt ? evnt.choices[(a as { choice: number }).choice].result : undefined });
    if (r.state.node === 'ending') {
      journal.explorerFinish({ campaign: camp.id, ending: r.state.ending!, score: finalScore(r.state), missions: Object.keys(r.state.outcomes),
        path: r.state.path, discovered: Object.keys(r.state.flags).filter((k) => k.startsWith('found:') && r.state.flags[k]).map((k) => k.slice(6)),
        evidence: r.state.evidence.map((e) => e.id) });
    }
    setState(r.state);
    setTab('mission');
  };

  // ─── 지도 ───
  const secret = p.kind === 'discover' ? p.target : null;
  const onMapClick = (id: string) => {
    if (result) return;
    if (p.kind === 'discover') {
      if (guesses.includes(id)) return;
      const g = [...guesses, id];
      setGuesses(g);
      if (id === p.target || g.length >= p.maxTries) submit({ kind: 'discover', guesses: g, cluesBought: clues });
      return;
    }
    if (p.kind === 'route') {
      const last = route[route.length - 1];
      if (route.includes(id)) { if (id === last && route.length > 1) setRoute(route.slice(0, -1)); return; }
      if (!ds.country(last)?.borders.includes(id)) { setFocus(id); return; }
      const r = [...route, id];
      setRoute(r);
      setFocus(id);
      return;
    }
    setFocus(id);
  };
  const optCountries = p.kind === 'decide' ? new Set(p.options.filter((o) => o.country).map((o) => o.country!)) : new Set<string>();
  const fillFor = useCallback((sh: MapShape) => (sh.props.listed ? POLITICAL[(sh.props.mc ?? 1) % POLITICAL.length] : UNLISTED), []);
  const classFor = useCallback((sh: MapShape) => {
    if (p.kind === 'discover' && guesses.includes(sh.id)) return sh.id === p.target ? 'pick-right' : 'pick-wrong';
    if (p.kind === 'route') { if (sh.id === p.goal) return 'route-goal'; if (route.includes(sh.id)) return 'route-on'; }
    if (optCountries.has(sh.id)) return 'opt-country';
    if (sh.id === s.location) return 'here';
    return undefined;
  }, [p, guesses, route, optCountries, s.location]); // eslint-disable-line react-hooks/exhaustive-deps
  const labelFor = useCallback((sh: MapShape) => (secret || !sh.props.listed ? undefined : ds.country(sh.id)?.name_ko), [secret, ds]);
  const tooltip = useCallback((sh: MapShape) => (secret ? null : <div className="tip"><strong>{ds.country(sh.id)?.name_ko ?? sh.props.ne_name_ko}</strong></div>), [secret, ds]);

  const ending = s.node === 'ending' ? camp.endings.find((e) => e.id === s.ending) : undefined;

  return (
    <div className={`explorer explorer--${tab}`}>
      <header className="ex-top">
        <strong className="ex-title">{camp.title}</strong>
        <span className="ex-res" title="탐험 자금 (가상)">자금 <b>{s.funds}</b></span>
        <span className="ex-res" title="남은 일정 (가상)">일정 <b>{s.days}</b>일</span>
        <span className="ex-res">성공 임무 <b>{successes(s)}</b></span>
        <span className="ex-res">현재 위치 <b>{ds.country(s.location)?.name_ko}</b></span>
        <span className="ex-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'mission'} className={`tab ${tab === 'mission' ? 'on' : ''}`} onClick={() => setTab('mission')}>임무</button>
          <button type="button" role="tab" aria-selected={tab === 'map'} className={`tab ${tab === 'map' ? 'on' : ''}`} onClick={() => setTab('map')}>지도</button>
        </span>
        <button type="button" className="btn-text ex-quit" onClick={() => { if (window.confirm('탐험 본부로 돌아갈까요? 진행 상황은 저장됩니다.')) setState(null); }}>본부로</button>
      </header>

      <aside className="ex-left" aria-label="현재 임무와 탐험일지">
        <section className="ex-mission">
          <p className="ex-kind">{ending ? '탐험 종료' : KIND_KO[p.kind] ?? ''}{evnt && <span className="fiction">가상 사건</span>}</p>
          <h2>{ending ? ending.title : evnt ? evnt.title : node?.title}</h2>
          {!ending && <p>{evnt ? evnt.text : node?.brief(s, ctx)}</p>}
        </section>
        <section className="ex-evidence">
          <h3>조사 자료 <small>{s.evidence.length}</small></h3>
          {s.evidence.length ? <ul>{s.evidence.map((e) => <li key={e.id}>{e.text} <small>{e.source}</small></li>)}</ul> : <p className="muted small">아직 모은 자료가 없습니다.</p>}
        </section>
        <section className="ex-log">
          <h3>탐험일지</h3>
          <ol reversed>{[...s.log].reverse().slice(0, 12).map((l, i) => (
            <li key={i} className={l.outcome ? `o-${l.outcome}` : ''}><b>{l.title}</b>{l.fiction && <span className="fiction">가상</span>} <span>{l.text}</span></li>
          ))}</ol>
        </section>
      </aside>

      <section className="ex-map" aria-label="탐험 지도">
        <WorldMap ref={mapRef} geo={geo} fillFor={fillFor} classFor={classFor} labelFor={labelFor} tooltip={tooltip}
          selected={secret ? null : focus} onSelect={onMapClick}
          ariaLabel="탐험 지도. 화살표 키로 나라를 옮기고 Enter 로 고릅니다."
          announce={(sh) => (secret ? ds.country(sh.id)?.region_ko ?? '' : ds.country(sh.id)?.name_ko ?? '')} />
        <div className="zoom-ctl" role="group" aria-label="지도 확대·축소">
          <button type="button" onClick={() => mapRef.current?.zoomBy(1.8)} aria-label="확대">+</button>
          <button type="button" onClick={() => mapRef.current?.zoomBy(1 / 1.8)} aria-label="축소">−</button>
          <button type="button" onClick={() => mapRef.current?.reset()} className="zc-reset" aria-label="세계 전체 보기">전체</button>
        </div>
      </section>

      <aside className="ex-right" aria-label="선택한 나라 자료">
        <CountryBrief ctx={ctx} id={secret ? null : focus ?? (p.kind === 'route' ? route[route.length - 1] : s.location)} highlight={p.kind === 'route' ? p.ruleIndicator : undefined} />
      </aside>

      <section className="ex-bottom" aria-live="polite">
        {result ? (
          <div className={`ex-result ${result.res ? `o-${result.res.outcome}` : ''}`}>
            <p className="ex-kind">{result.fiction ? <span className="fiction">가상 사건</span> : result.res ? { success: '임무 성공', partial: '절반의 성공', fail: '임무 실패' }[result.res.outcome] : '결정'}</p>
            <h3>{result.title}</h3>
            <p>{result.text ?? result.res?.message}</p>
            {result.res && result.res.evidence.length > 0 && <p className="ex-got">새 조사 자료 {result.res.evidence.length}개 확보</p>}
            {result.res && (result.res.cost.funds !== 0 || result.res.cost.days !== 0) && <p className="muted small">자금 {result.res.cost.funds >= 0 ? '+' : ''}{result.res.cost.funds}, 일정 {result.res.cost.days >= 0 ? '+' : ''}{result.res.cost.days}일</p>}
            <button type="button" className="btn" autoFocus onClick={() => setResult(null)}>계속</button>
          </div>
        ) : ending ? (
          <EndingView camp={camp} ctx={ctx} s={s} text={ending.text(s, ctx)} onAgain={() => setState(newGame(camp))} onHub={() => setState(null)} />
        ) : (
          <PuzzleView p={p} s={s} ctx={ctx} submit={submit} guesses={guesses} clues={clues} setClues={setClues} route={route} setRoute={setRoute}
            goMap={() => setTab('map')} onFocus={(id) => { setFocus(id); mapRef.current?.zoomToCountry(id); }} />
        )}
      </section>
    </div>
  );
}

function CountryBrief({ ctx, id, highlight }: { ctx: Ctx; id: string | null; highlight?: IndicatorId }) {
  const { ds, ex } = ctx;
  if (!id) return <div className="ex-brief"><p className="muted small">단서를 모아 지도에서 나라를 찾으세요. 찾기 전에는 나라 자료가 보이지 않습니다.</p></div>;
  const c = ds.country(id);
  if (!c) return null;
  const rows: IndicatorId[] = ['gdp_pc_ppp', 'productivity', 'manufacturing', 'services_va', 'exports_gdp'];
  const tr = ex.trade?.countries[id];
  return (
    <div className="ex-brief">
      <h3><Flag iso2={c.iso2} /> {c.name_ko}</h3>
      <dl className="facts">
        {rows.map((iid) => { const ind = ds.indicator(iid); const v = ds.refValue(id, iid); return (
          <div key={iid} className={highlight === iid ? 'hl' : ''}><dt>{ind.name_ko}</dt><dd>{v ? <>{fmtValue(ind, v.value, { short: true })} <small>{v.year}</small></> : '자료 없음'}</dd></div>
        ); })}
      </dl>
      {tr && <p className="small">수출 1위: {tr.products[0].name_ko.replace(/\(.*\)$/, '')} {(tr.products[0].share * 100).toFixed(1)}% <small>({tr.year}, UN Comtrade)</small></p>}
      <p className="small">이웃 나라: {c.borders.map((b) => ds.country(b)?.name_ko).join(', ') || '없음'}</p>
      <a className="small" href={`#/country/${id}`} target="_blank" rel="noreferrer">{c.name_ko} 도감 (새 탭)</a>
    </div>
  );
}

function PuzzleView({ p, s, ctx, submit, guesses, clues, setClues, route, setRoute, goMap, onFocus }: {
  p: Puzzle; s: GameState; ctx: Ctx; submit: (a: Answer) => void; guesses: string[]; clues: number; setClues: (n: number) => void;
  route: string[]; setRoute: (r: string[]) => void; goMap: () => void; onFocus: (id: string) => void;
}) {
  const { ds } = ctx;
  const nm = (id: string) => ds.country(id)?.name_ko ?? id;
  const [assign, setAssign] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState<IndicatorId[]>([]);
  const [pick, setPick] = useState<string | null>(null);
  const [order, setOrder] = useState<string[]>(p.kind === 'rank' ? p.items.map((x) => x.key) : []);
  const [chosen, setChosen] = useState<string[]>([]);
  useEffect(() => { setAssign({}); setRevealed([]); setPick(null); setChosen([]); setOrder(p.kind === 'rank' ? p.items.map((x) => x.key) : []); }, [p]);

  switch (p.kind) {
    case 'discover': {
      const nextCost = p.clues[1 + clues]?.cost ?? 0;
      const free = s.flags.freeClue && clues === 0;
      return (
        <div className="pz pz-discover">
          <ol className="clues">{p.clues.slice(0, 1 + clues).map((c, i) => <li key={i}>{c.text}</li>)}</ol>
          <p className="pz-actions">
            {1 + clues < p.clues.length && <button type="button" className="tab" disabled={!free && s.funds <= nextCost} onClick={() => setClues(clues + 1)}>단서 더 보기 ({free ? '무료' : `자금 ${nextCost}`})</button>}
            <span>남은 기회 {p.maxTries - guesses.length}번{guesses.length > 0 && ` · 고른 곳: ${guesses.map(nm).join(', ')}`}</span>
            <button type="button" className="btn mobile-only" onClick={goMap}>지도에서 찾기</button>
          </p>
        </div>
      );
    }
    case 'economy':
      return (
        <div className="pz pz-economy">
          <table className="compare"><thead><tr><th>상품군 (수출 1위)</th><th>어느 나라?</th></tr></thead><tbody>
            {p.items.map((it) => (
              <tr key={it.key}><th scope="row">{it.label} <small>{it.detail}</small></th>
                <td><span className="choice-row">{p.countries.map((c) => (
                  <button key={c} type="button" className={`tab ${assign[it.key] === c ? 'on' : ''}`} onClick={() => setAssign({ ...assign, [it.key]: c })}>{nm(c)}</button>
                ))}</span></td></tr>
            ))}
          </tbody></table>
          <p className="pz-actions"><button type="button" className="btn" disabled={Object.keys(assign).length < 3} onClick={() => submit({ kind: 'economy', assign })}>조사 결과 제출</button>
            <span className="muted small">각 나라의 상품 수출 1위 (UN Comtrade {p.year}년 이하)</span></p>
        </div>
      );
    case 'route': {
      const last = route[route.length - 1];
      const done = last === p.goal;
      return (
        <div className="pz pz-route">
          <p><b>조건</b> {p.rule}</p>
          <p className="route-chips">{route.map((x, i) => <span key={x}>{i > 0 && ' → '}<button type="button" className="linkish" onClick={() => onFocus(x)}>{nm(x)}</button></span>)}{!done && <span className="muted"> → … {nm(p.goal)}</span>}</p>
          <p className="muted small">지도에서 {nm(last)}와(과) 땅으로 맞닿은 나라를 누르세요. 마지막 나라를 다시 누르면 되돌립니다. 오른쪽 자료에서 조건 지표를 확인할 수 있습니다.</p>
          <p className="pz-actions">
            <button type="button" className="btn" disabled={!done} onClick={() => submit({ kind: 'route', path: route })}>이 길로 간다 ({route.length - 1}구간)</button>
            <button type="button" className="tab" disabled={route.length < 2} onClick={() => setRoute(route.slice(0, -1))}>한 칸 되돌리기</button>
            <button type="button" className="tab" onClick={() => submit({ kind: 'route', path: route, gaveUp: true })}>본부에 길 묻기 (자금 12, 2일)</button>
            <button type="button" className="btn mobile-only" onClick={goMap}>지도 열기</button>
          </p>
        </div>
      );
    }
    case 'compare': {
      const freeOne = !!s.flags.freeReveal;
      const costOf = (n: number) => Math.max(0, n - (freeOne ? 1 : 0)) * p.revealCost;
      return (
        <div className="pz pz-compare">
          <p><b>찾을 나라</b> {p.criteria}</p>
          <div className="table-scroll"><table className="compare"><thead><tr><th>후보</th>{p.columns.map((col) => (
            <th key={col.id}>{revealed.includes(col.id) ? col.label : <button type="button" className="tab" disabled={s.funds <= costOf(revealed.length + 1) - costOf(revealed.length)} onClick={() => setRevealed([...revealed, col.id])}>{col.label} 열기 ({freeOne && revealed.length === 0 ? '무료' : `자금 ${p.revealCost}`})</button>}</th>
          ))}</tr></thead><tbody>
            {p.candidates.map((c) => (
              <tr key={c} className={pick === c ? 'picked' : ''} onClick={() => setPick(c)}>
                <th scope="row"><label><input type="radio" name="cmp" checked={pick === c} onChange={() => setPick(c)} /> {nm(c)}</label></th>
                {p.columns.map((col) => <td key={col.id}>{revealed.includes(col.id) ? fmtValue(ds.indicator(col.id), ds.refValue(c, col.id)?.value, { short: true }) : '?'}</td>)}
              </tr>
            ))}
          </tbody></table></div>
          <p className="pz-actions"><button type="button" className="btn" disabled={!pick} onClick={() => submit({ kind: 'compare', pick: pick!, revealed })}>이 나라로 정한다</button>
            <span className="muted small">열람 비용 합계 {costOf(revealed.length)} · 자료는 각 지표 기준연도 값</span></p>
        </div>
      );
    }
    case 'rank': {
      const move = (i: number, d: number) => { const o = [...order]; const j = i + d; if (j < 0 || j >= o.length) return; [o[i], o[j]] = [o[j], o[i]]; setOrder(o); };
      const truthTop = [...p.items].sort((a, b) => b.value - a.value)[0];
      return (
        <div className="pz pz-rank">
          <p><b>{p.label}</b>이(가) 큰 순서로 놓으세요. <small className="muted">({p.source})</small></p>
          {s.flags.rankHint && <p className="ex-hint">정리해 둔 메모: 1위는 {truthTop.label}입니다.</p>}
          <ol className="rank-list">{order.map((k, i) => { const it = p.items.find((x) => x.key === k)!; return (
            <li key={k}><span className="rk-rank">{i + 1}</span><span>{it.label}</span>
              <button type="button" className="tab" aria-label={`${it.label} 위로`} disabled={i === 0} onClick={() => move(i, -1)}>▲</button>
              <button type="button" className="tab" aria-label={`${it.label} 아래로`} disabled={i === order.length - 1} onClick={() => move(i, 1)}>▼</button></li>
          ); })}</ol>
          <p className="pz-actions"><button type="button" className="btn" onClick={() => submit({ kind: 'rank', order })}>이 순서로 보고한다</button></p>
        </div>
      );
    }
    case 'decide':
      return (
        <div className="pz pz-decide">
          <ul className="decide-list">{p.options.map((o) => (
            <li key={o.id} className={o.available ? '' : 'locked'}>
              <div><b>{o.label}</b><p className="small">{o.detail}{!o.available && o.lockedReason && <> · <span className="lock">{o.lockedReason}</span></>}</p></div>
              {o.country && <button type="button" className="tab" onClick={() => onFocus(o.country!)}>지도</button>}
              <button type="button" className="btn" disabled={!o.available} onClick={() => submit({ kind: 'decide', option: o.id })}>{o.cost.funds ? `고른다 (자금 ${-o.cost.funds})` : '고른다'}</button>
            </li>
          ))}</ul>
        </div>
      );
    case 'event': {
      const ev = currentEvent(s)!;
      return (
        <div className="pz pz-event">
          <ul className="decide-list">{ev.choices.map((c, i) => (
            <li key={i}><div><b>{c.label}</b><p className="small">자금 {c.cost.funds >= 0 ? '+' : ''}{c.cost.funds}, 일정 {c.cost.days >= 0 ? '+' : ''}{c.cost.days}일</p></div>
              <button type="button" className="btn" onClick={() => submit({ kind: 'event', choice: i })}>이렇게 한다</button></li>
          ))}</ul>
        </div>
      );
    }
    case 'report':
      return (
        <div className="pz pz-report">
          <p><b>질문</b> {p.question}</p>
          <p className="muted small">조사 자료 가운데 질문에 답하는 데 가장 중요한 {p.pick}가지를 고르세요 ({chosen.length}/{p.pick}).</p>
          <ul className="report-list">{s.evidence.map((e) => (
            <li key={e.id}><label><input type="checkbox" checked={chosen.includes(e.id)} disabled={!chosen.includes(e.id) && chosen.length >= p.pick}
              onChange={() => setChosen(chosen.includes(e.id) ? chosen.filter((x) => x !== e.id) : [...chosen, e.id])} /> {e.text} <small>{e.source}</small></label></li>
          ))}</ul>
          <p className="pz-actions"><button type="button" className="btn" disabled={chosen.length === 0} onClick={() => submit({ kind: 'report', evidence: chosen })}>보고서 제출</button></p>
        </div>
      );
    default:
      return null;
  }
}

function EndingView({ camp, ctx, s, text, onAgain, onHub }: { camp: Campaign; ctx: Ctx; s: GameState; text: string; onAgain: () => void; onHub: () => void }) {
  const picked = String(s.flags.reportEvidence ?? '').split(',').filter(Boolean);
  const rec = useJournal().explorer.campaigns[camp.id];
  return (
    <div className="ex-ending">
      <p>{text}</p>
      <dl className="econ-glance">
        <div><dt>최종 점수</dt><dd>{Math.round(finalScore(s))}{rec && <small> 최고 {rec.best}</small>}</dd></div>
        <div><dt>보고서 점수</dt><dd>{s.reportScore ?? 0}</dd></div>
        <div><dt>성공한 임무</dt><dd>{successes(s)} / {Object.keys(s.outcomes).length}</dd></div>
        <div><dt>남은 자원</dt><dd>자금 {s.funds} · {s.days}일</dd></div>
      </dl>
      <p className="small">고른 길: {s.path.join(' → ') || '—'} · 들른 나라: {s.visited.map((v) => ctx.ds.country(v)?.name_ko).join(', ')}</p>
      <p className="small">보고서에 쓴 자료: {s.evidence.filter((e) => picked.includes(e.id)).map((e) => e.text).join(' / ') || '없음'}</p>
      <p className="small muted">본 결말 {rec?.endings.length ?? 1}/{camp.endings.length}: {camp.endings.map((e) => (rec?.endings.includes(e.id) ? e.title : '???')).join(' · ')}</p>
      <p className="pz-actions"><button type="button" className="btn" onClick={onAgain}>다른 길로 다시 탐험</button><button type="button" className="tab" onClick={onHub}>탐험 본부</button>
        <a href="#/journal">탐험일지</a></p>
    </div>
  );
}

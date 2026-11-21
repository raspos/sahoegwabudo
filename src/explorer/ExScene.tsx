import { useEffect, useMemo, useState } from 'react';
import './scene.css';
import { useData } from '../App';
import { Flag } from '../components/common';
import { koppenColor } from '../data/extras';
import { MiniMap } from './ExGraphics';
import type { Scene, SceneLine, SceneVisual } from './scenes';
import { useStoryDocs, CATEGORY_KO } from '../content/storyStore';
import { useExtras } from '../data/extras';
import { storiesForCountry } from '../pages/StoriesSection';

const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const pct = (v: number) => `${Math.round(v * 100)}%`;

/** 도착 장면을 그림 카드로 한 장씩 넘겨 보여 준다 (자동 넘김, 눌러서 멈춤·이동) */
export function SceneStory({ scene, cid, onDone }: { scene: Scene; cid: string; onDone: (notes: Scene['notes']) => void }) {
  const { ds } = useData();
  const docs = useStoryDocs();
  const ex = useExtras();
  // 사회과부도 나라 이야기 가운데 두 편을 '현지에서 들은 이야기' 카드로 덧붙인다 (방문할 때마다 다른 편이 먼저)
  const cards = useMemo<SceneLine[]>(() => {
    if (!docs) return scene.lines;
    const all = storiesForCountry(cid, docs, ds, ex);
    const start = all.length ? (scene.title.length + cid.charCodeAt(0)) % all.length : 0;
    const pick = [...all.slice(start), ...all.slice(0, start)].slice(0, 2);
    return [...scene.lines, ...pick.map((st): SceneLine => ({
      text: `현지에서 들은 이야기 — ${st.title}`,
      source: st.sources[0]?.label.replace(/^CIA World Factbook — [^:]+: .*/, 'CIA World Factbook') ?? '사회과부도 자료',
      visual: { kind: 'tale', category: CATEGORY_KO[st.category], title: st.title, panels: st.panels, cid },
    }))];
  }, [docs, ex, ds, cid, scene]);
  const last = cards.length; // 마지막 장 = 수첩
  const [i, setI] = useState(0);
  const [auto, setAuto] = useState(!reduced());
  const [picked, setPicked] = useState<string[]>([]);
  useEffect(() => {
    if (!auto || i >= last || cards[i].visual?.kind === 'tale') return;
    const t = setTimeout(() => setI((x) => x + 1), cards[i].fiction ? 2600 : 4200);
    return () => clearTimeout(t);
  }, [auto, i, last, cards]);
  const co = ds.country(cid);
  const go = (n: number) => { setAuto(false); setI(Math.max(0, Math.min(last, n))); };

  return (
    <div className="scene-story">
      <div className="ss-head">
        {co && <Flag iso2={co.iso2} size="md" />}
        <h3>{scene.title}</h3>
        <span className="ss-dots" role="tablist" aria-label="장면">
          {[...cards, null].map((_, k) => (
            <button key={k} type="button" role="tab" aria-selected={k === i} aria-label={k === last ? '수첩' : `장면 ${k + 1}`} className={k === i ? 'on' : k < i ? 'seen' : ''} onClick={() => go(k)} />
          ))}
        </span>
        <button type="button" className="btn-text ss-auto" onClick={() => setAuto(!auto)} aria-label={auto ? '자동 넘김 멈추기' : '자동 넘김'}>{auto ? '❚❚' : '▶'}</button>
      </div>
      {i < last ? (
        <div className="ss-stage" key={i} onClick={() => go(i + 1)}>
          <div className="ss-visual"><Visual line={cards[i]} /></div>
          <p className={`ss-caption ${cards[i].fiction ? 'fic' : ''}`}>
            {cards[i].text}
            {cards[i].fiction ? <span className="fiction">가상 장면</span> : cards[i].source && <small> ({cards[i].source})</small>}
          </p>
          {auto && cards[i].visual?.kind !== 'tale' && <i className="ss-timer" style={{ animationDuration: cards[i].fiction ? '2.6s' : '4.2s' }} />}
        </div>
      ) : (
        <div className="ss-stage ss-notes" key="notes">
          {scene.notes.length > 0 ? (
            <>
              <p className="small"><b>수첩에 적어 둘까요?</b> 적은 내용은 조사 자료가 되어 보고서에 쓸 수 있습니다. 질문과 관련 있는지는 직접 판단하세요.</p>
              {scene.notes.map((n) => (
                <label key={n.id} className="ss-note"><input type="checkbox" checked={picked.includes(n.id)} onChange={() => setPicked(picked.includes(n.id) ? picked.filter((x) => x !== n.id) : [...picked, n.id])} /> {n.text} <small>({n.source})</small></label>
              ))}
            </>
          ) : <p className="small muted">수첩에 적을 만한 것은 없었습니다.</p>}
        </div>
      )}
      <p className="pz-actions">
        {i > 0 && <button type="button" className="tab" onClick={() => go(i - 1)}>← 이전</button>}
        {i < last && <button type="button" className="tab" onClick={() => go(i + 1)}>다음 →</button>}
        {i < last && <button type="button" className="btn-text" onClick={() => go(last)}>건너뛰기</button>}
        {i === last && <button type="button" className="btn" autoFocus onClick={() => onDone(scene.notes.filter((n) => picked.includes(n.id)))}>조사를 시작한다</button>}
      </p>
    </div>
  );
}

function Visual({ line }: { line: SceneLine }) {
  const v = line.visual;
  if (!v) return <div className="sv-blank">📜</div>;
  switch (v.kind) {
    case 'arrive': return <Arrive v={v} />;
    case 'where': return <Where v={v} />;
    case 'land': return <Land v={v} />;
    case 'rivers': return <Rivers v={v} />;
    case 'merchant': return <Merchant />;
    case 'heritage': return <Heritage v={v} />;
    case 'market': return <Market v={v} />;
    case 'cargo': return <Cargo v={v} />;
    case 'stats': return <Stats v={v} />;
    case 'tale': return <Tale v={v} />;
  }
}

type V<K extends SceneVisual['kind']> = Extract<SceneVisual, { kind: K }>;

/** 도착: 탈것이 들어와 멈추고, 역 간판이 내려온다 */
function Arrive({ v }: { v: V<'arrive'> }) {
  return (
    <svg viewBox="0 0 400 150" className={`sv sv-arrive m-${v.mode}`} role="img" aria-label={`${v.city} 도착`}>
      <rect width="400" height="150" className="sky" />
      <circle cx="340" cy="34" r="16" className="sun" />
      <g className="clouds"><ellipse cx="80" cy="30" rx="26" ry="9" /><ellipse cx="200" cy="22" rx="20" ry="7" /></g>
      <path d="M0 108 Q60 90 120 104 T240 100 T400 98 V150 H0Z" className="hill" />
      <rect y="118" width="400" height="32" className="ground" />
      {v.mode === 'train' && <g className="rails">{Array.from({ length: 20 }, (_, k) => <rect key={k} x={k * 21} y="121" width="12" height="3" />)}<rect y="119" width="400" height="2" /></g>}
      {v.mode !== 'plane' && <rect y="125" width="400" height="2" className="road" />}
      <g className="sign"><rect x="250" y="56" width="120" height="30" rx="3" /><text x="310" y="76" textAnchor="middle">{v.city}</text><rect x="268" y="86" width="3" height="32" /><rect x="349" y="86" width="3" height="32" /></g>
      <g className="vehicle">
        {v.mode === 'train' && (<g transform="translate(0 84)"><rect x="0" y="6" width="70" height="28" rx="5" className="car" /><rect x="74" y="6" width="70" height="28" rx="5" className="car" /><rect x="148" y="0" width="56" height="34" rx="8" className="loco" />
          {[10, 32, 84, 106].map((x) => <rect key={x} x={x} y="12" width="16" height="10" className="win" />)}<rect x="176" y="7" width="20" height="12" className="win" />
          {[14, 56, 88, 130, 160, 192].map((x) => <circle key={x} cx={x} cy="35" r="5" className="wheel" />)}</g>)}
        {v.mode === 'bus' && (<g transform="translate(40 82)"><rect x="0" y="0" width="120" height="38" rx="7" className="car" />{[10, 34, 58, 82].map((x) => <rect key={x} x={x} y="7" width="18" height="12" className="win" />)}<rect x="104" y="7" width="12" height="20" className="win" /><circle cx="24" cy="39" r="7" className="wheel" /><circle cx="96" cy="39" r="7" className="wheel" /></g>)}
        {v.mode === 'plane' && (<g className="plane-body"><path d="M0 0 L60 -4 Q72 0 60 4 L0 4 Z M20 0 L34 -18 L42 -18 L36 0 Z M20 2 L34 18 L42 18 L36 2 Z M2 0 L-6 -10 L2 -10 L8 0Z" className="car" /></g>)}
      </g>
    </svg>
  );
}

/** 자리: 나라와 이웃 지도, 이웃 국기가 차례로 나타남 */
function Where({ v }: { v: V<'where'> }) {
  const { ds, geo } = useData();
  const marks: Record<string, string> = { [v.country]: 'mm-on', ...Object.fromEntries(v.neighbors.map((n) => [n, 'mm-visited'])) };
  return (
    <div className="sv sv-where">
      <MiniMap geo={geo} focus={[v.country, ...v.neighbors.slice(0, 6)]} current={v.country} marks={marks} pad={16} ratio={1.6} label="나라와 이웃" />
      <div className="sv-where-side">
        <span className={`place-badge p-${v.place}`}>{v.place === 'landlocked' ? '⛰ 바다 없는 내륙국' : v.place === 'coast' ? '🌊 바다에 닿은 나라' : '🏝 섬나라'}</span>
        {v.neighbors.length > 0 && <p className="small">이웃 {v.neighbors.length}개국</p>}
        <div className="nb-flags">{v.neighbors.slice(0, 9).map((n, k) => { const c = ds.country(n); return c ? <span key={n} style={{ animationDelay: `${0.3 + k * 0.12}s` }} title={c.name_ko}><Flag iso2={c.iso2} size="sm" /><small>{c.name_ko}</small></span> : null; })}</div>
      </div>
    </div>
  );
}

/** 풍경: 산 높이(에베레스트와 견줌), 기후 띠, 지형 비율 원 */
function Land({ v }: { v: V<'land'> }) {
  const h = v.peak ? Math.max(18, Math.min(96, (v.peak.m / 8848) * 96)) : 0;
  return (
    <div className="sv sv-land">
      {v.peak && (
        <svg viewBox="0 0 160 130" className="peak" role="img" aria-label={`${v.peak.name} ${v.peak.m}m`}>
          <path d="M10 118 L60 22 L110 118Z" className="ev" />
          <text x="60" y="16" textAnchor="middle" className="ev-t">에베레스트 8,848m</text>
          <path d={`M60 118 L${100} ${118 - h} L140 118Z`} className="pk" style={{ transformOrigin: '100px 118px' }} />
          <text x="100" y={112 - h} textAnchor="middle" className="pk-t">{v.peak.m.toLocaleString('ko-KR')}m</text>
          <rect x="0" y="118" width="160" height="12" className="base" />
          <text x="100" y="128" textAnchor="middle" className="pk-n">{v.peak.name}</text>
        </svg>
      )}
      <div className="land-right">
        {v.landform && (
          <div className="lf-ring">
            <svg viewBox="0 0 64 64" aria-hidden><circle cx="32" cy="32" r="26" className="rb" /><circle cx="32" cy="32" r="26" className="rf" style={{ strokeDasharray: `${v.landform.share * 163} 163` }} /></svg>
            <b>{pct(v.landform.share)}</b>
            <span>{v.landform.name}<small> {v.landform.kind}</small></span>
          </div>
        )}
        <div className="cl-bar" aria-label="기후">
          {v.climate.map((k, n) => <i key={k.code} style={{ flexGrow: k.share, background: koppenColor(k.code), animationDelay: `${0.2 + n * 0.2}s` }} title={`${k.name} ${pct(k.share)}`} />)}
        </div>
        <ul className="cl-key">{v.climate.map((k) => <li key={k.code}><i style={{ background: koppenColor(k.code) }} />{k.name} <b>{pct(k.share)}</b></li>)}</ul>
      </div>
    </div>
  );
}

/** 강: 물줄기가 차례로 그려진다 (길이 비례) */
function Rivers({ v }: { v: V<'rivers'> }) {
  const max = Math.max(...v.rivers.map((r) => r.km), 1);
  return (
    <svg viewBox="0 0 400 140" className="sv sv-rivers" role="img" aria-label={`강: ${v.rivers.map((r) => r.name).join(', ')}`}>
      <rect width="400" height="140" className="land-bg" />
      {v.rivers.map((r, k) => {
        const len = 80 + (r.km / max) * 260, y = 30 + k * 40;
        const d = `M20 ${y} q ${len / 8} -14 ${len / 4} 0 t ${len / 4} 0 t ${len / 4} 0 t ${len / 4} 0`;
        return (
          <g key={r.name}>
            <path d={d} className="river" pathLength={1} style={{ animationDelay: `${k * 0.45}s`, strokeWidth: 3 + (r.km / max) * 4 }} />
            <text x={30 + len} y={y + 4} className="rv-t" style={{ animationDelay: `${0.5 + k * 0.45}s` }}>{r.name} <tspan className="rv-km">{r.km.toLocaleString('ko-KR')}km</tspan></text>
          </g>
        );
      })}
    </svg>
  );
}

function Merchant() {
  return (
    <svg viewBox="0 0 400 140" className="sv sv-merchant" role="img" aria-label="시장 골목">
      <rect width="400" height="140" className="wall" />
      {[0, 1, 2, 3].map((k) => (
        <g key={k} transform={`translate(${20 + k * 95} 20)`} className="stall" style={{ animationDelay: `${k * 0.15}s` }}>
          <path d="M0 20 L40 0 L80 20Z" className={`awn a${k % 2}`} /><rect x="4" y="20" width="72" height="8" className={`awn a${k % 2}`} />
          <rect x="8" y="60" width="64" height="40" className="table" />
          {[0, 1, 2].map((j) => <circle key={j} cx={22 + j * 18} cy={56} r={8} className={`goods g${(k + j) % 3}`} />)}
        </g>
      ))}
      <g className="hand"><text x="350" y="120" fontSize="34">👋</text></g>
    </svg>
  );
}

function Heritage({ v }: { v: V<'heritage'> }) {
  const isGI = v.type === 'gi';
  return (
    <div className={`sv sv-heritage ${isGI ? 'gi' : 'unesco'}`}>
      <div className="seal"><span>{isGI ? 'EU' : 'UNESCO'}</span><small>{isGI ? '지리적 표시' : '인류무형문화유산'}</small><b>{v.year}</b></div>
      <div className="her-text"><b>{v.name}</b><small>{isGI ? v.detail : v.type === 'unesco-food' ? '음식 문화' : '공예'}</small></div>
    </div>
  );
}

function Market({ v }: { v: V<'market'> }) {
  return (
    <div className="sv sv-market">
      <div className="crate"><div className="pile">{Array.from({ length: 7 }, (_, k) => <i key={k} style={{ animationDelay: `${k * 0.08}s` }} />)}</div><span>{v.item}</span></div>
      <div className={`rank-medal ${v.rank <= 3 ? `r${v.rank}` : ''}`}><small>생산량</small><b>세계 {v.rank}위</b>{v.year && <small>{v.year}년</small>}</div>
    </div>
  );
}

/** 화물 전광판: 글자판이 넘어가며 나타나고, 비중 막대가 찬다 */
function Cargo({ v }: { v: V<'cargo'> }) {
  const { ds } = useData();
  const p = v.partner?.iso3 ? ds.country(v.partner.iso3) : undefined;
  return (
    <div className="sv sv-cargo" role="img" aria-label={`수출 1위 ${v.product}, 최대 손님 ${v.partner?.name ?? ''}`}>
      <div className="board">
        <div className="brow head"><span>DEPARTURES · 수출</span><span>{v.year}</span></div>
        <div className="brow"><span className="flap">{v.product}</span><span className="flap num">{(v.share * 100).toFixed(1)}%</span></div>
        <div className="bbar"><i style={{ width: `${v.share * 100}%` }} /></div>
        {v.partner && <div className="brow"><span className="flap d2">→ {p && <Flag iso2={p.iso2} size="sm" />} {v.partner.name}</span><span className="flap num d2">{(v.partner.share * 100).toFixed(1)}%</span></div>}
      </div>
      <svg viewBox="0 0 120 70" className="ship" aria-hidden><path d="M5 45 H110 L98 62 H18Z" className="hull" />{[0, 1, 2, 3].map((k) => <rect key={k} x={18 + k * 21} y={30 - (k % 2) * 8} width="19" height={15 + (k % 2) * 8} className={`ctn c${k % 3}`} />)}<path d="M0 64 Q15 58 30 64 T60 64 T90 64 T120 64" className="wave" /></svg>
    </div>
  );
}

/** 통계 안내판: 산업 구조 띠가 차고, 숫자가 올라간다 */
function Stats({ v }: { v: V<'stats'> }) {
  const s = v.sectors;
  const tot = s ? s.services + s.industry + s.agri : 1;
  return (
    <div className="sv sv-stats">
      {s && (
        <div className="sector">
          <div className="sec-bar">
            <i className="sv-s" style={{ width: `${(s.services / tot) * 100}%` }}><span>서비스 {Math.round(s.services)}%</span></i>
            <i className="sv-i" style={{ width: `${(s.industry / tot) * 100}%` }}><span>산업 {Math.round(s.industry)}%</span></i>
            <i className="sv-a" style={{ width: `${(s.agri / tot) * 100}%` }}><span>{s.agri >= 6 ? `농업 ${Math.round(s.agri)}%` : ''}</span></i>
          </div>
          <small>부가가치 기준 경제 구조 · {s.year}년</small>
        </div>
      )}
      {v.ppp && <div className="ppp"><small>구매력 기준 1인당 GDP</small><b>{v.ppp.text}</b><small>{v.ppp.year}년</small></div>}
    </div>
  );
}

/** 현지에서 들은 이야기: 책장이 펼쳐지고 장면이 한 줄씩 나타난다 */
function Tale({ v }: { v: V<'tale'> }) {
  return (
    <div className="sv sv-tale">
      <div className="tale-book">
        <span className="tale-cat">{v.category}</span>
        <b className="tale-title">{v.title}</b>
        <ol className="tale-panels">
          {v.panels.map((p, k) => <li key={k} style={{ animationDelay: `${0.5 + k * 0.9}s` }}>{p}</li>)}
        </ol>
        <a className="tale-more" href={`#/country/${v.cid}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>도감에서 다른 이야기 읽기 (새 탭)</a>
      </div>
    </div>
  );
}

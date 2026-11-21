import type { Country } from '../data/types';
import './sports.css';
import { useSports, type FifaRow, type Medals, type SportsData } from '../data/sports';

const fmt = (n: number) => n.toLocaleString('ko-KR');

function Move({ r }: { r: FifaRow }) {
  const d = r.prev - r.rank;
  if (!r.prev || d === 0) return <span className="fifa-move same" title="지난 발표와 같은 순위">–</span>;
  return <span className={`fifa-move ${d > 0 ? 'up' : 'down'}`} title={`지난 발표 ${r.prev}위`}>{d > 0 ? '▲' : '▼'}{Math.abs(d)}</span>;
}

/** FIFA 순위 카드: 큰 순위 숫자 + 전체 팀 중 위치 막대 */
function FifaCard({ label, r, date }: { label: string; r: FifaRow; date: string }) {
  const pos = 1 - (r.rank - 1) / Math.max(1, r.of - 1);
  return (
    <div className="fifa-card">
      <p className="fifa-label">{label}{r.team && <b> · {r.team}</b>}</p>
      <p className="fifa-rank"><b>{r.rank}</b>위 <small>/ {r.of}팀</small> <Move r={r} /></p>
      <div className="fifa-track" role="img" aria-label={`${r.of}팀 가운데 ${r.rank}위`}>
        <i style={{ left: `${(1 - pos) * 100}%` }} />
      </div>
      <p className="fifa-meta">{fmt(Math.round(r.points))}점 · {r.conf} · {date.slice(0, 7).replace('-', '년 ')}월 발표</p>
    </div>
  );
}

function MedalRow({ m }: { m: Medals }) {
  return (
    <span className="medals" aria-label={`금 ${m.g}, 은 ${m.s}, 동 ${m.b}`}>
      <span className="medal g" title="금메달">{fmt(m.g)}</span>
      <span className="medal s" title="은메달">{fmt(m.s)}</span>
      <span className="medal b" title="동메달">{fmt(m.b)}</span>
    </span>
  );
}

export function SportsSection({ c, compact }: { c: Country; compact?: boolean }) {
  const d = useSports();
  if (d === undefined) return <p className="muted">불러오는 중…</p>;
  if (!d) return <p className="muted">스포츠 자료를 불러오지 못했습니다.</p>;
  return <SportsBody d={d} c={c} compact={compact} />;
}

function SportsBody({ d, c, compact }: { d: SportsData; c: Country; compact?: boolean }) {
  const s = d.countries[c.id] ?? {};
  const m = d.meta;
  const ol = s.ol;
  const nat = s.national ?? [];
  const official = nat.filter((n) => n.official);
  const popular = nat.filter((n) => !n.official);
  const fifa = (k: 'fifa_m' | 'fifa_w', label: string) => {
    const one = s[k];
    const uk = s[`${k}_uk` as 'fifa_m_uk'];
    if (one) return <FifaCard label={label} r={one} date={m.fifa[k].date} />;
    if (uk?.length) return uk.slice(0, compact ? 1 : 4).map((r) => <FifaCard key={r.team} label={label} r={r} date={m.fifa[k].date} />);
    return <div className="fifa-card fifa-none"><p className="fifa-label">{label}</p><p className="muted small">FIFA 랭킹에 오르지 않음{m.fifa[k].not_ranked.includes(c.id) ? ' (FIFA 비회원이거나 최근 공식 경기가 적음)' : ''}</p></div>;
  };
  const sumT = ol ? ol.summer.t + ol.winter.t : 0;

  return (
    <div className="sports">
      {nat.length > 0 && (
        <div className="nat-sports">
          {official.length > 0 && <p><span className="nat-tag official">국기(법으로 지정)</span> {official.map((n) => <b key={n.sport_en} className="nat-chip">{n.sport_ko}{n.year && <small> {n.year}년</small>}</b>)}</p>}
          {popular.filter((n) => !n.region).length > 0 && <p><span className="nat-tag">국민 스포츠</span> {popular.filter((n) => !n.region).map((n) => <b key={n.sport_en} className="nat-chip">{n.sport_ko}</b>)}</p>}
          {!compact && popular.some((n) => n.region) && (
            <p className="small">{[...new Set(popular.filter((n) => n.region).map((n) => n.region_ko))].map((r) => (
              <span key={r} className="nat-region">{r}: {popular.filter((n) => n.region_ko === r).map((n) => n.sport_ko).join(', ')}</span>
            ))}</p>
          )}
        </div>
      )}

      <h3>축구 국가대표 FIFA 랭킹</h3>
      <div className="fifa-grid">
        {fifa('fifa_m', '남자')}
        {fifa('fifa_w', '여자')}
      </div>
      {c.id === 'GBR' && <p className="small muted">영국은 잉글랜드·스코틀랜드·웨일스·북아일랜드가 각자 국가대표팀으로 출전합니다.</p>}

      <h3>올림픽 메달</h3>
      {!ol ? <p className="muted small">올림픽위원회가 없어 올림픽에 나가지 않습니다.</p> : (
        <div className="olympics">
          <div className="ol-total">
            <p className="ol-big"><b>{fmt(ol.total.t)}</b>개 <small>역대 메달 · {ol.total.games}회 출전</small></p>
            <MedalRow m={ol.total} />
            {sumT > 0 && (
              <div className="ol-split" role="img" aria-label={`하계 ${ol.summer.t}개, 동계 ${ol.winter.t}개`}>
                <span className="sum" style={{ flexGrow: ol.summer.t }}>{ol.summer.t > 0 && `하계 ${fmt(ol.summer.t)}`}</span>
                <span className="win" style={{ flexGrow: ol.winter.t }}>{ol.winter.t > 0 && `동계 ${fmt(ol.winter.t)}`}</span>
              </div>
            )}
            {ol.total.t === 0 && <p className="small muted">아직 올림픽 메달이 없습니다.</p>}
          </div>
          {!compact && (
            <table className="ol-table">
              <thead><tr><th>대회</th><th>메달</th><th>순위</th></tr></thead>
              <tbody>
                {(['ol2024', 'ol2026'] as const).map((k) => (
                  <tr key={k}>
                    <th scope="row">{m.olympics.recent[k].label}</th>
                    <td>{s[k] ? <MedalRow m={s[k]!} /> : <span className="muted small">메달 없음</span>}</td>
                    <td>{s[k] ? `${s[k]!.rank}위` : '–'} <small className="muted">(메달 딴 {m.olympics.recent[k].nocs}개 팀 중)</small></td>
                  </tr>
                ))}
                <tr><th scope="row">하계 역대 ({ol.summer.games}회)</th><td><MedalRow m={ol.summer} /></td><td><a href={`#/rankings/olympic_medals/${c.id}`}>세계 순위</a></td></tr>
                {(ol.winter.games ?? 0) > 0 && <tr><th scope="row">동계 역대 ({ol.winter.games}회)</th><td><MedalRow m={ol.winter} /></td><td><a href={`#/rankings/olympic_gold/${c.id}`}>금메달 순위</a></td></tr>}
              </tbody>
            </table>
          )}
        </div>
      )}
      <details className="dz-src small">
        <summary>출처</summary>
        <ul>
          <li><a href={m.fifa.fifa_m.url} target="_blank" rel="noreferrer">FIFA/Coca-Cola 남자 세계 랭킹</a> ({m.fifa.fifa_m.date}) · <a href={m.fifa.fifa_w.url} target="_blank" rel="noreferrer">FIFA 여자 세계 랭킹</a> ({m.fifa.fifa_w.date})</li>
          <li><a href={m.olympics.url} target="_blank" rel="noreferrer">위키백과 All-time Olympic Games medal table</a>, <a href={m.olympics.recent.ol2024.url} target="_blank" rel="noreferrer">2024</a>·<a href={m.olympics.recent.ol2026.url} target="_blank" rel="noreferrer">2026</a> 메달 표 (IOC 결과 정리, CC BY-SA). 소련·동독 같은 옛 팀의 메달은 지금 나라에 더하지 않았습니다.</li>
          {nat.length > 0 && <li><a href={m.national.url} target="_blank" rel="noreferrer">위키백과 National sport</a> (CC BY-SA): 법으로 정한 국기와, 출처가 달린 비공식 국민 스포츠</li>}
          <li>확인 {m.retrieved_at}</li>
        </ul>
      </details>
    </div>
  );
}

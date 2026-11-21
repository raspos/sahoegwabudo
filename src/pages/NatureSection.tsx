import type { Dataset } from '../data/engine';
import type { Country } from '../data/types';
import { KOPPEN_KO, koppenColor, type Extras } from '../data/extras';

export function NatureSection({ ds, c, ex }: { ds: Dataset; c: Country; ex: Extras | null }) {
  if (!ex) return <p className="muted">불러오는 중…</p>;
  const n = ex.nature?.countries[c.id];
  const forest = ds.latest(c.id, 'forest'), arable = ds.latest(c.id, 'arable');
  if (!n) return <p className="muted">자연환경 자료 없음</p>;
  const shares = n.koppen.filter((k) => k.share !== null);
  return (
    <div className="nature">
      <h3>기후</h3>
      {n.koppen.length === 0 ? <p className="muted">기후 자료 없음</p> : shares.length ? (
        <figure className="climate">
          <div className="climate-bar" role="img" aria-label={shares.map((k) => `${KOPPEN_KO[k.code]} ${Math.round(k.share! * 100)}%`).join(', ')}>
            {shares.map((k) => <span key={k.code} style={{ width: `${k.share! * 100}%`, background: koppenColor(k.code) }} />)}
          </div>
          <ul className="climate-key">
            {shares.map((k) => (
              <li key={k.code}><i style={{ background: koppenColor(k.code) }} />{KOPPEN_KO[k.code]} <small>{k.code}</small> <b>{Math.round(k.share! * 100)}%</b></li>
            ))}
          </ul>
          <figcaption className="src">
            국토에서 각 기후가 차지하는 비율(5% 이상만) · 1991–2020년 평년 · Köppen-Geiger (Beck 외, 2023)
            {n.approx && ' · 나라가 작아 0.1° 격자로는 대략적인 값'}
          </figcaption>
        </figure>
      ) : (
        <p>{KOPPEN_KO[n.koppen[0].code]} <small>{n.koppen[0].code}</small> <small className="src">· 나라가 매우 작아 주변 격자로 본 대략적인 기후 · Köppen-Geiger (Beck 외, 2023)</small></p>
      )}

      <h3>지형과 강</h3>
      <dl className="facts nature-facts">
        <dt>대표 지형</dt>
        <dd>{n.landforms.length ? n.landforms.slice(0, 4).map((l, i) => (
          <span key={l.name_en + i}>{i > 0 && ', '}{l.name_ko ?? l.name_en}<small> ({l.kind_ko}{l.share_of_country >= 0.05 ? `, 국토의 약 ${Math.round(l.share_of_country * 100)}%` : ''})</small></span>
        )) : '자료 없음'}</dd>
        <dt>높은 산</dt>
        <dd>{n.peaks.length ? n.peaks.map((p, i) => <span key={p.name_en}>{i > 0 && ', '}{p.name_ko ?? p.name_en} <small>{p.elevation_m.toLocaleString('ko-KR')}m</small></span>) : '자료 없음'}</dd>
        <dt>주요 강</dt>
        <dd>{n.rivers.length ? n.rivers.map((r) => r.name).join(', ') : '자료 없음'}</dd>
        <dt>산림</dt>
        <dd>{forest ? <>육지의 {forest.value.toFixed(1)}% <small>{forest.year}년</small></> : '자료 없음'}</dd>
        <dt>경작지</dt>
        <dd>{arable ? <>육지의 {arable.value.toFixed(1)}% <small>{arable.year}년</small></> : '자료 없음'}</dd>
      </dl>
      <p className="src">지형·산·강: Natural Earth (강 이름은 원자료 표기) · 산림·경작지: World Bank WDI (FAO)</p>
    </div>
  );
}

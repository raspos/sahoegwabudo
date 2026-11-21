import { useMemo, type ReactNode } from 'react';
import type { Dataset } from '../data/engine';
import type { Country } from '../data/types';
import { fmtValue, koreanUnits } from '../data/format';
import type { Extras } from '../data/extras';
import { profileFor } from '../content/economy';
import { sectorSharesOf } from '../content/sectors';

/** 중학생도 알 수 있는 경제 용어 풀이 */
const TERMS: Record<string, string> = {
  GDP: '국내총생산. 한 나라 안에서 1년 동안 새로 만든 물건과 서비스의 가치를 모두 더한 값',
  '1인당 GDP': 'GDP를 인구로 나눈 값. 국민 한 사람이 평균적으로 만들어 낸 몫',
  구매력: '나라마다 물가가 달라서, 같은 돈으로 살 수 있는 양을 맞춰 비교하는 방법(PPP)',
  부가가치: '물건이나 서비스를 만들며 새로 보탠 가치. 판 값에서 재료값을 뺀 몫',
  수출: '나라 밖으로 상품이나 서비스를 파는 것. 다른 나라에서 들여와 다시 파는 재수출도 포함될 수 있음',
  생산성: '일하는 사람 한 명이 만들어 내는 가치. 여기서는 취업자 1명당 GDP',
};

export function Term({ t, children }: { t: keyof typeof TERMS; children?: ReactNode }) {
  return <abbr className="term" title={TERMS[t]} tabIndex={0}>{children ?? t}<span className="term-tip" role="tooltip">{TERMS[t]}</span></abbr>;
}

const pct = (v: number, d = 1) => `${(v * 100).toFixed(d)}%`;

export const sectorShares = sectorSharesOf;

function SectorBar({ s }: { s: NonNullable<ReturnType<typeof sectorShares>> }) {
  const segs = [
    { k: 'agri', label: '농림어업', v: s.agri },
    { k: 'industry', label: '산업', v: s.industry },
    { k: 'services', label: '서비스업', v: s.services },
  ];
  const other = s.other;
  return (
    <figure className="sector">
      <div className="sector-bar" role="img" aria-label={`농림어업 ${s.agri.toFixed(1)}%, 산업 ${s.industry.toFixed(1)}%(그중 제조업 ${s.manufacturing?.toFixed(1) ?? '자료 없음'}%), 서비스업 ${s.services.toFixed(1)}%`}>
        {segs.map((g) => (
          <span key={g.k} className={`seg seg-${g.k}`} style={{ width: `${Math.max(0, g.v)}%` }}>
            {g.k === 'industry' && s.manufacturing !== undefined && (
              <i className="seg-manuf" style={{ width: `${Math.min(100, (s.manufacturing / g.v) * 100)}%` }} />
            )}
          </span>
        ))}
        {other > 0.5 && <span className="seg seg-other" style={{ width: `${other}%` }} />}
      </div>
      <figcaption>
        <ul className="sector-key">
          <li><i className="seg-agri" />농림어업 <b>{s.agri.toFixed(1)}%</b></li>
          <li><i className="seg-industry" />산업(광업·제조업·건설·전기) <b>{s.industry.toFixed(1)}%</b>
            {s.manufacturing !== undefined && <span className="sub"> └ 그중 <i className="seg-manuf-key" />제조업 <b>{s.manufacturing.toFixed(1)}%</b></span>}
          </li>
          <li><i className="seg-services" />서비스업 <b>{s.services.toFixed(1)}%</b></li>
          {other > 0.5 && <li><i className="seg-other" />기타(생산물세 등 산업에 나누지 않는 몫) <b>{other.toFixed(1)}%</b></li>}
        </ul>
        <span className="src">GDP 대비 부가가치 비중 · {s.year}년 · World Bank WDI</span>
      </figcaption>
    </figure>
  );
}

export function EconomySection({ ds, c, ex, compact }: { ds: Dataset; c: Country; ex: Extras | null; compact?: boolean }) {
  const prof = profileFor(c.id);
  const s = useMemo(() => sectorShares(ds, c.id), [ds, c.id]);
  const trade = ex?.trade?.countries[c.id];
  const agri = ex?.agri?.countries[c.id];
  const spec = ex?.specialties?.countries[c.id];
  const nom = ds.refValue(c.id, 'gdp_pc'), ppp = ds.refValue(c.id, 'gdp_pc_ppp');
  const nomR = ds.rankOf(c.id, 'gdp_pc'), pppR = ds.rankOf(c.id, 'gdp_pc_ppp');
  const exp = ds.latest(c.id, 'exports_gdp'), prod = ds.rankOf(c.id, 'productivity');
  const tour = ds.latest(c.id, 'tourism_exports'), rents = ds.latest(c.id, 'resource_rents');
  const link = (iso: string | null, name: string) =>
    iso && ds.country(iso) ? <a href={`#/${compact ? 'map' : 'country'}/${iso}`}>{ds.country(iso)!.name_ko}</a> : <span title="195개국 기본 목록 밖의 지역">{name}</span>;

  // 비슷한 소득(구매력 기준) 나라의 산업 구조
  const peers = useMemo(() => {
    if (!ppp) return [];
    return ds.countries
      .filter((x) => x.id !== c.id && ds.refValue(x.id, 'gdp_pc_ppp') && sectorShares(ds, x.id))
      .map((x) => ({ x, d: Math.abs(Math.log(ds.refValue(x.id, 'gdp_pc_ppp')!.value / ppp.value)) }))
      .sort((a, b) => a.d - b.d).slice(0, 3).map((p) => p.x);
  }, [ds, c.id, ppp]);

  return (
    <div className="econ">
      {prof && <p className="econ-q">Q. {prof.question}</p>}

      <h3>한눈에 보는 경제</h3>
      <dl className="econ-glance">
        <div><dt><Term t="1인당 GDP" /> (명목)</dt><dd>{fmtValue(ds.indicator('gdp_pc'), nom?.value)}{nomR && <small> {nomR.rank}위/{nomR.of} · {nomR.year}</small>}</dd></div>
        <div><dt>1인당 GDP (<Term t="구매력">구매력 기준</Term>)</dt><dd>{fmtValue(ds.indicator('gdp_pc_ppp'), ppp?.value)}{pppR && <small> {pppR.rank}위/{pppR.of} · {pppR.year}</small>}</dd></div>
        <div><dt><Term t="생산성">취업자 1명당 GDP</Term></dt><dd>{prod ? <>{fmtValue(ds.indicator('productivity'), prod.value)}<small> {prod.rank}위/{prod.of} · {prod.year}</small></> : '자료 없음'}</dd></div>
        <div><dt><Term t="수출" /> 비율 (상품·서비스, GDP 대비)</dt><dd>{exp ? <>{exp.value.toFixed(1)}%<small> {exp.year}</small></> : '자료 없음'}</dd></div>
      </dl>
      {nom && ppp && nom.year === ppp.year && (
        <p className="econ-note">
          명목 1인당 GDP는 시장 환율로 바꾼 달러, 구매력 기준은 나라별 물가를 맞춘 국제달러입니다.
          {ppp.value > nom.value * 1.15 ? ' 구매력 기준 값이 더 크면, 같은 돈으로 살 수 있는 것이 미국보다 많을 만큼 물가가 낮다는 뜻입니다.'
            : ppp.value < nom.value * 0.87 ? ' 구매력 기준 값이 더 작으면, 물가가 비싸 같은 돈으로 살 수 있는 것이 적다는 뜻입니다.'
            : ' 두 값이 비슷하면 물가 수준이 미국과 비슷하다는 뜻입니다.'}
        </p>
      )}

      <h3>주요 산업 — 무엇으로 <Term t="부가가치" />를 만들까?</h3>
      {s ? <SectorBar s={s} /> : <p className="muted">산업별 부가가치 자료 없음</p>}
      {!compact && peers.length > 0 && s && (
        <div className="table-scroll">
          <table className="compare econ-peers">
            <caption>구매력 기준 1인당 GDP가 비슷한 나라와 산업 구조 비교</caption>
            <thead><tr><th scope="col" />{[c, ...peers].map((x) => <th key={x.id} scope="col" className={x.id === c.id ? 'me' : ''}>{x.id === c.id ? x.name_ko : <a href={`#/country/${x.id}`}>{x.name_ko}</a>}</th>)}</tr></thead>
            <tbody>
              {(['agri', 'industry', 'manufacturing', 'services'] as const).map((k) => (
                <tr key={k}>
                  <th scope="row">{{ agri: '농림어업', industry: '산업', manufacturing: '└ 제조업', services: '서비스업' }[k]}</th>
                  {[c, ...peers].map((x) => { const v = sectorShares(ds, x.id)?.[k]; return <td key={x.id} className={x.id === c.id ? 'me' : ''}>{v === undefined ? '자료 없음' : `${v.toFixed(1)}%`}</td>; })}
                </tr>
              ))}
              <tr><th scope="row">기준연도</th>{[c, ...peers].map((x) => <td key={x.id} className={x.id === c.id ? 'me' : ''}>{sectorShares(ds, x.id)?.year}</td>)}</tr>
            </tbody>
          </table>
        </div>
      )}

      <h3>무엇을 수출할까? <small>상품 수출, 상위 5개 상품군</small></h3>
      {!ex ? <p className="muted">불러오는 중…</p> : trade ? (
        <>
          <ol className="exports">
            {trade.products.slice(0, 5).map((p) => (
              <li key={p.hs}>
                <span className="ex-name" title={`HS ${p.hs}류 · ${p.name_en}`}>{p.name_ko}<small>HS {p.hs}</small></span>
                <span className="ex-bar" aria-hidden><i style={{ width: `${Math.min(100, p.share * 100 / Math.max(trade.products[0].share, 0.0001))}%` }} /></span>
                <span className="ex-val">{koreanUnits(p.value)} 달러 <b>{pct(p.share)}</b></span>
              </li>
            ))}
          </ol>
          <p className="src">
            전체 상품 수출 {koreanUnits(trade.total)} 달러 중 비중 · {trade.year}년 · Source: UN Comtrade (HS 2단위, 재수출 포함)
            {trade.unspecified_share > 0.05 && <> · 분류되지 않은 상품 {pct(trade.unspecified_share)}</>}
          </p>
          <h3>누구에게 수출할까?</h3>
          <ol className="partners">
            {trade.partners.map((p) => (
              <li key={p.code}>{link(p.iso3, p.name_ko ?? p.name_en)} <span className="ex-val">{koreanUnits(p.value)} 달러 <b>{pct(p.share)}</b></span></li>
            ))}
          </ol>
          {trade.partner_unspecified_share > 0.1 && (
            <p className="econ-note">이 나라는 상품 수출의 {pct(trade.partner_unspecified_share)}를 상대국을 밝히지 않고(지역 미상) 보고해, 위 비중은 실제 상대국 순위를 다 보여 주지 못합니다.</p>
          )}
          <p className="src">{trade.year}년 · Source: UN Comtrade · 서비스 수출은 포함하지 않음</p>
        </>
      ) : <p className="muted">상품 수출 자료 없음 (UN Comtrade에 보고된 2022~2024년 자료 없음)</p>}

      {(tour || rents) && (
        <dl className="econ-glance econ-small">
          {tour && <div><dt>관광 수입 (총수출 대비)</dt><dd>{tour.value.toFixed(1)}%<small> {tour.year}년 · 최근 자료가 아님{(tour.year === 2020 || tour.year === 2021) && ' · 코로나19로 국제 관광이 크게 줄었던 해'}</small></dd></div>}
          {rents && <div><dt>천연자원 지대 (GDP 대비)</dt><dd>{rents.value.toFixed(1)}%<small> {rents.year}년 · 최근 자료가 아님</small></dd></div>}
        </dl>
      )}

      {prof && prof.facts.length > 0 && (
        <>
          <h3>공식 통계로 더 보기</h3>
          <ul className="facts-list">
            {prof.facts.map((f) => (
              <li key={f.text}>{f.text} <small>({f.period}, <a href={f.url} target="_blank" rel="noreferrer">{f.source}</a>)</small></li>
            ))}
          </ul>
        </>
      )}

      <h3>특산물과 주요 생산품</h3>
      <div className="specialty">
        <section>
          <h4>A. 많이 생산하는 농축산물</h4>
          {agri?.by_tonnes.length ? (
            <ul>{agri.by_tonnes.map((i) => <li key={i.item}>{i.name_ko} <small>{koreanUnits(i.tonnes)} t · 세계 {i.rank}위</small></li>)}</ul>
          ) : <p className="muted">자료 없음</p>}
          {agri?.representative.length ? (
            <p className="spec-rank">세계 순위가 높은 품목: {agri.representative.map((i) => `${i.name_ko} ${i.rank}위`).join(', ')}</p>
          ) : null}
          <p className="src">{ex?.agri?.meta.year}년 · FAOSTAT (CC BY 4.0)</p>
        </section>
        <section>
          <h4>B. 수출액이 큰 상품</h4>
          {trade ? <ul>{trade.products.slice(0, 3).map((p) => <li key={p.hs}>{p.name_ko} <small>{pct(p.share)}</small></li>)}</ul> : <p className="muted">자료 없음</p>}
          <p className="src">{trade?.year}년 · UN Comtrade</p>
        </section>
        <section>
          <h4>C. 역사·문화적으로 알려진 특산물</h4>
          {spec?.unesco.length ? (
            <>
              <p className="spec-sub">유네스코 인류무형문화유산</p>
              <ul>{spec.unesco.map((u) => (
                <li key={u.id}>
                  <a href={u.url} target="_blank" rel="noreferrer" lang="en">{u.name_en}</a>
                  <small> {u.kind === 'food' ? '음식·음료' : '공예'} · {u.year}년{u.list === 'USL' ? ' · 긴급보호' : ''}{u.shared_with.length ? ` · ${u.shared_with.length}개 나라와 공동 등재` : ''}</small>
                </li>
              ))}</ul>
            </>
          ) : null}
          {spec?.gi.length ? (
            <>
              <p className="spec-sub">EU 지리적 표시 등록 명칭 <small>(모두 {spec.gi_total}개 중)</small></p>
              <ul>{spec.gi.map((g) => (
                <li key={g.file}><span lang="und">{g.name}</span> <small>{g.category_ko} · {g.type} · {g.year}년 · {g.file}</small></li>
              ))}</ul>
            </>
          ) : null}
          {prof?.specialties.length ? (
            <ul>{prof.specialties.map((f) => <li key={f.text}>{f.text} <small>(<a href={f.url} target="_blank" rel="noreferrer">{f.source}</a>)</small></li>)}</ul>
          ) : null}
          {!spec?.unesco.length && !spec?.gi.length && !prof?.specialties.length && <p className="muted">유네스코 인류무형문화유산이나 EU 지리적 표시에 등록된 특산물이 없습니다.</p>}
          {(spec?.unesco.length || spec?.gi.length) ? (
            <p className="src">
              {spec?.unesco.length ? 'UNESCO Intangible Cultural Heritage' : ''}
              {spec?.unesco.length && spec?.gi.length ? ' · ' : ''}
              {spec?.gi.length ? <><a href={ex?.specialties?.meta.gi_register_url} target="_blank" rel="noreferrer">EU 지리적 표시 등록부(eAmbrosia)</a>에서 등록 번호로 찾을 수 있음</> : ''}
            </p>
          ) : null}
        </section>
      </div>
    </div>
  );
}

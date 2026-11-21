import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { go, useData } from '../App';
import { WorldMap, type WorldMapHandle } from '../map/WorldMap';
import type { MapShape } from '../map/geo';
import { CONTINENTS, type ContinentId, type IndicatorId } from '../data/types';
import { colorFor, POLITICAL, SCALES, UNLISTED } from '../data/scales';
import { CountrySearch, CountryTip, Legend } from '../components/common';
import { Dossier } from './Dossier';
import { journal, useJournal } from '../store/journal';
import { todaysDiscovery } from '../content/discovery';
import { fmtValue, josa } from '../data/format';

type Theme = 'political' | 'density' | 'gdp_pc';
const THEMES: { id: Theme; label: string }[] = [
  { id: 'political', label: '기본 지도' },
  { id: 'density', label: '인구밀도' },
  { id: 'gdp_pc', label: '1인당 GDP' },
];

export function MapPage({ countryId }: { countryId?: string }) {
  const { ds, geo } = useData();
  const mapRef = useRef<WorldMapHandle>(null);
  const [theme, setTheme] = useState<Theme>('political');
  const j = useJournal();
  const selected = countryId && ds.country(countryId) ? countryId : null;

  useEffect(() => {
    if (selected) journal.visit(selected);
  }, [selected]);

  const fillFor = useCallback((s: MapShape) => {
    if (!s.props.listed) return UNLISTED;
    if (theme === 'political') return POLITICAL[(s.props.mc ?? 1) % POLITICAL.length];
    const v = ds.refValue(s.id, theme as IndicatorId)?.value;
    return colorFor(SCALES[theme as IndicatorId], v);
  }, [ds, theme]);

  const classFor = useCallback((s: MapShape) => (j.visited[s.id] && theme === 'political' ? 'visited' : undefined), [j.visited, theme]);

  const labelFor = useCallback((s: MapShape) => (s.props.listed ? ds.country(s.id)?.name_ko : undefined), [ds]);

  const tooltip = useCallback((s: MapShape) => {
    const c = ds.country(s.id);
    if (!c) return <div className="tip"><strong>{s.props.ne_name_ko || s.props.ne_name_en}</strong><p className="tip-note">195개국 기본 목록 밖의 지역</p></div>;
    if (theme === 'political') return <CountryTip ds={ds} c={c} />;
    const ind = ds.indicator(theme as IndicatorId);
    const r = ds.rankOf(c.id, ind.indicator_id);
    return (
      <div className="tip">
        <CountryTip ds={ds} c={c} />
        <p className="tip-metric">{ind.name_ko} <b>{fmtValue(ind, r?.value)}</b>{r && <> · {r.of}개국 중 {r.rank}위</>} <small>({ind.ref_year})</small></p>
      </div>
    );
  }, [ds, theme]);

  const open = (id: string) => go(`map/${id}`, !!selected);
  const close = () => go('', true);

  const disc = useMemo(() => todaysDiscovery(ds, new Date()), [ds]);
  const visitedCount = Object.keys(j.visited).filter((id) => ds.country(id)).length;

  return (
    <div className={`mappage ${selected ? 'has-panel' : ''}`}>
      <section className="map-stage" aria-label="세계지도">
        <div className="chart-room">
          <CountrySearch
            countries={ds.countries}
            onPick={(c) => { mapRef.current?.zoomToCountry(c.id); open(c.id); }}
            placeholder="나라 이름 찾기 (한글·영어)"
          />
          <div className="cr-row" role="group" aria-label="대륙으로 이동">
            {CONTINENTS.map((c) => (
              <button key={c.id} type="button" className="chip" onClick={() => mapRef.current?.zoomToContinent(c.id as ContinentId)}>{c.name}</button>
            ))}
          </div>
          <div className="cr-row themes" role="radiogroup" aria-label="지도 주제">
            {THEMES.map((t) => (
              <button key={t.id} type="button" role="radio" aria-checked={theme === t.id} className={`tab ${theme === t.id ? 'on' : ''}`} onClick={() => setTheme(t.id)}>{t.label}</button>
            ))}
          </div>
        </div>

        <div className="map-area">
        <WorldMap
          ref={mapRef}
          geo={geo}
          fillFor={fillFor}
          classFor={classFor}
          labelFor={labelFor}
          selected={selected}
          onSelect={open}
          tooltip={tooltip}
          ariaLabel="세계지도. 화살표 키로 나라를 옮겨 다니고 Enter 로 도감을 엽니다. +, - 로 확대·축소합니다."
          announce={(s) => ds.country(s.id)?.name_ko ?? ''}
          legendSlot={theme !== 'political' ? <Legend scale={SCALES[theme]} indicator={ds.indicator(theme)} /> : null}
        />

        <div className="zoom-ctl" role="group" aria-label="지도 확대·축소">
          <button type="button" onClick={() => mapRef.current?.zoomBy(1.8)} aria-label="확대">+</button>
          <button type="button" onClick={() => mapRef.current?.zoomBy(1 / 1.8)} aria-label="축소">−</button>
          <button type="button" onClick={() => mapRef.current?.reset()} aria-label="세계 전체 보기" className="zc-reset">전체</button>
        </div>

        <aside className="marginalia">
          {disc && (
            <div className="discovery">
              <h2>오늘의 발견</h2>
              <p>
                <button type="button" className="linkish" onClick={() => { mapRef.current?.zoomToCountry(disc.country.id); open(disc.country.id); }}>{disc.country.name_ko}</button>
                {josa(disc.country.name_ko, '은는').slice(disc.country.name_ko.length)} {disc.text}
              </p>
            </div>
          )}
          <div className="log">
            <h2>탐험 기록</h2>
            <p><b>{visitedCount}</b> / {ds.countries.length}개국 방문 <a href="#/journal">탐험일지</a></p>
          </div>
          <p className="credit">© 2026 <a href="https://raspos.github.io/databrew/" target="_blank" rel="noopener noreferrer">databrew</a> · 독립 데이터저널리즘 프로젝트</p>
        </aside>
        </div>
      </section>

      {selected && (
        <aside className="dossier-panel" aria-label="나라 도감">
          <Dossier id={selected} compact onClose={close} />
        </aside>
      )}
    </div>
  );
}

import { useId, useMemo, useState, type ReactNode } from 'react';
import { searchCountries } from '../data/search';
import type { Country, Indicator } from '../data/types';
import { continentName } from '../data/types';
import type { Scale } from '../data/scales';
import type { Dataset } from '../data/engine';
import { fmtValue } from '../data/format';

export function Flag({ iso2, size = 'md', title }: { iso2: string; size?: 'sm' | 'md' | 'lg'; title?: string }) {
  return <span className={`fi fi-${iso2.toLowerCase()} flag flag--${size}`} role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true} />;
}

/** 나라 검색 (콤보박스). 한국어·영어·별칭·초성 */
export function CountrySearch({ countries, onPick, placeholder = '나라 이름 찾기', autoFocus, compact }: {
  countries: Country[]; onPick: (c: Country) => void; placeholder?: string; autoFocus?: boolean; compact?: boolean;
}) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const id = useId();
  const results = useMemo(() => searchCountries(countries, q), [countries, q]);
  const pick = (c: Country) => {
    onPick(c);
    setQ('');
    setOpen(false);
  };
  return (
    <div className={`search ${compact ? 'search--compact' : ''}`}>
      <label htmlFor={id} className="sr-only">{placeholder}</label>
      <input
        id={id}
        type="search"
        role="combobox"
        aria-expanded={open && results.length > 0}
        aria-controls={id + '-list'}
        aria-activedescendant={open && results[active] ? `${id}-${results[active].id}` : undefined}
        aria-autocomplete="list"
        autoComplete="off"
        autoFocus={autoFocus}
        placeholder={placeholder}
        value={q}
        onChange={(e) => { setQ(e.target.value); setActive(0); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          else if (e.key === 'Enter' && results[active]) { e.preventDefault(); pick(results[active]); }
          else if (e.key === 'Escape') setOpen(false);
        }}
      />
      {open && results.length > 0 && (
        <ul className="search-list" role="listbox" id={id + '-list'}>
          {results.map((c, i) => (
            <li
              key={c.id}
              id={`${id}-${c.id}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => { e.preventDefault(); pick(c); }}
              onMouseEnter={() => setActive(i)}
            >
              <Flag iso2={c.iso2} size="sm" />
              <span className="sl-name">{c.name_ko}</span>
              <span className="sl-en">{c.name_en}</span>
              <span className="sl-cont">{continentName(c.continent)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Legend({ scale, indicator, title }: { scale: Scale; indicator: Indicator; title?: ReactNode }) {
  return (
    <figure className="legend" aria-label={`${indicator.name_ko} 범례`}>
      <figcaption>
        <strong>{title ?? indicator.name_ko}</strong>
        <span>{indicator.unit} · {indicator.ref_year}년</span>
      </figcaption>
      <ol className="legend-steps">
        {scale.colors.map((c, i) => (
          <li key={c}>
            <i style={{ background: c }} />
            <span>{scale.labels[i]}</span>
          </li>
        ))}
        <li className="legend-nodata"><i /><span>자료 없음</span></li>
      </ol>
      <p className="legend-src">{srcName(indicator)}</p>
    </figure>
  );
}

/** 지도 위에 마우스를 올렸을 때 보이는 짧은 정보 */
export function CountryTip({ ds, c }: { ds: Dataset; c: Country }) {
  const pop = ds.latest(c.id, 'population');
  const area = ds.latest(c.id, 'area');
  return (
    <div className="tip">
      <div className="tip-head"><Flag iso2={c.iso2} /><strong>{c.name_ko}</strong><span>{c.name_en}</span></div>
      <dl>
        <dt>수도</dt><dd>{c.capital_ko.join(', ') || '—'}</dd>
        <dt>인구</dt><dd>{pop ? `${fmtValue(ds.indicator('population'), pop.value, { short: true })} (${pop.year})` : '자료 없음'}</dd>
        <dt>면적</dt><dd>{area ? `${fmtValue(ds.indicator('area'), area.value)} (${area.year})` : '자료 없음'}</dd>
      </dl>
    </div>
  );
}

/** 지표 출처 짧은 이름 */
export function srcName(ind: Indicator): string {
  if (ind.group !== 'sports') return 'World Bank WDI';
  return ind.indicator_id.startsWith('fifa') ? `FIFA 세계 랭킹 (${ind.source.match(/\((.*)\)/)?.[1] ?? ''})` : '위키백과 올림픽 역대 메달 표 (IOC 결과)';
}

export function SourceLine({ ind, count }: { ind: Indicator; count?: number }) {
  return (
    <p className="source-line">
      {ind.ref_year}년 · {ind.unit} · {count ?? ind.ref_count}개국 · <a href={ind.source_url} target="_blank" rel="noreferrer">{ind.group === 'sports' ? srcName(ind) : `World Bank WDI (${ind.source_code})`}</a>
    </p>
  );
}

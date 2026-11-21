import { useMemo, useState } from 'react';
import type { Dataset } from '../data/engine';
import type { Extras } from '../data/extras';
import type { Country, IndicatorId } from '../data/types';
import { storiesFor } from '../content/stories';
import { CATEGORY_KO, renderStoryText, type StoryCategory, type StoryDoc, type StorySource } from '../content/storyStore';
import { journal, useJournal } from '../store/journal';

/** 도감에 보여 줄 이야기 하나 (JSON 이야기 + 기존 코드 이야기를 같은 모양으로) */
export interface ViewStory {
  id: string;
  title: string;
  category: StoryCategory;
  panels: string[];
  indicators: IndicatorId[];
  related: string[];
  next?: { country: string; why: string };
  sources: StorySource[];
  notes: string[];
}

/** 예전 코드 이야기의 분야 (나라 이름만 바꾼 틀 이야기 7편은 도감에서 뺀다: 같은 수치가 경제 도감 섹션에 있다) */
const LEGACY_CATEGORY: Record<string, StoryCategory> = {
  'kor-economy': 'economy', 'kor-population': 'culture', 'jpn-quake': 'geo', 'jpn-aging': 'culture', 'chn-population': 'history',
  'chn-factory': 'economy', 'chn-huline': 'geo', 'usa-economy': 'economy', 'usa-states': 'history', 'nld-lowland': 'geo',
  'nld-agri': 'economy', 'mng-sparse': 'geo', 'mng-nomad': 'culture', 'sgp-port': 'economy',
  'aut-income': 'economy', 'aut-exports': 'economy', 'aut-alps': 'geo',
};
export const RETIRED_TEMPLATE = (id: string) => id.endsWith('-economy-structure');

export function storiesForCountry(cid: string, docs: StoryDoc[], ds: Dataset, ex: Extras | null): ViewStory[] {
  const legacy: ViewStory[] = storiesFor(cid)
    .filter((s) => !RETIRED_TEMPLATE(s.id) && LEGACY_CATEGORY[s.id])
    .filter((s) => !s.needsExtras || ex)
    .map((s) => ({
      id: s.id, title: s.question, category: LEGACY_CATEGORY[s.id], panels: s.panels(ds, ex).map((p) => p.text),
      indicators: s.indicators, related: [], sources: [], notes: s.notes ?? [],
    }));
  const json: ViewStory[] = docs.filter((d) => d.country === cid).map((d) => ({
    id: d.id, title: d.title, category: d.category, panels: d.panels.map((p) => renderStoryText(p, ds, ex)),
    indicators: d.indicators ?? [], related: d.related ?? [], next: d.next, sources: d.sources, notes: [],
  }));
  return [...json, ...legacy];
}

export function StoriesSection({ c, ds, ex, docs, compact }: { c: Country; ds: Dataset; ex: Extras | null; docs: StoryDoc[] | null; compact?: boolean }) {
  const all = useMemo(() => (docs ? storiesForCountry(c.id, docs, ds, ex) : []), [c.id, docs, ds, ex]);
  const [cat, setCat] = useState<StoryCategory | 'all'>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const j = useJournal();
  if (!docs) return <p className="muted">이야기를 불러오는 중…</p>;
  if (!all.length) return <p className="muted">이 나라의 이야기는 아직 준비 중입니다.</p>;
  const cats = [...new Set(all.map((s) => s.category))];
  const list = (cat === 'all' ? all : all.filter((s) => s.category === cat));
  const shown = compact ? list.slice(0, 2) : list;
  const link = (id: string) => `#/${compact ? 'map' : 'country'}/${id}`;

  return (
    <div className="stories">
      {!compact && cats.length > 1 && (
        <div className="story-tabs" role="tablist" aria-label="이야기 분야">
          <button type="button" role="tab" aria-selected={cat === 'all'} className={`tab ${cat === 'all' ? 'on' : ''}`} onClick={() => setCat('all')}>전체 {all.length}</button>
          {cats.map((k) => (
            <button key={k} type="button" role="tab" aria-selected={cat === k} className={`tab ${cat === k ? 'on' : ''}`} onClick={() => setCat(k)}>
              {CATEGORY_KO[k]} {all.filter((s) => s.category === k).length}
            </button>
          ))}
        </div>
      )}
      {shown.map((s, i) => {
        const open = openId === s.id || (openId === null && !compact && i === 0);
        return (
          <article key={s.id} className={`story2 ${open ? 'is-open' : ''}`}>
            <button type="button" className="story-head" aria-expanded={open} onClick={() => setOpenId(open ? '' : s.id)}>
              <span className="story-cat">{CATEGORY_KO[s.category]}</span>
              <span className="story-title">{s.title}</span>
              {j.stories[s.id] && <span className="read-mark">읽음</span>}
            </button>
            {open && (
              <div className="story-body">
                <div className="panels">
                  {s.panels.map((p, k) => (
                    <div className="panel" key={k}><span className="panel-no">{k + 1}</span><p>{p}</p></div>
                  ))}
                </div>
                <div className="story-foot">
                  {s.related.length > 0 && (
                    <p>함께 보기 {s.related.map((r, k) => <span key={r}>{k > 0 && ', '}<a href={link(r)}>{ds.country(r)?.name_ko ?? r}</a></span>)}</p>
                  )}
                  {s.indicators.filter((iid) => ds.indicatorById.get(iid)?.rank).length > 0 && (
                    <p>관련 세계 랭킹 {s.indicators.filter((iid) => ds.indicatorById.get(iid)?.rank).map((iid, k) => (
                      <span key={iid}>{k > 0 && ', '}<a href={`#/rankings/${iid}/${c.id}`}>{ds.indicator(iid).name_ko}</a></span>
                    ))}</p>
                  )}
                  {s.next && ds.country(s.next.country) && (
                    <p className="story-next">다음 탐험 → <a href={link(s.next.country)}>{ds.country(s.next.country)!.name_ko}</a> <span>{s.next.why}</span></p>
                  )}
                  {(s.sources.length > 0 || s.notes.length > 0) && (
                    <details className="story-src">
                      <summary>출처</summary>
                      <ul>
                        {s.sources.map((src) => <li key={src.url + src.label}><a href={src.url} target="_blank" rel="noreferrer">{src.label}</a>{src.accessed && <small> (확인 {src.accessed})</small>}</li>)}
                        {s.notes.map((n) => <li key={n}>{n}</li>)}
                      </ul>
                      <p className="small muted">문장 속 숫자는 World Bank·UN Comtrade·FAOSTAT 등 사회과부도 자료에서 바로 읽어 옵니다.</p>
                    </details>
                  )}
                  {!j.stories[s.id] && <button type="button" className="tab story-done" onClick={() => journal.readStory(s.id)}>다 읽었어요</button>}
                </div>
              </div>
            )}
          </article>
        );
      })}
      {compact && list.length > shown.length && (
        <p className="story-more"><a href={`#/country/${c.id}`}>이야기 {list.length - shown.length}편 더 — 펼친 도감에서 읽기</a></p>
      )}
    </div>
  );
}

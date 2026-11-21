import { KOPPEN_KO } from '../data/extras';
import { fmtValue, josa } from '../data/format';
import { sectorSharesOf } from '../content/sectors';
import type { Ctx, Evidence } from './types';

/**
 * 도착 장면: 새 나라에 처음 들어설 때 임무 앞에 보이는 짧은 현지 이야기.
 * - 사실 문장은 모두 데이터(Köppen·Natural Earth·FAOSTAT·UNESCO·EU GI·UN Comtrade·World Bank)에서 만들고 출처를 단다.
 * - 이야기를 잇는 인물·상황(역무원, 상인 등)만 지어내며 fiction 으로 표시한다. 인물에게 통계를 말하게 하지 않는다.
 * - 장면마다 visual(그림으로 풀 자료)을 함께 넘긴다. 화면은 이 값으로 그림·애니메이션을 그리고, text 는 자막으로 쓴다.
 */
export type SceneVisual =
  | { kind: 'arrive'; mode: 'train' | 'plane' | 'bus'; city: string }
  | { kind: 'where'; country: string; neighbors: string[]; place: 'landlocked' | 'coast' | 'island' }
  | { kind: 'land'; landform?: { name: string; kind: string; share: number }; climate: { code: string; name: string; share: number }[]; peak?: { name: string; m: number } }
  | { kind: 'rivers'; rivers: { name: string; km: number }[] }
  | { kind: 'merchant' }
  | { kind: 'heritage'; name: string; year: number; type: 'unesco-food' | 'unesco-craft' | 'gi'; detail?: string }
  | { kind: 'market'; item: string; rank: number; year?: number }
  | { kind: 'cargo'; product: string; share: number; partner?: { iso3?: string; name: string; share: number }; year: number }
  | { kind: 'stats'; sectors?: { services: number; industry: number; agri: number; year: number }; ppp?: { text: string; year: number } }
  | { kind: 'tale'; category: string; title: string; panels: string[]; cid: string };

export interface SceneLine { text: string; source?: string; fiction?: boolean; visual?: SceneVisual }
export interface Scene { title: string; lines: SceneLine[]; notes: Evidence[] }

const GREET: { mode: 'train' | 'plane' | 'bus'; text: (cap: string) => string }[] = [
  { mode: 'train', text: (cap) => `기차가 ${cap}에 닿자 역무원이 짐을 내리는 걸 도와줍니다.` },
  { mode: 'plane', text: (cap) => `비행기가 ${cap} 공항에 내립니다. 입국 심사관이 탐험 본부 조사원증을 신기한 듯 들여다봅니다.` },
  { mode: 'bus', text: (cap) => `버스가 ${cap} 시내로 들어섭니다. 옆자리 승객이 창밖을 가리키며 이것저것 알려 줍니다.` },
];

export function arrivalScene(c: Ctx, cid: string, seed: number): Scene | undefined {
  const { ds, ex } = c;
  const co = ds.country(cid);
  if (!co) return undefined;
  const lines: SceneLine[] = [];
  const notes: Evidence[] = [];
  const cap = co.capital_ko[0] ?? co.name_ko;
  // 섬나라에는 기차가 닿지 않는다
  const greet = co.borders.length === 0 && GREET[seed % GREET.length].mode === 'train' ? GREET[1] : GREET[seed % GREET.length];
  lines.push({ text: greet.text(cap), fiction: true, visual: { kind: 'arrive', mode: greet.mode, city: cap } });

  // 자리: 지역·이웃·바다
  const place = co.landlocked ? 'landlocked' : co.borders.length ? 'coast' : 'island';
  lines.push({
    text: `${co.region_ko}의 ${place === 'landlocked' ? '바다 없는 내륙국' : place === 'coast' ? '바다에 닿은 나라' : '섬나라'}입니다.${co.borders.length ? ` 땅으로 맞닿은 이웃은 ${co.borders.map((b) => ds.country(b)?.name_ko).join(', ')}입니다.` : ''}`,
    source: 'mledoze/countries', visual: { kind: 'where', country: cid, neighbors: co.borders, place },
  });

  // 풍경: 지형·기후·산·강
  const n = ex.nature?.countries[cid];
  if (n) {
    const lf = n.landforms.find((l) => l.name_ko && l.share_of_country >= 0.05);
    const cl = n.koppen.filter((k) => k.share).slice(0, 3);
    const parts: string[] = [];
    if (!cl.length && n.koppen[0]) parts.push(`기후는 대략 ${KOPPEN_KO[n.koppen[0].code]}입니다`);
    if (lf) parts.push(`국토의 약 ${Math.round(lf.share_of_country * 100)}%가 ${lf.name_ko}(${lf.kind_ko})에 속합니다`);
    if (cl.length) parts.push(`기후는 ${cl.slice(0, 2).map((k) => `${KOPPEN_KO[k.code]} ${Math.round(k.share! * 100)}%`).join(', ')}입니다`);
    const pk = n.peaks.find((p) => p.name_ko);
    if (pk) parts.push(`가장 높은 산은 ${pk.name_ko}(${pk.elevation_m.toLocaleString('ko-KR')}m)입니다`);
    if (parts.length) {
      lines.push({
        text: `창밖 풍경 — ${parts.join('. ')}.`, source: 'Natural Earth · Köppen-Geiger 1991–2020',
        visual: {
          kind: 'land',
          landform: lf ? { name: lf.name_ko!, kind: lf.kind_ko, share: lf.share_of_country } : undefined,
          climate: (cl.length ? cl : n.koppen.slice(0, 1)).map((k) => ({ code: k.code, name: KOPPEN_KO[k.code], share: k.share ?? 1 })),
          peak: pk ? { name: pk.name_ko!, m: pk.elevation_m } : undefined,
        },
      });
      if (lf) notes.push({ id: `${cid}:scene-land`, text: `${co.name_ko} 국토의 약 ${Math.round(lf.share_of_country * 100)}%가 ${lf.name_ko}`, source: 'Natural Earth로 계산', tags: ['geo'], country: cid });
    }
    if (n.rivers.length) {
      const rv = n.rivers.slice(0, 3);
      lines.push({ text: `지도에 굵게 그려진 강: ${rv.map((r) => r.name).join(', ')}.`, source: 'Natural Earth',
        visual: { kind: 'rivers', rivers: rv.map((r) => ({ name: r.name, km: r.km_in_country })) } });
    }
  }

  // 시장: 특산물(UNESCO·EU GI) → 없으면 FAO 대표 생산품
  const sp = ex.specialties?.countries[cid];
  const food = sp?.unesco.find((u) => u.kind === 'food');
  const craft = sp?.unesco.find((u) => u.kind === 'craft');
  const gi = sp?.gi[0];
  const agri = ex.agri?.countries[cid];
  if (food || craft || gi) {
    lines.push({ text: '시장 골목에 들어서자 상인이 손짓합니다. "여기 왔으면 이건 꼭 보고 가야지요."', fiction: true, visual: { kind: 'merchant' } });
    if (food) lines.push({ text: `${food.name_en} — ${food.year}년 유네스코 인류무형문화유산에 오른 음식 문화입니다.`, source: 'UNESCO ICH',
      visual: { kind: 'heritage', name: food.name_en, year: food.year, type: 'unesco-food' } });
    if (gi) lines.push({ text: `${gi.name} — EU에 지리적 표시(${gi.type})로 등록된 ${gi.category_ko}입니다(${gi.year}년, 등록번호 ${gi.file}).`, source: 'EU 지리적 표시 등록부',
      visual: { kind: 'heritage', name: gi.name, year: gi.year, type: 'gi', detail: `${gi.type} · ${gi.category_ko}` } });
    if (craft && !food) lines.push({ text: `${craft.name_en} — ${craft.year}년 유네스코 인류무형문화유산에 오른 공예입니다.`, source: 'UNESCO ICH',
      visual: { kind: 'heritage', name: craft.name_en, year: craft.year, type: 'unesco-craft' } });
    notes.push({ id: `${cid}:scene-specialty`, text: `${co.name_ko}의 특산: ${food?.name_en ?? gi?.name ?? craft?.name_en}`, source: food || craft ? 'UNESCO ICH' : 'EU 지리적 표시 등록부', tags: ['culture'], country: cid });
  } else if (agri?.representative[0]) {
    const a = agri.representative[0];
    lines.push({ text: `시장에는 ${josa(a.name_ko, '이가')} 수북이 쌓여 있습니다. ${josa(co.name_ko, '은는')} ${a.name_ko} 생산량이 세계 ${a.rank}위입니다(${ex.agri?.meta.year}년).`, source: 'FAOSTAT',
      visual: { kind: 'market', item: a.name_ko, rank: a.rank, year: ex.agri?.meta.year } });
    notes.push({ id: `${cid}:scene-agri`, text: `${co.name_ko} ${a.name_ko} 생산 세계 ${a.rank}위`, source: `FAOSTAT ${ex.agri?.meta.year}`, tags: ['culture'], country: cid });
  }

  // 산업: 수출 1위(분류되지 않은 상품 HS 99 는 건너뜀)·최대 손님·산업 구조
  const tr = ex.trade?.countries[cid];
  const top = tr?.products.find((p) => p.hs !== '99');
  if (tr && top) {
    const p0 = tr.partners[0];
    const pn = p0 ? ((p0.iso3 && ds.country(p0.iso3)?.name_ko) || p0.name_ko || p0.name_en) : undefined;
    const prod = top.name_ko.replace(/\(.*\)$/, '');
    lines.push({
      text: `화물 터미널의 전광판 — 이 나라 상품 수출에서 가장 큰 상품군은 ${prod}(${(top.share * 100).toFixed(1)}%)${pn ? `, 가장 큰 손님은 ${pn}(${(p0.share * 100).toFixed(1)}%)` : ''}입니다.`,
      source: `UN Comtrade ${tr.year}`,
      visual: { kind: 'cargo', product: prod, share: top.share, partner: pn ? { iso3: p0.iso3 ?? undefined, name: pn, share: p0.share } : undefined, year: tr.year },
    });
  }
  const s = sectorSharesOf(ds, cid);
  const pc = ds.refValue(cid, 'gdp_pc_ppp');
  if (s || pc) {
    const pppText = pc ? fmtValue(ds.indicator('gdp_pc_ppp'), pc.value, { short: true }) : '';
    lines.push({
      text: `통계청 안내판 — ${s ? `서비스업 ${s.services.toFixed(0)}%, 산업 ${s.industry.toFixed(0)}%, 농림어업 ${s.agri.toFixed(0)}%로 경제가 나뉩니다(${s.year}년)` : ''}${s && pc ? '. ' : ''}${pc ? `구매력 기준 1인당 GDP는 ${pppText}(${pc.year}년)입니다` : ''}.`,
      source: 'World Bank WDI',
      visual: { kind: 'stats', sectors: s ? { services: s.services, industry: s.industry, agri: s.agri, year: s.year } : undefined, ppp: pc ? { text: pppText, year: pc.year } : undefined },
    });
  }
  return { title: `${co.name_ko}에 도착`, lines, notes };
}

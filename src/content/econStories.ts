import type { Dataset } from '../data/engine';
import type { Extras } from '../data/extras';
import { KOPPEN_KO } from '../data/extras';
import { koreanUnits } from '../data/format';
import { sectorSharesOf } from './sectors';
import { rankText, val } from './helpers';
import type { Story, StoryPanel } from './stories';

const t = (text: string): StoryPanel => ({ text });

/** 두 지표의 기준연도 순위 상관(스피어만, 동률 순위 그대로) */
function rankCorrelation(ds: Dataset, a: 'gdp_pc', b: 'productivity') {
  const ra = new Map(ds.ranking(a).rows.map((r) => [r.country.id, r.rank]));
  const rb = ds.ranking(b).rows.filter((r) => ra.has(r.country.id));
  const n = rb.length;
  if (n < 30) return undefined;
  const xs = rb.map((r) => ra.get(r.country.id)!), ys = rb.map((r) => r.rank);
  const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;
  const mx = mean(xs), my = mean(ys);
  let sxy = 0, sxx = 0, syy = 0;
  xs.forEach((x, i) => { sxy += (x - mx) * (ys[i] - my); sxx += (x - mx) ** 2; syy += (ys[i] - my) ** 2; });
  return { n, r: sxy / Math.sqrt(sxx * syy) };
}
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

function exportsLine(ex: Extras | null | undefined, cid: string, n = 3) {
  const tr = ex?.trade?.countries[cid];
  if (!tr) return undefined;
  const top = tr.products.slice(0, n).map((p) => `${p.name_ko.replace(/\(.*\)$/, '')} ${pct(p.share)}`).join(', ');
  return { tr, top };
}

function partnerName(ds: Dataset, p: { iso3: string | null; name_ko?: string | null; name_en: string }) {
  return (p.iso3 && ds.country(p.iso3)?.name_ko) || p.name_ko || p.name_en;
}

function sectorLine(ds: Dataset, cid: string) {
  const s = sectorSharesOf(ds, cid);
  if (!s) return '산업별 부가가치 자료는 없습니다.';
  return `${s.year}년 GDP에서 서비스업이 ${s.services.toFixed(1)}%, 산업(광업·제조업·건설 등)이 ${s.industry.toFixed(1)}%${s.manufacturing !== undefined ? `(그중 제조업 ${s.manufacturing.toFixed(1)}%)` : ''}, 농림어업이 ${s.agri.toFixed(1)}%를 차지합니다.`;
}

/** 경제 도감 이야기. 숫자는 모두 World Bank·UN Comtrade·FAOSTAT·Köppen·Natural Earth 자료에서 가져온다 */
export const ECON_STORIES: Story[] = [
  // ───────── 오스트리아 ─────────
  {
    id: 'aut-income', country: 'AUT', question: '오스트리아의 1인당 GDP가 높은 이유는 무엇일까?',
    indicators: ['gdp_pc', 'gdp_pc_ppp', 'productivity', 'services_va', 'manufacturing'],
    needsExtras: true,
    panels: (ds, ex) => {
      const nom = val(ds, 'AUT', 'gdp_pc'), ppp = val(ds, 'AUT', 'gdp_pc_ppp'), pr = val(ds, 'AUT', 'productivity');
      const top = exportsLine(ex, 'AUT', 4)?.top;
      const corr = rankCorrelation(ds, 'gdp_pc', 'productivity');
      return [
        t(`관찰: ${nom?.year}년 오스트리아의 1인당 GDP는 ${nom?.text ?? '자료 없음'}로 ${rankText(ds, 'AUT', 'gdp_pc')}입니다. 나라마다 다른 물가를 맞춘 구매력 기준으로는 ${ppp?.text ?? '자료 없음'}(${rankText(ds, 'AUT', 'gdp_pc_ppp')})입니다. 시장 환율로 바꾼 값(명목)과 물가를 맞춘 값(구매력 기준)은 같은 나라라도 달라질 수 있습니다.`),
        t(`근거 1 — 일하는 사람의 생산성: 취업자 1명이 1년에 만들어 내는 가치(취업자 1명당 GDP)는 ${pr?.text ?? '자료 없음'}(${pr?.year}년)로 ${rankText(ds, 'AUT', 'productivity')}입니다. ${corr ? `두 자료가 모두 있는 ${corr.n}개국을 보면 1인당 GDP 순위와 취업자 1명당 GDP 순위의 상관계수가 ${corr.r.toFixed(2)}로, 두 순위가 함께 움직이는 경향이 강합니다.` : ''}`),
        t(`근거 2 — 산업 구조: ${sectorLine(ds, 'AUT')} 서비스업이 가장 크고, 제조업도 GDP에서 적지 않은 몫을 차지합니다. 수출 상위 상품군은 ${top ?? '자료 없음'}로, 기술이 필요한 공산품이 많습니다(‘오스트리아는 무엇을 수출할까?’ 참고).`),
        t('해설: 오스트리아의 높은 소득을 산업 하나로 설명할 수는 없습니다. 위의 숫자가 보여 주는 것은 높은 생산성, 서비스업과 제조업이 함께 큰 산업 구조, 이웃 나라와의 활발한 수출이 함께 나타난다는 사실입니다. 이것이 정확히 얼마씩 소득을 높였는지는 이 자료만으로는 알 수 없습니다. 아래 ‘이 나라는 뭘로 먹고살까?’의 표에서 소득이 비슷한 나라와 산업 구조를 비교해 보세요.'),
      ];
    },
  },
  {
    id: 'aut-exports', country: 'AUT', question: '오스트리아는 무엇을 수출할까?',
    indicators: ['exports_gdp', 'manufacturing'],
    needsExtras: true,
    panels: (ds, ex) => {
      const e = exportsLine(ex, 'AUT', 4);
      const exp = ds.latest('AUT', 'exports_gdp');
      if (!e) return [t('상품 수출 자료를 불러오지 못했습니다.')];
      const p = e.tr.partners;
      return [
        t(`${e.tr.year}년 오스트리아의 상품 수출액은 ${koreanUnits(e.tr.total)} 달러였습니다. 많이 판 상품군은 ${e.top}입니다(UN Comtrade, HS 2단위).`),
        t(`가장 큰 손님은 이웃 나라 ${partnerName(ds, p[0])}입니다. 전체 상품 수출의 ${pct(p[0].share)}를 차지합니다. 그다음은 ${p.slice(1, 4).map((x) => `${partnerName(ds, x)}(${pct(x.share)})`).join(', ')}입니다. 오스트리아는 바다가 없는 내륙국이고, 상위 상대국 가운데 독일·이탈리아·스위스는 국경을 맞댄 이웃 나라입니다.`),
        t(`상품과 서비스를 합친 수출은 GDP의 ${exp ? `${exp.value.toFixed(1)}%(${exp.year}년)` : '자료 없음'}에 이릅니다. 수출액에는 관광객이 쓴 돈 같은 서비스 수출이 들어 있지만, 위의 상품군 순위에는 들어 있지 않습니다. 둘을 섞지 않는 것이 중요합니다.`),
      ];
    },
  },
  {
    id: 'aut-alps', country: 'AUT', question: '알프스산맥은 어떻게 경제활동과 연결될까?',
    indicators: ['forest', 'services_va'],
    needsExtras: true,
    panels: (ds, ex) => {
      const n = ex?.nature?.countries.AUT;
      const alps = n?.landforms.find((l) => l.name_en.toLowerCase() === 'alps');
      const peak = n?.peaks[0];
      const climates = (n?.koppen ?? []).filter((k) => k.share).map((k) => `${KOPPEN_KO[k.code]} ${Math.round(k.share! * 100)}%`).join(', ');
      const forest = ds.latest('AUT', 'forest');
      return [
        t(`지도로 재 보면 오스트리아 국토의 약 ${alps ? Math.round(alps.share_of_country * 100) : '?'}%가 알프스산맥에 속합니다(Natural Earth 자료로 계산). 가장 높은 산은 ${peak?.name_ko ?? '자료 없음'}(${peak?.elevation_m.toLocaleString('ko-KR')}m)입니다. 숲이 육지의 ${forest ? `${forest.value.toFixed(1)}%(${forest.year}년)` : '자료 없음'}를 덮고 있습니다.`),
        t(`높은 산이 많아 기후도 다양합니다. 1991~2020년 평년 기후로 보면 ${climates}입니다. 높은 봉우리에는 여름에도 서늘한 툰드라 기후가 나타납니다.`),
        t('오스트리아 통계청이 계산한 관광 위성계정에 따르면, 2024년 관광이 GDP에 직접 보탠 몫은 4.4%, 관광이 직접 만든 일자리는 전체의 4.3%였습니다. 2025년 숙박 시설에 묵은 밤은 1억 5,729만 박이었습니다.'),
        t('관광은 숙박·음식·교통·상점처럼 여러 서비스업에 흩어져 있어서, ‘산업별 부가가치’ 막대에는 따로 보이지 않습니다. 그래서 관광의 크기는 관광 위성계정이라는 별도 계산으로 봅니다. 이 자료만으로 관광객이 무엇 때문에 오스트리아를 찾는지까지는 알 수 없지만, 국토의 3분의 2가 알프스인 나라에서 관광이 GDP의 4.4%를 직접 만들어 낸다는 점은 알 수 있습니다.'),
      ];
    },
    notes: ['관광 직접 GDP 기여 4.4%·고용 4.3% (2024): Statistik Austria 관광 위성계정 https://www.statistik.at/statistiken/tourismus-und-verkehr/tourismus/tourismus-satellitenkonto/nationale-tourismus-satellitenkonten',
      '숙박 1억 5,729만 박 (2025): Statistik Austria https://www.statistik.at/statistiken/tourismus-und-verkehr/tourismus/beherbergung/ankuenfte-naechtigungen'],
  },
  // ───────── 나머지 7개국: 수출·산업 구조 ─────────
  ...([
    ['KOR', '대한민국은 무엇을 만들어 세계에 팔까?'],
    ['NLD', '네덜란드는 무엇을 사고팔아 먹고살까?'],
    ['NOR', '노르웨이는 무엇을 팔아 먹고살까?'],
    ['SAU', '사우디아라비아의 수출은 석유에 얼마나 기대고 있을까?'],
    ['MNG', '몽골은 무엇을 팔아 먹고살까?'],
    ['SGP', '싱가포르는 무엇을 사고팔아 먹고살까?'],
    ['BRA', '브라질은 무엇을 길러 세계에 팔까?'],
  ] as const).map(([cid, q]): Story => ({
    id: `${cid.toLowerCase()}-economy-structure`, country: cid, question: q,
    indicators: ['services_va', 'industry_va', 'exports_gdp', 'gdp_pc_ppp'],
    needsExtras: true,
    notes: cid === 'NLD' || cid === 'SGP' ? ['UN Comtrade 수출액에는 다른 나라에서 들여와 다시 내보내는 재수출이 포함된다'] : undefined,
    panels: (ds, ex) => {
      const e = exportsLine(ex, cid, 3);
      const nm = ds.country(cid)!.name_ko;
      const agri = ex?.agri?.countries[cid];
      const out: StoryPanel[] = [t(`산업 구조: ${sectorLine(ds, cid)}`)];
      if (e) {
        const p = e.tr.partners.slice(0, 3).map((x) => `${partnerName(ds, x)}(${pct(x.share)})`).join(', ');
        out.push(t(`수출: ${e.tr.year}년 ${nm}의 상품 수출액은 ${koreanUnits(e.tr.total)} 달러이고, 많이 판 상품군은 ${e.top}입니다. 주요 수출 상대는 ${p}입니다.${e.tr.partner_unspecified_share > 0.1 ? ` 다만 수출의 ${pct(e.tr.partner_unspecified_share)}는 상대국을 밝히지 않고 보고됐습니다.` : ''}${cid === 'NLD' || cid === 'SGP' ? ' 이 수출액에는 다른 나라에서 들여와 다시 내보내는 재수출도 들어 있어, 모두 이 나라에서 만든 물건은 아닙니다.' : ''}`));
      } else out.push(t('수출: UN Comtrade에 최근 상품 수출 자료가 없습니다.'));
      if (agri?.representative.length) {
        out.push(t(`농축산물: 세계 순위가 높은 품목은 ${agri.representative.slice(0, 3).map((i) => `${i.name_ko}(세계 ${i.rank}위)`).join(', ')}입니다(FAOSTAT ${ex?.agri?.meta.year}년).`));
      } else if (agri?.by_tonnes.length) {
        out.push(t(`농축산물: 많이 생산하는 품목은 ${agri.by_tonnes.slice(0, 3).map((i) => i.name_ko).join(', ')}입니다(FAOSTAT ${ex?.agri?.meta.year}년). 세계 15위 안에 드는 품목은 없습니다.`));
      }
      const ppp = val(ds, cid, 'gdp_pc_ppp');
      out.push(t(`소득: 구매력 기준 1인당 GDP는 ${ppp?.text ?? '자료 없음'}(${ppp?.year ?? ''}년, ${rankText(ds, cid, 'gdp_pc_ppp')})입니다. 산업 구조와 수출품을 소득이 비슷한 나라와 비교해 보세요.`));
      return out;
    },
  })),
];

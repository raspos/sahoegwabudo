import type { Campaign, Ctx, DecisionOption, GameState, Node } from './types';
import { compareMission, discoverMission, economyMission, ev, rankMission, routeMission, sectorEvidence } from './missions';
import { has, successes, travelCost } from './engine';

/**
 * 캠페인 3~5 (아프리카·남아메리카·서아시아).
 * 이야기 문장은 사회과부도 자료(UN Comtrade 수출 1위, World Bank 지표, 국경·지형)로 확인한 사실만 쓴다.
 */
const tripHint = (c: Ctx, s: GameState, to: string) => {
  const t = travelCost(c, s, to);
  return t.funds || t.days ? `이동 예상: 자금 ${-t.funds}, ${-t.days}일` : '지금 있는 곳';
};
function opt(o: Omit<DecisionOption, 'cost' | 'available'> & { info?: number; available?: boolean }, s: GameState): DecisionOption {
  const info = o.info ?? 0;
  const affordable = s.funds - info > 0;
  return { ...o, cost: { funds: -info, days: 0 }, available: (o.available ?? true) && affordable,
    lockedReason: o.available === false ? o.lockedReason : !affordable ? '탐험 자금이 모자랍니다' : undefined };
}
function endingsFor(prefix: string) {
  return (s: GameState) => {
    const sc = s.reportScore ?? 0;
    if (s.flags.earlyReturn && sc < 7) return `${prefix}-early`;
    if (sc >= 7 && successes(s) >= 4) return `${prefix}-best`;
    if (sc >= 4) return `${prefix}-solid`;
    return `${prefix}-open`;
  };
}
const relevanceText = '보고서는 고른 자료가 질문과 얼마나 관련 있는지로 평가됩니다.';
const BRANCH: Record<string, string> = { ZMB: '잠비아', NGA: '나이지리아', BWA: '보츠와나', CHL: '칠레', ARG: '아르헨티나', COL: '콜롬비아', ARE: '아랍에미리트', TUR: '튀르키예', EGY: '이집트' };
const branchOf = (s: GameState) => BRANCH[s.flags.branch as string] ?? '';

// ═══════════════════════ 캠페인 3. 땅속의 보물 (아프리카) ═══════════════════════
const AF = 'africa-resources';
const AF_POOL = ['ZAF', 'NGA', 'AGO', 'ZMB', 'BWA', 'CIV', 'GHA', 'ETH', 'KEN', 'COD', 'COG', 'GAB', 'TZA', 'UGA', 'MOZ', 'NAM', 'ZWE', 'DZA', 'EGY', 'MAR', 'TUN', 'SEN', 'CMR', 'MLI', 'BFA'];

const afNodes: Node[] = [
  economyMission({
    id: 'af-exports', title: '항구 창고의 세 상자', country: 'ZAF', pool: ['ZAF', 'ZMB', 'NGA', 'CIV', 'ETH', 'MWI', 'BEN', 'MAR'], must: 'ZAF', tags: ['resources', 'trade'],
    next: () => 'af-rank',
    brief: () => '남아프리카공화국 항구 창고에 세 나라의 대표 수출품이 담긴 상자가 놓여 있습니다. 상품군마다 어느 나라의 수출 1위인지 짝지어 보세요.',
  }),
  rankMission({
    id: 'af-rank', title: '땅에서 얻는 몫', country: 'ZAF', mode: 'indicator', indicator: 'resource_rents',
    pool: ['ZMB', 'COD', 'AGO', 'COG', 'GAB', 'GHA', 'NGA', 'ZAF', 'BWA', 'KEN', 'MAR', 'ETH', 'TZA', 'DZA', 'MOZ', 'BFA', 'MLI'], tags: ['resources'],
    next: () => 'af-compare',
    brief: () => '석유·광물·숲에서 얻는 몫(천연자원 지대)이 GDP에서 얼마나 되는지, 다섯 나라를 큰 순서로 놓으세요.',
  }),
  compareMission({
    id: 'af-compare', title: '자원 부자는 소득도 높을까', country: 'ZAF', pool: AF_POOL, target: 'gdp_pc', filter: 'resource_rents', extra: 'agri_va',
    tags: ['income', 'resources'], next: () => 'af-route-choice',
    brief: () => '자원 지대가 큰 나라 가운데 1인당 GDP가 가장 높은 곳을 찾습니다. 자료 줄을 열 때마다 자금이 듭니다.',
  }),
  {
    type: 'decide', id: 'af-route-choice', title: '다음 행선지',
    brief: (s) => `남은 자금 ${s.funds}, 일정 ${s.days}일. ${has(s, 'af-rank:rank') ? '자원 지대 순위를 알고 있습니다.' : '아직 자원 지대 순위를 모릅니다.'}`,
    options: (s, c) => [
      opt({ id: 'zmb', label: '잠비아 — 수출의 3분의 2가 구리', country: 'ZMB', next: 'af-zm-find', setFlags: { branch: 'ZMB' }, detail: `${tripHint(c, s, 'ZMB')}.` }, s),
      opt({ id: 'nga', label: '나이지리아 — 수출 대부분이 석유·가스', country: 'NGA', next: 'af-ng-find', setFlags: { branch: 'NGA' },
        info: has(s, 'af-rank:rank') ? 0 : 8, detail: `${tripHint(c, s, 'NGA')}. 자원 지대 순위를 알면 정보비 0, 모르면 8.` }, s),
      opt({ id: 'bwa', label: '보츠와나 — 보석을 팔아 소득이 높은 내륙국', country: 'BWA', next: 'af-bw-find', setFlags: { branch: 'BWA' },
        available: s.flags['af-compare:answer'] !== undefined || s.funds > 40, lockedReason: '비교 조사 자료가 없고 자금도 40 이하입니다',
        info: s.flags['af-compare:answer'] !== undefined ? 0 : 10, detail: `${tripHint(c, s, 'BWA')}. 비교 조사를 마쳤으면 정보비 0, 아니면 10.` }, s),
    ],
  },
  // ── 잠비아 갈래 ──
  discoverMission({
    id: 'af-zm-find', title: '북쪽 국경의 구리 나라', country: 'ZMB', target: 'COD', next: () => 'af-zm-route',
    brief: () => '잠비아 광산 마을에서, 북쪽 이웃 가운데 구리를 가장 많이 수출하는 큰 나라가 있다는 이야기를 들었습니다. 단서를 모아 지도에서 찾으세요.',
    evidence: (c) => [ev(c.ds, 'COD', 'resource_rents', ['resources']), ev(c.ds, 'COD', 'gdp_pc', ['income']), ev(c.ds, 'ZMB', 'resource_rents', ['resources'])],
  }),
  routeMission({
    id: 'af-zm-route', title: '동쪽 바다로 가는 길', country: 'COD', start: 'COD', goal: 'KEN', next: () => 'af-final-choice',
    rules: [
      { label: '농림어업 비중이 15% 이상인 나라만 지나기', ind: 'agri_va', min: 15, tags: ['agri', 'route'] },
      { label: '관광 수입이 수출의 15% 이상인 나라만 지나기', ind: 'tourism_exports', min: 15, tags: ['route'] },
    ],
    brief: () => '콩고민주공화국에서 동쪽 바다에 닿은 케냐까지 땅으로 이어진 길을 찾으세요. 조건에 맞는 나라만 거쳐야 합니다.',
  }),
  // ── 나이지리아 갈래 ──
  discoverMission({
    id: 'af-ng-find', title: '사막에 걸친 북쪽 이웃', country: 'NGA', target: 'NER', next: () => 'af-ng-route',
    brief: () => '라고스의 시장에서, 나이지리아 북쪽으로 사막까지 이어지는 넓은 내륙국 이야기를 들었습니다. 단서를 모아 지도에서 찾으세요.',
    evidence: (c) => [sectorEvidence(c.ds, 'NER', ['agri']), ev(c.ds, 'NGA', 'resource_rents', ['resources']), ev(c.ds, 'NGA', 'gdp_pc', ['income'])],
  }),
  routeMission({
    id: 'af-ng-route', title: '기니만 해안길', country: 'NGA', start: 'NGA', goal: 'GHA', next: () => 'af-final-choice',
    rules: [
      { label: '농림어업 비중이 20% 이상인 나라만 지나기', ind: 'agri_va', min: 20, tags: ['agri', 'route'] },
      { label: '제조업 비중이 10% 이상인 나라만 지나기', ind: 'manufacturing', min: 10, tags: ['industry', 'route'] },
    ],
    brief: () => '나이지리아에서 서쪽 가나까지 땅길로 갑니다. 조건에 맞는 나라만 지나세요.',
  }),
  // ── 보츠와나 갈래 ──
  discoverMission({
    id: 'af-bw-find', title: '사막 서쪽의 이웃', country: 'BWA', target: 'NAM', next: () => 'af-bw-route',
    brief: () => '보츠와나에서, 서쪽으로 대서양에 닿은 이웃 나라를 찾아야 합니다. 이 나라도 보석을 많이 수출한다고 합니다.',
    evidence: (c) => [ev(c.ds, 'NAM', 'gdp_pc', ['income']), ev(c.ds, 'BWA', 'gdp_pc', ['income']), ev(c.ds, 'BWA', 'resource_rents', ['resources'])],
  }),
  routeMission({
    id: 'af-bw-route', title: '인도양까지 가로지르기', country: 'NAM', start: 'NAM', goal: 'MOZ', next: () => 'af-final-choice',
    rules: [
      { label: '1인당 GDP가 3,000달러 이상인 나라만 지나기', ind: 'gdp_pc', min: 3000, tags: ['income', 'route'] },
      { label: '서비스업 비중이 60% 이상인 나라만 지나기', ind: 'services_va', min: 60, tags: ['industry', 'route'] },
    ],
    brief: () => '나미비아에서 인도양에 닿은 모잠비크까지 대륙을 가로지릅니다. 조건에 맞는 나라만 지나세요.',
  }),
  {
    type: 'decide', id: 'af-final-choice', title: '보고서를 쓸까, 더 조사할까',
    brief: (s) => `남은 자금 ${s.funds}, 일정 ${s.days}일.`,
    options: (s, c) => [
      opt({ id: 'report-now', label: '본부로 돌아가 보고서를 쓴다', next: 'af-report', detail: '남은 자원을 아낍니다.' }, s),
      opt({ id: 'open-rank', label: '아프리카 1인당 GDP 순위를 조사한다', next: 'af-open-rank', available: s.days > 3, lockedReason: '일정이 부족합니다', detail: '지금 있는 곳에서 자료를 모읍니다.' }, s),
      opt({ id: 'civ', label: '카카오 향이 나는 서아프리카 항구를 찾아 나선다', next: 'af-civ', available: s.days > 5, lockedReason: '일정이 부족합니다', detail: `${tripHint(c, s, 'GHA')}. 가나에서 단서를 모아 찾습니다.` }, s),
    ],
  },
  rankMission({
    id: 'af-open-rank', title: '자원과 소득의 순서', country: 'ZAF', mode: 'indicator', indicator: 'gdp_pc', pool: ['BWA', 'GAB', 'ZAF', 'NAM', 'DZA', 'EGY', 'MAR', 'TUN', 'AGO', 'GHA', 'CIV', 'KEN', 'NGA', 'ZMB', 'ETH', 'COD'],
    tags: ['income'], next: () => 'af-report',
    brief: () => '다섯 나라를 1인당 GDP가 높은 순서로 놓으세요. 자원 지대 순서와 같을까요?',
  }),
  discoverMission({
    id: 'af-civ', title: '코코아 항구', country: 'GHA', target: 'CIV', next: () => 'af-report',
    brief: () => '수출 1위 상품이 코코아인 서아프리카 나라를 지도에서 찾으세요.',
    evidence: (c) => [sectorEvidence(c.ds, 'CIV', ['agri']), ev(c.ds, 'CIV', 'population', ['distractor'])],
  }),
  { type: 'report', id: 'af-report', title: '탐험 보고서', question: '자원이 많은 나라는 모두 부유할까?',
    brief: () => `모은 조사 자료 가운데 질문에 답하는 세 가지를 고르세요. ${relevanceText}` },
];

export const AFRICA: Campaign = {
  id: AF, title: '땅속의 보물', region: '아프리카', question: '자원이 많은 나라는 모두 부유할까?',
  intro: '세 번째 임무. 구리·석유·보석을 파는 아프리카 나라들을 돌며, 땅속의 보물이 사람들의 소득으로 이어지는지 확인해야 합니다.',
  start: 'af-exports', startLocation: 'ZAF', startResources: { funds: 85, days: 30 },
  nodes: Object.fromEntries(afNodes.map((n) => [n.id, n])),
  relevance: { resources: 3, income: 3, trade: 1, partners: 1, agri: 1, industry: 1, route: 0, geo: 0, distractor: -1 },
  pickEnding: endingsFor('af'),
  endings: [
    { id: 'af-best', title: '본부 최우수 탐험 보고서', text: (s) => `${branchOf(s)} 길에서 모은 자료로, 자원 지대가 큰 나라와 소득이 높은 나라가 꼭 같지는 않다는 점을 숫자로 보여 주었습니다.` },
    { id: 'af-solid', title: '탄탄한 현장 보고서', text: () => '자원과 수출의 관계는 잘 짚었지만, 소득과 견주는 자료가 하나 모자랐습니다.' },
    { id: 'af-open', title: '질문이 남은 보고서', text: () => '모은 자료가 질문과 조금 멀었습니다. 자원에서 얻는 몫과 1인당 소득을 나란히 놓아야 답이 보입니다.' },
    { id: 'af-early', title: '조기 귀환', text: () => '자원이 바닥나 서둘러 돌아왔습니다. 넓은 대륙에서는 이동 비용을 먼저 따져 보세요.' },
  ],
};

// ═══════════════════════ 캠페인 4. 들판과 광산의 대륙 (남아메리카) ═══════════════════════
const SA = 'samerica-harvest';
const SA_POOL = ['BRA', 'ARG', 'CHL', 'PER', 'BOL', 'COL', 'ECU', 'URY', 'PRY', 'GUY', 'SUR', 'MEX'];

const saNodes: Node[] = [
  economyMission({
    id: 'sa-exports', title: '산투스 부두의 화물', country: 'BRA', pool: ['BRA', 'CHL', 'URY', 'PRY', 'SUR', 'PER', 'ECU'], must: 'BRA', tags: ['trade', 'resources'],
    next: () => 'sa-partners',
    brief: () => '브라질 부두에 세 나라의 대표 수출품이 실린 화물이 들어왔습니다. 상품군마다 어느 나라의 수출 1위인지 짝지어 보세요.',
  }),
  rankMission({
    id: 'sa-partners', title: '브라질 상품은 어디로', country: 'BRA', mode: 'partners', of: 'BRA', tags: ['trade', 'partners'], next: () => 'sa-compare',
    brief: () => '브라질이 상품을 많이 파는 다섯 곳을 비중이 큰 순서로 놓으세요.',
  }),
  compareMission({
    id: 'sa-compare', title: '많이 파는 나라가 더 부유할까', country: 'BRA', pool: SA_POOL, target: 'gdp_pc', filter: 'exports_gdp', extra: 'resource_rents',
    tags: ['income', 'trade'], next: () => 'sa-route-choice',
    brief: () => '수출 비율이 높은 나라 가운데 1인당 GDP가 가장 높은 곳을 찾습니다. 자료 줄을 열 때마다 자금이 듭니다.',
  }),
  {
    type: 'decide', id: 'sa-route-choice', title: '다음 행선지',
    brief: (s) => `남은 자금 ${s.funds}, 일정 ${s.days}일. ${has(s, 'sa-partners:rank') ? '브라질의 수출 상대국 순위를 알고 있습니다.' : '아직 브라질의 수출 상대국 순위를 모릅니다.'}`,
    options: (s, c) => [
      opt({ id: 'chl', label: '칠레 — 광석을 파는 태평양의 긴 나라', country: 'CHL', next: 'sa-cl-find', setFlags: { branch: 'CHL' }, detail: `${tripHint(c, s, 'CHL')}.` }, s),
      opt({ id: 'arg', label: '아르헨티나 — 남쪽의 큰 이웃', country: 'ARG', next: 'sa-ar-find', setFlags: { branch: 'ARG' },
        info: has(s, 'sa-partners:rank') ? 0 : 8, detail: `${tripHint(c, s, 'ARG')}. 상대국 순위를 알면 정보비 0, 모르면 8.` }, s),
      opt({ id: 'col', label: '콜롬비아 — 카리브해와 태평양을 함께 낀 나라', country: 'COL', next: 'sa-co-find', setFlags: { branch: 'COL' },
        available: s.flags['sa-compare:answer'] !== undefined || s.funds > 40, lockedReason: '비교 조사 자료가 없고 자금도 40 이하입니다',
        info: s.flags['sa-compare:answer'] !== undefined ? 0 : 10, detail: `${tripHint(c, s, 'COL')}. 비교 조사를 마쳤으면 정보비 0, 아니면 10.` }, s),
    ],
  },
  // ── 칠레 갈래 ──
  discoverMission({
    id: 'sa-cl-find', title: '고원 너머의 내륙국', country: 'CHL', target: 'BOL', next: () => 'sa-cl-route',
    brief: () => '칠레 광산 도시에서, 동쪽 고원 너머 바다가 없는 이웃 나라도 광석을 많이 판다는 이야기를 들었습니다. 지도에서 찾으세요.',
    evidence: (c) => [ev(c.ds, 'BOL', 'resource_rents', ['resources']), sectorEvidence(c.ds, 'BOL', ['industry']), ev(c.ds, 'CHL', 'gdp_pc', ['income'])],
  }),
  routeMission({
    id: 'sa-cl-route', title: '안데스를 넘는 화물', country: 'BOL', start: 'CHL', goal: 'PRY', next: () => 'sa-final-choice',
    rules: [
      { label: '1인당 GDP가 10,000달러 이상인 나라만 지나기', ind: 'gdp_pc', min: 10000, tags: ['income', 'route'] },
      { label: '제조업 비중이 14% 이상인 나라만 지나기', ind: 'manufacturing', min: 14, tags: ['industry', 'route'] },
    ],
    brief: () => '칠레에서 파라과이까지 화물이 갈 땅길을 찾으세요. 조건에 맞는 나라만 거쳐야 합니다.',
  }),
  // ── 아르헨티나 갈래 ──
  discoverMission({
    id: 'sa-ar-find', title: '강 건너의 작은 이웃', country: 'ARG', target: 'URY', next: () => 'sa-ar-route',
    brief: () => '부에노스아이레스 항구에서, 큰 강 하구 건너편의 작은 이웃 나라는 고기를 가장 많이 수출한다는 이야기를 들었습니다. 지도에서 찾으세요.',
    evidence: (c) => [ev(c.ds, 'URY', 'gdp_pc', ['income']), sectorEvidence(c.ds, 'URY', ['industry']), ev(c.ds, 'ARG', 'agri_va', ['agri'])],
  }),
  routeMission({
    id: 'sa-ar-route', title: '팜파스에서 안데스로', country: 'URY', start: 'URY', goal: 'BOL', next: () => 'sa-final-choice',
    rules: [
      { label: '제조업 비중이 14% 이상인 나라만 지나기', ind: 'manufacturing', min: 14, tags: ['industry', 'route'] },
      { label: '1인당 GDP가 12,000달러 이상인 나라만 지나기', ind: 'gdp_pc', min: 12000, tags: ['income', 'route'] },
    ],
    brief: () => '우루과이에서 볼리비아까지 땅길로 갑니다. 조건에 맞는 나라만 지나세요.',
  }),
  // ── 콜롬비아 갈래 ──
  discoverMission({
    id: 'sa-co-find', title: '적도의 이름을 가진 나라', country: 'COL', target: 'ECU', next: () => 'sa-co-route',
    brief: () => '보고타에서, 남쪽 이웃 가운데 나라 이름이 \'적도\'라는 뜻인 곳이 있다는 이야기를 들었습니다. 단서를 모아 지도에서 찾으세요.',
    evidence: (c) => [ev(c.ds, 'ECU', 'exports_gdp', ['trade']), sectorEvidence(c.ds, 'ECU', ['industry']), ev(c.ds, 'COL', 'resource_rents', ['resources'])],
  }),
  routeMission({
    id: 'sa-co-route', title: '아마존 쪽으로', country: 'ECU', start: 'ECU', goal: 'BRA', next: () => 'sa-final-choice',
    rules: [
      { label: '천연자원 지대가 GDP의 10% 이상인 나라만 지나기', ind: 'resource_rents', min: 10, tags: ['resources', 'route'] },
      { label: '상품·서비스 수출이 GDP의 20% 이상인 나라만 지나기', ind: 'exports_gdp', min: 20, tags: ['trade', 'route'] },
    ],
    brief: () => '에콰도르에서 브라질까지 땅으로 이어진 길을 찾으세요.',
  }),
  {
    type: 'decide', id: 'sa-final-choice', title: '보고서를 쓸까, 더 조사할까',
    brief: (s) => `남은 자금 ${s.funds}, 일정 ${s.days}일.`,
    options: (s, c) => [
      opt({ id: 'report-now', label: '본부로 돌아가 보고서를 쓴다', next: 'sa-report', detail: '남은 자원을 아낍니다.' }, s),
      opt({ id: 'open-rank', label: '남아메리카 수출 비율 순위를 조사한다', next: 'sa-open-rank', available: s.days > 3, lockedReason: '일정이 부족합니다', detail: '지금 있는 곳에서 자료를 모읍니다.' }, s),
      opt({ id: 'pry', label: '콩을 파는 내륙국을 찾아 나선다', next: 'sa-pry', available: s.days > 5, lockedReason: '일정이 부족합니다', detail: `${tripHint(c, s, 'ARG')}. 아르헨티나에서 단서를 모아 찾습니다.` }, s),
    ],
  },
  rankMission({
    id: 'sa-open-rank', title: '바깥으로 얼마나 파나', country: 'BRA', mode: 'indicator', indicator: 'exports_gdp', pool: ['GUY', 'SUR', 'PRY', 'CHL', 'ECU', 'PER', 'URY', 'BOL', 'BRA', 'COL', 'ARG', 'MEX'],
    tags: ['trade', 'openness'], next: () => 'sa-report',
    brief: () => '다섯 나라를 GDP 대비 수출 비율이 높은 순서로 놓으세요.',
  }),
  discoverMission({
    id: 'sa-pry', title: '콩밭의 내륙국', country: 'ARG', target: 'PRY', next: () => 'sa-report',
    brief: () => '수출 1위 상품이 기름을 짜는 씨앗(콩 등)인 남아메리카 내륙국을 지도에서 찾으세요.',
    evidence: (c) => [sectorEvidence(c.ds, 'PRY', ['agri']), ev(c.ds, 'PRY', 'area', ['distractor'])],
  }),
  { type: 'report', id: 'sa-report', title: '탐험 보고서', question: '남아메리카 나라들은 무엇을 팔아 살까?',
    brief: () => `모은 조사 자료 가운데 질문에 답하는 세 가지를 고르세요. ${relevanceText}` },
];

export const SAMERICA: Campaign = {
  id: SA, title: '들판과 광산의 대륙', region: '남아메리카', question: '남아메리카 나라들은 무엇을 팔아 살까?',
  intro: '네 번째 임무. 브라질 부두에서 출발해 광산과 들판을 따라가며, 남아메리카 나라들이 무엇을 팔아 누구에게 보내는지 밝혀야 합니다.',
  start: 'sa-exports', startLocation: 'BRA', startResources: { funds: 85, days: 30 },
  nodes: Object.fromEntries(saNodes.map((n) => [n.id, n])),
  relevance: { trade: 3, resources: 2, agri: 2, partners: 2, openness: 1, income: 1, industry: 1, route: 0, geo: 0, distractor: -1 },
  pickEnding: endingsFor('sa'),
  endings: [
    { id: 'sa-best', title: '본부 최우수 탐험 보고서', text: (s) => `${branchOf(s)} 길에서 모은 자료로, 광석·연료·농산물이 어느 나라의 주력 상품인지와 그 상품이 어디로 가는지 함께 짚었습니다.` },
    { id: 'sa-solid', title: '탄탄한 현장 보고서', text: () => '주력 수출품은 잘 짚었지만, 누구에게 파는지나 수출이 경제에서 차지하는 몫이 빠졌습니다.' },
    { id: 'sa-open', title: '질문이 남은 보고서', text: () => '흥미로운 자료였지만 질문과는 거리가 있었습니다. 넓이나 인구보다 무엇을 파는지가 핵심입니다.' },
    { id: 'sa-early', title: '조기 귀환', text: () => '자원이 바닥나 서둘러 돌아왔습니다. 안데스를 넘는 길은 비쌉니다.' },
  ],
};

// ═══════════════════════ 캠페인 5. 석유 다음의 길 (서아시아·북아프리카) ═══════════════════════
const ME = 'mideast-future';
const ME_POOL = ['SAU', 'ARE', 'QAT', 'KWT', 'OMN', 'BHR', 'IRQ', 'IRN', 'JOR', 'ISR', 'TUR', 'EGY', 'DZA', 'MAR', 'TUN'];

const meNodes: Node[] = [
  economyMission({
    id: 'me-exports', title: '제다 항의 세 컨테이너', country: 'SAU', pool: ['SAU', 'BHR', 'JOR', 'TUR', 'YEM', 'TUN', 'MAR'], must: 'SAU', tags: ['resources', 'trade'],
    next: () => 'me-rank',
    brief: () => '사우디아라비아 항구에 세 나라의 대표 수출품이 실린 컨테이너가 도착했습니다. 상품군마다 어느 나라의 수출 1위인지 짝지어 보세요.',
  }),
  rankMission({
    id: 'me-rank', title: '석유가 경제에서 차지하는 몫', country: 'SAU', mode: 'indicator', indicator: 'resource_rents', pool: ME_POOL, tags: ['resources'],
    next: () => 'me-compare',
    brief: () => '천연자원 지대가 GDP에서 차지하는 몫이 큰 순서로 다섯 나라를 놓으세요.',
  }),
  compareMission({
    id: 'me-compare', title: '공장을 키운 부자 나라', country: 'SAU', pool: ME_POOL, target: 'gdp_pc', filter: 'manufacturing', extra: 'resource_rents',
    tags: ['income', 'manufacturing'], next: () => 'me-route-choice',
    brief: () => '제조업 비중이 큰 나라 가운데 1인당 GDP가 가장 높은 곳을 찾습니다. 자료 줄을 열 때마다 자금이 듭니다.',
  }),
  {
    type: 'decide', id: 'me-route-choice', title: '다음 행선지',
    brief: (s) => `남은 자금 ${s.funds}, 일정 ${s.days}일. ${has(s, 'me-rank:rank') ? '자원 지대 순위를 알고 있습니다.' : '아직 자원 지대 순위를 모릅니다.'}`,
    options: (s, c) => [
      opt({ id: 'are', label: '아랍에미리트 — 석유·가스가 수출의 절반쯤인 나라', country: 'ARE', next: 'me-ae-find', setFlags: { branch: 'ARE' }, detail: `${tripHint(c, s, 'ARE')}.` }, s),
      opt({ id: 'tur', label: '튀르키예 — 자동차를 가장 많이 파는 나라', country: 'TUR', next: 'me-tr-find', setFlags: { branch: 'TUR' },
        info: has(s, 'me-rank:rank') ? 0 : 8, detail: `${tripHint(c, s, 'TUR')}. 자원 지대 순위를 알면 정보비 0, 모르면 8.` }, s),
      opt({ id: 'egy', label: '이집트 — 관광 수입이 큰 나일강의 나라', country: 'EGY', next: 'me-eg-find', setFlags: { branch: 'EGY' },
        available: s.flags['me-compare:answer'] !== undefined || s.funds > 40, lockedReason: '비교 조사 자료가 없고 자금도 40 이하입니다',
        info: s.flags['me-compare:answer'] !== undefined ? 0 : 10, detail: `${tripHint(c, s, 'EGY')}. 비교 조사를 마쳤으면 정보비 0, 아니면 10.` }, s),
    ],
  },
  // ── 아랍에미리트 갈래 ──
  discoverMission({
    id: 'me-ae-find', title: '아라비아해의 이웃', country: 'ARE', target: 'OMN', next: () => 'me-ae-route',
    brief: () => '두바이에서, 동쪽으로 아라비아해에 닿은 이웃 나라를 찾아야 합니다. 단서를 모아 지도에서 찾으세요.',
    evidence: (c) => [ev(c.ds, 'ARE', 'manufacturing', ['manufacturing']), ev(c.ds, 'OMN', 'exports_gdp', ['openness']), ev(c.ds, 'OMN', 'resource_rents', ['resources'])],
  }),
  routeMission({
    id: 'me-ae-route', title: '반도를 가로질러', country: 'OMN', start: 'OMN', goal: 'JOR', next: () => 'me-final-choice',
    rules: [{ label: '1인당 GDP가 20,000달러 이상인 나라만 지나기', ind: 'gdp_pc', min: 20000, tags: ['income', 'route'] }],
    brief: () => '오만에서 요르단까지 아라비아반도를 땅으로 가로지릅니다. 조건에 맞는 나라만 지나세요.',
  }),
  // ── 튀르키예 갈래 ──
  discoverMission({
    id: 'me-tr-find', title: '두 바다를 낀 동쪽 이웃', country: 'TUR', target: 'IRN', next: () => 'me-tr-route',
    brief: () => '이스탄불에서, 동쪽 국경 너머 카스피해와 페르시아만을 함께 낀 큰 나라를 찾아야 합니다.',
    evidence: (c) => [ev(c.ds, 'TUR', 'manufacturing', ['manufacturing']), sectorEvidence(c.ds, 'TUR', ['industry']), ev(c.ds, 'IRN', 'resource_rents', ['resources'])],
  }),
  routeMission({
    id: 'me-tr-route', title: '유럽으로 가는 자동차 길', country: 'TUR', start: 'TUR', goal: 'AUT', next: () => 'me-final-choice',
    rules: [
      { label: '제조업 비중이 14% 이상인 나라만 지나기', ind: 'manufacturing', min: 14, tags: ['manufacturing', 'route'] },
      { label: '상품·서비스 수출이 GDP의 50% 이상인 나라만 지나기', ind: 'exports_gdp', min: 50, tags: ['openness', 'route'] },
    ],
    brief: () => '튀르키예에서 자동차 부품을 싣고 오스트리아까지 땅길로 갑니다. 조건에 맞는 나라만 거쳐야 합니다.',
  }),
  // ── 이집트 갈래 ──
  discoverMission({
    id: 'me-eg-find', title: '나일강 상류의 이웃', country: 'EGY', target: 'SDN', next: () => 'me-eg-route',
    brief: () => '카이로에서, 나일강을 거슬러 남쪽으로 올라가면 닿는 이웃 나라를 찾아야 합니다.',
    evidence: (c) => [ev(c.ds, 'EGY', 'tourism_exports', ['tourism']), sectorEvidence(c.ds, 'EGY', ['industry']), ev(c.ds, 'SDN', 'agri_va', ['agri'])],
  }),
  routeMission({
    id: 'me-eg-route', title: '사하라 남쪽으로', country: 'SDN', start: 'EGY', goal: 'TCD', next: () => 'me-final-choice',
    rules: [
      { label: '농림어업 비중이 20% 이상인 나라만 지나기', ind: 'agri_va', min: 20, tags: ['agri', 'route'] },
      { label: '관광 수입이 수출의 15% 이상인 나라만 지나기', ind: 'tourism_exports', min: 15, tags: ['tourism', 'route'] },
    ],
    brief: () => '이집트에서 차드까지 땅길로 갑니다. 조건에 맞는 나라만 지나세요.',
  }),
  {
    type: 'decide', id: 'me-final-choice', title: '보고서를 쓸까, 더 조사할까',
    brief: (s) => `남은 자금 ${s.funds}, 일정 ${s.days}일.`,
    options: (s, c) => [
      opt({ id: 'report-now', label: '본부로 돌아가 보고서를 쓴다', next: 'me-report', detail: '남은 자원을 아낍니다.' }, s),
      opt({ id: 'open-rank', label: '관광 수입 비중 순위를 조사한다', next: 'me-open-rank', available: s.days > 3, lockedReason: '일정이 부족합니다', detail: '지금 있는 곳에서 자료를 모읍니다.' }, s),
      opt({ id: 'bhr', label: '알루미늄을 파는 섬나라를 찾아 나선다', next: 'me-bhr', available: s.days > 5, lockedReason: '일정이 부족합니다', detail: `${tripHint(c, s, 'SAU')}. 사우디아라비아에서 단서를 모아 찾습니다.` }, s),
    ],
  },
  rankMission({
    id: 'me-open-rank', title: '석유 대신 관광', country: 'SAU', mode: 'indicator', indicator: 'tourism_exports', pool: ['JOR', 'LBN', 'EGY', 'TUR', 'SYR', 'ISR', 'OMN', 'QAT', 'BHR', 'SAU', 'MAR', 'TUN', 'IRQ', 'KWT'],
    tags: ['tourism'], next: () => 'me-report',
    brief: () => '다섯 나라를 관광 수입이 수출에서 차지하는 비중이 높은 순서로 놓으세요.',
  }),
  discoverMission({
    id: 'me-bhr', title: '만 안의 섬나라', country: 'SAU', target: 'BHR', next: () => 'me-report',
    brief: () => '수출 1위 상품이 석유가 아니라 알루미늄인, 땅으로 맞닿은 이웃이 없는 나라를 지도에서 찾으세요.',
    evidence: (c) => [ev(c.ds, 'BHR', 'manufacturing', ['manufacturing']), ev(c.ds, 'BHR', 'density', ['distractor'])],
  }),
  { type: 'report', id: 'me-report', title: '탐험 보고서', question: '석유를 파는 나라들은 무엇으로 미래를 준비할까?',
    brief: () => `모은 조사 자료 가운데 질문에 답하는 세 가지를 고르세요. ${relevanceText}` },
];

export const MIDEAST: Campaign = {
  id: ME, title: '석유 다음의 길', region: '서아시아', question: '석유를 파는 나라들은 무엇으로 미래를 준비할까?',
  intro: '다섯 번째 임무. 석유를 파는 나라와 공장·관광으로 사는 이웃을 견주며, 석유 다음의 길을 찾아야 합니다.',
  start: 'me-exports', startLocation: 'SAU', startResources: { funds: 90, days: 30 },
  nodes: Object.fromEntries(meNodes.map((n) => [n.id, n])),
  relevance: { manufacturing: 3, industry: 3, tourism: 3, openness: 2, trade: 1, income: 1, resources: 1, partners: 1, agri: 0, route: 0, geo: 0, distractor: -1 },
  pickEnding: endingsFor('me'),
  endings: [
    { id: 'me-best', title: '본부 최우수 탐험 보고서', text: (s) => `${branchOf(s)} 길에서 모은 자료로, 공장·관광·무역처럼 석유 밖의 산업이 얼마나 컸는지를 숫자로 보여 주었습니다.` },
    { id: 'me-solid', title: '탄탄한 현장 보고서', text: () => '석유 의존도는 잘 보여 주었지만, 그 대신 키운 산업을 보여 주는 자료가 하나 모자랐습니다.' },
    { id: 'me-open', title: '질문이 남은 보고서', text: () => '자료가 질문과 조금 멀었습니다. 석유 밖의 산업(제조업·관광·서비스) 비중을 모아야 답이 됩니다.' },
    { id: 'me-early', title: '조기 귀환', text: () => '자원이 바닥나 서둘러 돌아왔습니다. 사막을 건너는 길은 생각보다 깁니다.' },
  ],
};

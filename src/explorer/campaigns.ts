import type { Campaign, Ctx, DecisionOption, GameState, Node } from './types';
import { compareMission, discoverMission, economyMission, ev, rankMission, routeMission, sectorEvidence } from './missions';
import { has, successes, travelCost } from './engine';

const nm = (c: Ctx, id: string) => c.ds.country(id)?.name_ko ?? id;
const tripHint = (c: Ctx, s: GameState, to: string) => {
  const t = travelCost(c, s, to);
  return t.funds || t.days ? `이동 예상: 자금 ${-t.funds}, ${-t.days}일` : '지금 있는 곳';
};

/** 선택지 하나 (정보비는 바로, 이동비는 임무를 시작할 때 낸다) */
function opt(o: Omit<DecisionOption, 'cost' | 'available'> & { info?: number; available?: boolean }, s: GameState): DecisionOption {
  const info = o.info ?? 0;
  const affordable = s.funds - info > 0;
  return { ...o, cost: { funds: -info, days: 0 }, available: (o.available ?? true) && affordable,
    lockedReason: o.available === false ? o.lockedReason : !affordable ? '탐험 자금이 모자랍니다' : undefined };
}

const relevanceText = '보고서는 고른 자료가 질문과 얼마나 관련 있는지로 평가됩니다.';

// ═══════════════════════ 캠페인 1. 세계 경제의 비밀 (유럽) ═══════════════════════
const EU = 'europe-economy';
const EU_POOL = ['AUT', 'DEU', 'CHE', 'NLD', 'BEL', 'ITA', 'FRA', 'CZE', 'SVN', 'SVK', 'HUN', 'POL', 'DNK', 'SWE', 'FIN', 'IRL', 'ESP', 'PRT', 'LUX', 'NOR'];

const euNodes: Node[] = [
  discoverMission({
    id: 'eu-find', title: '메모 속의 나라', country: 'AUT', target: 'AUT', next: () => 'eu-exports',
    brief: () => '본부가 남긴 메모에는 "알프스 한가운데, 바다 없는 부유한 나라"라고만 적혀 있습니다. 단서를 모아 지도에서 그 나라를 찾으세요. 단서를 더 볼수록 탐험 자금이 듭니다.',
    evidence: (c) => {
      const n = c.ex.nature?.countries.AUT;
      const alps = n?.landforms.find((l) => l.name_en.toLowerCase() === 'alps');
      return [
        { id: 'AUT:alps', text: `오스트리아 국토의 약 ${alps ? Math.round(alps.share_of_country * 100) : '?'}%가 알프스산맥`, source: 'Natural Earth로 계산', tags: ['geo', 'tourism'], country: 'AUT' },
        ev(c.ds, 'AUT', 'gdp_pc_ppp', ['income']),
        ev(c.ds, 'AUT', 'population', ['distractor']),
      ];
    },
  }),
  economyMission({
    id: 'eu-exports', title: '세 나라의 주력 수출품', country: 'AUT', pool: ['AUT', 'DEU', 'CHE', 'NLD', 'CZE', 'BEL', 'ITA', 'HUN', 'IRL'], must: 'AUT',
    tags: ['trade', 'industry'], next: () => 'eu-peer',
    brief: () => '빈의 무역관에서 세 나라의 수출 통계표를 얻었지만 나라 이름이 지워져 있습니다. 상품군마다 어느 나라의 수출 1위인지 짝지어 주세요. 다 맞히면 오스트리아의 수출 상대국 자료도 받을 수 있습니다.',
  }),
  compareMission({
    id: 'eu-peer', title: '공장이 강한 부자 나라', country: 'AUT', pool: EU_POOL, target: 'productivity', filter: 'manufacturing', extra: 'exports_gdp',
    tags: ['productivity', 'industry'], next: () => 'eu-route-choice',
    brief: () => '오스트리아처럼 제조업이 강하면서 생산성이 높은 나라를 비교 대상으로 삼으려 합니다. 조건에 맞는 한 나라를 고르세요. 자료 줄을 열 때마다 자금이 듭니다. 꼭 필요한 줄만 열어 보세요.',
  }),
  {
    type: 'decide', id: 'eu-route-choice', title: '다음 행선지',
    brief: (s, c) => `지금까지의 자료로 다음 조사지를 정합니다. 남은 자금 ${s.funds}, 일정 ${s.days}일. ${has(s, 'AUT:top-partner') ? `${nm(c, 'DEU')}이(가) 오스트리아의 최대 수출 상대라는 자료가 있습니다.` : '아직 오스트리아의 수출 상대국을 모릅니다.'}`,
    options: (s, c) => [
      opt({ id: 'deu', label: '독일 — 최대 무역 상대를 따라간다', country: 'DEU', next: 'eu-deu-route', setFlags: { branch: 'DEU' },
        detail: `${tripHint(c, s, 'DEU')}. 수출 상대국 자료가 있으면 바로 갈 수 있습니다.`, available: has(s, 'AUT:top-partner'), lockedReason: '수출 상대국 자료가 없습니다' }, s),
      opt({ id: 'deu-paid', label: '독일 — 무역 통계를 사서 확인하고 간다', country: 'DEU', next: 'eu-deu-route', setFlags: { branch: 'DEU' }, info: 10,
        detail: `통계 열람비 10 + ${tripHint(c, s, 'DEU')}`, available: !has(s, 'AUT:top-partner'), lockedReason: '이미 자료가 있습니다' }, s),
      opt({ id: 'che', label: '스위스 — 알프스의 또 다른 부자 나라', country: 'CHE', next: 'eu-che-rank', setFlags: { branch: 'CHE' },
        detail: `${tripHint(c, s, 'CHE')}. 같은 알프스 나라끼리 생산성을 비교합니다.` }, s),
      opt({ id: 'nld', label: '네덜란드 — 유럽의 관문 항구', country: 'NLD', next: 'eu-nld-exports', setFlags: { branch: 'NLD' },
        info: s.flags['eu-peer:answer'] === 'NLD' || s.flags['eu-peer:answer'] === 'BEL' || s.flags.freeReveal ? 0 : 8,
        detail: `${tripHint(c, s, 'NLD')}. 항만 자료 열람비 ${s.flags['eu-peer:answer'] === 'NLD' || s.flags['eu-peer:answer'] === 'BEL' ? '0(비교 조사에서 이미 확보)' : '8'}.` }, s),
    ],
  },
  // ── 독일 갈래 ──
  routeMission({
    id: 'eu-deu-route', title: '부품이 넘는 국경', country: 'DEU', start: 'DEU', goal: 'ITA', next: () => 'eu-deu-rank',
    rules: [
      { label: '상품·서비스 수출이 GDP의 60% 이상인 나라만 지나기', ind: 'exports_gdp', min: 60, tags: ['trade', 'openness'] },
      { label: '서비스업 비중이 70% 이상인 나라만 지나기', ind: 'services_va', min: 70, tags: ['industry'] },
      { label: '제조업 비중이 19% 이상인 나라만 지나기', ind: 'manufacturing', min: 19, tags: ['industry'] },
    ],
    brief: () => '독일 공장의 부품이 이탈리아로 가는 길을 따라가 봅니다. 지도에서 독일부터 땅으로 이어진 나라를 하나씩 눌러 이탈리아까지 가세요. 조건을 어긴 나라를 지나면 조사가 어긋납니다. 한 구간마다 하루와 자금 2가 듭니다.',
  }),
  rankMission({
    id: 'eu-deu-rank', title: '오스트리아의 손님들', country: 'ITA', mode: 'partners', of: 'AUT', tags: ['trade', 'partners'], next: () => 'eu-final-choice',
    brief: () => '오스트리아가 상품을 가장 많이 파는 다섯 나라를 큰 순서대로 놓아 보세요. 비중이 큰 손님이 누구인지가 오스트리아 경제를 읽는 실마리입니다.',
  }),
  // ── 스위스 갈래 ──
  rankMission({
    id: 'eu-che-rank', title: '일하는 사람 한 명의 힘', country: 'CHE', mode: 'indicator', indicator: 'productivity', pool: ['CHE', 'AUT', 'DEU', 'ITA', 'FRA', 'NLD', 'BEL', 'SVN', 'CZE', 'DNK', 'NOR', 'IRL', 'POL', 'HUN', 'ESP', 'PRT', 'SVK'],
    tags: ['productivity', 'income'], next: () => 'eu-che-route',
    brief: () => '스위스 통계청 앞 카페에서, 유럽 다섯 나라의 \'취업자 1명당 GDP\'를 높은 순서로 놓아 보세요. 소득이 높은 나라는 일하는 사람 한 명이 만드는 가치도 클까요?',
  }),
  routeMission({
    id: 'eu-che-route', title: '알프스 남쪽 길', country: 'CHE', start: 'CHE', goal: 'SVN', next: () => 'eu-final-choice',
    rules: [
      { label: '지중해성 기후(여름에 건조)가 국토의 20% 이상인 나라만 지나기', climate: 'Cs', tags: ['geo'] },
      { label: '서비스업 비중이 64.2% 이상인 나라만 지나기', ind: 'services_va', min: 64.2, tags: ['industry'] },
    ],
    brief: () => '스위스에서 슬로베니아까지, 알프스 남쪽으로 돌아가는 길을 찾습니다. 기후 조건을 지키며 땅으로 이어진 나라를 누르세요.',
  }),
  // ── 네덜란드 갈래 ──
  economyMission({
    id: 'eu-nld-exports', title: '항구 나라들의 수출품', country: 'NLD', pool: ['NLD', 'BEL', 'DEU', 'FRA', 'DNK', 'IRL', 'ESP', 'ITA'], must: 'NLD', tags: ['trade', 'openness'],
    next: () => 'eu-nld-rank',
    brief: () => '로테르담 항만 사무소에서 받은 표입니다. 항구로 물건이 드나드는 세 나라의 수출 1위 상품군을 짝지어 보세요. (UN Comtrade 수출에는 들여와 다시 내보내는 재수출도 들어 있습니다.)',
  }),
  rankMission({
    id: 'eu-nld-rank', title: '얼마나 밖으로 파는가', country: 'NLD', mode: 'indicator', indicator: 'exports_gdp', pool: ['NLD', 'BEL', 'DEU', 'FRA', 'AUT', 'IRL', 'LUX', 'CHE', 'ITA', 'ESP', 'DNK', 'SVK', 'HUN', 'POL'],
    tags: ['trade', 'openness'], next: () => 'eu-nld-route',
    brief: () => '다섯 나라를 \'GDP 대비 수출 비율\'이 높은 순서로 놓아 보세요. 수출이 GDP보다 많은 나라도 있습니다.',
  }),
  routeMission({
    id: 'eu-nld-route', title: '컨테이너 열차', country: 'NLD', start: 'NLD', goal: 'CZE', next: () => 'eu-final-choice',
    rules: [{ label: '제조업 비중이 17% 이상인 나라만 지나기', ind: 'manufacturing', min: 17, tags: ['industry'] }],
    brief: () => '로테르담에 내린 컨테이너가 체코 공장까지 가는 철길을 그려 보세요. 공장이 많은 나라를 거쳐야 합니다.',
  }),
  // ── 마지막 선택 ──
  {
    type: 'decide', id: 'eu-final-choice', title: '보고서를 쓸까, 더 조사할까',
    brief: (s) => `남은 자금 ${s.funds}, 일정 ${s.days}일. 지금 보고서를 쓰면 남은 자원이 점수에 더해지고, 더 조사하면 자료가 늘어납니다.`,
    options: (s, c) => [
      opt({ id: 'report-now', label: '빈으로 돌아가 보고서를 쓴다', next: 'eu-report', detail: '남은 자원을 아낍니다.' }, s),
      opt({ id: 'czech', label: '체코의 공장 지대를 더 조사한다', country: 'CZE', next: 'eu-cze', available: s.days > 4, lockedReason: '일정이 부족합니다',
        detail: `${tripHint(c, s, 'CZE')}. 오스트리아의 이웃 공장 나라를 찾아 산업 구조 자료를 얻습니다.` }, s),
    ],
  },
  discoverMission({
    id: 'eu-cze', title: '이웃 공장 나라', country: 'CZE', target: 'CZE', next: () => 'eu-report',
    brief: () => '오스트리아 북쪽에 맞닿은, 자동차를 많이 수출하는 나라를 지도에서 찾으세요.',
    evidence: (c) => [sectorEvidence(c.ds, 'CZE', ['industry']), sectorEvidence(c.ds, 'AUT', ['industry'])],
  }),
  { type: 'report', id: 'eu-report', title: '탐험 보고서', question: '오스트리아는 어떻게 높은 소득 수준을 유지할까?',
    brief: () => `모은 조사 자료 가운데 질문에 답하는 데 가장 중요한 세 가지를 골라 보고서를 쓰세요. ${relevanceText}` },
];

function endingsFor(prefix: string) {
  return (s: GameState) => {
    const sc = s.reportScore ?? 0;
    if (s.flags.earlyReturn && sc < 7) return `${prefix}-early`;
    if (sc >= 7 && successes(s) >= 4) return `${prefix}-best`;
    if (sc >= 4) return `${prefix}-solid`;
    return `${prefix}-open`;
  };
}

const branchName: Record<string, string> = { DEU: '독일', CHE: '스위스', NLD: '네덜란드', CHN: '중국', VNM: '베트남', SGP: '싱가포르' };

export const EUROPE: Campaign = {
  id: EU, title: '세계 경제의 비밀', region: '유럽', question: '오스트리아는 어떻게 높은 소득 수준을 유지할까?',
  intro: '탐험 본부의 새 조사원이 된 당신. 첫 임무는 알프스의 작은 나라가 어떻게 부유해졌는지 밝히는 것입니다.',
  start: 'eu-find', startLocation: 'AUT', startResources: { funds: 80, days: 30 },
  nodes: Object.fromEntries(euNodes.map((n) => [n.id, n])),
  relevance: { productivity: 3, income: 2, industry: 2, trade: 2, partners: 1, openness: 1, tourism: 1, geo: 0, route: 0, distractor: -1 },
  pickEnding: endingsFor('eu'),
  endings: [
    { id: 'eu-best', title: '본부 최우수 탐험 보고서', text: (s) => `${branchName[s.flags.branch as string] ?? ''} 길을 거쳐 모은 자료가 질문의 핵심을 짚었습니다. 높은 생산성, 서비스업과 제조업이 함께 큰 산업 구조, 이웃 나라와의 활발한 수출을 근거로 든 보고서가 본부 게시판에 걸렸습니다.` },
    { id: 'eu-solid', title: '탄탄한 현장 보고서', text: () => '중요한 근거 몇 가지를 잘 골랐습니다. 다만 생산성·산업 구조·수출 가운데 빠진 고리가 있어 본부가 추가 조사를 권했습니다.' },
    { id: 'eu-open', title: '질문이 남은 보고서', text: () => '흥미로운 사실은 많았지만, 소득 수준과 직접 이어지는 근거가 부족했습니다. 인구나 산의 높이만으로는 나라가 부유한 까닭을 설명하기 어렵습니다.' },
    { id: 'eu-early', title: '조기 귀환', text: () => '자금이나 일정이 바닥나 서둘러 돌아왔습니다. 모은 자료만으로 보고서를 냈지만, 다음 탐험에서는 자원을 더 아껴 써야겠습니다.' },
  ],
};

// ═══════════════════════ 캠페인 2. 공장과 바다의 길 (아시아) ═══════════════════════
const AS = 'asia-factory';
const AS_POOL = ['KOR', 'JPN', 'CHN', 'VNM', 'THA', 'MYS', 'IDN', 'PHL', 'IND', 'KHM', 'SGP', 'BGD', 'LKA', 'PAK', 'MMR', 'LAO', 'MNG', 'NPL'];

const asNodes: Node[] = [
  economyMission({
    id: 'as-exports', title: '부산항의 컨테이너', country: 'KOR', pool: ['KOR', 'JPN', 'IDN', 'KHM', 'LAO', 'IND', 'MMR'], must: 'KOR', tags: ['manufacturing', 'trade'],
    next: () => 'as-partners',
    brief: () => '부산항에 쌓인 컨테이너 세 줄에 서로 다른 나라의 대표 수출품이 실려 있습니다. 상품군마다 어느 나라의 수출 1위인지 짝지어 보세요.',
  }),
  rankMission({
    id: 'as-partners', title: '한국 상품은 어디로', country: 'KOR', mode: 'partners', of: 'KOR', tags: ['trade', 'partners'], next: () => 'as-compare',
    brief: () => '한국이 상품을 많이 파는 다섯 곳을 비중이 큰 순서로 놓으세요. 다음 행선지를 고르는 데 쓰입니다.',
  }),
  compareMission({
    id: 'as-compare', title: '아시아의 공장을 찾아라', country: 'KOR', pool: AS_POOL, target: 'manufacturing', filter: 'exports_gdp', extra: 'productivity',
    tags: ['manufacturing', 'trade'], next: () => 'as-route-choice',
    brief: () => '수출을 많이 하는 나라 가운데 제조업 비중이 가장 큰 곳을 찾으려 합니다. 자료 줄을 열 때마다 자금이 듭니다.',
  }),
  {
    type: 'decide', id: 'as-route-choice', title: '다음 행선지',
    brief: (s, c) => `남은 자금 ${s.funds}, 일정 ${s.days}일. ${has(s, 'as-partners:rank') ? '한국의 수출 상대국 순위를 알고 있습니다.' : '아직 한국의 수출 상대국 순위를 모릅니다.'} ${s.flags['as-compare:answer'] ? `비교 조사에서 ${nm(c, s.flags['as-compare:answer'] as string)}을(를) 짚었습니다.` : ''}`,
    options: (s, c) => [
      opt({ id: 'chn', label: '중국 — 한국의 가장 큰 시장', country: 'CHN', next: 'as-cn-find', setFlags: { branch: 'CHN' }, detail: `${tripHint(c, s, 'CHN')}.` }, s),
      opt({ id: 'vnm', label: '베트남 — 빠르게 크는 공장 나라', country: 'VNM', next: 'as-vn-find', setFlags: { branch: 'VNM' },
        info: has(s, 'as-partners:rank') ? 0 : 8, detail: `${tripHint(c, s, 'VNM')}. 상대국 순위를 알면 정보비 0, 모르면 8.` }, s),
      opt({ id: 'sgp', label: '싱가포르 — 바닷길의 교차로', country: 'SGP', next: 'as-sg-find', setFlags: { branch: 'SGP' },
        available: s.flags['as-compare:answer'] !== undefined || s.funds > 40, lockedReason: '비교 조사 자료가 없고 자금도 40 이하입니다',
        info: s.flags['as-compare:answer'] !== undefined ? 0 : 10, detail: `${tripHint(c, s, 'SGP')}. 바닷길이라 비쌉니다. 비교 조사를 마쳤으면 정보비 0, 아니면 10.` }, s),
    ],
  },
  // ── 중국 갈래 ──
  discoverMission({
    id: 'as-cn-find', title: '국경 너머의 광산', country: 'CHN', target: 'LAO', next: () => 'as-cn-route',
    brief: () => '중국 남쪽 국경 너머, 광석을 많이 내보내는 내륙국이 있다고 합니다. 단서를 모아 지도에서 찾으세요.',
    evidence: (c) => [sectorEvidence(c.ds, 'LAO', ['manufacturing']), ev(c.ds, 'CHN', 'manufacturing', ['manufacturing'])],
  }),
  routeMission({
    id: 'as-cn-route', title: '남쪽으로 가는 공급망', country: 'LAO', start: 'CHN', goal: 'THA', next: () => 'as-final-choice',
    rules: [
      { label: '제조업 비중이 20% 이상인 나라만 지나기', ind: 'manufacturing', min: 20, tags: ['manufacturing', 'route'] },
      { label: '상품·서비스 수출이 GDP의 60% 이상인 나라만 지나기', ind: 'exports_gdp', min: 60, tags: ['trade', 'route'] },
    ],
    brief: () => '중국에서 태국까지 부품이 가는 육로를 찾으세요. 조건에 맞는 나라만 거쳐야 합니다.',
  }),
  // ── 베트남 갈래 ──
  discoverMission({
    id: 'as-vn-find', title: 'S자 해안의 공장', country: 'VNM', target: 'VNM', next: () => 'as-vn-route',
    brief: () => '한국 기업들이 공장을 많이 세운, 길쭉한 S자 해안의 나라를 지도에서 찾으세요.',
    evidence: (c) => [sectorEvidence(c.ds, 'VNM', ['manufacturing']), ev(c.ds, 'VNM', 'exports_gdp', ['trade'])],
  }),
  routeMission({
    id: 'as-vn-route', title: '메콩을 건너', country: 'VNM', start: 'VNM', goal: 'MYS', next: () => 'as-final-choice',
    rules: [
      { label: '제조업 비중이 20% 이상인 나라만 지나기', ind: 'manufacturing', min: 20, tags: ['manufacturing', 'route'] },
      { label: '열대 기후(A)가 국토의 20% 이상인 나라만 지나기', climate: 'A', tags: ['geo'] },
    ],
    brief: () => '베트남에서 말레이시아까지 땅으로 이어진 길을 찾으세요.',
  }),
  // ── 싱가포르 갈래 ──
  discoverMission({
    id: 'as-sg-find', title: '해협 끝의 작은 섬', country: 'SGP', target: 'SGP', next: () => 'as-sg-route',
    brief: () => '말레이반도 끝, 바닷길이 모이는 작은 섬나라를 찾으세요. 작은 나라는 지도 위 동그라미로 표시됩니다.',
    evidence: (c) => [ev(c.ds, 'SGP', 'exports_gdp', ['trade']), sectorEvidence(c.ds, 'SGP', ['manufacturing'])],
  }),
  routeMission({
    id: 'as-sg-route', title: '반도를 따라 북쪽으로', country: 'MYS', start: 'MYS', goal: 'KHM', next: () => 'as-final-choice',
    rules: [{ label: '제조업 비중이 22% 이상인 나라만 지나기', ind: 'manufacturing', min: 22, tags: ['manufacturing', 'route'] }],
    brief: () => '배에서 내려 말레이시아에서 캄보디아까지 땅길로 올라갑니다. (싱가포르↔말레이시아는 바닷길로 건넜다고 칩니다.)',
  }),
  {
    type: 'decide', id: 'as-final-choice', title: '보고서를 쓸까, 더 조사할까',
    brief: (s) => `남은 자금 ${s.funds}, 일정 ${s.days}일.`,
    options: (s, c) => [
      opt({ id: 'report-now', label: '서울로 돌아가 보고서를 쓴다', next: 'as-report', detail: '남은 자원을 아낍니다.' }, s),
      opt({ id: 'open-rank', label: '아시아 수출 비율 순위를 조사한다', next: 'as-open-rank', available: s.days > 3, lockedReason: '일정이 부족합니다', detail: '지금 있는 곳에서 자료를 모읍니다.' }, s),
      opt({ id: 'bgd', label: '방글라데시의 옷 공장을 찾아간다', country: 'BGD', next: 'as-bgd', available: s.days > 5, lockedReason: '일정이 부족합니다', detail: `${tripHint(c, s, 'BGD')}.` }, s),
    ],
  },
  rankMission({
    id: 'as-open-rank', title: '바깥으로 얼마나 파나', country: 'THA', mode: 'indicator', indicator: 'exports_gdp', pool: ['SGP', 'VNM', 'MYS', 'THA', 'KHM', 'KOR', 'PHL', 'IDN', 'IND', 'CHN', 'JPN', 'BGD', 'LKA', 'PAK'],
    tags: ['trade', 'openness'], next: () => 'as-report',
    brief: () => '다섯 나라를 GDP 대비 수출 비율이 높은 순서로 놓으세요.',
  }),
  discoverMission({
    id: 'as-bgd', title: '갠지스 하구의 옷 공장', country: 'BGD', target: 'BGD', next: () => 'as-report',
    brief: () => '큰 강 하구에 자리한, 옷을 많이 수출하는 나라를 지도에서 찾으세요.',
    evidence: (c) => [sectorEvidence(c.ds, 'BGD', ['manufacturing']), ev(c.ds, 'BGD', 'population', ['distractor'])],
  }),
  { type: 'report', id: 'as-report', title: '탐험 보고서', question: '아시아의 공장들은 무엇을 만들어 어디로 보낼까?',
    brief: () => `모은 조사 자료 가운데 질문에 답하는 세 가지를 고르세요. ${relevanceText}` },
];

export const ASIA: Campaign = {
  id: AS, title: '공장과 바다의 길', region: '아시아', question: '아시아의 공장들은 무엇을 만들어 어디로 보낼까?',
  intro: '두 번째 임무. 서울 본부를 떠나 아시아의 공장과 항구를 따라가며, 무엇이 만들어져 어디로 가는지 밝혀야 합니다.',
  start: 'as-exports', startLocation: 'KOR', startResources: { funds: 90, days: 32 },
  nodes: Object.fromEntries(asNodes.map((n) => [n.id, n])),
  relevance: { manufacturing: 3, trade: 2, partners: 2, openness: 1, productivity: 1, income: 1, industry: 1, route: 0, geo: 0, distractor: -1 },
  pickEnding: endingsFor('as'),
  endings: [
    { id: 'as-best', title: '본부 최우수 탐험 보고서', text: (s) => `${branchName[s.flags.branch as string] ?? ''} 길에서 모은 자료로, 어떤 나라가 무엇을 만들어 누구에게 파는지 꿰뚫어 보았습니다.` },
    { id: 'as-solid', title: '탄탄한 현장 보고서', text: () => '제조업과 수출의 연결을 잘 짚었지만, 수출 상대국이나 산업 구조 가운데 한 고리가 비었습니다.' },
    { id: 'as-open', title: '질문이 남은 보고서', text: () => '모은 자료가 질문과 조금 멀었습니다. 인구나 기후보다 무엇을 만들고 누구에게 파는지가 핵심입니다.' },
    { id: 'as-early', title: '조기 귀환', text: () => '자원이 바닥나 서둘러 돌아왔습니다. 다음에는 비싼 바닷길과 단서 구입을 아껴 보세요.' },
  ],
};

export const CAMPAIGNS: Campaign[] = [EUROPE, ASIA];
export const campaignById = (id: string) => CAMPAIGNS.find((c) => c.id === id);

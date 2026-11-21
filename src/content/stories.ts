import type { Dataset } from '../data/engine';
import type { IndicatorId } from '../data/types';
import { josa } from '../data/format';
import { lowRankText, name, peak, rankText, val, valueIn } from './helpers';

/**
 * 나라별 이야기.
 * - 한 이야기는 질문 하나와 2~4개의 '장면(panel)'으로 이뤄진다. 장면 단위는 나중에 4~6컷 만화로 바꿀 때 컷이 된다
 *   (panel.art 에 그림 경로를 넣으면 화면이 그림+글 구성으로 바뀐다).
 * - 문장 속 숫자는 모두 데이터(World Bank WDI)에서 계산한다. 숫자가 없으면 '자료 없음'으로 나온다.
 * - 데이터로 확인할 수 없는 사실(역사·지리 설명)은 널리 확인된 내용만 쓰고, 출처를 notes 에 적는다.
 */
export interface StoryPanel {
  text: string;
  art?: string;
  caption?: string;
}
export interface Story {
  id: string;
  country: string;
  question: string;
  panels: (ds: Dataset) => StoryPanel[];
  indicators: IndicatorId[];   // 이 이야기에서 쓰는 지표 (세계 랭킹 연결)
  notes?: string[];            // 데이터 외 사실의 출처
}

const t = (text: string): StoryPanel => ({ text });

export const STORIES: Story[] = [
  // ───────── 대한민국 ─────────
  {
    id: 'kor-economy', country: 'KOR', question: '한국의 경제 규모는 세계에서 어느 정도일까?',
    indicators: ['gdp', 'gdp_pc', 'manufacturing', 'area'],
    panels: (ds) => {
      const gdp = val(ds, 'KOR', 'gdp'), pc = val(ds, 'KOR', 'gdp_pc'), mf = val(ds, 'KOR', 'manufacturing');
      return [
        t(`GDP(국내총생산)는 한 나라 안에서 1년 동안 새로 만들어 낸 물건과 서비스의 값을 모두 더한 것입니다. ${gdp?.year}년 대한민국의 GDP는 ${gdp?.text ?? '자료 없음'}로, ${rankText(ds, 'KOR', 'gdp')}입니다.`),
        t(`국토 면적은 ${rankText(ds, 'KOR', 'area')}, 인구는 ${rankText(ds, 'KOR', 'population')}입니다. 땅에 비해 경제 규모가 큰 편입니다. 한국은 반도체·자동차·배·석유화학 제품을 만들어 수출하는 제조업 강국으로, 제조업이 GDP에서 차지하는 비중이 ${mf?.text ?? '자료 없음'}(${mf?.year}년, ${rankText(ds, 'KOR', 'manufacturing')})입니다.`),
        t(`1인당 GDP는 ${pc?.text ?? '자료 없음'}로 ${rankText(ds, 'KOR', 'gdp_pc')}입니다. 나라 전체의 경제 크기(GDP)와 국민 한 사람에게 돌아가는 평균 몫(1인당 GDP)은 순위가 서로 다를 수 있습니다.`),
      ];
    },
  },
  {
    id: 'kor-population', country: 'KOR', question: '한국의 인구구조는 어떻게 변화하고 있을까?',
    indicators: ['fertility', 'life_exp', 'population'],
    panels: (ds) => {
      const f = val(ds, 'KOR', 'fertility'), le = val(ds, 'KOR', 'life_exp');
      const pk = peak(ds, 'KOR', 'population');
      const panels = [
        t(`합계출산율은 여성 한 명이 평생 낳을 것으로 예상되는 아이 수입니다. 인구가 늘지도 줄지도 않으려면 대략 2.1명이 필요하다고 봅니다. ${f?.year}년 대한민국의 합계출산율은 ${f?.text ?? '자료 없음'}로, ${lowRankText(ds, 'KOR', 'fertility')}. 2000년에는 ${valueIn(ds, 'KOR', 'fertility', 2000)}이었습니다.`),
        t(`한편 기대수명은 ${le?.text ?? '자료 없음'}(${le?.year}년)로 ${rankText(ds, 'KOR', 'life_exp')}입니다. 아이는 적게 태어나고 사람들은 오래 살기 때문에, 전체 인구에서 노인이 차지하는 비율이 빠르게 커지고 있습니다. 이를 '고령화'라고 합니다.`),
      ];
      if (pk && pk.year < pk.lastYear) {
        panels.push(t(`대한민국 인구는 ${pk.year}년 ${pk.text}으로 가장 많았고, ${pk.lastYear}년에는 ${valueIn(ds, 'KOR', 'population', pk.lastYear)}입니다. 태어나는 사람보다 세상을 떠나는 사람이 많아지면 인구는 줄어듭니다.`));
      }
      return panels;
    },
  },
  // ───────── 일본 ─────────
  {
    id: 'jpn-quake', country: 'JPN', question: '일본에는 왜 지진과 화산이 많을까?',
    indicators: ['area'],
    notes: ['판 구조와 환태평양 조산대: 일반 지구과학 개념 (미국지질조사국 USGS 등)'],
    panels: () => [
      t('일본 열도는 태평양판·필리핀해판·유라시아판·북아메리카판이 서로 만나는 곳 가까이에 있습니다. 무거운 바다 판이 다른 판 밑으로 파고드는 경계에서는 땅이 자주 흔들리고, 땅속에서 마그마가 만들어져 화산이 생기기 쉽습니다.'),
      t('태평양을 빙 둘러싼 이런 지대를 \'환태평양 조산대\'라고 부릅니다. 일본뿐 아니라 인도네시아, 필리핀, 칠레, 미국 서부 해안도 이 띠 위에 있습니다.'),
      t('그래서 일본은 건물을 지을 때 흔들림을 견디도록 짓는 내진 설계를 엄격하게 하고, 지진이 오기 직전 휴대전화로 알려 주는 긴급 지진 속보를 운영합니다. 화산 덕분에 온천도 많습니다.'),
    ],
  },
  {
    id: 'jpn-aging', country: 'JPN', question: '오래 사는 나라 일본, 인구는 왜 줄어들까?',
    indicators: ['life_exp', 'fertility', 'population'],
    panels: (ds) => {
      const le = val(ds, 'JPN', 'life_exp'), f = val(ds, 'JPN', 'fertility');
      const pk = peak(ds, 'JPN', 'population');
      const out = [
        t(`일본은 기대수명이 ${le?.text ?? '자료 없음'}(${le?.year}년)로 ${rankText(ds, 'JPN', 'life_exp')}인, 세계에서 손꼽히게 오래 사는 나라입니다.`),
        t(`그러나 합계출산율은 ${f?.text ?? '자료 없음'}로, 인구를 유지하는 데 필요한 약 2.1명보다 훨씬 낮습니다. 오래 살지만 아이가 적게 태어나면, 노인은 많아지고 전체 인구는 점점 줄어듭니다.`),
      ];
      if (pk && pk.year < pk.lastYear) {
        out.push(t(`World Bank 자료에서 일본 인구가 가장 많았던 해는 ${pk.year}년(${pk.text})입니다. ${pk.lastYear}년 인구는 ${valueIn(ds, 'JPN', 'population', pk.lastYear)}입니다. 한국도 비슷한 길을 걷고 있어 두 나라를 함께 비교해 볼 만합니다.`));
      }
      return out;
    },
  },
  // ───────── 중국 ─────────
  {
    id: 'chn-population', country: 'CHN', question: '세계 인구 1위 자리는 왜 바뀌었을까?',
    indicators: ['population', 'fertility'],
    notes: ['한 자녀 정책(1980년 무렵~2015년): 중국 정부가 2015년 폐지를 발표, 2016년부터 두 자녀 허용'],
    panels: (ds) => {
      const chn = ds.series('CHN', 'population'), ind = new Map(ds.series('IND', 'population'));
      const cross = chn.find(([y, v]) => (ind.get(y) ?? 0) > v)?.[0];
      return [
        t(`오랫동안 세계에서 인구가 가장 많은 나라는 중국이었습니다. 그런데 World Bank 자료(유엔 인구 추계)에서는 ${cross ? `${cross}년부터 인도 인구가 중국보다 많습니다` : '아직 중국이 1위입니다'}. ${ds.ranking('population').year}년 인구는 인도 ${val(ds, 'IND', 'population')?.text}, 중국 ${val(ds, 'CHN', 'population')?.text}입니다.`),
        t(`중국은 1980년 무렵부터 2015년까지 한 가정이 자녀를 한 명만 낳도록 하는 '한 자녀 정책'을 펼쳤습니다. 지금 중국의 합계출산율은 ${val(ds, 'CHN', 'fertility')?.text}, 인도는 ${val(ds, 'IND', 'fertility')?.text}입니다(${ds.indicator('fertility').ref_year}년).`),
        t('출산율 차이가 수십 년 쌓이면 두 나라의 인구 순위도 바뀝니다. 인구는 한 해의 사건보다 오랜 세월의 흐름이 만들어 내는 결과입니다.'),
      ];
    },
  },
  {
    id: 'chn-factory', country: 'CHN', question: '중국은 어떻게 \'세계의 공장\'이 됐을까?',
    indicators: ['gdp', 'manufacturing', 'gdp_growth'],
    notes: ['개혁·개방(1978년)과 경제특구(선전 등 1980년 지정): 중국 현대사 일반 사실'],
    panels: (ds) => {
      const g = val(ds, 'CHN', 'gdp');
      const g2000 = ds.value('CHN', 'gdp', 2000);
      const times = g && g2000 ? Math.round(g.value / g2000) : undefined;
      return [
        t('1978년 중국은 \'개혁·개방\' 정책을 시작했습니다. 선전 같은 바닷가 도시를 경제특구로 정해 외국 기업이 공장을 세울 수 있게 했고, 일할 사람이 많고 임금이 낮았던 중국에 세계의 공장이 모여들었습니다.'),
        t(`${g?.year}년 중국의 GDP는 ${g?.text ?? '자료 없음'}로 ${rankText(ds, 'CHN', 'gdp')}입니다.${times ? ` 2000년과 비교하면 약 ${times}배가 됐습니다(그해 달러 기준).` : ''} 제조업 비중은 ${val(ds, 'CHN', 'manufacturing')?.text ?? '자료 없음'}입니다.`),
        t('지금 중국은 값싼 물건만이 아니라 전기차, 배터리, 태양광 패널처럼 첨단 기술이 필요한 제품도 많이 만듭니다.'),
      ];
    },
  },
  {
    id: 'chn-huline', country: 'CHN', question: '넓은 중국 땅, 사람들은 어디에 살까?',
    indicators: ['area', 'density'],
    notes: ['후환융 선(1935): 중국 지리학자 후환융이 제시한 인구 분포선'],
    panels: (ds) => [
      t(`중국의 국토 면적은 ${val(ds, 'CHN', 'area')?.text}로 ${rankText(ds, 'CHN', 'area')}입니다. 하지만 사람들은 땅 전체에 고르게 살지 않습니다.`),
      t('1935년 지리학자 후환융은 북동쪽 헤이룽장성의 헤이허와 남서쪽 윈난성의 텅충을 잇는 선을 그었습니다. 이 선의 남동쪽에 인구의 대부분(90% 이상)이 살고, 북서쪽의 넓은 땅에는 사람이 아주 적게 삽니다.'),
      t('북서쪽에는 높은 고원과 사막, 건조한 초원이 넓게 펼쳐져 있어 농사를 짓기 어렵기 때문입니다. 평균 인구밀도만 보면 놓치기 쉬운, 지도가 알려 주는 사실입니다.'),
    ],
  },
  // ───────── 미국 ─────────
  {
    id: 'usa-economy', country: 'USA', question: '세계에서 경제 규모가 가장 큰 나라는?',
    indicators: ['gdp', 'gdp_pc', 'population'],
    panels: (ds) => {
      const r = ds.ranking('gdp');
      const total = r.rows.reduce((s, x) => s + x.value, 0);
      const us = r.rows.find((x) => x.country.id === 'USA');
      const share = us ? Math.round((us.value / total) * 100) : undefined;
      return [
        t(`${r.year}년 미국의 GDP는 ${val(ds, 'USA', 'gdp')?.text ?? '자료 없음'}로 ${rankText(ds, 'USA', 'gdp')}입니다.${share ? ` 자료가 있는 ${r.rows.length}개국의 GDP를 모두 더한 값의 약 ${share}%에 이릅니다.` : ''}`),
        t(`인구는 ${rankText(ds, 'USA', 'population')}, 국토 면적은 ${rankText(ds, 'USA', 'area')}입니다. 큰 국내 시장, 풍부한 자원, 정보기술·금융 같은 산업이 경제를 떠받칩니다. 미국 달러는 나라 사이의 무역과 금융 거래에서 가장 많이 쓰이는 돈이기도 합니다.`),
        t(`1인당 GDP는 ${val(ds, 'USA', 'gdp_pc')?.text ?? '자료 없음'}로 ${rankText(ds, 'USA', 'gdp_pc')}입니다. 인구가 많으면서 1인당 GDP도 높은 나라는 드뭅니다.`),
      ];
    },
  },
  {
    id: 'usa-states', country: 'USA', question: '미국은 왜 \'합중국\'이라고 부를까?',
    indicators: ['area'],
    notes: ['알래스카 매입(1867), 알래스카·하와이 주 승격(1959): 미국사 일반 사실'],
    panels: () => [
      t('미국의 정식 이름은 \'아메리카 합중국(United States of America)\'입니다. 50개의 주(State)와 수도 워싱턴 D.C.가 모여 하나의 나라를 이룬 연방 국가라는 뜻입니다. 주마다 따로 법과 의회가 있습니다.'),
      t('50개 주 가운데 알래스카와 하와이는 본토와 떨어져 있습니다. 알래스카는 1867년 러시아에게서 사들인 땅이고, 하와이는 태평양 한가운데의 섬들입니다. 두 곳 모두 1959년에 주가 됐습니다.'),
      t('본토만 해도 동서로 아주 넓어서 동부·중부·산지·태평양의 네 표준시간대로 나뉩니다. 뉴욕이 정오일 때 로스앤젤레스는 오전 9시입니다.'),
    ],
  },
  // ───────── 네덜란드 ─────────
  {
    id: 'nld-lowland', country: 'NLD', question: '왜 바다보다 낮은 땅이 많을까?',
    indicators: ['density', 'area'],
    notes: ['국토의 약 26% 해수면 아래, 약 59% 홍수 위험: 네덜란드 환경평가청(PBL), 2010', '1953년 북해 대홍수와 델타 계획: 네덜란드 현대사 일반 사실'],
    panels: (ds) => [
      t('네덜란드(Nederland)라는 이름은 \'낮은 땅\'이라는 뜻입니다. 국토의 약 4분의 1이 바다 수면보다 낮고, 절반이 넘는 땅이 홍수 위험을 안고 있습니다.'),
      t('라인강 등이 바다로 흘러드는 낮은 습지에 살던 사람들은 둑을 쌓고, 풍차로 물을 퍼내 땅을 말렸습니다. 이렇게 바다나 호수를 막아 만든 땅을 \'폴더(polder)\'라고 합니다.'),
      t(`1953년 북해 대홍수로 큰 피해를 입은 뒤에는 거대한 방조제와 수문을 쌓는 \'델타 계획\'을 추진했습니다. 좁은 땅에 사람이 많이 살아 인구밀도가 ${val(ds, 'NLD', 'density')?.text}(${rankText(ds, 'NLD', 'density')})이니, 땅 한 뼘도 소중합니다.`),
    ],
  },
  {
    id: 'nld-agri', country: 'NLD', question: '작은 나라 네덜란드는 어떻게 농업 수출 강국이 됐을까?',
    indicators: ['area', 'gdp_pc'],
    notes: ['농산물 수출액 세계 2위(미국 다음): 네덜란드 정부·통계청(CBS) 발표'],
    panels: (ds) => [
      t(`네덜란드의 국토 면적은 ${val(ds, 'NLD', 'area')?.text}로 ${rankText(ds, 'NLD', 'area')}입니다. 대한민국(${val(ds, 'KOR', 'area')?.text})보다 작은데도, 농산물 수출액은 미국 다음으로 많은 나라로 꼽힙니다.`),
      t('비결은 기술입니다. 유리 온실에서 빛·온도·물을 정밀하게 조절해 토마토, 파프리카, 꽃을 기르고, 대학과 연구소가 개발한 품종과 재배 기술을 농가가 바로 씁니다.'),
      t('유럽에서 가장 큰 항구인 로테르담 항도 중요합니다. 다른 나라의 농산물을 들여와 가공하고 포장해 다시 유럽 곳곳으로 보내는 \'물류의 관문\' 역할을 합니다.'),
    ],
  },
  // ───────── 몽골 ─────────
  {
    id: 'mng-sparse', country: 'MNG', question: '왜 넓은 국토에 비해 인구가 적을까?',
    indicators: ['density', 'area', 'population'],
    panels: (ds) => {
      const c = ds.country('MNG');
      const names = (c?.borders ?? []).map((b) => name(ds, b));
      const nb = names.length > 1 ? `${names.slice(0, -1).map((n) => josa(n, '과와')).join(' ')} ${names[names.length - 1]}` : names.join('');
      return [
        t(`몽골의 국토 면적은 ${val(ds, 'MNG', 'area')?.text}로 ${rankText(ds, 'MNG', 'area')}이지만, 인구는 ${val(ds, 'MNG', 'population')?.text}입니다. 인구밀도는 ${val(ds, 'MNG', 'density')?.text}로 ${lowRankText(ds, 'MNG', 'density')}.`),
        t(`몽골은 ${nb ? `${nb} 사이에 있는` : ''} 바다가 없는 내륙국입니다. 바다에서 멀어 비가 적고, 평균 해발 고도가 1,500m가 넘는 고원이라 겨울이 몹시 춥습니다. 남쪽에는 고비 사막이 펼쳐져 있습니다.`),
        t('이런 땅에서는 농사를 짓기 어렵습니다. 그래서 사람들은 예로부터 넓은 초원을 옮겨 다니며 가축을 길러 왔고, 지금은 수도 울란바토르에 전체 인구의 절반 가까이가 모여 삽니다.'),
      ];
    },
  },
  {
    id: 'mng-nomad', country: 'MNG', question: '초원과 유목 생활은 어떤 관계가 있을까?',
    indicators: ['urban'],
    panels: (ds) => [
      t('비가 적은 초원에서는 풀이 금방 자라지 않습니다. 한곳에서 가축이 풀을 다 뜯어 먹으면, 사람들은 풀이 새로 자란 곳으로 가축을 몰고 옮겨 갑니다. 이것이 유목입니다.'),
      t('유목민은 쉽게 접었다 펼 수 있는 둥근 천막집 \'게르\'에 삽니다. 양·염소·말·소·낙타를 기르며 고기·젖·털을 얻습니다. 몽골의 가축 수는 사람 수보다 훨씬 많습니다.'),
      t(`겨울 혹한과 폭설로 가축이 한꺼번에 죽는 재해 \'조드\'가 닥치면 유목민은 큰 어려움을 겪고, 많은 사람이 도시로 옮겨 갑니다. 몽골의 도시화율은 ${val(ds, 'MNG', 'urban')?.text}(${val(ds, 'MNG', 'urban')?.year}년)입니다.`),
    ],
  },
  // ───────── 싱가포르 (추가) ─────────
  {
    id: 'sgp-port', country: 'SGP', question: '작은 도시국가는 어떻게 세계적인 무역 중심지가 됐을까?',
    indicators: ['area', 'density', 'gdp_pc'],
    notes: ['말레이시아에서 분리 독립(1965): 싱가포르 현대사 일반 사실'],
    panels: (ds) => [
      t(`싱가포르의 국토 면적은 ${val(ds, 'SGP', 'area')?.text}입니다. 서울보다 조금 큰 섬나라에 ${val(ds, 'SGP', 'population')?.text}이 살아, 인구밀도가 ${rankText(ds, 'SGP', 'density')}입니다.`),
      t('싱가포르는 말레이반도 남쪽 끝, 인도양과 태평양을 잇는 말라카 해협의 길목에 있습니다. 중동의 석유와 아시아의 공산품을 실은 배가 반드시 지나가는 자리입니다.'),
      t(`1965년 말레이시아에서 떨어져 나와 독립한 뒤, 싱가포르는 항구와 공항을 키우고 금융·물류 기업을 불러들였습니다. 지금 1인당 GDP는 ${val(ds, 'SGP', 'gdp_pc')?.text}로 ${rankText(ds, 'SGP', 'gdp_pc')}입니다. 땅이 작다는 약점을 좋은 자리를 살린 무역으로 이겨 낸 셈입니다.`),
    ],
  },
];

export const storiesFor = (cid: string) => STORIES.filter((s) => s.country === cid);
export const STORY_COUNTRIES = [...new Set(STORIES.map((s) => s.country))];

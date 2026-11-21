/**
 * 경제 도감 편집 콘텐츠.
 * - 통계(World Bank·UN Comtrade·FAOSTAT·Köppen·Natural Earth)로 확인할 수 없는 사실만 여기에 둔다.
 * - 모든 항목은 실제로 읽은 공식 페이지의 발행처·주소·기준 시점을 함께 저장한다 (테스트가 출처 누락을 막는다).
 * - 'C. 역사·문화적으로 알려진 특산물'도 출처가 확인된 것만 싣는다. 생산량(A)·수출액(B)과 한 순위로 섞지 않는다.
 * - 2026-11-21 에 읽은 페이지 기준. 출처를 확보하지 못한 나라는 비워 두고 통계만 보여 준다.
 */
export interface SourcedFact {
  text: string;
  source: string;
  url: string;
  period: string; // 수치의 기준 시점 (없으면 '발행일 기준' 등)
}

export interface EconomyProfile {
  country: string;
  /** 도감 '이 나라는 뭘로 먹고살까?' 맨 위에 두는 질문 */
  question: string;
  facts: SourcedFact[];
  specialties: SourcedFact[];
}

export const ECONOMY_PROFILES: EconomyProfile[] = [
  {
    country: 'AUT',
    question: '오스트리아는 어떻게 높은 소득 수준을 유지할까?',
    facts: [
      { text: '관광 위성계정으로 계산한 관광의 직접 GDP 기여도는 4.4%, 관광이 직접 만든 일자리는 전체 고용의 4.3%입니다. 같은 해 방문객 지출은 392억 유로였습니다.',
        source: 'Statistik Austria (WIFO와 함께 작성한 관광 위성계정)', url: 'https://www.statistik.at/statistiken/tourismus-und-verkehr/tourismus/tourismus-satellitenkonto/nationale-tourismus-satellitenkonten', period: '2024년' },
      { text: '숙박 시설에 묵은 밤은 모두 1억 5,729만 박, 도착 손님은 4,817만 명이었습니다. 손님 한 명이 평균 3.3박을 머물렀습니다.',
        source: 'Statistik Austria', url: 'https://www.statistik.at/statistiken/tourismus-und-verkehr/tourismus/beherbergung/ankuenfte-naechtigungen', period: '2025년' },
    ],
    specialties: [],
  },
  {
    country: 'NLD',
    question: '좁은 나라 네덜란드는 무엇으로 세계와 거래할까?',
    facts: [
      { text: '농산물 수출액은 1,375억 유로로 1년 전보다 8.4% 늘었습니다. 이 가운데 884억 유로는 네덜란드에서 생산한 상품, 491억 유로는 들여와 다시 내보낸 재수출입니다 (11·12월은 추정치).',
        source: '네덜란드 통계청(CBS)·바헤닝언 경제연구소(WUR)', url: 'https://www.cbs.nl/en-gb/news/2026/03/value-of-agricultural-exports-up-by-over-8-percent-in-2025', period: '2025년' },
      { text: '농산물 수출에서 가장 큰 품목군은 유제품·달걀(133억 유로)이고, 코코아 제품(124억 유로)이 그다음입니다.',
        source: '네덜란드 통계청(CBS)·바헤닝언 경제연구소(WUR)', url: 'https://www.cbs.nl/en-gb/news/2026/03/value-of-agricultural-exports-up-by-over-8-percent-in-2025', period: '2025년' },
      { text: '로테르담 항만공사는 로테르담 항을 유럽에서 가장 큰 항구라고 소개합니다. 2026년 1~9월 물동량은 3억 2,320만 t으로 전년 같은 기간보다 0.9% 늘었습니다.',
        source: '로테르담 항만공사(Port of Rotterdam Authority)', url: 'https://www.portofrotterdam.com/en/experience-online/facts-and-figures', period: '2026년 1~9월' },
      { text: '네덜란드 정부는 이 나라를 홍수가 나기 쉬운 낮은 삼각주로 설명하며, 대비하지 않으면 국토의 최대 60%가 물에 잠길 수 있다고 밝힙니다.',
        source: '네덜란드 정부(government.nl), 델타 프로그램', url: 'https://www.government.nl/themes/nature-and-the-environment/water-management/delta-programme-flood-safety-freshwater-and-spatial-adaptation', period: '발행일 기준(연도 표기 없음)' },
    ],
    specialties: [],
  },
  {
    country: 'NOR',
    question: '노르웨이는 석유와 바다로 어떻게 먹고살까?',
    facts: [
      { text: '원유·천연가스·콘덴세이트 수출액은 1조 크로네로, 노르웨이 전체 상품 수출액의 57%였습니다 (GDP 대비 비율이 아니라 상품 수출 대비 비율).',
        source: '노르웨이 해양석유국·에너지부 (norskpetroleum.no)', url: 'https://www.norskpetroleum.no/en/', period: '2025년' },
      { text: '석유·가스 생산량은 석유 환산 약 2억 3,920만 Sm³였고, 그 절반 넘게가 천연가스였습니다. 가스관은 약 8,800km에 이릅니다.',
        source: '노르웨이 해양석유국·에너지부 (norskpetroleum.no)', url: 'https://www.norskpetroleum.no/en/', period: '2025년' },
      { text: '석유 부문에서 일하는 사람은 약 21만 명이었습니다.',
        source: '노르웨이 해양석유국·에너지부 (norskpetroleum.no)', url: 'https://www.norskpetroleum.no/en/', period: '2023년' },
      { text: '1~10월 수산물 수출액은 1,513억 크로네로 전년 같은 기간보다 1% 늘었습니다. 10월 수출액의 76%는 양식 어류였습니다.',
        source: '노르웨이 수산물위원회(Norwegian Seafood Council)', url: 'https://en.seafood.no/news-and-media/news-archive/norwegian-seafood-exports-remained-stable-in-october/', period: '2026년 1~10월' },
    ],
    specialties: [
      { text: '말린 대구(스톡피시)와 소금에 절여 말린 대구(클립피시). 소금 절인 대구는 대부분 포르투갈로 수출되며, 포르투갈에서는 바칼랴우로 성탄 음식의 중심이 됩니다.',
        source: '노르웨이 수산물위원회(Norwegian Seafood Council)', url: 'https://en.seafood.no/news-and-media/news-archive/norwegian-seafood-exports-remained-stable-in-october/', period: '2026년 10월 발표' },
    ],
  },
  {
    country: 'SGP',
    question: '땅이 좁은 싱가포르는 무엇으로 먹고살까?',
    facts: [
      { text: '싱가포르 항은 컨테이너 3,730만 TEU를 처리했습니다.', source: '싱가포르 해사항만청(MPA)', url: 'https://www.mpa.gov.sg/maritime-singapore/what-maritime-singapore-offers/global-hub-port', period: '2022년' },
      { text: '해사항만청은 싱가포르가 1986년부터 선박 톤수 기준 세계에서 가장 바쁜 항구였고, 약 200개 해운사가 600곳이 넘는 항구와 연결된다고 밝힙니다.',
        source: '싱가포르 해사항만청(MPA)', url: 'https://www.mpa.gov.sg/maritime-singapore/what-maritime-singapore-offers/global-hub-port', period: '발행일 기준(연도 표기 없음)' },
    ],
    specialties: [],
  },
  // 대한민국·사우디아라비아·몽골·브라질: 공식 페이지를 자동으로 읽지 못해(접속 차단·스크립트 화면) 편집 사실은 비워 둔다.
  // 이 나라들의 경제 도감은 World Bank·UN Comtrade·FAOSTAT 통계와 기존 나라 이야기로 구성한다.
  { country: 'KOR', question: '대한민국은 무엇을 만들어 세계에 팔까?', facts: [], specialties: [] },
  { country: 'SAU', question: '사우디아라비아의 경제는 석유에 얼마나 기대고 있을까?', facts: [], specialties: [] },
  { country: 'MNG', question: '몽골은 초원과 땅속 자원으로 어떻게 먹고살까?', facts: [], specialties: [] },
  { country: 'BRA', question: '브라질은 넓은 땅에서 무엇을 길러 세계에 팔까?', facts: [], specialties: [] },
];

export const profileFor = (cid: string) => ECONOMY_PROFILES.find((p) => p.country === cid);

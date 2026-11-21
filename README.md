# 사회과부도

세계를 펼치다. 숫자로 발견하다.

세계지도를 돌아다니며 나라를 발견하고, 나라 도감과 세계 랭킹으로 비교하고, 게임으로 확인하는 정적 웹서비스 (MVP 0.1).

## 실행

```powershell
npm install
npm run dev        # http://localhost:5173
npm test           # 자동 테스트 25개
npm run build      # dist/ (GitHub Pages 하위 경로에서도 동작하는 상대 경로 빌드)
```

통계 다시 받기 (Python 3.12, 수집 → 검증 → 통과 시에만 public/data 교체):

```powershell
python -I pipeline/fetch.py
python -I pipeline/build.py
```

## 화면

| 주소 | 화면 |
|---|---|
| `#/` · `#/map/KOR` | 세계지도 (기본·인구밀도·1인당 GDP), 검색, 대륙 이동, 오른쪽 도감 패널 |
| `#/atlas` | 나라 도감 찾아보기 (대륙별·가나다순 195개국) |
| `#/country/KOR` | 펼친 도감 (위치·기본 정보·숫자·순위·이야기·비교·확인 문제) |
| `#/rankings/population` | 세계 랭킹 12개 지표 (목록 + 지도) |
| `#/play`, `#/play/map`, `#/play/battle` | 도전하기: 세계지도 챌린지, 세계 랭킹 배틀, 탐구 노트 목록 |
| `#/lesson/{id}` | 탐구 노트 12개 |
| `#/journal` | 나의 탐험일지 (LocalStorage) |

## 구조

```
pipeline/            Python 수집(fetch.py)·검증·정규화(build.py), 지표 정의(indicators.py)
data/raw/            원자료 (mledoze, Natural Earth, World Bank, Wikidata)
data/validation_report.json
public/data/         프런트엔드용 정적 자료 (countries, indicators, observations, world.topo)
src/data/            공통 데이터 엔진(engine.ts: 값·순위), 형식, 검색, 단계 구분 색
src/map/             d3-geo·d3-zoom SVG 세계지도 (geo.ts, WorldMap.tsx)
src/pages/           세계지도·도감·찾아보기·랭킹·도전하기·탐구 노트·탐험일지
src/games/           문제 생성(questions.ts), 세계지도 챌린지, 랭킹 배틀
src/content/         나라 이야기(stories.ts), 탐구 노트(lessons.ts), 오늘의 발견
src/store/journal.ts 탐험일지 (방문/학습 완료 분리)
.github/workflows/   deploy.yml (테스트→빌드→Pages), data.yml (월 1회 자료 갱신 PR)
```

기술: React 18 · TypeScript · Vite 5 · d3-geo/zoom · topojson · flag-icons · Vitest · Python 3.12 · mapshaper.

자료 출처와 순위 원칙은 [DATA_SOURCES.md](DATA_SOURCES.md).

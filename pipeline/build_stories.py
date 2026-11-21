"""나라 이야기 원고(pipeline/stories_src/*.txt) → public/data/stories/{region}.json

원고 형식 (이야기 사이는 빈 줄):
  @ 이야기ID ISO3 분야(geo|economy|history|culture|resources|curious)
  ? 질문형 제목?
  s: Factbook 항목들 (background terrain climate resources hazards pop_dist rivers econ agri industries languages religions ethnic independence capital_note geo_note)
  + 출처 이름 | https://...        (Factbook 밖의 출처, 여러 줄 가능)
  i: 관련 지표 id들
  r: 함께 볼 나라 ISO3들
  n: ISO3 | 다음 탐험 이유
  - 장면 문장 (3~4줄)

출처 표기는 원고에 쓴 Factbook 항목에서 만든다: 'CIA World Factbook — 나라(영문): 항목' + 그 나라 Factbook JSON 파일 주소.
사용: python -I pipeline/build_stories.py
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'pipeline' / 'stories_src'
OUT = ROOT / 'public' / 'data' / 'stories'
ACCESSED = '2026-11-21'
SECTION = {
    'background': 'Introduction – Background', 'geo_note': 'Geography – note', 'terrain': 'Geography – Terrain', 'climate': 'Geography – Climate',
    'resources': 'Geography – Natural resources', 'hazards': 'Geography – Natural hazards', 'pop_dist': 'People – Population distribution',
    'rivers': 'Geography – Major rivers', 'econ': 'Economy – Economic overview', 'agri': 'Economy – Agricultural products',
    'industries': 'Economy – Industries', 'languages': 'People – Languages', 'religions': 'People – Religions', 'ethnic': 'People – Ethnic groups',
    'independence': 'Government – Independence', 'capital_note': 'Government – Capital',
}
CATS = {'geo', 'economy', 'history', 'culture', 'resources', 'curious'}


def region_of(c):
    k = c['continent']
    return 'americas' if k in ('north_america', 'south_america') else k


def main():
    countries = {c['id']: c for c in json.loads((ROOT / 'public/data/countries.json').read_text(encoding='utf-8'))}
    bundles = json.loads((ROOT / 'data/raw/factbook/bundles.json').read_text(encoding='utf-8'))
    out = {r: [] for r in ('asia', 'europe', 'africa', 'americas', 'oceania')}
    errors = []
    for f in sorted(SRC.glob('*.txt')):
        for block in f.read_text(encoding='utf-8').replace('\r', '').split('\n\n'):
            lines = [l.rstrip() for l in block.strip().split('\n') if l.strip() and not l.startswith('#')]
            if not lines:
                continue
            head = lines[0].split()
            if head[0] != '@' or len(head) != 4:
                errors.append(f'{f.name}: 머리줄 오류 {lines[0]}'); continue
            _, sid, iso, cat = head
            d = {'id': sid, 'country': iso, 'title': '', 'category': cat, 'panels': [], 'indicators': [], 'related': [], 'sources': [], 'reviewed': ACCESSED}
            secs = []
            for l in lines[1:]:
                if l.startswith('? '): d['title'] = l[2:].strip()
                elif l.startswith('- '): d['panels'].append(l[2:].strip())
                elif l.startswith('s:'): secs = l[2:].split()
                elif l.startswith('i:'): d['indicators'] = l[2:].split()
                elif l.startswith('r:'): d['related'] = l[2:].split()
                elif l.startswith('n:'):
                    a, b = l[2:].split('|', 1); d['next'] = {'country': a.strip(), 'why': b.strip()}
                elif l.startswith('+ '):
                    a, b = l[2:].split('|', 1); d['sources'].append({'label': a.strip(), 'url': b.strip(), 'accessed': ACCESSED})
                elif d['panels']: d['panels'][-1] += ' ' + l.strip()   # 장면 이어 쓰기
                else: errors.append(f'{sid}: 알 수 없는 줄 {l[:40]}')
            if iso not in countries: errors.append(f'{sid}: 국가 코드 {iso}'); continue
            if cat not in CATS: errors.append(f'{sid}: 분야 {cat}')
            bad = [s for s in secs if s not in SECTION]
            if bad: errors.append(f'{sid}: Factbook 항목 {bad}')
            if secs:
                names = ', '.join(SECTION[s] for s in secs if s in SECTION)
                for fp in bundles[iso]['files']:
                    d['sources'].insert(0, {'label': f"CIA World Factbook — {countries[iso]['name_en']}: {names}",
                                            'url': f'https://github.com/factbook/factbook.json/blob/master/{fp}', 'accessed': ACCESSED})
            for k in ('indicators', 'related'):
                if not d[k]: del d[k]
            out[region_of(countries[iso])].append(d)
    if errors:
        raise SystemExit('\n'.join(errors))
    OUT.mkdir(parents=True, exist_ok=True)
    for r, docs in out.items():
        docs.sort(key=lambda d: (d['country'], d['id']))
        (OUT / f'{r}.json').write_text(json.dumps(docs, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print({r: len(v) for r, v in out.items()}, '합계', sum(len(v) for v in out.values()))


if __name__ == '__main__':
    main()

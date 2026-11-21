"""스포츠 자료: FIFA 세계 랭킹(남·여), 올림픽 메달(역대·최근 대회), 국기(國技)·국민 스포츠.

출처
- FIFA/Coca-Cola World Ranking: FIFA 공식 랭킹 API (inside.fifa.com 랭킹 화면이 쓰는 api.fifa.com 주소)
- 올림픽 메달: 영어 위키백과 'All-time Olympic Games medal table', '2024 Summer Olympics medal table', '2026 Winter Olympics medal table' (IOC 공식 결과를 정리한 표, CC BY-SA). 판 번호(revid)를 함께 기록한다.
- 국기·국민 스포츠: 영어 위키백과 'National sport' (법으로 정한 공식 국기 / 출처가 달린 비공식 국민 스포츠)

결과
- public/data/sports.json            나라별 상세 (도감 '스포츠' 섹션)
- public/data/sports_indicators.json  세계 랭킹에 쓰는 지표 4개(FIFA 남·여 포인트, 올림픽 역대 메달·금메달)
사용: python -I pipeline/sports.py
"""
import json
import re
import time
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / 'data' / 'raw' / 'sports'
OUT = ROOT / 'public' / 'data'
UA = {'User-Agent': 'sahoegwabudo-data/1.0 (educational atlas)'}
TODAY = date.today().isoformat()

# 코드가 ISO3와 다른 경우 (FIFA·IOC 공통으로 쓰는 것이 대부분)
CODE_FIX = {
    'ALG': 'DZA', 'ANG': 'AGO', 'ANT': 'ATG', 'BAH': 'BHS', 'BAN': 'BGD', 'BAR': 'BRB', 'BHU': 'BTN', 'BIZ': 'BLZ', 'BOT': 'BWA',
    'BRU': 'BRN', 'BUL': 'BGR', 'BUR': 'BFA', 'CAM': 'KHM', 'CGO': 'COG', 'CHA': 'TCD', 'CHI': 'CHL', 'CRC': 'CRI', 'CRO': 'HRV',
    'CTA': 'CAF', 'DEN': 'DNK', 'ESA': 'SLV', 'FIJ': 'FJI', 'GAM': 'GMB', 'GEQ': 'GNQ', 'GER': 'DEU', 'GRE': 'GRC', 'GRN': 'GRD',
    'GUA': 'GTM', 'GUI': 'GIN', 'HAI': 'HTI', 'HON': 'HND', 'INA': 'IDN', 'IRI': 'IRN', 'KSA': 'SAU', 'KUW': 'KWT', 'LAT': 'LVA',
    'LES': 'LSO', 'LBA': 'LBY', 'MAD': 'MDG', 'MAS': 'MYS', 'MAW': 'MWI', 'MGL': 'MNG', 'MRI': 'MUS', 'MTN': 'MRT', 'MYA': 'MMR',
    'NED': 'NLD', 'NEP': 'NPL', 'NGR': 'NGA', 'NIG': 'NER', 'OMA': 'OMN', 'PAR': 'PRY', 'PHI': 'PHL', 'PLE': 'PSE', 'POR': 'PRT',
    'PUR': 'PUR', 'RSA': 'ZAF', 'SAM': 'WSM', 'SEY': 'SYC', 'SIN': 'SGP', 'SKN': 'KNA', 'SLO': 'SVN', 'SOL': 'SLB', 'SRI': 'LKA',
    'SUD': 'SDN', 'SUI': 'CHE', 'TAN': 'TZA', 'TGA': 'TON', 'TOG': 'TGO', 'TPE': 'TPE', 'TRI': 'TTO', 'UAE': 'ARE', 'URU': 'URY',
    'VAN': 'VUT', 'VIE': 'VNM', 'VIN': 'VCT', 'ZAM': 'ZMB', 'ZIM': 'ZWE', 'LCA': 'LCA', 'MON': 'MCO', 'ASA': 'ASA', 'CPV': 'CPV',
    'COM': 'COM', 'DMA': 'DMA', 'FSM': 'FSM', 'KOS': 'KOS', 'MHL': 'MHL', 'PLW': 'PLW', 'SMR': 'SMR', 'SSD': 'SSD', 'TLS': 'TLS',
    'CAY': 'CYM', 'IVB': 'VGB', 'ISV': 'VIR', 'ARU': 'ABW', 'BER': 'BMU', 'GUM': 'GUM', 'COK': 'COK', 'HKG': 'HKG',
}
UK_TEAMS = {'ENG': '잉글랜드', 'SCO': '스코틀랜드', 'WAL': '웨일스', 'NIR': '북아일랜드'}
NON_UN = {'TPE', 'HKG', 'KOS', 'PUR', 'ISV', 'BER', 'IVB', 'CAY', 'ARU', 'GUM', 'ASA', 'COK', 'AHO'}  # 195개국 목록 밖
HISTORIC_NOC = {'URS', 'GDR', 'FRG', 'EUN', 'TCH', 'YUG', 'SCG', 'BOH', 'ANZ', 'RU1', 'UAR', 'EUA', 'IOA', 'ROC', 'OAR', 'AIN', 'EOR', 'ZZX', 'WIF', 'NBO', 'RT', 'IOP', 'MIX', 'BWI', 'RHO', 'NRH', 'SAA', 'CRT'}


SPORT_KO = {
    'alpine skiing': '알파인 스키', 'american football': '미식축구', 'archery': '활쏘기', 'arnis': '아르니스(필리핀 전통 무술)', 'association football': '축구',
    'australian rules football': '오스트레일리안 풋볼', 'badminton': '배드민턴', 'baseball': '야구', 'basketball': '농구', 'basque pelota': '바스크 펠로타',
    'bocce': '보체', 'bokator': '보카토르(캄보디아 전통 무술)', 'buzkashi': '부즈카시(말 타고 염소 몰기)', 'camel racing': '낙타 경주', 'capoeira': '카포에이라',
    'charrería': '차레리아(멕시코 전통 기마술)', 'chilean rodeo': '칠레 로데오', 'chinlone': '친롱(미얀마 등나무 공차기)', 'cirit/jereed': '지릿(말 타고 창 던지기)',
    'cricket': '크리켓', 'cross-country skiing': '크로스컨트리 스키', 'dandibiyo': '단디비요(막대 치기 놀이)', 'destrezas criollas': '데스트레사스 크리오야스(가우초 기마 기술)',
    'field hockey': '필드하키', 'freestyle wrestling': '자유형 레슬링', 'gaelic football': '게일식 풋볼', 'gaelic games': '게일 경기', 'gaelic handball': '게일식 핸드볼',
    'glíma': '글리마(아이슬란드 전통 씨름)', 'gushtigiri': '구슈티기리(타지키스탄 씨름)', 'ice hockey': '아이스하키', 'kabaddi': '카바디', 'lacrosse': '라크로스',
    'mongolian wrestling': '몽골 씨름(부흐)', 'motorcycle speedway': '모터사이클 스피드웨이', 'muay thai': '무에타이', 'oină': '오이너(루마니아 전통 구기)',
    'paleta frontón': '팔레타 프론톤', 'pato': '파토(말 타고 공 넣기)', 'pesäpallo': '페사팔로(핀란드식 야구)', 'rallying': '랠리', 'roller hockey': '롤러하키',
    'rugby league': '럭비 리그', 'rugby union': '럭비 유니언', 'sepak takraw': '세팍타크로', 'sumo': '스모', 'table tennis': '탁구', 'taekwondo': '태권도',
    'tejo': '테호(원반 던지기)', 'valencian pilota': '발렌시아 펠로타', 'volleyball': '배구', 'water polo': '수구', 'camogie': '카모기(여자 헐링)', 'falconry': '매사냥',
    'handball': '핸드볼', 'horse racing': '경마', 'hurling': '헐링', "ladies' gaelic football": '여자 게일식 풋볼', 'oil wrestling': '오일 레슬링', 'pencak silat': '펜착 실랏',
    'rounders': '라운더스', 'sipa': '시파(발로 공 차올리기)', 'golf': '골프', 'shinty': '신티',
}
REGION_KO = {'England': '잉글랜드', 'Scotland': '스코틀랜드', 'Wales': '웨일스', 'Northern Ireland': '북아일랜드', 'Basque Country': '바스크 지방', 'Catalonia': '카탈루냐', 'Valencia': '발렌시아'}


def fetch(url, cache):
    p = RAW / cache
    if p.exists() and time.time() - p.stat().st_mtime < 6 * 3600:
        return p.read_text(encoding='utf-8')
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r:
        t = r.read().decode('utf-8')
    RAW.mkdir(parents=True, exist_ok=True)
    p.write_text(t, encoding='utf-8')
    time.sleep(1)
    return t


def wiki(page):
    u = f'https://en.wikipedia.org/w/api.php?action=parse&page={page}&prop=wikitext|revid&format=json&formatversion=2'
    j = json.loads(fetch(u, f'wiki_{page}.json'))['parse']
    return j['wikitext'], j['revid']


def main():
    countries = json.loads((OUT / 'countries.json').read_text(encoding='utf-8'))
    ids = {c['id'] for c in countries}
    # IOC와 FIFA 코드가 서로 다른 경우 (예: IOC BRN = 바레인, ISO BRN = 브루나이)
    ioc = {**CODE_FIX, 'BRN': 'BHR', 'BRU': 'BRN', 'GBS': 'GNB', 'NCA': 'NIC'}
    fifa = {**CODE_FIX, 'BRU': 'BRN', 'NCA': 'NIC', 'EQG': 'GNQ'}
    to_iso = lambda code: (ioc.get(code, code) if ioc.get(code, code) in ids else None)
    fifa_iso = lambda code: (fifa.get(code, code) if fifa.get(code, code) in ids else None)
    out = {c['id']: {} for c in countries}
    problems = []

    # ── FIFA ──
    fifa_meta = {}
    for g, key, page in ((1, 'fifa_m', 'men'), (2, 'fifa_w', 'women')):
        html = fetch(f'https://inside.fifa.com/fifa-world-ranking/{page}', f'fifa_{page}.html')
        nd = json.loads(re.search(r'__NEXT_DATA__" type="application/json">(.*?)</script>', html, re.S).group(1))
        rk = nd['props']['pageProps']['pageData']['ranking']
        sched = rk['allAvailableDates'][0]
        data = json.loads(fetch(f"https://api.fifa.com/api/v3/fifarankings/rankings/rankingsbyschedule?rankingScheduleId={sched['id']}&language=en",
                                f"fifa_{sched['id']}.json"))['Results']
        n = len(data)
        fifa_meta[key] = {'date': sched['date'], 'teams': n, 'url': f'https://inside.fifa.com/fifa-world-ranking/{page}'}
        for t in data:
            code = t['IdCountry']
            row = {'rank': t['Rank'], 'points': round(t['TotalPoints'], 2), 'prev': t['PrevRank'], 'of': n, 'conf': t['ConfederationName']}
            if code in UK_TEAMS:
                out['GBR'].setdefault(key + '_uk', []).append({**row, 'team': UK_TEAMS[code]})
                continue
            iso = fifa_iso(code)
            if iso: out[iso][key] = row
        miss = sorted(i for i in ids if key not in out[i] and i != 'GBR')
        fifa_meta[key]['not_ranked'] = miss

    # ── 올림픽 역대 ──
    w, rev_all = wiki('All-time_Olympic_Games_medal_table')
    nums = lambda s: [int(x) for x in re.findall(r"(?:^|\|)\s*(?:style=\"[^\"]*\"\|)?\s*'*(\d+)'*\s*(?=\|\||$)", s)]
    seen_noc = set()
    span = r'<span id= ?"([A-Z0-9]{3})">(?:(?!</span>).)*</span>[^\n]*\n'
    for m in re.finditer(span + r'([^\n]*)\n([^\n]*)\n([^\n]*)', w, re.S):
        code, a, b, c = m.groups()
        sa, sb, sc = nums(a), nums(b), nums(c)
        if len(sa) != 5 or len(sb) != 5 or len(sc) != 5: continue   # 메달 표가 아닌 다른 표(출전 횟수 표 등)
        seen_noc.add(code)
        iso = to_iso(code)
        if not iso:
            if code not in HISTORIC_NOC and code not in NON_UN: problems.append(f'IOC 코드 미대응 {code}')
            continue
        f = lambda v: {'games': v[0], 'g': v[1], 's': v[2], 'b': v[3], 't': v[4]}
        out[iso]['ol'] = {'summer': f(sa), 'winter': f(sb), 'total': f(sc)}
        if sa[1] + sb[1] != sc[1] or sa[4] + sb[4] != sc[4]: problems.append(f'올림픽 합계 불일치 {code}')
    # 메달이 없는 참가국 (첫 표: 'have yet to win')
    no_medal = set()
    tbl0 = w[w.find('!No. Summer'): w.find('|}', w.find('!No. Summer'))]
    for m in re.finditer(span + r'\|[^\n]*?(\d+)\s*\|\|[^\n]*?(\d+)\s*\|\|\s*(\d+)', tbl0, re.S):
        code = m.group(1); iso = to_iso(code)
        if iso and 'ol' not in out[iso]:
            no_medal.add(iso)
            out[iso]['ol'] = {'summer': {'games': int(m.group(2)), 'g': 0, 's': 0, 'b': 0, 't': 0}, 'winter': {'games': int(m.group(3)), 'g': 0, 's': 0, 'b': 0, 't': 0},
                              'total': {'games': int(m.group(4)), 'g': 0, 's': 0, 'b': 0, 't': 0}}

    # ── 최근 대회 ──
    recent = {}
    for key, page, label in (('ol2024', '2024_Summer_Olympics_medal_table', '2024 파리 하계올림픽'), ('ol2026', '2026_Winter_Olympics_medal_table', '2026 밀라노·코르티나담페초 동계올림픽')):
        w2, rev = wiki(page)
        rows = []
        for m in re.finditer(r'gold_([A-Z0-9]{3})\s*=\s*(\d+)\s*\|\s*silver_\1\s*=\s*(\d+)\s*\|\s*bronze_\1\s*=\s*(\d+)', w2):
            code, g, s, b = m.group(1), int(m.group(2)), int(m.group(3)), int(m.group(4))
            rows.append((code, g, s, b))
        # IOC 공식 순위 방식: 금 → 은 → 동
        rows.sort(key=lambda r: (-r[1], -r[2], -r[3]))
        prev, rank = None, 0
        for i, (code, g, s, b) in enumerate(rows):
            if (g, s, b) != prev: rank = i + 1; prev = (g, s, b)
            iso = to_iso(code)
            if iso: out[iso][key] = {'g': g, 's': s, 'b': b, 't': g + s + b, 'rank': rank}
            elif code not in HISTORIC_NOC and code not in NON_UN: problems.append(f'{key} 코드 미대응 {code}')
        recent[key] = {'label': label, 'revid': rev, 'url': f'https://en.wikipedia.org/w/index.php?title={page}&oldid={rev}', 'nocs': len(rows)}

    # ── 국기·국민 스포츠 ──
    w3, rev_ns = wiki('National_sport')
    name_to_iso = {}
    for c in countries:
        for n in [c['name_en'], c['official_en'], *c.get('aliases', [])]:
            name_to_iso[n.lower()] = c['id']
    name_to_iso.update({'united states': 'USA', 'czech republic': 'CZE', 'ivory coast': 'CIV', 'east timor': 'TLS', 'the bahamas': 'BHS', 'bahamas': 'BHS',
                        'the gambia': 'GMB', 'republic of ireland': 'IRL', 'ireland': 'IRL', 'myanmar': 'MMR', 'burma': 'MMR', 'eswatini': 'SWZ', 'swaziland': 'SWZ',
                        'cape verde': 'CPV', 'north korea': 'PRK', 'south korea': 'KOR', 'russia': 'RUS', 'vatican city': 'VAT', 'turkey': 'TUR', 'türkiye': 'TUR',
                        'federated states of micronesia': 'FSM', 'micronesia': 'FSM', 'democratic republic of the congo': 'COD', 'republic of the congo': 'COG',
                        'são tomé and príncipe': 'STP', 'sao tome and principe': 'STP', 'laos': 'LAO', 'brunei': 'BRN', 'syria': 'SYR', 'iran': 'IRN', 'vietnam': 'VNM',
                        'moldova': 'MDA', 'tanzania': 'TZA', 'bolivia': 'BOL', 'venezuela': 'VEN', 'palestine': 'PSE', 'state of palestine': 'PSE', 'north macedonia': 'MKD'})
    sec = {'official': w3[w3.find('== Official national sports =='): w3.find('== Unofficial national sports ==')],
           'unofficial': w3[w3.find('== Unofficial national sports =='): w3.find('== See also ==')]}
    unmatched = []

    def clean(cell):
        cell = re.sub(r'<ref[^>]*/>', '', cell)
        cell = re.sub(r'<ref[^>]*>.*?</ref>', '', cell, flags=re.S)
        cell = re.sub(r'\{\{[^{}]*\}\}', '', cell)
        links = re.findall(r'\[\[([^\]|]+)(?:\|([^\]]+))?\]\]', cell)
        return [(b or a).strip() for a, b in links], re.sub(r'\[\[(?:[^\]|]+\|)?([^\]]+)\]\]', r'\1', cell).strip(' |')

    for kind, txt in sec.items():
        cur_country = None
        for row in txt.split('\n|-')[1:]:
            lines = [l for l in row.strip().split('\n') if l.strip()]
            if not lines or lines[0].startswith('|}'): continue
            head = lines[0]
            if not head.startswith('!'): continue
            hl, _ = clean(head.split('|', 1)[1] if '|' in head else head)
            if not hl: continue
            rs = re.search(r'rowspan\s*=\s*"?(\d+)', head)
            parent = bool(rs and int(rs.group(1)) > 1)      # 지역별 행이 이어지는 나라 (영국·스페인)
            is_main = parent or 'colspan="2"' in head or kind == 'official'
            name = hl[0]
            iso = name_to_iso.get(name.lower())
            region = None
            body = lines[1:]
            if not is_main:
                region, iso = name, cur_country             # 앞 나라의 지역 행 (잉글랜드·카탈루냐 등)
            elif iso is None:
                unmatched.append(f'{kind}: {name}'); cur_country = None; continue
            else:
                cur_country = iso
            if parent:
                if body and body[0].startswith('!') and 'Entire' in body[0]: body = body[1:]   # 나라 전체 행
                else: continue
            if iso is None: continue
            cells = []
            rest = '\n'.join(body)
            if '||' in head.split(']]')[-1]:
                rest = head.split(']]', 1)[1] + '\n' + rest
            for part in re.split(r'\n\||\|\|', '\n' + rest):
                if part.strip(): cells.append(part)
            if not cells: continue
            sports, _ = clean(cells[0])
            if not sports: continue
            year = None; law = None
            if kind == 'official' and len(cells) > 1:
                _, ytxt = clean(cells[1]); ym = re.search(r'\d{4}', ytxt); year = int(ym.group()) if ym else None
                if len(cells) > 2:
                    _, law = clean(cells[2]); law = law or None
            ent = out[iso].setdefault('national', [])
            for sp in sports:
                if any(e['sport_en'].lower() == sp.lower() and e.get('region') == region for e in ent): continue
                ko = SPORT_KO.get(sp.lower())
                if not ko: problems.append(f'종목 한국어 이름 없음: {sp}')
                if region and region not in REGION_KO: problems.append(f'지역 한국어 이름 없음: {region}')
                ent.append({'sport_en': sp[0].upper() + sp[1:], 'sport_ko': ko or sp, 'official': kind == 'official', **({'year': year} if year else {}), **({'law': law} if law else {}),
                            **({'region': region, 'region_ko': REGION_KO.get(region, region)} if region else {})})

    # ── 저장 ──
    countries_out = {k: v for k, v in out.items() if v}
    meta = {'retrieved_at': TODAY, 'fifa': fifa_meta,
            'olympics': {'revid': rev_all, 'url': f'https://en.wikipedia.org/w/index.php?title=All-time_Olympic_Games_medal_table&oldid={rev_all}',
                         'no_medal_participants': len(no_medal), 'recent': recent,
                         'not_listed': sorted(i for i in ids if 'ol' not in out[i])},
            'national': {'revid': rev_ns, 'url': f'https://en.wikipedia.org/w/index.php?title=National_sport&oldid={rev_ns}', 'unmatched': unmatched}}
    (OUT / 'sports.json').write_text(json.dumps({'meta': meta, 'countries': countries_out}, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')

    # 세계 랭킹 지표
    year = int(TODAY[:4])
    def ind(iid, name_ko, name_en, unit, unit_en, sort, digits, source, url, definition):
        obs = {}
        for k, v in out.items():
            val = {'fifa_men': lambda: v.get('fifa_m', {}).get('points'), 'fifa_women': lambda: v.get('fifa_w', {}).get('points'),
                   'olympic_medals': lambda: v.get('ol', {}).get('total', {}).get('t'), 'olympic_gold': lambda: v.get('ol', {}).get('total', {}).get('g')}[iid]()
            if val is not None: obs[k] = [[year, val]]
        n = len(obs)
        return ({'indicator_id': iid, 'source_code': iid, 'name_ko': name_ko, 'name_en': name_en, 'unit': unit, 'unit_en': unit_en, 'sort': sort, 'digits': digits,
                 'category': '스포츠', 'definition_en': definition, 'source': source, 'source_org': source, 'source_url': url, 'update_frequency': '자료 갱신 시',
                 'retrieved_at': TODAY, 'ref_year': year, 'ref_count': n, 'latest_year': year, 'coverage_by_year': {str(year): n},
                 'missing_all_years': sorted(i for i in ids if i not in obs), 'rank': True, 'group': 'sports'}, obs)
    inds = [
        ind('fifa_men', 'FIFA 남자 랭킹 포인트', 'FIFA/Coca-Cola Men\'s World Ranking points', '점', 'points', 'desc', 2, f"FIFA/Coca-Cola Men's World Ranking ({fifa_meta['fifa_m']['date']})",
            fifa_meta['fifa_m']['url'], 'Ranking points of the senior men\'s national team. The United Kingdom has four separate teams (England, Scotland, Wales, Northern Ireland) and is not ranked as one country.'),
        ind('fifa_women', 'FIFA 여자 랭킹 포인트', 'FIFA Women\'s World Ranking points', '점', 'points', 'desc', 2, f"FIFA Women's World Ranking ({fifa_meta['fifa_w']['date']})",
            fifa_meta['fifa_w']['url'], 'Ranking points of the senior women\'s national team. The United Kingdom has four separate teams.'),
        ind('olympic_medals', '올림픽 역대 메달', 'All-time Olympic medals (Summer + Winter)', '개', 'medals', 'desc', 0, 'Wikipedia, All-time Olympic Games medal table (IOC results)',
            meta['olympics']['url'], 'Total Summer and Winter Olympic medals won by the current National Olympic Committee. Medals of historic teams (Soviet Union, East/West Germany, etc.) are not added to successor states.'),
        ind('olympic_gold', '올림픽 역대 금메달', 'All-time Olympic gold medals', '개', 'gold medals', 'desc', 0, 'Wikipedia, All-time Olympic Games medal table (IOC results)',
            meta['olympics']['url'], 'Total Summer and Winter Olympic gold medals won by the current National Olympic Committee.'),
    ]
    (OUT / 'sports_indicators.json').write_text(json.dumps({'indicators': [i for i, _ in inds], 'observations': {i['indicator_id']: o for i, o in inds}}, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')

    print('FIFA 남', fifa_meta['fifa_m']['date'], len([1 for v in out.values() if 'fifa_m' in v]), '미순위', fifa_meta['fifa_m']['not_ranked'])
    print('FIFA 여', fifa_meta['fifa_w']['date'], len([1 for v in out.values() if 'fifa_w' in v]), '미순위', fifa_meta['fifa_w']['not_ranked'])
    print('올림픽 역대', len([1 for v in out.values() if 'ol' in v]), '메달 0개 참가국', len(no_medal), '목록에 없음', meta['olympics']['not_listed'])
    print('2024', len([1 for v in out.values() if 'ol2024' in v]), '2026', len([1 for v in out.values() if 'ol2026' in v]))
    print('국민 스포츠', len([1 for v in out.values() if 'national' in v]), '미대응', unmatched)
    print('문제', problems)
    print('KOR', json.dumps(out['KOR'], ensure_ascii=False))
    print('GBR', json.dumps(out['GBR'], ensure_ascii=False)[:600])


if __name__ == '__main__':
    main()

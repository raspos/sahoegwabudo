"""정규화·검증·저장 단계.

data/raw/ 원자료 → 국가코드 매핑 → 검증 → 정규화 → public/data/ 반영.
결과는 먼저 public/data.staging/ 에 쓰고, 오류(errors)가 하나도 없을 때만 public/data/ 를 교체한다.
경고(warnings)는 data/validation_report.json 에 남기고 배포를 막지 않는다.

실행: python -I pipeline/build.py
"""
from __future__ import annotations

import json
import math
import shutil
import subprocess
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = ROOT / "public" / "data"
STAGE = ROOT / "public" / "data.staging"
sys.path.insert(0, str(ROOT / "pipeline"))
from indicators import INDICATORS  # noqa: E402

sys.stdout.reconfigure(encoding="utf-8")

FIRST_YEAR = 2000          # 프런트엔드에 싣는 첫 해 (원자료는 1990년부터 보관)
MIN_RANK_COVERAGE = 150    # 순위 기준연도: 값이 있는 나라가 150개국 이상인 가장 최근 해

errors: list[str] = []
warnings: list[str] = []

# ── 편집 기준 이름 (원자료 표기가 국내 교과서·언론 관행과 다른 경우만) ──
NAME_KO_OVERRIDE = {
    "KOR": "대한민국", "PRK": "북한", "AUS": "오스트레일리아", "COG": "콩고 공화국",
    "COD": "콩고민주공화국", "ZAF": "남아프리카공화국", "DMA": "도미니카 연방",
    "CAF": "중앙아프리카공화국", "DOM": "도미니카공화국", "VAT": "바티칸 시국",
    "GNQ": "적도기니", "FSM": "미크로네시아 연방", "BIH": "보스니아 헤르체고비나",
}
OFFICIAL_KO = {"PRK": "조선민주주의인민공화국", "VAT": "교황청(바티칸 시국)", "KOR": "대한민국"}
ALIASES = {
    "KOR": ["한국", "남한", "South Korea", "Korea", "Republic of Korea"],
    "PRK": ["조선", "North Korea", "DPRK"],
    "USA": ["미합중국", "USA", "US", "United States of America", "America"],
    "GBR": ["UK", "United Kingdom", "Britain", "잉글랜드", "브리튼"],
    "AUS": ["호주"], "VAT": ["교황청", "바티칸", "Holy See", "Vatican"],
    "NLD": ["홀랜드", "Holland"], "TUR": ["터키", "Turkey"], "CZE": ["체코 공화국", "Czech Republic"],
    "CIV": ["아이보리코스트", "Ivory Coast"], "SWZ": ["스와질란드", "Swaziland"],
    "MKD": ["마케도니아"], "MMR": ["버마", "Burma"], "TLS": ["East Timor"],
    "CPV": ["Cape Verde"], "COD": ["DR Congo", "DRC", "민주콩고"], "COG": ["콩고"],
    "ARE": ["UAE"], "CHN": ["중화인민공화국", "PRC"], "JPN": ["Nippon"], "GEO": ["그루지야"],
    "BLR": ["벨로루시"], "PSE": ["Palestine", "State of Palestine"],
}
CAPITAL_KO_MANUAL = {  # Wikidata 영어 표기와 원자료 표기가 달라 자동 연결이 안 된 경우
    "ATG": "세인트존스", "ISL": "레이캬비크", "MNG": "울란바토르", "NRU": "야렌",
    "SMR": "산마리노", "TON": "누쿠알로파", "USA": "워싱턴 D.C.", "YEM": "사나",
}
CAPITAL_NOTE = {
    "ISR": "수도의 지위를 두고 국제적으로 이견이 있습니다.",
    "PSE": "수도의 지위를 두고 국제적으로 이견이 있습니다.",
}
CAPITAL_KO_SHORT = {"서울특별시": "서울", "도쿄도": "도쿄", "베이징시": "베이징"}
SUBREGION_KO = {
    "Australia and New Zealand": "오스트레일리아·뉴질랜드", "Caribbean": "카리브해", "Central America": "중앙아메리카",
    "Central Asia": "중앙아시아", "Central Europe": "중부 유럽", "Eastern Africa": "동아프리카", "Eastern Asia": "동아시아",
    "Eastern Europe": "동유럽", "Melanesia": "멜라네시아", "Micronesia": "미크로네시아", "Middle Africa": "중앙아프리카",
    "North America": "북아메리카", "Northern Africa": "북아프리카", "Northern Europe": "북유럽", "Polynesia": "폴리네시아",
    "South America": "남아메리카", "South-Eastern Asia": "동남아시아", "Southeast Europe": "남동유럽",
    "Southern Africa": "남아프리카", "Southern Asia": "남아시아", "Southern Europe": "남유럽", "Western Africa": "서아프리카",
    "Western Asia": "서아시아", "Western Europe": "서유럽",
}
CONTINENTS = [("asia", "아시아"), ("europe", "유럽"), ("africa", "아프리카"),
              ("north_america", "북아메리카"), ("south_america", "남아메리카"), ("oceania", "오세아니아")]


def continent_of(region: str, subregion: str) -> str:
    if region == "Americas":
        return "south_america" if subregion == "South America" else "north_america"
    return {"Asia": "asia", "Europe": "europe", "Africa": "africa", "Oceania": "oceania"}[region]


def load(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


# ───────────────────────── 국가 목록 ─────────────────────────
def build_countries():
    raw = load(RAW / "countries.json")
    # 원자료(mledoze)는 바티칸을 unMember=true 로 표시하지만 바티칸은 유엔 비회원 옵서버다.
    observers = {"VAT", "PSE"}
    members = [x for x in raw if x.get("unMember") and x["cca3"] not in observers]
    obs = [x for x in raw if x["cca3"] in observers]
    if len(members) != 193:
        errors.append(f"유엔 회원국 수가 193이 아님: {len(members)}")
    if len(obs) != 2:
        errors.append(f"옵서버 국가 수가 2가 아님: {len(obs)}")

    wd = load(RAW / "wikidata_capital_lang_currency.json")["results"]["bindings"]
    wd_by = defaultdict(lambda: defaultdict(list))
    for b in wd:
        prop = b["prop"]["value"].rsplit("/", 1)[-1]
        wd_by[b["iso"]["value"]][prop].append((b.get("valLabelEn", {}).get("value"), b.get("valLabelKo", {}).get("value")))

    codes = load(RAW / "wikidata_codes_ko.json")["results"]["bindings"]
    code_ko: dict[tuple[str, str], str] = {}
    for b in codes:
        key = (b["kind"]["value"], b["code"]["value"])
        # 같은 코드에 이름이 여럿이면 가장 짧은 것을 쓴다 (예: '원' vs '대한민국 원')
        if key not in code_ko or len(b["ko"]["value"]) < len(code_ko[key]):
            code_ko[key] = b["ko"]["value"]

    countries = []
    for x in members + obs:
        iso3 = x["cca3"]
        caps_en = x.get("capital", [])
        caps_ko = []
        wcaps = wd_by[iso3]["P36"]
        for cp in caps_en:
            ko = next((k for e, k in wcaps if e == cp and k), None)
            if not ko and len(caps_en) == 1:
                ko = CAPITAL_KO_MANUAL.get(iso3)
            if not ko:
                warnings.append(f"{iso3} 수도 한국어명 없음: {cp} (영어 표기 사용)")
            caps_ko.append(ko or cp)
        caps_ko = [CAPITAL_KO_SHORT.get(c, c) for c in caps_ko]
        langs = x.get("languages") or {}
        langs_ko = [code_ko.get(("language", code), name) for code, name in langs.items()]
        cur = x.get("currencies", {}) or {}
        currencies = [{"code": code, "name_en": v.get("name"), "symbol": v.get("symbol"),
                       "name_ko": code_ko.get(("currency", code))} for code, v in cur.items()]
        for cu in currencies:
            if not cu["name_ko"]:
                warnings.append(f"{iso3} 통화 한국어명 없음: {cu['code']}")
        sub = x.get("subregion", "")
        if sub not in SUBREGION_KO:
            errors.append(f"{iso3} 지역 번역 없음: {sub}")
        countries.append({
            "id": iso3,
            "iso2": x["cca2"],
            "iso3": iso3,
            "m49": x.get("ccn3"),
            "status": "observer" if iso3 in observers else "member",
            "name_ko": NAME_KO_OVERRIDE.get(iso3, x["translations"]["kor"]["common"]),
            "official_ko": OFFICIAL_KO.get(iso3, x["translations"]["kor"]["official"]),
            "name_en": x["name"]["common"],
            "official_en": x["name"]["official"],
            "aliases": list(dict.fromkeys(ALIASES.get(iso3, []) + ([x["translations"]["kor"]["common"]]
                                                 if iso3 in NAME_KO_OVERRIDE else []))),
            "continent": continent_of(x["region"], sub),
            "region_ko": SUBREGION_KO.get(sub, sub),
            "region_en": sub,
            "capital_ko": caps_ko,
            "capital_en": caps_en,
            "capital_note": CAPITAL_NOTE.get(iso3),
            "currencies": currencies,
            "languages_en": sorted((x.get("languages") or {}).values()),
            "languages_ko": langs_ko,
            "borders": sorted(x.get("borders", [])),
            "landlocked": bool(x.get("landlocked")),
            "latlng": x.get("latlng"),
        })
    ids = [c["id"] for c in countries]
    for key in ("id", "iso2", "m49"):
        dup = [k for k, n in Counter(c[key] for c in countries).items() if n > 1]
        if dup:
            errors.append(f"국가코드 중복({key}): {dup}")
    if any(not c["m49"] for c in countries):
        errors.append("M49 코드 없는 국가 존재")
    # 인접국은 195개국 목록 안에 있는 나라만 링크로 쓰고, 나머지(예: 목록 외 지역)는 따로 둔다
    idset = set(ids)
    for c in countries:
        c["borders_outside"] = [b for b in c["borders"] if b not in idset]
        c["borders"] = [b for b in c["borders"] if b in idset]
        for b in c["borders"]:
            other = next(o for o in countries if o["id"] == b)
            if c["id"] not in other["borders"] and c["id"] not in other.get("borders_outside", []):
                warnings.append(f"인접국 비대칭: {c['id']}→{b}")
    names = Counter(c["name_ko"] for c in countries)
    if any(n > 1 for n in names.values()):
        errors.append(f"한국어 국가명 중복: {[k for k, n in names.items() if n > 1]}")
    return sorted(countries, key=lambda c: c["name_ko"])


# ───────────────────────── 통계 ─────────────────────────
SANITY = {  # 단위 오류를 잡기 위한 허용 범위 (벗어나면 오류)
    "population": (500, 2e9), "area": (0.1, 2e7), "density": (0.01, 3e4),
    "gdp": (1e6, 5e13), "gdp_pc": (10, 5e5), "gdp_growth": (-80, 200), "inflation": (-40, 1e6),
    "fertility": (0.5, 9), "life_exp": (10, 95), "urban": (0, 100), "manufacturing": (0, 70), "internet": (0, 100),
}


def competition_rank(items, descending=True):
    """동률은 같은 순위, 다음 순위는 건너뛴다 (1, 2, 2, 4). 비교는 원값 기준."""
    ordered = sorted(items, key=lambda kv: (-kv[1] if descending else kv[1], kv[0]))
    ranks, prev, prev_rank = {}, None, 0
    for i, (cid, v) in enumerate(ordered, start=1):
        if v != prev:
            prev_rank, prev = i, v
        ranks[cid] = prev_rank
    return ranks


def build_stats(country_ids: set[str]):
    indicators_out, obs_out = [], {}
    for ind in INDICATORS:
        code, iid = ind["source_code"], ind["indicator_id"]
        f = RAW / "wb" / f"{code}.json"
        if not f.exists():
            errors.append(f"원자료 없음: {code}")
            continue
        d = load(f)
        meta = d["meta"]
        if meta["id"] != code:
            errors.append(f"메타데이터 코드 불일치: {code}")
        series = defaultdict(dict)
        seen = Counter()
        for r in d["data"]:
            cid = r["countryiso3code"]
            if cid not in country_ids:
                continue  # 지역·소득그룹 집계 및 195개국 외 지역 제외
            seen[(cid, r["date"])] += 1
            v = r["value"]
            if v is None:
                continue  # 결측은 저장하지 않는다 (0이나 추정치로 채우지 않음)
            if not isinstance(v, (int, float)) or not math.isfinite(v):
                errors.append(f"{iid} {cid} {r['date']} 숫자 아님: {v}")
                continue
            lo, hi = SANITY[iid]
            if not (lo <= v <= hi):
                errors.append(f"{iid} {cid} {r['date']} 허용 범위 밖 값: {v}")
            series[cid][int(r["date"])] = v
        dups = [k for k, n in seen.items() if n > 1]
        if dups:
            errors.append(f"{iid} 국가·연도 중복: {dups[:5]}")
        unmapped = {r["countryiso3code"] for r in d["data"] if r["countryiso3code"] not in country_ids}
        missing_countries = sorted(country_ids - set(series))
        # 기준연도
        cov = Counter(y for s in series.values() for y in s)
        candidate = [y for y, n in cov.items() if n >= MIN_RANK_COVERAGE]
        if not candidate:
            errors.append(f"{iid} 순위 기준연도 없음")
            continue
        ref_year = max(candidate)
        ref_vals = [(cid, s[ref_year]) for cid, s in series.items() if ref_year in s]
        ranks = competition_rank(ref_vals, ind["sort"] == "desc")
        # 순위 재계산 점검: 순위는 1부터, 최대값은 국가 수 이하, 값 순서와 일치
        if min(ranks.values()) != 1 or max(ranks.values()) > len(ref_vals):
            errors.append(f"{iid} 순위 범위 오류")
        by_rank = sorted(ref_vals, key=lambda kv: ranks[kv[0]])
        for (a, va), (b, vb) in zip(by_rank, by_rank[1:]):
            if (ind["sort"] == "desc" and va < vb) or (ind["sort"] == "asc" and va > vb):
                errors.append(f"{iid} 순위 역전 {a}/{b}")
        ties = sum(1 for n in Counter(v for _, v in ref_vals).values() if n > 1)
        # 연도 간 급변 (경고만)
        if iid in ("population", "area", "life_exp", "urban"):
            for cid, s in series.items():
                ys = sorted(s)
                for y0, y1 in zip(ys, ys[1:]):
                    if y1 - y0 == 1 and s[y0] > 0 and abs(s[y1] / s[y0] - 1) > 0.25:
                        warnings.append(f"{iid} {cid} {y0}→{y1} 25% 넘는 변화: {s[y0]}→{s[y1]}")
        latest_year = max(cov)
        indicators_out.append({
            **ind,
            "name_en": meta["name"],
            "definition_en": meta.get("sourceNote", ""),
            "source": "World Bank, World Development Indicators",
            "source_org": meta.get("sourceOrganization", "").strip(),
            "source_url": f"https://data.worldbank.org/indicator/{code}",
            "update_frequency": "연 1회 (World Bank WDI 갱신 시)",
            "retrieved_at": d["retrieved_at"],
            "ref_year": ref_year,
            "ref_count": len(ref_vals),
            "latest_year": latest_year,
            "coverage_by_year": {str(y): cov[y] for y in sorted(cov) if y >= FIRST_YEAR},
            "ties_in_ref_year": ties,
            "missing_all_years": missing_countries,
        })
        obs_out[iid] = {cid: [[y, s[y]] for y in sorted(s) if y >= FIRST_YEAR]
                        for cid, s in sorted(series.items())}
        print(f"{iid:14s} ref {ref_year} n={len(ref_vals):3d} latest {latest_year} "
              f"missing={len(missing_countries)} ties={ties} dropped_aggregates={len(unmapped)}")
    return indicators_out, obs_out


# ───────────────────────── 지도 ─────────────────────────
def build_map(country_ids: set[str]):
    g = load(RAW / "ne_50m_admin_0_countries.geojson")
    feats = []
    for f in g["features"]:
        p = f["properties"]
        # ISO_A3 가 -99 인 경우: 프랑스·노르웨이처럼 본토(ADM0_A3 == ISO_A3_EH)만 ISO 코드를 쓰고,
        # 다른 나라에 딸린 작은 영역(예: 애시모어 카르티에 제도)은 자체 ADM0_A3 코드로 둔다.
        if p["ISO_A3"] != "-99":
            iso = p["ISO_A3"]
        elif p["ISO_A3_EH"] == p["ADM0_A3"]:
            iso = p["ISO_A3_EH"]
        else:
            iso = p["ADM0_A3"]
        if p["ADMIN"] == "Antarctica":
            continue
        listed = iso in country_ids
        sov = p["SOV_A3"]
        feats.append({"type": "Feature", "geometry": f["geometry"], "properties": {
            "id": iso, "listed": listed,
            "ne_name_ko": p.get("NAME_KO"), "ne_name_en": p.get("NAME"),
            "sovereign": p.get("SOVEREIGNT"), "type": p.get("TYPE"),
            "lx": p.get("LABEL_X"), "ly": p.get("LABEL_Y"), "tiny": p.get("TINY", -99), "mc": p.get("MAPCOLOR7"),
        }})
    ids_on_map = Counter(f["properties"]["id"] for f in feats if f["properties"]["listed"])
    missing = sorted(country_ids - set(ids_on_map))
    if missing:
        errors.append(f"지도에 없는 국가: {missing}")
    dup = [k for k, n in ids_on_map.items() if n > 1]
    if dup:
        errors.append(f"지도 영역이 한 국가에 여러 개: {dup}")
    STAGE.mkdir(parents=True, exist_ok=True)
    tmp = ROOT / "data" / "map_stage.geojson"
    tmp.write_text(json.dumps({"type": "FeatureCollection", "features": feats}, ensure_ascii=False), encoding="utf-8")
    out = STAGE / "world.topo.json"
    mapshaper = ROOT / "node_modules" / ".bin" / ("mapshaper.cmd" if sys.platform == "win32" else "mapshaper")
    cmd = [str(mapshaper), str(tmp), "-simplify", "15%", "keep-shapes", "-clean",
           "-o", "format=topojson", "quantization=1e5", str(out)]
    r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if r.returncode != 0:
        errors.append("mapshaper 실패: " + r.stderr[-500:])
        return
    topo = load(out)
    obj = next(iter(topo["objects"].values()))
    after = {gm["properties"]["id"] for gm in obj["geometries"] if gm.get("type") and gm["properties"]["listed"]}
    lost = sorted(country_ids - after)
    if lost:
        errors.append(f"단순화 후 사라진 국가: {lost}")
    print(f"map features={len(obj['geometries'])} listed={len(after)} size={out.stat().st_size // 1024}KB")
    tmp.unlink()


def main():
    countries = build_countries()
    ids = {c["id"] for c in countries}
    indicators, obs = build_stats(ids)
    # 기본정보의 면적·인구는 통계 원자료(World Bank)에서 연결하므로 국가 정보에는 수치를 따로 두지 않는다.
    build_map(ids)
    STAGE.mkdir(parents=True, exist_ok=True)
    meta = {"built_from": {
        "countries": "mledoze/countries (REST Countries 원자료), ODbL",
        "korean_labels": "Wikidata (수도·공용어·통화 한국어 명칭), CC0",
        "map": "Natural Earth 1:50m Admin 0 Countries, public domain",
        "stats": "World Bank World Development Indicators API, CC BY 4.0",
    }, "first_year": FIRST_YEAR, "min_rank_coverage": MIN_RANK_COVERAGE,
        "country_count": len(countries), "indicator_count": len(indicators)}
    (STAGE / "countries.json").write_text(json.dumps(countries, ensure_ascii=False), encoding="utf-8")
    (STAGE / "indicators.json").write_text(json.dumps(indicators, ensure_ascii=False), encoding="utf-8")
    (STAGE / "observations.json").write_text(json.dumps(obs, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (STAGE / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    report = {"errors": errors, "warnings": warnings, "countries": len(countries), "indicators": len(indicators),
              "members": sum(c["status"] == "member" for c in countries),
              "observers": sum(c["status"] == "observer" for c in countries)}
    (ROOT / "data" / "validation_report.json").write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"countries={len(countries)} (member {report['members']}, observer {report['observers']}) "
          f"indicators={len(indicators)} errors={len(errors)} warnings={len(warnings)}")
    if errors:
        for e in errors:
            print("ERROR", e)
        print("검증 실패: public/data 는 이전 상태로 유지됨")
        sys.exit(1)
    if OUT.exists():
        shutil.rmtree(OUT)
    STAGE.replace(OUT)
    print("public/data 갱신 완료")


if __name__ == "__main__":
    main()

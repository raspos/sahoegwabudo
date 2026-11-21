"""역사·문화적으로 알려진 특산물 모듈 (public/data/specialties.json) — 도감 'C. 역사·문화적 특산물'.

두 공식 등록부만 쓴다 (생산량·수출액과 섞지 않는다):
1) UNESCO 인류무형문화유산 대표목록·긴급보호목록의 음식·음료·공예 종목
   - UNESCO 사이트가 자동 내려받기를 막아, 브라우저에서 추출한 data/reference/unesco_ich_food_craft.tsv 를 입력으로 쓴다.
2) EU 지리적 표시(GI) 등록부 eAmbrosia 의 '등록됨' 상태 명칭 (원산지 명칭 보호 PDO·지리적 표시 보호 PGI·증류주 GI)
   - 공개 API: https://ec.europa.eu/geographical-indications-register/eambrosia-public-api/api/gi-applications/filter
실행: python -I pipeline/specialties.py [--refresh]
"""
from __future__ import annotations

import json
import sys
import time
import urllib.request
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REF = ROOT / "data" / "reference" / "unesco_ich_food_craft.tsv"
RAW = ROOT / "data" / "raw" / "eu_gi.json"
OUT = ROOT / "public" / "data" / "specialties.json"
sys.stdout.reconfigure(encoding="utf-8")
GI_API = "https://ec.europa.eu/geographical-indications-register/eambrosia-public-api/api/gi-applications/filter"
GI_REGISTER = "https://ec.europa.eu/agriculture/eambrosia/geographical-indications-register/"

# UNESCO 국가 표기 → ISO3 (countries.json 의 영어 이름으로 찾지 못하는 것만)
UNESCO_NAMES = {
    "Republic of Korea": "KOR", "Democratic People’s Republic of Korea": "PRK", "Türkiye": "TUR", "Viet Nam": "VNM",
    "Iran (Islamic Republic of)": "IRN", "Netherlands (Kingdom of the)": "NLD", "State of Palestine": "PSE",
    "Syrian Arab Republic": "SYR", "Republic of Moldova": "MDA", "Venezuela (Bolivarian Republic of)": "VEN",
    "Bolivia (Plurinational State of)": "BOL", "Lao People's Democratic Republic": "LAO", "Côte d'Ivoire": "CIV",
    "Micronesia (Federated States of)": "FSM", "Russian Federation": "RUS", "Czechia": "CZE", "United Arab Emirates": "ARE",
    "Timor-Leste": "TLS", "North Macedonia": "MKD", "United Kingdom of Great Britain and Northern Ireland": "GBR",
}

GI_CATEGORY_KO = [
    ("Wine", "와인"), ("Class 1.1", "신선 육류"), ("Class 1.2", "육가공품(햄·소시지 등)"), ("Class 1.3", "치즈"),
    ("Class 1.4", "꿀·달걀 등 동물성 식품"), ("Class 1.5", "기름·버터"), ("Class 1.6", "과일·채소·곡물"),
    ("Class 1.7", "수산물"), ("Class 1.8", "향신료 등"), ("Class 2.1", "맥주"), ("Class 2.3", "빵·과자"),
    ("Class 2.4", "생면 반죽"), ("Class 2.5", "파스타"), ("Class 2.6", "소금"), ("Class 2.", "기타 가공식품"),
]
# 화면에 고를 때의 우선순위 (음식 → 증류주 → 와인)
CATEGORY_ORDER = ["치즈", "육가공품(햄·소시지 등)", "과일·채소·곡물", "빵·과자", "수산물", "기름·버터", "꿀·달걀 등 동물성 식품",
                  "신선 육류", "향신료 등", "맥주", "파스타", "소금", "기타 가공식품", "증류주", "와인"]


def gi_category(cat: str | None) -> str:
    if not cat:
        return "기타 가공식품"
    for prefix, ko in GI_CATEGORY_KO:
        if cat.startswith(prefix):
            return ko
    return "증류주" if cat[:1].isdigit() else "기타 가공식품"


def fetch_gi(refresh: bool):
    if RAW.exists() and not refresh:
        return json.loads(RAW.read_text(encoding="utf-8"))
    body = json.dumps({"cnCode": [], "filters": [], "first": 0, "lang": "en", "sortField": "statusDate", "sortOrder": -1,
                       "rows": 10000, "registerId": None, "cnCodes": []}).encode()
    req = urllib.request.Request(GI_API, data=body, headers={"Content-Type": "application/json",
                                                              "User-Agent": "sahoegwabudo-data/0.3 (non-commercial educational site)"})
    with urllib.request.urlopen(req, timeout=180) as r:
        data = json.loads(r.read().decode("utf-8"))
    if data.get("count") != len(data.get("results", [])):
        raise RuntimeError(f"GI 응답 일부만 받음: {len(data.get('results', []))}/{data.get('count')}")
    RAW.parent.mkdir(parents=True, exist_ok=True)
    RAW.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    return data


def main(refresh=False):
    errors, warnings = [], []
    countries = json.loads((ROOT / "public" / "data" / "countries.json").read_text(encoding="utf-8"))
    by_name = {}
    for c in countries:
        for n in [c["name_en"], c["official_en"], *c["aliases"]]:
            by_name[n] = c["id"]
    by_iso2 = {c["iso2"].lower(): c["id"] for c in countries}
    out = defaultdict(lambda: {"unesco": [], "gi": [], "gi_total": 0})

    # ── UNESCO ──
    n_unesco = 0
    for line in REF.read_text(encoding="utf-8").splitlines():
        if not line.strip() or line.startswith("#"):
            continue
        num, year, lst, kind, cs, label = line.split("|", 5)
        isos = []
        for name in cs.split(";"):
            iso = UNESCO_NAMES.get(name) or by_name.get(name)
            if not iso:
                errors.append(f"UNESCO 국가 이름 연결 실패: {name}")
                continue
            isos.append(iso)
        n_unesco += 1
        for iso in isos:
            out[iso]["unesco"].append({"id": num, "name_en": label.strip(), "year": int(year), "list": lst, "kind": kind,
                                       "url": f"https://ich.unesco.org/en/{lst}/{num}",
                                       "shared_with": [x for x in isos if x != iso]})

    # ── EU 지리적 표시 ──
    try:
        gi = fetch_gi(refresh)
    except Exception as e:  # noqa: BLE001
        prev = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else None
        if not prev:
            errors.append(f"GI 등록부 수집 실패: {e}")
            gi = {"results": []}
        else:
            warnings.append(f"GI 등록부 수집 실패, 기존 값 유지: {e}")
            for iso, v in prev["countries"].items():
                out[iso]["gi"], out[iso]["gi_total"] = v["gi"], v["gi_total"]
            gi = {"results": []}
    per = defaultdict(list)
    for g in gi["results"]:
        if g.get("status") != "Registered":
            continue
        for cc in (g.get("countryId") or "").split(","):
            cc = cc.strip().lower().replace("uk(ni)", "gb").replace("uk", "gb")
            iso = by_iso2.get(cc)
            if not iso:
                warnings.append(f"GI 국가 코드 연결 실패: {cc} ({g.get('protectedName')})")
                continue
            d, m, y = (g.get("registrationDate") or "01/01/1900").split("/")
            per[iso].append({"name": g["protectedName"], "category_ko": gi_category(g.get("productCategory")),
                             "type": g.get("geographicalIndicatorTypeCode") or "GI", "year": int(y), "file": g.get("fileName"),
                             "_date": f"{y}{m}{d}"})
    for iso, items in per.items():
        out[iso]["gi_total"] = len(items)
        by_cat = defaultdict(list)
        for it in sorted(items, key=lambda x: x["_date"]):
            by_cat[it["category_ko"]].append(it)
        picked = []
        while len(picked) < 6 and any(by_cat.values()):   # 종류가 겹치지 않게 돌아가며 고른다
            for cat in CATEGORY_ORDER:
                if by_cat.get(cat) and len(picked) < 6:
                    picked.append(by_cat[cat].pop(0))
        for it in picked:
            it.pop("_date")
        out[iso]["gi"] = picked

    for v in out.values():
        v["unesco"].sort(key=lambda x: (x["kind"] != "food", x["year"]))
    meta = {"unesco": "UNESCO Intangible Cultural Heritage, Representative List / Urgent Safeguarding List (음식·음료·공예 종목)",
            "unesco_elements": n_unesco, "gi": "EU geographical indications register eAmbrosia (Registered)",
            "gi_register_url": GI_REGISTER, "retrieved_at": time.strftime("%Y-%m-%d"), "warnings": warnings[:30]}
    covered = sum(1 for v in out.values() if v["unesco"] or v["gi"])
    print(f"UNESCO 종목 {n_unesco}, 나라 {covered}개국 (UNESCO {sum(1 for v in out.values() if v['unesco'])}, "
          f"GI {sum(1 for v in out.values() if v['gi'])}), errors={len(errors)} warnings={len(warnings)}")
    if errors or covered < 80:
        for e in errors[:20]:
            print("ERROR", e)
        print("검증 실패: 기존 specialties.json 유지")
        sys.exit(1)
    OUT.write_text(json.dumps({"meta": meta, "countries": dict(sorted(out.items()))}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print("public/data/specialties.json 갱신", OUT.stat().st_size // 1024, "KB")


if __name__ == "__main__":
    main(refresh="--refresh" in sys.argv)

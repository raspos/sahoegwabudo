"""FAOSTAT 농축산물 생산 모듈 (public/data/agri.json).

입력: FAOSTAT 'Production: Crops and livestock products'(QCL) 일괄 내려받기 파일 (CC BY 4.0), data/raw/fao/qcl.zip
- 생산량(Element 5510, 단위 t)만 쓰고, FAO 집계 품목(품목 코드 1700 이상: 곡물 합계 등)은 뺀다.
- 기준연도: 생산량 행 수가 가장 많은 해의 95% 이상이 채워진 가장 최근 해 (모든 나라 같은 해).
- 두 목록을 따로 둔다: by_tonnes = 그 나라에서 톤수로 가장 많이 생산하는 5개,
  representative = 세계 15위 안이면서 1만 t 이상인 품목을 순위 순으로 5개 (기타·혼합 품목 제외).
- 가축 수(Element 5111 Stocks, 마리)는 따로 둔다.
- M49 코드 하나에 FAO 지역이 정확히 하나만 대응해야 한다 (중국은 'China; mainland' M49 156).
실행: python -I pipeline/agri.py
"""
from __future__ import annotations

import csv
import io
import json
import sys
import zipfile
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ZIP = ROOT / "data" / "raw" / "fao" / "qcl.zip"
OUT = ROOT / "public" / "data" / "agri.json"
sys.path.insert(0, str(ROOT / "pipeline"))
from fao_ko import FAO_KO  # noqa: E402

sys.stdout.reconfigure(encoding="utf-8")
# 1차 생산물만 남긴다: 기름·설탕·술·유제품 가공품·부산물(내장·지방·가죽) 제외
PROCESSED = ("oil", "beer", "sugar (centrifugal", "molasses", "wine", "offal", "fat", "tallow", "hides", "butter",
             "ghee", "cheese", "cream", "yoghurt", "whey", "condensed", "evaporated", "powder", "buttermilk",
             "skim milk", "beeswax", "raw silk", "in immediate packings", "cashewapple", "n.e.c")
LIVESTOCK = {"866": "소", "976": "양", "1016": "염소", "1034": "돼지", "1096": "말", "1126": "낙타", "946": "물소", "1110": "노새", "1107": "당나귀"}


def main(list_missing=False):
    errors = []
    countries = json.loads((ROOT / "public" / "data" / "countries.json").read_text(encoding="utf-8"))
    by_m49 = {c["m49"].zfill(3): c["id"] for c in countries}
    z = zipfile.ZipFile(ZIP)
    areas = list(csv.DictReader(io.TextIOWrapper(z.open("Production_Crops_Livestock_E_AreaCodes.csv"), encoding="latin-1")))
    fao_to_id = {}
    for a in areas:
        m = a["M49 Code"].lstrip("'").zfill(3)
        if m in by_m49 and int(a["Area Code"]) < 5000:
            cid = by_m49[m]
            if cid in fao_to_id.values():
                errors.append(f"M49 {m} 에 FAO 지역 둘 이상")
            fao_to_id[a["Area Code"]] = cid
    if fao_to_id.get("41") != "CHN" or "351" in fao_to_id:
        errors.append("중국 매핑 오류 (China; mainland 41 이어야 함)")

    prod = defaultdict(dict)        # year → {(cid, item): (value, flag)}
    world = defaultdict(dict)       # year → {item: value}
    stocks = defaultdict(dict)      # year → {(cid, item): value}
    names = {}
    rows_by_year = defaultdict(int)
    f = io.TextIOWrapper(z.open("Production_Crops_Livestock_E_All_Data_(Normalized).csv"), encoding="latin-1")
    for r in csv.DictReader(f):
        el, item, year = r["Element Code"], r["Item Code"], int(r["Year"])
        if year < 2015 or not r["Value"]:
            continue
        if el == "5510" and r["Unit"] == "t" and int(item) < 1700 and not any(k in r["Item"].lower() for k in PROCESSED):
            names[item] = r["Item"]
            v = float(r["Value"])
            if r["Area Code"] == "5000":
                world[year][item] = v
            elif r["Area Code"] in fao_to_id:
                prod[year][(fao_to_id[r["Area Code"]], item)] = (v, r["Flag"])
                rows_by_year[year] += 1
        elif el == "5111" and item in LIVESTOCK and r["Area Code"] in fao_to_id:
            stocks[year][(fao_to_id[r["Area Code"]], item)] = float(r["Value"])
    mx = max(rows_by_year.values())
    year = max(y for y, n in rows_by_year.items() if n >= 0.95 * mx)
    print("rows by year:", dict(sorted(rows_by_year.items())[-4:]), "→ ref year", year)

    P = prod[year]
    by_item = defaultdict(list)
    for (cid, item), (v, _) in P.items():
        if v > 0:
            by_item[item].append((cid, v))
    rank = {}
    for item, lst in by_item.items():
        lst.sort(key=lambda t: -t[1])
        prev, prev_rank = None, 0
        for i, (cid, v) in enumerate(lst, 1):
            if v != prev:
                prev_rank, prev = i, v
            rank[(cid, item)] = (prev_rank, len(lst))

    out, missing = {}, set()
    for c in countries:
        cid = c["id"]
        items = [(item, v, flag) for (k, item), (v, flag) in P.items() if k == cid and v > 0]
        if not items:
            continue
        def score(t):
            item, v, _ = t
            r, _n = rank[(cid, item)]
            share = v / world[year].get(item, v) if world[year].get(item) else 0
            return (r, -share)
        vague = lambda nm: nm.lower().startswith(("other", "mixed"))
        notable = [t for t in items if rank[(cid, t[0])][0] <= 15 and t[1] >= 10000 and not vague(names[t[0]])]
        rep = sorted(notable, key=score)[:5]
        top_t = sorted(items, key=lambda t: -t[1])[:5]
        def pack(t):
            item, v, flag = t
            r, n = rank[(cid, item)]
            w = world[year].get(item)
            if item not in FAO_KO:
                missing.add((item, names[item]))
            return {"item": item, "name_en": names[item], "name_ko": FAO_KO.get(item), "tonnes": v,
                    "rank": r, "of": n, "world_share": round(v / w, 4) if w else None, "flag": flag or None}
        ls = sorted(((LIVESTOCK[it], v) for (k, it), v in stocks[year].items() if k == cid and v > 0), key=lambda t: -t[1])[:4]
        out[cid] = {"representative": [pack(t) for t in rep], "by_tonnes": [pack(t) for t in top_t],
                    "livestock": [{"name_ko": n, "head": v} for n, v in ls]}

    if missing:
        print(f"한국어 이름 없는 품목 {len(missing)}개:")
        for it, nm in sorted(missing, key=lambda t: int(t[0])):
            print(f'    "{it}": "",  # {nm}')
        if not list_missing:
            errors.append("한국어 품목명 누락")
    meta = {"source": "FAO. FAOSTAT: Crops and livestock products (QCL). Licence: CC-BY-4.0. https://www.fao.org/faostat/en/#data/QCL",
            "year": year, "countries": len(out), "accessed": __import__("time").strftime("%Y-%m-%d"),
            "note": "대표 생산품 = 세계 순위·세계 비중 순. 품목 한국어 이름은 편집 번역."}
    print(f"countries={len(out)} year={year} errors={errors}")
    if errors or len(out) < 150:
        print("검증 실패: 기존 agri.json 유지")
        sys.exit(1)
    OUT.write_text(json.dumps({"meta": meta, "countries": out}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print("public/data/agri.json 갱신", OUT.stat().st_size // 1024, "KB")


if __name__ == "__main__":
    main(list_missing="--list-missing" in sys.argv)

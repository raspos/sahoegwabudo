"""UN Comtrade 상품 수출 모듈 (public/data/trade.json).

- 공개 미리보기 API(키 없음, 호출당 500건, 초당 1회 이하)를 쓴다. 나라별 응답은 data/raw/comtrade/ 에 저장해 다시 부르지 않는다.
- 수출(flowCode=X)은 재수출을 포함한다. 운송수단·통관절차 세부행이 섞이지 않도록 motCode=0, customsCode=C00, partner2Code=0 행만 쓴다.
- 비중은 같은 해 TOTAL(전체 상품) 수출액에 대한 비율이다. HS 2단위 합계가 TOTAL 과 2% 넘게 다르면 경고한다.
- 검증에 실패하면 기존 public/data/trade.json 을 그대로 둔다.

실행: python -I pipeline/trade.py [--refresh]
"""
from __future__ import annotations

import json
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw" / "comtrade"
OUT = ROOT / "public" / "data" / "trade.json"
sys.path.insert(0, str(ROOT / "pipeline"))
from hs2_ko import HS2_KO  # noqa: E402

sys.stdout.reconfigure(encoding="utf-8")
API = "https://comtradeapi.un.org/public/v1/preview/C/A/HS"
REF = "https://comtradeapi.un.org/files/v1/app/reference/{}.json"
YEARS = [2024, 2023, 2022]
# 상위 5개 상대국에서 뺄 항목 (총액에는 남긴다): 미상 지역·선박 연료·자유무역지대·특수 범주
NON_PARTNER = {0, 837, 838, 839, 899}
# 195개국 목록 밖의 상대 지역: 원자료 이름을 직역한다 (다른 이름으로 바꾸지 않는다)
PARTNER_KO = {344: "홍콩(중국 특별행정구)", 446: "마카오(중국 특별행정구)", 490: "기타 아시아(달리 분류되지 않음)",
              899: "지역 미상", 837: "선박 연료", 838: "자유무역지대", 839: "특수 범주"}
UA = {"User-Agent": "sahoegwabudo-data/0.2 (non-commercial educational site)"}
_last = [0.0]
calls = [0]


def get_json(url: str, cache: Path | None = None, refresh=False):
    if cache and cache.exists() and not refresh:
        return json.loads(cache.read_text(encoding="utf-8"))
    for attempt in range(4):
        wait = 1.3 - (time.time() - _last[0])
        if wait > 0:
            time.sleep(wait)
        _last[0] = time.time()
        calls[0] += 1
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=90) as r:
                data = json.loads(r.read().decode("utf-8-sig"))
            if cache:
                cache.parent.mkdir(parents=True, exist_ok=True)
                cache.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
            return data
        except urllib.error.HTTPError as e:
            if e.code == 429:
                time.sleep(20 * (attempt + 1))
                continue
            raise
        except Exception:  # noqa: BLE001
            time.sleep(5 * (attempt + 1))
    raise RuntimeError(f"Comtrade 호출 실패: {url}")


def q(**params) -> str:
    return API + "?" + urllib.parse.urlencode(params)


def clean(rows):
    return [r for r in rows if r.get("flowCode") == "X" and r.get("motCode") == 0
            and r.get("customsCode") == "C00" and r.get("partner2Code") == 0]


def main(refresh=False):
    errors, warnings = [], []
    countries = json.loads((ROOT / "public" / "data" / "countries.json").read_text(encoding="utf-8"))
    ids = {c["id"] for c in countries}
    rep = get_json(REF.format("Reporters"), RAW / "ref_reporters.json", refresh)["results"]
    par = get_json(REF.format("partnerAreas"), RAW / "ref_partners.json", refresh)["results"]
    hs = get_json(REF.format("HS"), RAW / "ref_hs.json", refresh)["results"]
    hs_en = {h["id"]: h["text"].split(" - ", 1)[-1] for h in hs if h.get("aggrLevel") == 2}

    # 현재 유효한 보고국 코드 → ISO3 (만료된 옛 코드 제외)
    rep_code = {}
    for r in rep:
        iso = r.get("reporterCodeIsoAlpha3")
        if iso in ids and not r.get("isGroup") and not r.get("entryExpiredDate"):
            rep_code[iso] = r["reporterCode"]
    partner_iso = {p["PartnerCode"]: p.get("PartnerCodeIsoAlpha3") for p in par}
    partner_name = {p["PartnerCode"]: p["PartnerDesc"] for p in par}
    no_reporter = sorted(ids - set(rep_code))

    # 1) 연도별 전체 수출액 (보고국 전체를 한 번에)
    totals = {}
    for y in YEARS:
        d = get_json(q(period=y, partnerCode=0, cmdCode="TOTAL", flowCode="X"), RAW / f"totals_{y}.json", refresh)
        totals[y] = {r["reporterCode"]: r["primaryValue"] for r in clean(d.get("data", [])) if r.get("partnerCode") == 0}
        print(f"totals {y}: {len(totals[y])} reporters")

    # 2) 나라별 최신 연도에 맞춰 여러 나라를 한 번에 묻는다 (상품 5개국, 상대국 2개국씩; 500건에 닿으면 반으로 나눠 다시)
    latest = {iso: next((y for y in YEARS if totals[y].get(code)), None) for iso, code in rep_code.items()}

    def cache_path(iso, kind, year):
        return RAW / f"{iso}_{kind}_{year}.json"

    def fetch_group(kind, year, isos):
        todo = [i for i in isos if not cache_path(i, kind, year).exists() or refresh]
        if not todo:
            return
        codes = ",".join(str(rep_code[i]) for i in todo)
        params = dict(reporterCode=codes, period=year, flowCode="X")
        params.update(dict(partnerCode=0, cmdCode="AG2") if kind == "hs2" else dict(cmdCode="TOTAL"))
        rows = get_json(q(**params)).get("data", [])
        if len(rows) >= 500 and len(todo) > 1:
            half = len(todo) // 2
            fetch_group(kind, year, todo[:half])
            fetch_group(kind, year, todo[half:])
            return
        for i in todo:
            mine = [r for r in rows if r.get("reporterCode") == rep_code[i]]
            cache_path(i, kind, year).write_text(json.dumps({"data": mine}, ensure_ascii=False), encoding="utf-8")

    for y in YEARS:
        group = sorted(i for i, yy in latest.items() if yy == y)
        for k in range(0, len(group), 5):
            fetch_group("hs2", y, group[k:k + 5])
        for k in range(0, len(group), 2):
            fetch_group("partners", y, group[k:k + 2])
        print(f"year {y}: {len(group)} countries fetched, calls={calls[0]}", flush=True)

    out = {}
    for iso, code in sorted(rep_code.items()):
        year = latest[iso]
        if not year:
            continue
        total = totals[year][code]
        prod = clean(json.loads(cache_path(iso, "hs2", year).read_text(encoding="utf-8")).get("data", []))
        prod = [r for r in prod if r.get("partnerCode") == 0 and len(str(r.get("cmdCode"))) == 2]
        part = clean(json.loads(cache_path(iso, "partners", year).read_text(encoding="utf-8")).get("data", []))
        s = sum(r["primaryValue"] for r in prod)
        if prod and abs(s / total - 1) > 0.02:
            warnings.append(f"{iso} {year} HS2 합계 {s:.3e} ≠ TOTAL {total:.3e}")
        if len(prod) >= 500 or len(part) >= 500:
            warnings.append(f"{iso} 응답이 500건 한도에 닿음 (일부 누락 가능)")
        dup = len(prod) - len({r['cmdCode'] for r in prod})
        if dup:
            errors.append(f"{iso} HS2 중복 행 {dup}")
        products = sorted(prod, key=lambda r: -r["primaryValue"])
        partners = sorted([r for r in part if r["partnerCode"] not in NON_PARTNER], key=lambda r: -r["primaryValue"])
        out[iso] = {
            "year": year,
            "total": total,
            "hs_sum_ratio": round(s / total, 4) if prod else None,
            "products": [{"hs": r["cmdCode"], "name_ko": HS2_KO.get(r["cmdCode"]), "name_en": hs_en.get(r["cmdCode"]),
                          "value": r["primaryValue"], "share": r["primaryValue"] / total} for r in products[:8]],
            "unspecified_share": next((r["primaryValue"] / total for r in prod if r["cmdCode"] == "99"), 0),
            "partner_unspecified_share": sum(r["primaryValue"] for r in part if r["partnerCode"] in NON_PARTNER - {0}) / total,
            "partners": [{"iso3": partner_iso.get(r["partnerCode"]) if partner_iso.get(r["partnerCode"]) in ids else None,
                          "code": r["partnerCode"], "name_en": partner_name.get(r["partnerCode"], str(r["partnerCode"])),
                          "name_ko": PARTNER_KO.get(r["partnerCode"]),
                          "value": r["primaryValue"], "share": r["primaryValue"] / total} for r in partners[:5]],
        }
        for p in out[iso]["products"]:
            if not p["name_ko"]:
                errors.append(f"HS {p['hs']} 한국어 약칭 없음")

    by_year = {y: sum(1 for v in out.values() if v["year"] == y) for y in YEARS}
    meta = {"source": "UN Comtrade (public preview API), Source: UN Comtrade", "flow": "X (수출, 재수출 포함)",
            "classification": "HS (보고 당시 판)", "retrieved_at": time.strftime("%Y-%m-%d"),
            "countries": len(out), "by_year": by_year, "no_reporter_code": no_reporter,
            "warnings": warnings}
    print(f"countries={len(out)} by_year={by_year} calls={calls[0]} errors={len(errors)} warnings={len(warnings)}")
    if errors or len(out) < 150:
        for e in errors[:20]:
            print("ERROR", e)
        print("검증 실패: 기존 trade.json 유지")
        sys.exit(1)
    tmp = OUT.with_suffix(".json.tmp")
    tmp.write_text(json.dumps({"meta": meta, "countries": out}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    tmp.replace(OUT)
    print("public/data/trade.json 갱신")


if __name__ == "__main__":
    main(refresh="--refresh" in sys.argv)

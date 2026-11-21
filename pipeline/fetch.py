"""원자료 다운로드 단계.

각 원자료를 data/raw/ 아래에 받는다. 한 소스가 실패해도 기존 파일은 지우지 않는다
(임시 파일에 받은 뒤 JSON 파싱이 성공했을 때만 교체).

실행: python -I pipeline/fetch.py [--only wb|wikidata|base]
"""
from __future__ import annotations

import json
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
RAW.mkdir(parents=True, exist_ok=True)
sys.path.insert(0, str(ROOT / "pipeline"))
from indicators import INDICATORS  # noqa: E402

UA = {"User-Agent": "sahoegwabudo-data/0.1 (static educational site)"}

BASE_SOURCES = {
    "countries.json": "https://raw.githubusercontent.com/mledoze/countries/master/countries.json",
    "ne_50m_admin_0_countries.geojson": "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson",
}

WB_YEARS = "1990:2025"


def get(url: str, headers: dict | None = None, timeout: int = 120) -> bytes:
    req = urllib.request.Request(url, headers={**UA, **(headers or {})})
    last = None
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"download failed: {url}: {last}")


def save_atomic(name: str, data: bytes, must_json: bool = True) -> None:
    tmp = RAW / (name + ".tmp")
    tmp.write_bytes(data)
    if must_json:
        json.loads(data.decode("utf-8"))  # 파싱 실패 시 예외 → 기존 파일 유지
    tmp.replace(RAW / name)


def fetch_base() -> None:
    for name, url in BASE_SOURCES.items():
        save_atomic(name, get(url))
        print("ok", name)


def fetch_wb() -> None:
    out_dir = RAW / "wb"
    out_dir.mkdir(exist_ok=True)
    for ind in INDICATORS:
        code = ind["source_code"]
        url = (f"https://api.worldbank.org/v2/country/all/indicator/{code}"
               f"?format=json&per_page=20000&date={WB_YEARS}")
        data = get(url)
        parsed = json.loads(data)
        if not isinstance(parsed, list) or len(parsed) < 2 or not parsed[1]:
            raise RuntimeError(f"unexpected WB payload for {code}")
        if parsed[0].get("pages", 1) != 1:
            raise RuntimeError(f"WB pagination not handled for {code}")
        meta = json.loads(get(f"https://api.worldbank.org/v2/indicator/{code}?format=json"))
        tmp = out_dir / f"{code}.json.tmp"
        tmp.write_text(json.dumps({"meta": meta[1][0], "data": parsed[1],
                                   "retrieved_at": time.strftime("%Y-%m-%d")},
                                  ensure_ascii=False), encoding="utf-8")
        tmp.replace(out_dir / f"{code}.json")
        print("ok wb", code, len(parsed[1]))


SPARQL = """
SELECT ?iso ?prop ?valLabelKo ?valLabelEn WHERE {
  VALUES ?prop { wdt:P36 wdt:P37 wdt:P38 }
  ?c wdt:P298 ?iso .
  ?c ?prop ?val .
  OPTIONAL { ?val rdfs:label ?valLabelKo FILTER(lang(?valLabelKo) = "ko") }
  OPTIONAL { ?val rdfs:label ?valLabelEn FILTER(lang(?valLabelEn) = "en") }
}
"""


# 통화(ISO 4217, P498)와 언어(ISO 639-3, P220)의 한국어 명칭. 필요한 코드만 VALUES 로 좁혀 질의한다.
def codes_query(prop: str, kind: str, codes: list[str]) -> str:
    vals = " ".join(f'"{c}"' for c in sorted(set(codes)))
    return f"""SELECT ?kind ?code ?ko WHERE {{ VALUES ?code {{ {vals} }} ?x wdt:{prop} ?code .
      ?x rdfs:label ?ko FILTER(lang(?ko) = "ko") BIND("{kind}" AS ?kind) }}"""


def wdqs(q: str) -> bytes:
    url = "https://query.wikidata.org/sparql?" + urllib.parse.urlencode({"query": q})
    return get(url, {"Accept": "application/sparql-results+json"}, timeout=180)


def fetch_wikidata() -> None:
    time.sleep(70)  # WDQS 요청 제한(분당 1회) 대응
    save_atomic("wikidata_capital_lang_currency.json", wdqs(SPARQL))
    print("ok wikidata capitals")
    countries = json.loads((RAW / "countries.json").read_text(encoding="utf-8"))
    cur = [c for x in countries for c in (x.get("currencies") or {})]
    lang = [c for x in countries for c in (x.get("languages") or {})]
    merged = {"head": {}, "results": {"bindings": []}}
    for prop, kind, codes in (("P498", "currency", cur), ("P220", "language", lang)):
        time.sleep(70)  # WDQS 요청 제한(분당 1회) 대응
        part = json.loads(wdqs(codes_query(prop, kind, codes)))
        merged["results"]["bindings"] += part["results"]["bindings"]
        print("ok wikidata", kind, len(part["results"]["bindings"]))
    save_atomic("wikidata_codes_ko.json", json.dumps(merged, ensure_ascii=False).encode("utf-8"))


if __name__ == "__main__":
    only = sys.argv[2] if len(sys.argv) > 2 and sys.argv[1] == "--only" else None
    steps = {"base": fetch_base, "wb": fetch_wb, "wikidata": fetch_wikidata}
    failed = []
    for key, fn in steps.items():
        if only and key != only:
            continue
        try:
            fn()
        except Exception as e:  # noqa: BLE001
            failed.append(key)
            print("FAILED", key, e, file=sys.stderr)
    if failed:
        print("일부 원자료 수집 실패. 기존 원자료는 유지됨:", failed, file=sys.stderr)
        sys.exit(1)

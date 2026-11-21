"""CIA World Factbook(factbook.json 미러)에서 나라별 이야기 재료를 간추린다 (data/raw/factbook/bundles.json).

이 파일은 집필용 참고 자료다. 서비스에 직접 싣지 않고, 이야기를 쓸 때 사실 확인과 출처 표기에 쓴다.
출처: CIA World Factbook (퍼블릭 도메인), 미러 https://github.com/factbook/factbook.json
실행: python -I pipeline/factbook_bundles.py [ISO3 ...]   (ISO3 를 주면 그 나라 재료를 출력)
"""
from __future__ import annotations

import html
import json
import re
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ZIP = ROOT / "data" / "raw" / "factbook" / "factbook.zip"
OUT = ROOT / "data" / "raw" / "factbook" / "bundles.json"
sys.stdout.reconfigure(encoding="utf-8")
EXTRA_FIPS = {"SSD": ["od"], "NOR": ["no"], "ISR": ["is"], "PSE": ["we", "gz"]}
FIELDS = [
    ("background", "Introduction", "Background"),
    ("geo_note", "Geography", "Geography - note"),
    ("terrain", "Geography", "Terrain"),
    ("climate", "Geography", "Climate"),
    ("resources", "Geography", "Natural resources"),
    ("hazards", "Geography", "Natural hazards"),
    ("pop_dist", "Geography", "Population distribution"),
    ("rivers", "Geography", "Major rivers (by length in km)"),
    ("econ", "Economy", "Economic overview"),
    ("agri", "Economy", "Agricultural products"),
    ("industries", "Economy", "Industries"),
    ("languages", "People and Society", "Languages"),
    ("religions", "People and Society", "Religions"),
    ("ethnic", "People and Society", "Ethnic groups"),
    ("independence", "Government", "Independence"),
    ("capital_note", "Government", "Capital"),
]


def clean(v) -> str:
    if isinstance(v, dict):
        t = v.get("text") or " ".join(clean(x) for x in v.values())
    else:
        t = str(v or "")
    t = re.sub(r"<[^>]+>", " ", t)
    return re.sub(r"\s+", " ", html.unescape(t)).strip()


def main():
    z = zipfile.ZipFile(ZIP)
    files = {n.split("/")[-1][:-5]: n for n in z.namelist() if n.endswith(".json") and n.count("/") == 2}
    ne = json.loads((ROOT / "data" / "raw" / "ne_50m_admin_0_countries.geojson").read_text(encoding="utf-8"))["features"]
    countries = json.loads((ROOT / "public" / "data" / "countries.json").read_text(encoding="utf-8"))
    ids = {c["id"] for c in countries}

    def iso(p):
        if p["ISO_A3"] != "-99":
            return p["ISO_A3"]
        return p["ISO_A3_EH"] if p["ISO_A3_EH"] == p["ADM0_A3"] else p["ADM0_A3"]

    fips: dict[str, list[str]] = {}
    for f in ne:
        p = f["properties"]
        i = iso(p)
        if i in ids and p["FIPS_10"] not in ("-99", None):
            fips.setdefault(i, []).append(p["FIPS_10"].lower())
    fips.update(EXTRA_FIPS)
    out, missing = {}, []
    for c in countries:
        codes = [x for x in fips.get(c["id"], []) if x in files]
        if not codes:
            missing.append(c["id"])
            continue
        rec = {"fips": codes, "files": [files[x].split("/", 1)[1] for x in codes]}
        for key, sec, field in FIELDS:
            vals = []
            for x in codes:
                d = json.loads(z.read(files[x]))
                v = d.get(sec, {}).get(field)
                if v:
                    vals.append(clean(v))
            if vals:
                rec[key] = " | ".join(vals)
        out[c["id"]] = rec
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=0), encoding="utf-8")
    print(f"bundles {len(out)} / {len(countries)}, missing {missing}")


def show(isos: list[str], short=False):
    b = json.loads(OUT.read_text(encoding="utf-8"))
    lim = {"background": 900, "econ": 500} if not short else {"background": 500, "econ": 250}
    for i in isos:
        r = b.get(i)
        if not r:
            print(i, "없음")
            continue
        print(f"## {i} ({','.join(r['fips'])})")
        for k, _, _ in FIELDS:
            if k in r:
                print(f"- {k}: {r[k][:lim.get(k, 260 if not short else 160)]}")


if __name__ == "__main__":
    if len(sys.argv) > 1:
        args = [a for a in sys.argv[1:] if a != "--short"]
        show(args, "--short" in sys.argv)
    else:
        main()

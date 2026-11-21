"""기후·자연환경 모듈 (public/data/nature.json). 정적 자료라 월간 갱신에는 넣지 않고 손으로 한 번 실행한다.

입력 (data/raw, 저장소 제외):
- Köppen-Geiger 1991–2020, 0.1° 격자 (Beck et al. 2023, Scientific Data 10:724, CC BY 4.0)
- Natural Earth 50m 국가 경계, 50m 지리 지역(산맥·사막·고원 등), 10m 강, 10m 고도 지점 (퍼블릭 도메인)

방법:
- 국가 경계를 0.1° 격자에 래스터화(PIL)하고, 칸마다 cos(위도)로 면적 가중해 기후형 비율을 낸다. 바다(0)는 뺀다.
- 칸이 30개 미만인 작은 나라는 approx=true 로 표시한다. 칸이 없으면 대표 지점 주변 칸의 기후형 하나만 쓴다.
- 산맥·사막 등은 그 지역 폴리곤의 격자 칸 가운데 이 나라에 속한 칸의 비율(지역 기준)과 나라 면적 대비 비율을 함께 계산해,
  지역의 10% 이상이 나라 안에 있거나 나라 면적의 5% 이상을 덮을 때만 싣는다.
- 강은 선을 따라 점을 찍어 나라 안에 들어온 길이(km)를 재고, 50km 이상만 싣는다.

실행: python -I pipeline/nature.py
"""
from __future__ import annotations

import json
import math
import sys
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = ROOT / "public" / "data" / "nature.json"
sys.stdout.reconfigure(encoding="utf-8")
W, H, RES = 3600, 1800, 0.1

KOPPEN = {}
for line in (RAW / "koppen" / "legend.txt").read_text(encoding="utf-8").splitlines():
    s = line.strip()
    if s[:1].isdigit() and ":" in s:
        num, rest = s.split(":", 1)
        parts = rest.split()
        KOPPEN[int(num)] = {"code": parts[0], "name_en": " ".join(parts[1:]).split("[")[0].strip()}

# Natural Earth 한국어 이름의 명백한 오기만 고친다
NAME_KO_FIX = {"치리산": "지리산"}

REGION_KO = {"Range/mtn": "산지·산맥", "Desert": "사막", "Plateau": "고원", "Plain": "평야", "Basin": "분지",
             "Delta": "삼각주", "Lowland": "저지대", "Valley": "골짜기", "Wetlands": "습지", "Tundra": "툰드라",
             "Foothills": "구릉지", "Gorge": "협곡", "Peninsula": "반도", "Pen/cape": "반도·곶", "Isthmus": "지협"}


def px(lon, lat):
    return ((lon + 180) / RES, (90 - lat) / RES)


def polys(geom):
    if geom["type"] == "Polygon":
        yield geom["coordinates"]
    elif geom["type"] == "MultiPolygon":
        yield from geom["coordinates"]


def rasterize(features, key):
    """features → (H, W) int32 격자 (0 = 없음). key(feature) → 1 이상 정수"""
    img = Image.new("I", (W, H), 0)
    d = ImageDraw.Draw(img)
    for f in features:
        k = key(f)
        if not k or not f.get("geometry"):
            continue
        for poly in polys(f["geometry"]):
            outer = [px(x, y) for x, y in poly[0]]
            if len(outer) >= 3:
                d.polygon(outer, fill=k)
            for hole in poly[1:]:
                if len(hole) >= 3:
                    d.polygon([px(x, y) for x, y in hole], fill=0)
    return np.array(img, dtype=np.int32)


def main():
    countries = json.loads((ROOT / "public" / "data" / "countries.json").read_text(encoding="utf-8"))
    ids = [c["id"] for c in countries]
    idx = {cid: i + 1 for i, cid in enumerate(ids)}
    ne = json.loads((RAW / "ne_50m_admin_0_countries.geojson").read_text(encoding="utf-8"))["features"]

    def ne_id(p):
        if p["ISO_A3"] != "-99":
            return p["ISO_A3"]
        return p["ISO_A3_EH"] if p["ISO_A3_EH"] == p["ADM0_A3"] else p["ADM0_A3"]

    label = {}
    for f in ne:
        cid = ne_id(f["properties"])
        if cid in idx:
            label[cid] = (f["properties"]["LABEL_X"], f["properties"]["LABEL_Y"])
    cgrid = rasterize(ne, lambda f: idx.get(ne_id(f["properties"])))
    kg = np.array(Image.open(RAW / "koppen" / "1991_2020" / "koppen_geiger_0p1.tif"), dtype=np.int32)
    assert kg.shape == (H, W)
    lat = 90 - (np.arange(H) + 0.5) * RES
    wrow = np.cos(np.radians(lat))[:, None] * np.ones((1, W))
    cell_km2 = (111.32 * RES) ** 2 * wrow

    out = {cid: {} for cid in ids}
    errors = []
    # ── 기후 ──
    for cid in ids:
        m = cgrid == idx[cid]
        cells = int(m.sum())
        land = m & (kg > 0)
        rec = out[cid]
        rec["cells"] = cells
        if land.sum() == 0:
            lx, ly = label.get(cid, (None, None))
            if lx is None:
                errors.append(f"{cid} 대표 지점 없음")
                continue
            x, y = int((lx + 180) / RES), int((90 - ly) / RES)
            win = kg[max(0, y - 3):y + 4, max(0, x - 3):x + 4]
            vals = Counter(int(v) for v in win.ravel() if v > 0)
            if not vals:
                rec["koppen"] = []
                rec["koppen_note"] = "격자 자료 없음"
                continue
            code = vals.most_common(1)[0][0]
            rec["koppen"] = [{"id": code, "code": KOPPEN[code]["code"], "share": None}]
            rec["approx"] = True
            continue
        w = wrow[land]
        cls = kg[land]
        tot = w.sum()
        shares = sorted(((int(k), float(w[cls == k].sum() / tot)) for k in np.unique(cls)), key=lambda t: -t[1])
        rec["koppen"] = [{"id": k, "code": KOPPEN[k]["code"], "share": round(s, 4)} for k, s in shares if s >= 0.05] or \
                        [{"id": shares[0][0], "code": KOPPEN[shares[0][0]]["code"], "share": round(shares[0][1], 4)}]
        rec["approx"] = cells < 30

    # ── 지형 지역 (산맥·사막 등) ──
    regions = json.loads((RAW / "ne_phys" / "ne_50m_geography_regions_polys.geojson").read_text(encoding="utf-8"))["features"]
    regions = [r for r in regions if r["properties"]["FEATURECLA"] in REGION_KO]
    country_area = {cid: float(cell_km2[cgrid == idx[cid]].sum()) for cid in ids}
    for i, r in enumerate(regions):
        g = rasterize([r], lambda f: 1)
        mask = g == 1
        if not mask.any():
            continue
        area = cell_km2[mask]
        tot = float(area.sum())
        owners = cgrid[mask]
        for k in np.unique(owners):
            if k == 0:
                continue
            cid = ids[k - 1]
            a = float(area[owners == k].sum())
            share_region, share_country = a / tot, (a / country_area[cid] if country_area[cid] else 0)
            if share_region >= 0.10 or share_country >= 0.05:
                p = r["properties"]
                out[cid].setdefault("landforms", []).append({
                    "name_ko": p.get("NAME_KO"), "name_en": p["NAME"].title(), "kind": p["FEATURECLA"],
                    "kind_ko": REGION_KO[p["FEATURECLA"]], "share_of_region": round(share_region, 3),
                    "share_of_country": round(share_country, 3)})
    for cid in ids:
        lf = out[cid].get("landforms", [])
        lf.sort(key=lambda x: -x["share_of_country"])
        out[cid]["landforms"] = lf[:6]

    # ── 강 ──
    rivers = json.loads((RAW / "ne_phys" / "ne_10m_rivers_lake_centerlines.geojson").read_text(encoding="utf-8"))["features"]
    rlen = defaultdict(lambda: defaultdict(float))
    for r in rivers:
        p = r["properties"]
        if p.get("featurecla") != "River" or not p.get("name") or "canal" in p["name"].lower():
            continue
        geom = r["geometry"]
        lines = [geom["coordinates"]] if geom["type"] == "LineString" else geom["coordinates"]
        for line in lines:
            for (x0, y0), (x1, y1) in zip(line, line[1:]):
                seg = math.hypot((x1 - x0) * math.cos(math.radians((y0 + y1) / 2)), y1 - y0) * 111.32
                n = max(1, int(seg / 5))
                for t in range(n):
                    x = x0 + (x1 - x0) * (t + 0.5) / n
                    y = y0 + (y1 - y0) * (t + 0.5) / n
                    col, row = int((x + 180) / RES), int((90 - y) / RES)
                    if 0 <= col < W and 0 <= row < H and cgrid[row, col]:
                        rlen[ids[cgrid[row, col] - 1]][p["name"]] += seg / n
    for cid in ids:
        rs = sorted(((n, km) for n, km in rlen[cid].items() if km >= 50), key=lambda t: -t[1])
        out[cid]["rivers"] = [{"name": n, "km_in_country": round(km)} for n, km in rs[:5]]

    # ── 높은 산 ──
    pts = json.loads((RAW / "ne_phys" / "ne_10m_geography_regions_elevation_points.geojson").read_text(encoding="utf-8"))["features"]
    peaks = defaultdict(list)
    for f in pts:
        p = f["properties"]
        if p.get("featurecla") != "mountain" or not p.get("elevation"):
            continue
        x, y = f["geometry"]["coordinates"][:2]
        col, row = int((x + 180) / RES), int((90 - y) / RES)
        k = cgrid[row, col] if 0 <= col < W and 0 <= row < H else 0
        if k:
            peaks[ids[k - 1]].append({"name_ko": NAME_KO_FIX.get(p.get("name_ko"), p.get("name_ko")), "name_en": p["name"], "elevation_m": int(p["elevation"])})
    for cid in ids:
        out[cid]["peaks"] = sorted(peaks[cid], key=lambda x: -x["elevation_m"])[:3]

    no_climate = [c for c in ids if not out[c].get("koppen")]
    approx = [c for c in ids if out[c].get("approx")]
    meta = {"koppen": "Beck et al. (2023) Köppen-Geiger 1991–2020, 0.1°, CC BY 4.0, doi:10.6084/m9.figshare.21789074",
            "koppen_classes": KOPPEN, "physical": "Natural Earth 50m geography regions, 10m rivers, 10m elevation points",
            "approx_countries": approx, "no_climate": no_climate}
    print(f"countries={len(ids)} approx={len(approx)} no_climate={no_climate} errors={errors}")
    if errors or len(no_climate) > 3:
        print("검증 실패: 기존 nature.json 유지")
        sys.exit(1)
    OUT.write_text(json.dumps({"meta": meta, "countries": out}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print("public/data/nature.json 갱신", OUT.stat().st_size // 1024, "KB")


if __name__ == "__main__":
    main()

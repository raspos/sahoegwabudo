"""링크 미리보기 이미지 (public/og.png, 1200×630).

사이트와 같은 지도책 색과 Natural Earth 투영으로 세계지도를 그리고 제목을 얹는다.
글꼴: Noto Serif KR / Noto Sans KR (SIL Open Font License). 실행: python -I pipeline/og_image.py
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "og.png"
W, H = 1200, 630
S = 2  # 2배로 그린 뒤 줄여 가장자리를 매끄럽게
PAPER, SEA, INK, ACCENT, RULE = "#F4EEDC", "#426D75", "#252D2B", "#8F4F26", "#9D9179"
SEA_LINE = "#5D8A92"
POLITICAL = ["#D9CD9A", "#BFC79A", "#E0BE8E", "#C9B08A", "#D3D2A8", "#CDB993", "#B9BE8E"]
FONT_DIR = Path("C:/Windows/Fonts")


def natural_earth(lon: float, lat: float):
    l, p = math.radians(lon), math.radians(lat)
    p2 = p * p
    p4 = p2 * p2
    x = l * (0.870700 - 0.131979 * p2 - 0.013791 * p4 + 0.003971 * p4 * p4 * p2 - 0.001529 * p4 * p4 * p4)
    y = p * (1.007226 + 0.015085 * p2 - 0.044475 * p4 * p2 + 0.028874 * p4 * p4 - 0.005916 * p4 * p4 * p2)
    return x, y


def font(name: str, size: int, weight: int):
    f = ImageFont.truetype(str(FONT_DIR / name), size * S)
    try:
        f.set_variation_by_axes([weight])
    except Exception:  # noqa: BLE001
        pass
    return f


def main():
    img = Image.new("RGB", (W * S, H * S), PAPER)
    d = ImageDraw.Draw(img)
    # 지도 배치: 오른쪽으로 치우친 큰 지도 (왼쪽에 제목)
    mx0, mw = 330, 840
    xmax, _ = natural_earth(180, 0)
    _, ymax = natural_earth(0, 90)
    k = mw / (2 * xmax)
    mh = 2 * ymax * k
    my0 = (H - mh) / 2

    def P(lon, lat):
        x, y = natural_earth(lon, lat)
        return ((mx0 + mw / 2 + x * k) * S, (my0 + mh / 2 - y * k) * S)

    sphere = [P(180, la) for la in range(-90, 91)] + [P(-180, la) for la in range(90, -91, -1)]
    d.polygon(sphere, fill=SEA)
    for lo in range(-180, 181, 30):  # 경선
        d.line([P(lo, la) for la in range(-90, 91, 2)], fill=SEA_LINE, width=S)
    for la in range(-60, 61, 30):  # 위선
        d.line([P(lo, la) for lo in range(-180, 181, 2)], fill=SEA_LINE, width=S)

    g = json.loads((ROOT / "data" / "raw" / "ne_50m_admin_0_countries.geojson").read_text(encoding="utf-8"))
    for f in g["features"]:
        p = f["properties"]
        if p["ADMIN"] == "Antarctica":
            continue
        geom = f["geometry"]
        polys = [geom["coordinates"]] if geom["type"] == "Polygon" else geom["coordinates"]
        color = POLITICAL[(p.get("MAPCOLOR7") or 1) % len(POLITICAL)]
        for poly in polys:
            ring = [P(x, y) for x, y in poly[0]]
            if len(ring) > 2:
                d.polygon(ring, fill=color, outline="#7F725B")
    d.line(sphere + [sphere[0]], fill=INK, width=2 * S)

    # 제목 상자 (지도 위에 겹치는 종이 띠)
    bx0, bx1 = 48, 560
    by0 = (H - 320) / 2
    by1 = by0 + 320
    d.rectangle([bx0 * S, by0 * S, bx1 * S, by1 * S], fill=PAPER, outline=INK, width=2 * S)
    title = font("NotoSerifKR-VF.ttf", 92, 900)
    sub = font("NotoSerifKR-VF.ttf", 30, 600)
    small = font("NotoSansKR-VF.ttf", 22, 500)
    d.text(((bx0 + 40) * S, (by0 + 34) * S), "사회과부도", font=title, fill=INK)
    d.line([((bx0 + 40) * S, (by0 + 168) * S), ((bx1 - 40) * S, (by0 + 168) * S)], fill=INK, width=2 * S)
    d.line([((bx0 + 40) * S, (by0 + 175) * S), ((bx1 - 40) * S, (by0 + 175) * S)], fill=INK, width=S)
    d.text(((bx0 + 40) * S, (by0 + 196) * S), "세계를 펼치다. 숫자로 발견하다.", font=sub, fill=ACCENT)
    d.text(((bx0 + 40) * S, (by0 + 256) * S), "세계지도 · 195개국 도감 · 세계 랭킹 · 도전하기", font=small, fill="#4A514D")

    img = img.resize((W, H), Image.LANCZOS)
    img.save(OUT, optimize=True)
    print("public/og.png", OUT.stat().st_size // 1024, "KB")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()

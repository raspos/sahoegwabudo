"""지표 정의. 코드와 정의는 World Bank 지표 메타데이터(API /v2/indicator/{code})에서 확인한 것만 쓴다.

higher_is: 랭킹 기본 정렬 방향 (desc = 큰 값이 1위).
digits: 화면 표시 소수 자리.
rank: 세계 랭킹·배틀에 쓰는지 (자료가 오래됐거나 들쭉날쭉한 지표는 도감에만 연도와 함께 보인다).
group: core(첫 12개) / economy / nature
"""

INDICATORS = [
    {"indicator_id": "population", "source_code": "SP.POP.TOTL", "name_ko": "인구", "unit": "명",
     "unit_en": "people", "sort": "desc", "digits": 0, "category": "인구"},
    {"indicator_id": "area", "source_code": "AG.LND.TOTL.K2", "name_ko": "국토 면적", "unit": "km²",
     "unit_en": "sq. km (land area)", "sort": "desc", "digits": 0, "category": "지리"},
    {"indicator_id": "density", "source_code": "EN.POP.DNST", "name_ko": "인구밀도", "unit": "명/km²",
     "unit_en": "people per sq. km of land area", "sort": "desc", "digits": 1, "category": "인구"},
    {"indicator_id": "gdp", "source_code": "NY.GDP.MKTP.CD", "name_ko": "GDP", "unit": "US달러",
     "unit_en": "current US$", "sort": "desc", "digits": 0, "category": "경제"},
    {"indicator_id": "gdp_pc", "source_code": "NY.GDP.PCAP.CD", "name_ko": "1인당 GDP", "unit": "US달러",
     "unit_en": "current US$", "sort": "desc", "digits": 0, "category": "경제"},
    {"indicator_id": "gdp_growth", "source_code": "NY.GDP.MKTP.KD.ZG", "name_ko": "경제성장률", "unit": "%",
     "unit_en": "annual %", "sort": "desc", "digits": 1, "category": "경제"},
    {"indicator_id": "inflation", "source_code": "FP.CPI.TOTL.ZG", "name_ko": "소비자물가 상승률", "unit": "%",
     "unit_en": "annual %", "sort": "desc", "digits": 1, "category": "경제"},
    {"indicator_id": "fertility", "source_code": "SP.DYN.TFRT.IN", "name_ko": "합계출산율", "unit": "명",
     "unit_en": "births per woman", "sort": "desc", "digits": 2, "category": "인구"},
    {"indicator_id": "life_exp", "source_code": "SP.DYN.LE00.IN", "name_ko": "기대수명", "unit": "세",
     "unit_en": "years", "sort": "desc", "digits": 1, "category": "인구"},
    {"indicator_id": "urban", "source_code": "SP.URB.TOTL.IN.ZS", "name_ko": "도시화율", "unit": "%",
     "unit_en": "% of total population", "sort": "desc", "digits": 1, "category": "사회"},
    {"indicator_id": "manufacturing", "source_code": "NV.IND.MANF.ZS", "name_ko": "제조업 부가가치 비중", "unit": "% (GDP 대비)",
     "unit_en": "% of GDP", "sort": "desc", "digits": 1, "category": "경제"},
    {"indicator_id": "internet", "source_code": "IT.NET.USER.ZS", "name_ko": "인터넷 이용률", "unit": "%",
     "unit_en": "% of population", "sort": "desc", "digits": 1, "category": "사회"},
    # ── PHASE 2: 경제 구조 ──
    {"indicator_id": "agri_va", "source_code": "NV.AGR.TOTL.ZS", "name_ko": "농림어업 비중", "unit": "% (GDP 대비)",
     "unit_en": "% of GDP", "sort": "desc", "digits": 1, "category": "경제", "group": "economy"},
    {"indicator_id": "industry_va", "source_code": "NV.IND.TOTL.ZS", "name_ko": "산업(광공업·건설) 비중", "unit": "% (GDP 대비)",
     "unit_en": "% of GDP", "sort": "desc", "digits": 1, "category": "경제", "group": "economy"},
    {"indicator_id": "services_va", "source_code": "NV.SRV.TOTL.ZS", "name_ko": "서비스업 비중", "unit": "% (GDP 대비)",
     "unit_en": "% of GDP", "sort": "desc", "digits": 1, "category": "경제", "group": "economy"},
    {"indicator_id": "gdp_pc_ppp", "source_code": "NY.GDP.PCAP.PP.CD", "name_ko": "1인당 GDP(구매력 기준)", "unit": "국제달러",
     "unit_en": "current international $", "sort": "desc", "digits": 0, "category": "경제", "group": "economy"},
    {"indicator_id": "exports_gdp", "source_code": "NE.EXP.GNFS.ZS", "name_ko": "수출 비율(상품·서비스)", "unit": "% (GDP 대비)",
     "unit_en": "% of GDP", "sort": "desc", "digits": 1, "category": "경제", "group": "economy"},
    {"indicator_id": "productivity", "source_code": "SL.GDP.PCAP.EM.KD", "name_ko": "취업자 1명당 GDP", "unit": "국제달러(2021년 PPP 불변)",
     "unit_en": "constant 2021 PPP $", "sort": "desc", "digits": 0, "category": "경제", "group": "economy"},
    {"indicator_id": "resource_rents", "source_code": "NY.GDP.TOTL.RT.ZS", "name_ko": "천연자원 지대", "unit": "% (GDP 대비)",
     "unit_en": "% of GDP", "sort": "desc", "digits": 1, "category": "경제", "group": "economy", "rank": False},
    {"indicator_id": "tourism_exports", "source_code": "ST.INT.RCPT.XP.ZS", "name_ko": "관광 수입 비중(수출 대비)", "unit": "% (총수출 대비)",
     "unit_en": "% of total exports", "sort": "desc", "digits": 1, "category": "경제", "group": "economy", "rank": False},
    # ── PHASE 2: 자연환경 ──
    {"indicator_id": "forest", "source_code": "AG.LND.FRST.ZS", "name_ko": "산림 비율", "unit": "% (육지 면적 대비)",
     "unit_en": "% of land area", "sort": "desc", "digits": 1, "category": "지리", "group": "nature"},
    {"indicator_id": "arable", "source_code": "AG.LND.ARBL.ZS", "name_ko": "경작지 비율", "unit": "% (육지 면적 대비)",
     "unit_en": "% of land area", "sort": "desc", "digits": 1, "category": "지리", "group": "nature"},
]

for _i in INDICATORS:
    _i.setdefault("rank", True)
    _i.setdefault("group", "core")

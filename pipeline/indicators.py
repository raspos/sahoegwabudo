"""지표 정의. 코드와 정의는 World Bank 지표 메타데이터(API /v2/indicator/{code})에서 확인한 것만 쓴다.

higher_is: 랭킹 기본 정렬 방향 (desc = 큰 값이 1위).
digits: 화면 표시 소수 자리.
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
]

import { geoGraticule10, geoNaturalEarth1, geoPath, type GeoProjection } from 'd3-geo';
import { feature } from 'topojson-client';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import type { ContinentId } from '../data/types';

export const MAP_W = 1000;
export const MAP_H = 520;

export interface MapProps {
  id: string;            // ISO3 (목록 외 지역은 Natural Earth ADM0_A3)
  listed: boolean;       // 195개국 기본 목록에 포함되는지
  ne_name_ko: string;
  ne_name_en: string;
  sovereign: string;
  type: string;
  lx: number;
  ly: number;
  tiny: number;
  mc?: number;          // Natural Earth MAPCOLOR7
}

export interface MapShape {
  id: string;
  props: MapProps;
  d: string;
  bounds: [[number, number], [number, number]];
  label: [number, number];
  /** 기본 배율에서 화면상 넓이가 매우 작아 클릭하기 어려운 나라 */
  small: boolean;
}

export interface Geo {
  projection: GeoProjection;
  shapes: MapShape[];
  byId: Map<string, MapShape>;
  sphere: string;
  graticule: string;
}

let cache: Promise<Geo> | null = null;

export function loadGeo(base: string): Promise<Geo> {
  if (!cache) {
    cache = fetch(`${base}data/world.topo.json`)
      .then((r) => r.json())
      .then((topo) => {
        const key = Object.keys(topo.objects)[0];
        const fc = feature(topo, topo.objects[key]) as unknown as FeatureCollection<Geometry, MapProps>;
        return buildGeo(fc.features);
      });
  }
  return cache;
}

export function buildGeo(features: Feature<Geometry, MapProps>[]): Geo {
  const projection = geoNaturalEarth1().fitExtent([[8, 8], [MAP_W - 8, MAP_H - 8]], { type: 'Sphere' });
  const path = geoPath(projection);
  const shapes: MapShape[] = [];
  for (const f of features) {
    if (!f.geometry) continue;
    const d = path(f) ?? '';
    const b = path.bounds(f) as [[number, number], [number, number]];
    const area = path.area(f);
    const p = projection([f.properties.lx, f.properties.ly]) ?? path.centroid(f);
    shapes.push({
      id: f.properties.id,
      props: f.properties,
      d,
      bounds: b,
      label: p as [number, number],
      small: area < 6 || (b[1][0] - b[0][0]) * (b[1][1] - b[0][1]) < 9,
    });
  }
  return {
    projection,
    shapes,
    byId: new Map(shapes.filter((s) => s.props.listed).map((s) => [s.id, s])),
    sphere: path({ type: 'Sphere' }) ?? '',
    graticule: path(geoGraticule10()) ?? '',
  };
}

/** 대륙별 이동 범위 (경도·위도). 해외 영토 때문에 국가 경계로 계산하면 범위가 왜곡되므로 고정값을 쓴다. */
export const CONTINENT_VIEW: Record<ContinentId, [[number, number], [number, number]]> = {
  asia: [[25, -11], [150, 56]],
  europe: [[-25, 34], [45, 71]],
  africa: [[-20, -36], [55, 38]],
  north_america: [[-170, 6], [-52, 72]],
  south_america: [[-85, -56], [-33, 13]],
  oceania: [[110, -48], [180, 2]],
};

export const OCEAN_LABELS: { name: string; lon: number; lat: number }[] = [
  { name: '태 평 양', lon: -140, lat: 8 },
  { name: '대 서 양', lon: -38, lat: 22 },
  { name: '인 도 양', lon: 78, lat: -22 },
  { name: '북 극 해', lon: 10, lat: 80 },
  { name: '남 극 해', lon: 40, lat: -62 },
];

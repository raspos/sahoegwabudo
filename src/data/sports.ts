import { useEffect, useState } from 'react';

/** pipeline/sports.py 가 만드는 public/data/sports.json */
export interface FifaRow { rank: number; points: number; prev: number; of: number; conf: string; team?: string }
export interface Medals { games?: number; g: number; s: number; b: number; t: number; rank?: number }
export interface NationalSport { sport_en: string; sport_ko: string; official: boolean; year?: number; law?: string; region?: string; region_ko?: string }
export interface SportsCountry {
  fifa_m?: FifaRow; fifa_w?: FifaRow; fifa_m_uk?: FifaRow[]; fifa_w_uk?: FifaRow[];
  ol?: { summer: Medals; winter: Medals; total: Medals };
  ol2024?: Medals; ol2026?: Medals;
  national?: NationalSport[];
}
export interface SportsData {
  meta: {
    retrieved_at: string;
    fifa: Record<'fifa_m' | 'fifa_w', { date: string; teams: number; url: string; not_ranked: string[] }>;
    olympics: { url: string; recent: Record<'ol2024' | 'ol2026', { label: string; url: string; nocs: number }>; not_listed: string[] };
    national: { url: string };
  };
  countries: Record<string, SportsCountry>;
}

let cache: Promise<SportsData | null> | null = null;
export function loadSports(base = import.meta.env.BASE_URL): Promise<SportsData | null> {
  if (!cache) cache = fetch(`${base}data/sports.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  return cache;
}
export function useSports(): SportsData | null | undefined {
  const [d, setD] = useState<SportsData | null | undefined>(undefined);
  useEffect(() => { let on = true; loadSports().then((x) => on && setD(x)); return () => { on = false; }; }, []);
  return d;
}

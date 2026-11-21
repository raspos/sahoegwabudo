import type { ReactNode } from 'react';
import './graphics.css';
import type { Geo } from '../map/geo';
import type { Campaign } from './types';
import { useDelta } from './ExAnim';

/** 캠페인에서 조사원이 머무는 나라들(임무 장소). 발견 임무의 정답(target)은 넣지 않는다. */
export function campaignStations(c: Campaign): string[] {
  const out: string[] = [c.startLocation];
  for (const n of Object.values(c.nodes)) {
    const k = (n as { country?: string }).country;
    if (k && !out.includes(k)) out.push(k);
  }
  return out;
}

type Box = [number, number, number, number];
function boxOf(geo: Geo, ids: string[], pad: number, ratio: number): Box {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const id of ids) {
    const s = geo.byId.get(id);
    if (!s) continue;
    // 해외 영토가 있는 나라는 경계 대신 이름 자리 주변만 쓴다
    const [[a, b], [c, d]] = s.bounds;
    const big = c - a > 120 || d - b > 80;
    const [lx, ly] = s.label;
    const bb: Box = big ? [lx - 20, ly - 14, lx + 20, ly + 14] : [a, b, c, d];
    x0 = Math.min(x0, bb[0]); y0 = Math.min(y0, bb[1]); x1 = Math.max(x1, bb[2]); y1 = Math.max(y1, bb[3]);
  }
  if (!isFinite(x0)) return [0, 0, 1000, 520];
  x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
  let w = x1 - x0, h = y1 - y0;
  if (w / h < ratio) { const nw = h * ratio; x0 -= (nw - w) / 2; w = nw; } else { const nh = w / ratio; y0 -= (nh - h) / 2; h = nh; }
  return [x0, y0, w, h];
}

export interface Track { ids: string[]; color: string; dashed?: boolean; numbered?: boolean; line?: boolean }

/** 작은 지도: 지정한 나라들 주변만 잘라 보여 주고, 경로를 선과 번호로 잇는다 */
export function MiniMap({ geo, focus, tracks = [], marks = {}, current, pad = 18, ratio = 1.6, className, label, children, fit = 'slice' }: {
  geo: Geo; focus: string[]; tracks?: Track[]; marks?: Record<string, string>; current?: string; pad?: number; ratio?: number; fit?: 'slice' | 'meet';
  className?: string; label: string; children?: ReactNode;
}) {
  const [x, y, w, h] = boxOf(geo, focus, pad, ratio);
  const k = w / 300; // 선 굵기·글자 크기를 그림 크기에 맞춘다
  const pt = (id: string) => geo.byId.get(id)?.label;
  return (
    <svg className={`minimap ${className ?? ''}`} viewBox={`${x} ${y} ${w} ${h}`} role="img" aria-label={label} preserveAspectRatio={`xMidYMid ${fit}`}>
      <rect x={x} y={y} width={w} height={h} className="mm-sea" />
      {geo.shapes.map((s) => {
        const [[a, b], [c, d]] = s.bounds;
        if (c < x || a > x + w || d < y || b > y + h) return null;
        return <path key={s.id + s.props.ne_name_en} d={s.d} className={`mm-land ${marks[s.id] ?? ''} ${s.id === current ? 'mm-here' : ''}`} style={{ strokeWidth: 0.6 * k }} />;
      })}
      {tracks.map((t, ti) => {
        const pts = t.ids.map(pt).filter(Boolean) as [number, number][];
        return (
          <g key={ti}>
            {t.line !== false && <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke={t.color} strokeWidth={2.2 * k} strokeDasharray={t.dashed ? `${5 * k} ${3.5 * k}` : undefined} strokeLinecap="round" strokeLinejoin="round" />}
            {pts.map((p, i) => (
              <g key={i}>
                <circle cx={p[0]} cy={p[1]} r={(t.numbered ? 7 : 3.6) * k} fill={i === 0 ? '#fffaf0' : t.color} stroke={t.color} strokeWidth={1.6 * k} />
                {t.numbered && <text x={p[0]} y={p[1] + 3.2 * k} textAnchor="middle" fontSize={9 * k} fontWeight={700} fill={i === 0 ? t.color : '#fffaf0'}>{i + 1}</text>}
              </g>
            ))}
          </g>
        );
      })}
      {current && pt(current) && (
        <g className="mm-pin" transform={`translate(${pt(current)![0]} ${pt(current)![1]}) scale(${k})`}>
          <circle r={12} className="mm-pulse" />
          <path d="M0 0 C-7 -9 -7 -18 0 -20 C7 -18 7 -9 0 0Z" fill="#b8462f" stroke="#fffaf0" strokeWidth={1.4} />
          <circle cy={-13.5} r={3} fill="#fffaf0" />
        </g>
      )}
      {children}
    </svg>
  );
}

/** 자원 막대 (자금·일정). 처음 값 대비 남은 몫 */
export function Meter({ icon, label, value, max, unit = '' }: { icon: ReactNode; label: string; value: number; max: number; unit?: string }) {
  const r = Math.max(0, Math.min(1, value / (max || 1)));
  const d = useDelta(value);
  return (
    <span key={d?.key} className={`meter ${r < 0.25 ? 'low' : ''} ${d ? 'bump' : ''}`} title={`${label} (가상) ${value}${unit} / 처음 ${max}${unit}`}>
      {d && <span className={`delta ${d.n > 0 ? 'plus' : 'minus'}`} aria-hidden>{d.n > 0 ? '+' : ''}{d.n}</span>}
      <span className="meter-ico" aria-hidden>{icon}</span>
      <span className="meter-lab">{label}</span>
      <span className="meter-bar"><i style={{ width: `${r * 100}%` }} /></span>
      <b>{value}{unit}</b>
    </span>
  );
}

const G = (d: ReactNode) => <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">{d}</svg>;
export const ICON: Record<string, ReactNode> = {
  funds: G(<><ellipse cx="12" cy="7" rx="7" ry="3" /><path d="M5 7v5c0 1.7 3.1 3 7 3s7-1.3 7-3V7" /><path d="M5 12v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5" /></>),
  days: G(<><rect x="3.5" y="5" width="17" height="15" rx="1.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>),
  ok: G(<><circle cx="12" cy="12" r="8.5" /><path d="m8 12.5 2.8 2.8L16.5 9.5" /></>),
  pin: G(<><path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.3" /></>),
  discover: G(<><circle cx="10.5" cy="10.5" r="6" /><path d="m15 15 5.5 5.5" /><path d="M10.5 7.5v6M7.5 10.5h6" /></>),
  economy: G(<><path d="M4 20V10M10 20V5M16 20v-8M22 20H2" /></>),
  route: G(<><circle cx="5" cy="18" r="2" /><circle cx="19" cy="6" r="2" /><path d="M7 18h6a3 3 0 0 0 0-6h-2a3 3 0 0 1 0-6h6" /></>),
  compare: G(<><path d="M12 4v16M5 8l-3 6h6zM19 8l-3 6h6zM5 8h14" /></>),
  rank: G(<><path d="M4 20V13h5v7M9.5 20V8h5v12M15 20v-9h5v9" /></>),
  decide: G(<><path d="M12 21V11M12 11 6 5M12 11l6-6M6 5H3.5M6 5V2.5M18 5h2.5M18 5V2.5" /></>),
  report: G(<><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5M10 13h6M10 17h6" /></>),
  event: G(<><path d="M12 3 2.5 20h19z" /><path d="M12 10v4.5M12 17.2v.3" /></>),
  ending: G(<><path d="M5 21V4M5 4h11l-2 4 2 4H5" /></>),
  story: G(<><path d="M4 5c3-1 5.5-1 8 1 2.5-2 5-2 8-1v14c-3-1-5.5-1-8 1-2.5-2-5-2-8-1z" /><path d="M12 6v14" /></>),
};

/** 탐험 본부 머리 그림: 나침반 */
export function Compass({ size = 92 }: { size?: number }) {
  return (
    <svg className="compass" width={size} height={size} viewBox="-50 -50 100 100" aria-hidden>
      <circle r="46" fill="#fffaf0" stroke="#3a2e22" strokeWidth="1.5" />
      <circle r="40" fill="none" stroke="#3a2e22" strokeWidth=".6" strokeDasharray="1.5 2.6" />
      {Array.from({ length: 16 }, (_, i) => <line key={i} x1="0" y1="-46" x2="0" y2={i % 4 ? -42 : -38} stroke="#3a2e22" strokeWidth={i % 4 ? 0.6 : 1.2} transform={`rotate(${i * 22.5})`} />)}
      <path d="M0 -34 L6 0 L0 34 L-6 0Z" fill="#3a2e22" transform="rotate(45)" opacity=".35" />
      <path d="M0 -34 L6 0 L0 34 L-6 0Z" fill="#3a2e22" transform="rotate(-45)" opacity=".35" />
      <path d="M0 -36 L7 0 L-7 0Z" fill="#b8462f" />
      <path d="M0 36 L7 0 L-7 0Z" fill="#3a2e22" />
      <path d="M-36 0 L0 -6 L0 6Z M36 0 L0 -6 L0 6Z" fill="#7d6a52" />
      <circle r="3" fill="#fffaf0" stroke="#3a2e22" />
      {(['N', 'E', 'S', 'W'] as const).map((t, i) => <text key={t} x={[0, 30, 0, -30][i]} y={[-24, 4, 30, 4][i]} textAnchor="middle" fontSize="9" fontWeight="700" fill="#3a2e22" fontFamily="serif">{t}</text>)}
    </svg>
  );
}

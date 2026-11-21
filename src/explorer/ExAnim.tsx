import { useEffect, useRef, useState } from 'react';
import './anim.css';
import type { Geo } from '../map/geo';
import { Flag } from '../components/common';
import type { Dataset } from '../data/engine';

const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** 이동 장면: 두 나라 사이 곡선이 그려지고 비행기가 날아간다 (누르면 건너뜀) */
export function TravelAnim({ geo, ds, from, to, cost, onDone }: {
  geo: Geo; ds: Dataset; from: string; to: string; cost: { funds: number; days: number }; onDone: () => void;
}) {
  useEffect(() => { const t = setTimeout(onDone, reduced() ? 600 : 2300); return () => clearTimeout(t); }, [onDone]);
  const a = geo.byId.get(from)?.label, b = geo.byId.get(to)?.label;
  const A = ds.country(from), B = ds.country(to);
  if (!a || !b || !A || !B) return null;
  // 두 점을 감싸는 화면
  const pad = Math.max(40, Math.hypot(b[0] - a[0], b[1] - a[1]) * 0.45);
  const x0 = Math.min(a[0], b[0]) - pad, y0 = Math.min(a[1], b[1]) - pad;
  let w = Math.abs(b[0] - a[0]) + pad * 2, h = Math.abs(b[1] - a[1]) + pad * 2;
  if (w / h < 1.7) w = h * 1.7; else h = w / 1.7;
  const cx = (a[0] + b[0]) / 2, cy = (a[1] + b[1]) / 2;
  const vx = cx - w / 2, vy = cy - h / 2;
  const dist = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const mid: [number, number] = [cx, cy - dist * 0.35];          // 위로 부푼 곡선
  const d = `M${a[0]},${a[1]} Q${mid[0]},${mid[1]} ${b[0]},${b[1]}`;
  const k = w / 300;
  void x0; void y0;
  return (
    <div className="travel" role="dialog" aria-label={`${A.name_ko}에서 ${B.name_ko}(으)로 이동`} onClick={onDone}>
      <div className="travel-card">
        <svg viewBox={`${vx} ${vy} ${w} ${h}`} preserveAspectRatio="xMidYMid slice" className="travel-map" aria-hidden>
          <rect x={vx} y={vy} width={w} height={h} className="mm-sea" />
          {geo.shapes.map((s) => {
            const [[p, q], [r, t]] = s.bounds;
            if (r < vx || p > vx + w || t < vy || q > vy + h) return null;
            return <path key={s.id + s.props.ne_name_en} d={s.d} className={`mm-land ${s.id === from ? 'mm-visited' : s.id === to ? 'mm-on' : ''}`} style={{ strokeWidth: 0.6 * k }} />;
          })}
          <path d={d} className="travel-arc" fill="none" style={{ strokeWidth: 2.4 * k, strokeDasharray: `${5 * k} ${4 * k}` }} />
          <path d={d} className="travel-arc-draw" fill="none" pathLength={1} style={{ strokeWidth: 2.4 * k }} />
          <circle cx={a[0]} cy={a[1]} r={4 * k} className="travel-dot" />
          <circle cx={b[0]} cy={b[1]} r={5 * k} className="travel-dot to" />
          <g className="travel-plane">
            <g transform={`scale(${k * 0.9})`}>
              <path d="M-10 0 L10 0 M4 0 L-2 -8 L1 -8 L8 0 L1 8 L-2 8 L4 0 M-8 0 L-11 -4 L-9 -4 L-6 0 L-9 4 L-11 4 Z" fill="#fffaf0" stroke="#3a2e22" strokeWidth={1.3} strokeLinejoin="round" />
            </g>
            {!reduced() && <animateMotion dur="1.7s" fill="freeze" rotate="auto" path={d} keyPoints="0;1" keyTimes="0;1" calcMode="spline" keySplines="0.45 0 0.35 1" />}
          </g>
        </svg>
        <p className="travel-text">
          <span><Flag iso2={A.iso2} size="sm" /> {A.name_ko}</span>
          <span className="travel-arrow">→</span>
          <span><Flag iso2={B.iso2} size="sm" /> <b>{B.name_ko}</b></span>
        </p>
        {(cost.funds !== 0 || cost.days !== 0) && <p className="travel-cost">자금 {cost.funds} · {cost.days}일</p>}
        <p className="travel-skip">누르면 건너뜁니다</p>
      </div>
    </div>
  );
}

/** 숫자가 바뀌면 +/- 가 떠오른다 */
export function useDelta(value: number) {
  const prev = useRef(value);
  const [d, setD] = useState<{ n: number; key: number } | null>(null);
  useEffect(() => {
    if (value !== prev.current) { setD({ n: value - prev.current, key: Date.now() }); prev.current = value; }
  }, [value]);
  return d;
}

/** 결과 도장 */
export function Stamp({ outcome }: { outcome?: 'success' | 'partial' | 'fail' }) {
  if (!outcome) return null;
  const t = { success: '성공', partial: '절반 성공', fail: '실패' }[outcome];
  return <span className={`stamp-big o-${outcome}`} aria-hidden>{t}</span>;
}

/** 축하 종이 조각 (최우수 결말) */
export function Confetti() {
  if (reduced()) return null;
  const colors = ['#b8462f', '#2f6f8f', '#e7c35a', '#5f8a5a', '#8a3e2a', '#a9cbd8'];
  return (
    <div className="confetti" aria-hidden>
      {Array.from({ length: 36 }, (_, i) => (
        <i key={i} style={{ left: `${(i * 37) % 100}%`, background: colors[i % colors.length], animationDelay: `${(i % 9) * 0.12}s`, animationDuration: `${2.2 + (i % 5) * 0.35}s`, transform: `rotate(${i * 23}deg)` }} />
      ))}
    </div>
  );
}

import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode } from 'react';
import { select } from 'd3-selection';
import 'd3-transition';
import { zoom as d3zoom, zoomIdentity, type ZoomBehavior } from 'd3-zoom';
import { CONTINENT_VIEW, MAP_H, MAP_W, OCEAN_LABELS, type Geo, type MapShape } from './geo';
import type { ContinentId } from '../data/types';

export interface WorldMapHandle {
  zoomToCountry: (id: string) => void;
  zoomToContinent: (c: ContinentId) => void;
  reset: () => void;
  zoomBy: (f: number) => void;
}

interface Props {
  geo: Geo;
  fillFor: (s: MapShape) => string;
  /** 추가 CSS 클래스 (정답·오답·방문 등) */
  classFor?: (s: MapShape) => string | undefined;
  selected?: string | null;
  onSelect?: (id: string) => void;
  tooltip?: (s: MapShape) => ReactNode;
  /** 지도 위 국가명 표시. undefined 를 돌려주면 표시하지 않는다 */
  labelFor?: (s: MapShape) => string | undefined;
  ariaLabel: string;
  /** 키보드로 나라를 옮겨 다닐 때 이름을 읽어 줄지 (게임에서는 false) */
  announce?: (s: MapShape) => string;
  className?: string;
  legendSlot?: ReactNode;
}

interface Frame { x: number; y: number; w: number; h: number }
const BASE_FRAME: Frame = { x: 0, y: 0, w: MAP_W, h: MAP_H };

/** SVG 좌표 틀을 화면 비율에 맞춘다. 지도(1000×520)는 가운데에 두고 남는 쪽으로 틀을 넓힌다 */
function frameOf(svg: SVGSVGElement | null): Frame {
  const cw = svg?.clientWidth ?? 0, ch = svg?.clientHeight ?? 0;
  if (!cw || !ch) return BASE_FRAME;
  const r = ch / cw;
  if (r > MAP_H / MAP_W) { const h = MAP_W * r; return { x: 0, y: (MAP_H - h) / 2, w: MAP_W, h }; }
  const w = MAP_H / r;
  return { x: (MAP_W - w) / 2, y: 0, w, h: MAP_H };
}

/** 세로로 긴 화면(휴대전화)에서는 지도가 높이를 채우도록 확대해 유라시아 쪽을 중심으로 시작한다 */
function homeTransform(f: Frame, geo: Geo) {
  if (f.h / f.w < 0.85) return zoomIdentity;
  const k = Math.min(3.2, f.h / (MAP_H - 16));
  const c = geo.projection([88, 0]) ?? [MAP_W / 2, MAP_H / 2];
  return zoomIdentity.translate(f.x + f.w / 2 - k * c[0], f.y + f.h / 2 - k * c[1]).scale(k);
}

function configure(z: ZoomBehavior<SVGSVGElement, unknown>, f: Frame) {
  z.extent([[f.x, f.y], [f.x + f.w, f.y + f.h]])
    .translateExtent([[Math.min(f.x, -40), Math.min(f.y, -20)], [Math.max(f.x + f.w, MAP_W + 40), Math.max(f.y + f.h, MAP_H + 20)]]);
}

const reduceMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const Shapes = memo(function Shapes({ shapes, fills, classes, selected }: {
  shapes: MapShape[]; fills: string[]; classes: (string | undefined)[]; selected?: string | null;
}) {
  return (
    <>
      {shapes.map((s, i) => (
        <path
          key={s.id + i}
          d={s.d}
          data-id={s.id}
          data-listed={s.props.listed ? '1' : '0'}
          fill={fills[i]}
          className={`land${s.props.listed ? '' : ' unlisted'}${s.id === selected ? ' is-selected' : ''}${classes[i] ? ' ' + classes[i] : ''}`}
        />
      ))}
    </>
  );
});

export const WorldMap = forwardRef<WorldMapHandle, Props>(function WorldMap(
  { geo, fillFor, classFor, selected, onSelect, tooltip, labelFor, ariaLabel, announce, className, legendSlot }, ref,
) {
  const svgRef = useRef<SVGSVGElement>(null);
  const gRef = useRef<SVGGElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown>>();
  const kRef = useRef(1);
  const frameRef = useRef<Frame>(BASE_FRAME);
  const [frame, setFrame] = useState<Frame>(BASE_FRAME);
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null);
  const [kbId, setKbId] = useState<string | null>(null);
  const [liveMsg, setLiveMsg] = useState('');

  const fills = useMemo(() => geo.shapes.map(fillFor), [geo, fillFor]);
  const classes = useMemo(() => geo.shapes.map((s) => classFor?.(s)), [geo, classFor]);
  const markers = useMemo(() => geo.shapes.filter((s) => s.small && s.props.listed), [geo]);
  const labels = useMemo(
    () => (labelFor ? geo.shapes.map((s) => ({ s, text: labelFor(s) })).filter((x) => x.text) as { s: MapShape; text: string }[] : []),
    [geo, labelFor],
  );

  const applyScale = useCallback((k: number) => {
    const g = gRef.current;
    if (!g) return;
    const svg = svgRef.current;
    // 화면 1px 당 viewBox 단위: 글자 크기를 화면 기준으로 일정하게 유지한다
    const sc = svg && svg.clientWidth ? Math.max(0.2, svg.clientWidth / frameRef.current.w) : 1;
    g.querySelectorAll<SVGCircleElement>('circle.mk').forEach((c) => c.setAttribute('r', String(3.3 / (sc * Math.pow(k, 0.85)))));
    g.querySelectorAll<SVGCircleElement>('circle.mk-hit').forEach((c) => c.setAttribute('r', String(9 / (sc * k))));
    g.querySelectorAll<SVGTextElement>('text.clabel').forEach((t) => {
      const w = Number(t.dataset.w), h = Number(t.dataset.h), len = Number(t.dataset.len);
      const fs = 12.5 / (k * sc);
      t.setAttribute('font-size', String(fs));
      t.setAttribute('stroke-width', String(2.6 / (k * sc)));
      const show = w * k * sc > len * 13 + 8 && h * k * sc > 15;
      t.style.display = show ? '' : 'none';
    });
    g.querySelectorAll<SVGTextElement>('text.ocean').forEach((t) => t.setAttribute('font-size', String(14 / (sc * Math.max(1, k * 0.6)))));
  }, []);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const z = d3zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, 60])
      .clickDistance(5)
      .on('zoom', (e) => {
        gRef.current?.setAttribute('transform', e.transform.toString());
        kRef.current = e.transform.k;
        applyScale(e.transform.k);
      });
    zoomRef.current = z;
    const f = frameOf(svg);
    frameRef.current = f;
    setFrame(f);
    configure(z, f);
    select(svg).call(z).on('dblclick.zoom', null);
    select(svg).call(z.transform, homeTransform(f, geo));
    applyScale(kRef.current);
    return () => { select(svg).on('.zoom', null); };
  }, [applyScale, geo]);

  useEffect(() => applyScale(kRef.current), [labels, markers, applyScale]);
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      const f = frameOf(svg);
      const old = frameRef.current;
      if (Math.abs(f.w - old.w) > 0.5 || Math.abs(f.h - old.h) > 0.5) {
        frameRef.current = f;
        setFrame(f);
        if (zoomRef.current) configure(zoomRef.current, f);
      }
      applyScale(kRef.current);
    });
    ro.observe(svg);
    return () => ro.disconnect();
  }, [applyScale]);

  const goBounds = useCallback((b: [[number, number], [number, number]], maxK = 12) => {
    const svg = svgRef.current, z = zoomRef.current;
    if (!svg || !z) return;
    const [[x0, y0], [x1, y1]] = b;
    const f = frameRef.current;
    const k = Math.max(1, Math.min(maxK, 0.82 / Math.max((x1 - x0) / f.w, (y1 - y0) / f.h)));
    const t = zoomIdentity.translate(f.x + f.w / 2 - k * (x0 + x1) / 2, f.y + f.h / 2 - k * (y0 + y1) / 2).scale(k);
    select(svg).transition().duration(reduceMotion() ? 0 : 550).call(z.transform, t);
  }, []);

  useImperativeHandle(ref, () => ({
    zoomToCountry(id) {
      const s = geo.byId.get(id);
      if (!s) return;
      const [[x0, y0], [x1, y1]] = s.bounds;
      const wide = x1 - x0 > MAP_W * 0.55; // 날짜변경선을 걸친 나라 (피지·키리바시 등)
      if (wide && id !== 'RUS') {
        const [cx, cy] = s.label;
        goBounds([[cx - 30, cy - 18], [cx + 30, cy + 18]]);
      } else {
        // 작은 나라도 주변 나라가 함께 보이도록 최소 범위를 둔다
        const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
        const hw = Math.max((x1 - x0) * 0.65, 34), hh = Math.max((y1 - y0) * 0.65, 20);
        goBounds([[cx - hw, cy - hh], [cx + hw, cy + hh]], 14);
      }
    },
    zoomToContinent(c) {
      const [[lo0, la0], [lo1, la1]] = CONTINENT_VIEW[c];
      const a = geo.projection([lo0, la1])!, b2 = geo.projection([lo1, la0])!;
      const a2 = geo.projection([lo0, la0])!, b3 = geo.projection([lo1, la1])!;
      goBounds([[Math.min(a[0], a2[0]), Math.min(a[1], b3[1])], [Math.max(b2[0], b3[0]), Math.max(a2[1], b2[1])]]);
    },
    reset() {
      const svg = svgRef.current, z = zoomRef.current;
      if (svg && z) select(svg).transition().duration(reduceMotion() ? 0 : 450).call(z.transform, homeTransform(frameRef.current, geo));
    },
    zoomBy(f) {
      const svg = svgRef.current, z = zoomRef.current;
      if (svg && z) select(svg).transition().duration(reduceMotion() ? 0 : 250).call(z.scaleBy, f);
    },
  }), [geo, goBounds]);

  const idFromEvent = (e: React.PointerEvent | React.MouseEvent) => {
    const el = (e.target as Element).closest('[data-id]') as SVGElement | null;
    if (!el || el.dataset.listed !== '1') return el ? { id: el.dataset.id!, listed: false } : null;
    return { id: el.dataset.id!, listed: true };
  };

  const onMove = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return;
    const hit = idFromEvent(e);
    const wrap = wrapRef.current?.getBoundingClientRect();
    if (!hit || !wrap) return setHover(null);
    setHover({ id: hit.id, x: e.clientX - wrap.left, y: e.clientY - wrap.top });
  };

  const onClick = (e: React.MouseEvent) => {
    const hit = idFromEvent(e);
    if (hit?.listed) onSelect?.(hit.id);
  };

  // 키보드 탐색: ←/→ 로 화면에 보이는 나라를 서쪽→동쪽 순으로, Enter 로 선택
  const kbOrder = useMemo(
    () => geo.shapes.filter((s) => s.props.listed).sort((a, b) => a.label[0] - b.label[0] || a.label[1] - b.label[1]),
    [geo],
  );
  const onKey = (e: React.KeyboardEvent) => {
    const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', ' ', 'Escape', '+', '=', '-'];
    if (!keys.includes(e.key)) return;
    e.preventDefault();
    if (e.key === '+' || e.key === '=') return zoomRef.current && select(svgRef.current!).call(zoomRef.current.scaleBy, 1.6);
    if (e.key === '-') return zoomRef.current && select(svgRef.current!).call(zoomRef.current.scaleBy, 1 / 1.6);
    if (e.key === 'Escape') return setKbId(null);
    if (e.key === 'Enter' || e.key === ' ') {
      if (kbId) onSelect?.(kbId);
      return;
    }
    const svg = svgRef.current!;
    const t = (svg as unknown as { __zoom?: { k: number; x: number; y: number } }).__zoom ?? { k: 1, x: 0, y: 0 };
    const visible = kbOrder.filter((s) => {
      const x = s.label[0] * t.k + t.x, y = s.label[1] * t.k + t.y;
      const f = frameRef.current;
      return x >= f.x && x <= f.x + f.w && y >= f.y && y <= f.y + f.h;
    });
    const list = visible.length ? visible : kbOrder;
    let idx = list.findIndex((s) => s.id === kbId);
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      // 위·아래: 가까운 경도 범위에서 북쪽/남쪽 나라
      const cur = list[idx] ?? list[0];
      const dir = e.key === 'ArrowUp' ? -1 : 1;
      const cand = list
        .filter((s) => (s.label[1] - cur.label[1]) * dir > 2)
        .sort((a, b) => Math.hypot(a.label[0] - cur.label[0], (a.label[1] - cur.label[1]) * 0.6) - Math.hypot(b.label[0] - cur.label[0], (b.label[1] - cur.label[1]) * 0.6));
      idx = cand.length ? list.indexOf(cand[0]) : idx;
    } else {
      idx = idx < 0 ? 0 : (idx + (e.key === 'ArrowRight' ? 1 : -1) + list.length) % list.length;
    }
    const next = list[Math.max(0, idx)];
    setKbId(next.id);
    if (announce) setLiveMsg(announce(next));
  };

  const hovered = hover ? geo.shapes.find((s) => s.id === hover.id) : undefined;
  const tipContent = hovered && tooltip ? tooltip(hovered) : null;
  const kbShape = kbId ? geo.byId.get(kbId) : undefined;
  const wrapW = wrapRef.current?.clientWidth ?? 0;

  return (
    <div className={`worldmap ${className ?? ''}`} ref={wrapRef}>
      <svg
        ref={svgRef}
        viewBox={`${frame.x} ${frame.y} ${frame.w} ${frame.h}`}
        preserveAspectRatio="xMidYMid meet"
        role="application"
        aria-label={ariaLabel}
        aria-roledescription="세계지도"
        tabIndex={0}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        onClick={onClick}
        onKeyDown={onKey}
      >
        <defs>
          <pattern id="nodata" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="5" height="5" fill="var(--nodata-bg)" />
            <line x1="0" y1="0" x2="0" y2="5" stroke="var(--nodata-line)" strokeWidth="1.6" />
          </pattern>
        </defs>
        <rect x={frame.x} y={frame.y} width={frame.w} height={frame.h} fill="var(--paper)" />
        <g ref={gRef}>
          <path d={geo.sphere} className="sphere" />
          <path d={geo.graticule} className="graticule" />
          {OCEAN_LABELS.map((o) => {
            const p = geo.projection([o.lon, o.lat]);
            return p ? <text key={o.name} className="ocean" x={p[0]} y={p[1]} textAnchor="middle">{o.name}</text> : null;
          })}
          <Shapes shapes={geo.shapes} fills={fills} classes={classes} selected={selected} />
          {kbShape && <path d={kbShape.d} className="kb-focus" />}
          {selected && geo.byId.get(selected) && <path d={geo.byId.get(selected)!.d} className="sel-outline" />}
          {labels.map(({ s, text }) => (
            <text
              key={'l' + s.id}
              className="clabel"
              x={s.label[0]}
              y={s.label[1]}
              textAnchor="middle"
              dominantBaseline="middle"
              data-w={s.bounds[1][0] - s.bounds[0][0]}
              data-h={s.bounds[1][1] - s.bounds[0][1]}
              data-len={text.length}
            >{text}</text>
          ))}
          {markers.map((s) => (
            <g key={'m' + s.id} data-id={s.id} data-listed="1" className={`marker${s.id === selected ? ' is-selected' : ''}${classes[geo.shapes.indexOf(s)] ? ' ' + classes[geo.shapes.indexOf(s)] : ''}`}>
              <circle className="mk-hit" cx={s.label[0]} cy={s.label[1]} r={9} />
              <circle className="mk" cx={s.label[0]} cy={s.label[1]} r={3} fill={fills[geo.shapes.indexOf(s)]} />
            </g>
          ))}
        </g>
      </svg>
      {legendSlot}
      <div className="sr-only" aria-live="polite">{liveMsg}</div>
      {tipContent && hover && (
        <div
          className="map-tip"
          style={{
            left: Math.min(hover.x + 14, Math.max(0, wrapW - 250)),
            top: hover.y + 16,
          }}
          role="tooltip"
        >
          {tipContent}
        </div>
      )}
    </div>
  );
});

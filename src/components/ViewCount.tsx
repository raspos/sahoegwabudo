import { useEffect, useState } from 'react';

/** 조회수(오늘·누적). databrew와 같은 공개 카운터(countapi)를 쓴다.
 *  - 배포 주소(raspos.github.io)에서만, 브라우저 세션당 1회 올린다. 다른 곳(로컬 등)에서는 읽기만 한다.
 *  - '오늘'은 한국 시간 날짜별 키로 센다. 읽지 못하면 아무것도 보여 주지 않는다(가짜 숫자 없음). */
const API = 'https://countapi.mileshilliard.com/api/v1/';
const PREFIX = 'sahoegwabudo_pv_';

export function kstDay(now = new Date()): string {
  return new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 10).replace(/-/g, '');
}

let pending: Promise<{ today: number; total: number } | null> | null = null;

function load(): Promise<{ today: number; total: number } | null> {
  if (pending) return pending;
  const flag = 'sbd_pv_' + kstDay();
  let hit = typeof location !== 'undefined' && location.hostname === 'raspos.github.io';
  try { if (sessionStorage.getItem(flag)) hit = false; } catch { /* 저장소를 못 쓰면 그대로 */ }
  const one = (key: string) =>
    fetch(API + (hit ? 'hit/' : 'get/') + PREFIX + key, { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => (typeof j.value === 'number' ? j.value : hit ? 1 : 0));
  pending = Promise.all([one('d' + kstDay()), one('total')])
    .then(([today, total]) => {
      try { if (hit) sessionStorage.setItem(flag, '1'); } catch { /* 무시 */ }
      return total > 0 ? { today, total } : null;
    })
    .catch(() => null);
  return pending;
}

export function ViewCount({ className }: { className?: string }) {
  const [v, setV] = useState<{ today: number; total: number } | null>(null);
  useEffect(() => { let on = true; load().then((x) => on && setV(x)); return () => { on = false; }; }, []);
  if (!v) return null;
  return <span className={className ?? 'view-count'}> · 조회수 오늘 {v.today.toLocaleString('ko-KR')} · 누적 {v.total.toLocaleString('ko-KR')}</span>;
}

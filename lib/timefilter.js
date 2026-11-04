// 출발·도착 시각 범위 필터 ("06시 ~ 12시"). 현지 시각 기준 (서울·도쿄 모두 UTC+9라 같은 시계)

function toHour(v) {
  if (v == null || v === '') return null;
  const h = Number(v);
  return Number.isInteger(h) && h >= 0 && h <= 24 ? h : null;
}

// ("6", "12") → [6, 12]. 비었거나 0~24 전체거나 거꾸로면 null(= 필터 없음)
export function parseRange(fromV, toV) {
  const from = toHour(fromV) ?? 0;
  const to = toHour(toV) ?? 24;
  if (from >= to || (from === 0 && to === 24)) return null;
  return [from, to];
}

// "2026-12-01T08:30:00+09:00" → 510 (자정부터 분)
function minutesOf(iso) {
  const m = /T(\d{2}):(\d{2})/.exec(iso || '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

// 시계 시각(분)이 [from시, to시] 안인지 (끝 시각 포함: 18시까지 → 18:00 도착도 포함)
function inRange(minutes, range) {
  if (!range) return true;
  if (minutes == null) return false;
  return minutes >= range[0] * 60 && minutes <= range[1] * 60;
}

// 가는 편의 출발·도착 시각이 각 범위 안인지.
// 도착 = 출발 + 소요시간(분)의 시계 시각 (자정을 넘기면 다음 날 시각으로 비교).
// 소요시간을 모르면 도착 범위를 정했을 때 제외.
export function matchesTime(departAt, duration, { depRange = null, arrRange = null }) {
  const dep = minutesOf(departAt);
  const arr = dep != null && duration != null ? (dep + duration) % 1440 : null;
  return inRange(dep, depRange) && inRange(arr, arrRange);
}

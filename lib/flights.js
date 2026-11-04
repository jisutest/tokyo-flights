import { routesFor } from './routes.js';
import { matchesTime } from './timefilter.js';

const API = 'https://api.travelpayouts.com/aviasales/v3/prices_for_dates';

/**
 * Travelpayouts(Aviasales) 캐시 가격 조회.
 * origin/destination에 공항 코드를 넣어도 도시 단위로 묶여 나올 수 있어서
 * 응답의 origin_airport / destination_airport로 다시 걸러낸다.
 */
async function fetchPrices({ origin, destination, departAt, returnAt, direct, token }) {
  const params = new URLSearchParams({
    origin,
    destination,
    departure_at: departAt,
    one_way: returnAt ? 'false' : 'true',
    direct: direct ? 'true' : 'false',
    currency: 'krw',
    sorting: 'price',
    unique: 'false',
    limit: '1000',
  });
  if (returnAt) params.set('return_at', returnAt);

  const res = await fetch(`${API}?${params}`, {
    headers: { 'X-Access-Token': token, 'Accept-Encoding': 'gzip' },
  });
  if (!res.ok) throw new Error(`Travelpayouts ${res.status}`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Travelpayouts error');
  return json.data || [];
}

function toTicket(d, marker) {
  let link = d.link ? `https://www.aviasales.com${d.link}` : null;
  if (link && marker) link += `${link.includes('?') ? '&' : '?'}marker=${encodeURIComponent(marker)}`;
  return {
    price: d.price,
    airline: d.airline,
    flightNumber: d.flight_number,
    departAt: d.departure_at,
    returnAt: d.return_at || null,
    transfers: d.transfers ?? 0,
    returnTransfers: d.return_transfers ?? null,
    // 왕복이면 duration은 왕복 합계라 가는 편 시간으로 쓰면 안 됨
    duration: d.duration_to ?? (d.return_at ? null : d.duration) ?? null,
    returnDuration: d.duration_back ?? null,
    link,
  };
}

// Aviasales 실시간 검색 링크. 예) TYO→SEL 11/20 출발, 11/23 귀국, 성인 1명 → /search/TYO2011SEL23111
// 날짜가 특정일(YYYY-MM-DD)일 때만 만들 수 있음 (한 달 검색은 null)
export function searchUrl(origin, destination, departAt, returnAt, marker) {
  if (departAt?.length !== 10 || (returnAt && returnAt.length !== 10)) return null;
  const ddmm = (d) => d.slice(8, 10) + d.slice(5, 7);
  let url = `https://www.aviasales.com/search/${origin}${ddmm(departAt)}${destination}${returnAt ? ddmm(returnAt) : ''}1`;
  if (marker) url += `?marker=${encodeURIComponent(marker)}`;
  return url;
}

export async function getLivePrices(q, token, marker) {
  const ROUTES = routesFor(q.dir);
  // 도시 단위(SEL↔TYO) 1회 + 공항 단위 4회를 병렬로 조회해 합친다.
  const queries = [
    q.dir === 'tokyo' ? { origin: 'TYO', destination: 'SEL' } : { origin: 'SEL', destination: 'TYO' },
    ...ROUTES.map((r) => ({ origin: r.from, destination: r.to })),
  ];
  const results = await Promise.allSettled(
    queries.map((x) => fetchPrices({ ...x, ...q, token }))
  );
  const failures = results.filter((r) => r.status === 'rejected');
  if (failures.length === results.length) throw failures[0].reason;

  // 조회별 결과 요약 (어느 조회가 비었는지/실패했는지 응답에서 바로 확인용)
  const sources = queries.map((x, i) => {
    const r = results[i];
    return r.status === 'fulfilled'
      ? { query: `${x.origin}-${x.destination}`, count: r.value.length }
      : { query: `${x.origin}-${x.destination}`, error: String(r.reason?.message || r.reason) };
  });

  const buckets = Object.fromEntries(ROUTES.map((r) => [r.id, new Map()]));
  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    for (const d of r.value) {
      const id = `${d.origin_airport}-${d.destination_airport}`;
      if (!buckets[id]) continue;
      const t = toTicket(d, marker);
      if (!matchesTime(t, q)) continue;
      const key = `${d.airline}${d.flight_number}|${d.departure_at}|${d.return_at || ''}`;
      const prev = buckets[id].get(key);
      if (!prev || t.price < prev.price) buckets[id].set(key, t);
    }
  }
  const routes = ROUTES.map(({ baseId, ...route }) => ({
    ...route,
    // 자르지 않음: 화면의 항공사별 시각표에 수집된 시각을 모두 보여줌
    tickets: [...buckets[route.id].values()].sort((a, b) => a.price - b.price),
  }));
  return { routes, sources };
}

// ---------- 토큰이 없을 때 쓰는 샘플 데이터 ----------
function seeded(seed) {
  let s = 0;
  for (const c of seed) s = (s * 31 + c.charCodeAt(0)) >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

const MOCK_AIRLINES = {
  'GMP-HND': ['KE', 'OZ', 'JL', 'NH', '7C', 'TW'],
  'GMP-NRT': ['7C', 'TW'],
  'ICN-HND': ['KE', 'OZ', 'MM', 'LJ'],
  'ICN-NRT': ['7C', 'LJ', 'TW', 'ZG', 'ZE', 'RS', 'YP', 'KE', 'OZ'],
};
const BASE = { 'GMP-HND': 230000, 'GMP-NRT': 170000, 'ICN-HND': 190000, 'ICN-NRT': 120000 };

// 귀국일이 월 단위면 출발 4일 뒤로 (단, 귀국월 안에서)
function mockReturn(departDate, returnAt) {
  if (returnAt.length === 10) return returnAt;
  const d = new Date(`${departDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 4);
  const iso = d.toISOString().slice(0, 10);
  return iso.startsWith(returnAt) ? iso : `${returnAt}-28`;
}

export function getMockPrices(q) {
  const month = q.departAt.length === 7;
  return routesFor(q.dir).map(({ baseId, ...route }) => {
    const rnd = seeded(route.id + q.departAt + (q.returnAt || '') + q.direct);
    const airlines = MOCK_AIRLINES[baseId];
    // 시간대 필터 후에도 남도록 넉넉히 만든 뒤 20개만 사용
    const tickets = Array.from({ length: 60 }, () => {
      const day = month ? String(1 + Math.floor(rnd() * 28)).padStart(2, '0') : null;
      const date = month ? `${q.departAt}-${day}` : q.departAt;
      const hh = String(6 + Math.floor(rnd() * 16)).padStart(2, '0'); // 06~21시 출발
      const mm = ['00', '15', '30', '45'][Math.floor(rnd() * 4)];
      const airline = airlines[Math.floor(rnd() * airlines.length)];
      const factor = q.returnAt ? 1.8 : 1;
      const price = Math.round((BASE[baseId] * factor * (0.7 + rnd() * 0.8)) / 100) * 100;
      const rh = String(7 + Math.floor(rnd() * 15)).padStart(2, '0'); // 오는 편 07~21시 출발
      const rm = ['05', '20', '40', '55'][Math.floor(rnd() * 4)];
      return {
        price,
        airline,
        flightNumber: String(100 + Math.floor(rnd() * 900)),
        departAt: `${date}T${hh}:${mm}:00+09:00`,
        returnAt: q.returnAt ? `${mockReturn(date, q.returnAt)}T${rh}:${rm}:00+09:00` : null,
        transfers: 0,
        returnTransfers: q.returnAt ? 0 : null,
        duration: 130 + Math.floor(rnd() * 30),
        returnDuration: q.returnAt ? 135 + Math.floor(rnd() * 30) : null,
        link: null,
      };
    })
      .filter((t) => matchesTime(t, q))
      .sort((a, b) => a.price - b.price)
      .slice(0, 20);
    return { ...route, tickets };
  });
}

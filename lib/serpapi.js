// SerpApi Google Flights 실시간 조회 (https://serpapi.com/google-flights-api)
// - 출발/도착 공항을 쉼표로 묶어 1번 요청으로 4개 노선을 모두 조회 (검색 1회 = 크레딧 1개)
// - 같은 파라미터는 SerpApi가 1시간 캐시하며 캐시 응답은 크레딧을 쓰지 않음
// - 왕복은 첫 응답에 가는 편 + 왕복 가격만 옴. 오는 편 상세는 항공편마다 추가 요청이 필요해서
//   (크레딧 소모) 받지 않고, 오는 편 시간 조건은 Google에 return_times로 넘겨 거르게 함.
import { routesFor } from './routes.js';
import { matchesLeg } from './timefilter.js';

const API = 'https://serpapi.com/search.json';

// 우리 범위 [a, b]시(끝 포함) → Google 형식 "a,b-1" (Google은 두 번째 숫자가 '마지막 시간대의 시작 시각')
function googleHours(range) {
  if (!range) return '0,23';
  return `${range[0]},${Math.max(range[0], range[1] - 1)}`;
}
// 출발만: "a,b" / 도착까지: "출발a,출발b,도착a,도착b". 둘 다 없으면 null
function googleTimes(depRange, arrRange) {
  if (!depRange && !arrRange) return null;
  return arrRange ? `${googleHours(depRange)},${googleHours(arrRange)}` : googleHours(depRange);
}

// "2026-11-20 08:10" → "2026-11-20T08:10:00+09:00" (서울·도쿄 모두 UTC+9)
const toIso = (s) => (s ? `${s.replace(' ', 'T')}:00+09:00` : null);

// Google 항공권에서 같은 검색 열기
function googleFlightsUrl(from, to, date, returnDate) {
  const q = `Flights from ${from} to ${to} on ${date}${returnDate ? ` through ${returnDate}` : ' one way'}`;
  return `https://www.google.com/travel/flights?hl=ko&gl=kr&curr=KRW&q=${encodeURIComponent(q)}`;
}

export async function getSerpPrices(q, apiKey) {
  const ROUTES = routesFor(q.dir);
  const origins = [...new Set(ROUTES.map((r) => r.from))].join(',');
  const dests = [...new Set(ROUTES.map((r) => r.to))].join(',');
  const round = Boolean(q.returnAt);

  const params = new URLSearchParams({
    engine: 'google_flights',
    departure_id: origins,
    arrival_id: dests,
    outbound_date: q.departAt,
    type: round ? '1' : '2', // 1 왕복, 2 편도
    currency: 'KRW',
    hl: 'ko',
    gl: 'kr',
    stops: q.direct ? '1' : '0', // 1 직항만, 0 상관없음
    show_hidden: 'true', // Google의 '항공편 더보기'에 숨겨진 항공편까지 (예약 가능한 시각 전체)
    deep_search: 'true', // 브라우저의 Google 항공권과 같은 결과 (응답은 조금 느려짐)
    api_key: apiKey,
  });
  if (round) params.set('return_date', q.returnAt);
  const outTimes = googleTimes(q.depRange, q.arrRange);
  if (outTimes) params.set('outbound_times', outTimes);
  const retTimes = round ? googleTimes(q.retDepRange, q.retArrRange) : null;
  if (retTimes) params.set('return_times', retTimes);

  const res = await fetch(`${API}?${params}`, { signal: AbortSignal.timeout(50000) });
  const json = await res.json().catch(() => ({}));
  // "결과 없음"은 오류가 아니라 0건으로 처리
  const noResults = typeof json.error === 'string' && /hasn't returned any results|no results/i.test(json.error);
  if (!res.ok && !noResults) throw new Error(`SerpApi ${res.status}${json.error ? `: ${json.error}` : ''}`);
  if (json.error && !noResults) throw new Error(`SerpApi: ${json.error}`);

  const items = [...(json.best_flights || []), ...(json.other_flights || [])];
  const buckets = Object.fromEntries(ROUTES.map((r) => [r.id, new Map()]));
  for (const it of items) {
    const segs = it.flights || [];
    if (!segs.length || typeof it.price !== 'number') continue;
    if (q.direct && segs.length > 1) continue; // stops=1로 요청하지만 혹시 섞여 오면 제외
    const first = segs[0], last = segs[segs.length - 1];
    const id = `${first.departure_airport?.id}-${last.arrival_airport?.id}`;
    if (!buckets[id]) continue;
    // "KE 703" → 항공사 코드 KE, 편명 703 (코드가 있어야 화면에서 한글 항공사명으로 보임)
    const [code, num] = String(first.flight_number || '').split(' ');
    const t = {
      price: it.price,
      airline: code || first.airline,
      flightNumber: num || '',
      departAt: toIso(first.departure_airport?.time),
      returnAt: null, // 왕복이어도 오는 편 상세는 받지 않음 (위 설명 참고)
      transfers: segs.length - 1,
      returnTransfers: null,
      duration: it.total_duration ?? null,
      returnDuration: null,
      link: googleFlightsUrl(first.departure_airport.id, last.arrival_airport.id, q.departAt, q.returnAt),
    };
    // Google도 시간으로 거르지만 경계가 조금 달라서 가는 편은 한 번 더 확인
    if (!matchesLeg(t.departAt, t.duration, q.depRange, q.arrRange)) continue;
    const key = `${t.airline}${t.flightNumber}|${t.departAt}`;
    const prev = buckets[id].get(key);
    if (!prev || t.price < prev.price) buckets[id].set(key, t);
  }

  const routes = ROUTES.map(({ baseId, ...route }) => ({
    ...route,
    // 자르지 않음: 화면의 항공사별 시각표에 예약 가능한 시각을 모두 보여줌
    tickets: [...buckets[route.id].values()].sort((a, b) => a.price - b.price),
  }));
  const sources = [{ query: `google_flights ${origins}-${dests}`, count: items.length, ...(noResults ? { note: json.error } : {}) }];
  return { routes, sources };
}

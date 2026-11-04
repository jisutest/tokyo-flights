import { getLivePrices, getMockPrices, searchUrl } from '../lib/flights.js';
import { getSerpPrices } from '../lib/serpapi.js';
import { parseRange } from '../lib/timefilter.js';

// SerpApi deep_search는 응답이 느릴 수 있어 함수 실행 시간을 넉넉히 (Vercel)
export const config = { maxDuration: 60 };

const DATE_RE =/^\d{4}-\d{2}(-\d{2})?$/;

// GET /api/compare?from=seoul|tokyo&depart=2026-12-20&return=2026-12-24&direct=1
//   시각 범위(0~24시, 생략 = 전체):
//   가는 편 depFrom/depTo(출발) arrFrom/arrTo(도착), 오는 편 retDepFrom/retDepTo retArrFrom/retArrTo
export default async function handler(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const dir = url.searchParams.get('from') === 'tokyo' ? 'tokyo' : 'seoul';
  const departAt = url.searchParams.get('depart') || '';
  const returnAt = url.searchParams.get('return') || '';
  const direct = url.searchParams.get('direct') === '1';
  const p = (k) => url.searchParams.get(k);
  const depRange = parseRange(p('depFrom'), p('depTo'));
  const arrRange = parseRange(p('arrFrom'), p('arrTo'));
  const retDepRange = parseRange(p('retDepFrom'), p('retDepTo'));
  const retArrRange = parseRange(p('retArrFrom'), p('retArrTo'));

  if (!DATE_RE.test(departAt) || (returnAt && !DATE_RE.test(returnAt))) {
    return send(res, 400, { error: '날짜 형식은 YYYY-MM 또는 YYYY-MM-DD 입니다.' });
  }
  if (returnAt && returnAt < departAt) {
    return send(res, 400, { error: '돌아오는 날이 출발일보다 빠릅니다.' });
  }

  const q = { dir, departAt, returnAt: returnAt || null, direct, depRange, arrRange, retDepRange, retArrRange };
  const token = process.env.TRAVELPAYOUTS_TOKEN;
  const marker = process.env.TRAVELPAYOUTS_MARKER;

  // 노선별 + 도시 단위 Aviasales 실시간 검색 링크 (캐시에 가격이 없을 때 바로 가볼 수 있게)
  const links = (routes) => routes.map((r) => ({ ...r, searchUrl: searchUrl(r.from, r.to, departAt, returnAt, marker) }));
  const [cityFrom, cityTo] = dir === 'tokyo' ? ['TYO', 'SEL'] : ['SEL', 'TYO'];
  const citySearchUrl = searchUrl(cityFrom, cityTo, departAt, returnAt, marker);

  // 실시간 조회(SerpApi)는 날짜가 특정일일 때만 가능. 한 달 검색은 아래 캐시 데이터로.
  const serpKey = process.env.SERPAPI_KEY;
  const exactDates = departAt.length === 10 && (!returnAt || returnAt.length === 10);
  const realtime = Boolean(serpKey);

  try {
    if (serpKey && exactDates) {
      const { routes, sources } = await getSerpPrices(q, serpKey);
      // 같은 검색은 Vercel CDN에 10분 캐시 (SerpApi 크레딧 절약)
      res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=1800');
      return send(res, 200, { mock: false, provider: 'serpapi', query: q, routes: links(routes), sources, citySearchUrl });
    }
    if (!token) {
      return send(res, 200, { mock: true, provider: 'mock', realtime, query: q, routes: links(getMockPrices(q)), citySearchUrl });
    }
    let { routes, sources } = await getLivePrices(q, token, marker);

    // 특정일 조합으로 수집된 가격이 하나도 없으면 같은 달 전체로 다시 조회
    // (캐시 데이터라 정확한 날짜 조합은 비어 있는 경우가 많음, 특히 도쿄 출발)
    let fallback = null;
    if (departAt.length === 10 && routes.every((r) => !r.tickets.length)) {
      const mq = { ...q, departAt: departAt.slice(0, 7), returnAt: returnAt ? returnAt.slice(0, 7) : null };
      const monthly = await getLivePrices(mq, token, marker).catch(() => null);
      if (monthly?.routes.some((r) => r.tickets.length)) {
        routes = monthly.routes;
        sources = monthly.sources;
        fallback = 'month';
      }
    }

    // Vercel CDN에 10분 캐시 (API 호출량 절약)
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=3600');
    // sources: 조회별 원본 건수/에러 (결과가 비었을 때 원인 확인용)
    // fallback: 'month'면 요청한 날짜가 아니라 같은 달 다른 날짜의 가격
    return send(res, 200, { mock: false, provider: 'travelpayouts', realtime, query: q, routes: links(routes), sources, fallback, citySearchUrl });
  } catch (err) {
    console.error(err);
    return send(res, 502, {
      error: '가격 정보를 가져오지 못했습니다. 잠시 후 다시 시도해 주세요.',
      detail: String(err?.message || err), // 예: "Travelpayouts 401" / "SerpApi: Invalid API key" → 키 문제
    });
  }
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

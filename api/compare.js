import { getLivePrices, getMockPrices } from '../lib/flights.js';
import { parseRange } from '../lib/timefilter.js';

const DATE_RE = /^\d{4}-\d{2}(-\d{2})?$/;

// GET /api/compare?from=seoul|tokyo&depart=2026-12-20&return=2026-12-24&direct=1
//                  &depFrom=6&depTo=12&arrFrom=9&arrTo=15  (가는 편 출발/도착 시각 범위, 0~24시, 생략 = 전체)
export default async function handler(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const dir = url.searchParams.get('from') === 'tokyo' ? 'tokyo' : 'seoul';
  const departAt = url.searchParams.get('depart') || '';
  const returnAt = url.searchParams.get('return') || '';
  const direct = url.searchParams.get('direct') === '1';
  const p = (k) => url.searchParams.get(k);
  const depRange = parseRange(p('depFrom'), p('depTo'));
  const arrRange = parseRange(p('arrFrom'), p('arrTo'));

  if (!DATE_RE.test(departAt) || (returnAt && !DATE_RE.test(returnAt))) {
    return send(res, 400, { error: '날짜 형식은 YYYY-MM 또는 YYYY-MM-DD 입니다.' });
  }
  if (returnAt && returnAt < departAt) {
    return send(res, 400, { error: '돌아오는 날이 출발일보다 빠릅니다.' });
  }

  const q = { dir, departAt, returnAt: returnAt || null, direct, depRange, arrRange };
  const token = process.env.TRAVELPAYOUTS_TOKEN;

  try {
    if (!token) {
      return send(res, 200, { mock: true, query: q, routes: getMockPrices(q) });
    }
    const routes = await getLivePrices(q, token, process.env.TRAVELPAYOUTS_MARKER);
    // Vercel CDN에 10분 캐시 (API 호출량 절약)
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=3600');
    return send(res, 200, { mock: false, query: q, routes });
  } catch (err) {
    console.error(err);
    return send(res, 502, { error: '가격 정보를 가져오지 못했습니다. 잠시 후 다시 시도해 주세요.' });
  }
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

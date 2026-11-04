import { getLivePrices, getMockPrices } from '../lib/flights.js';

const DATE_RE = /^\d{4}-\d{2}(-\d{2})?$/;

// GET /api/compare?depart=2026-12-20&return=2026-12-24&direct=1
export default async function handler(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const departAt = url.searchParams.get('depart') || '';
  const returnAt = url.searchParams.get('return') || '';
  const direct = url.searchParams.get('direct') === '1';

  if (!DATE_RE.test(departAt) || (returnAt && !DATE_RE.test(returnAt))) {
    return send(res, 400, { error: '날짜 형식은 YYYY-MM 또는 YYYY-MM-DD 입니다.' });
  }
  if (returnAt && returnAt < departAt) {
    return send(res, 400, { error: '귀국일이 출발일보다 빠릅니다.' });
  }

  const q = { departAt, returnAt: returnAt || null, direct };
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

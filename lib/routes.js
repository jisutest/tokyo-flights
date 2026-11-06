// 한국 쪽 출발/도착 도시별 비교 노선 (서울 출발 기준 방향)
export const CITIES = {
  seoul: {
    code: 'SEL', name: '서울', airports: '김포·인천',
    routes: [
      { id: 'GMP-HND', from: 'GMP', to: 'HND', fromName: '김포', toName: '하네다' },
      { id: 'GMP-NRT', from: 'GMP', to: 'NRT', fromName: '김포', toName: '나리타' },
      { id: 'ICN-HND', from: 'ICN', to: 'HND', fromName: '인천', toName: '하네다' },
      { id: 'ICN-NRT', from: 'ICN', to: 'NRT', fromName: '인천', toName: '나리타' },
    ],
  },
  daegu: {
    code: 'TAE', name: '대구', airports: '대구',
    routes: [
      { id: 'TAE-HND', from: 'TAE', to: 'HND', fromName: '대구', toName: '하네다' },
      { id: 'TAE-NRT', from: 'TAE', to: 'NRT', fromName: '대구', toName: '나리타' },
    ],
  },
};

export const cityOf = (city) => CITIES[city] || CITIES.seoul;

// dir: 'seoul'(한국→도쿄) | 'tokyo'(도쿄→한국), city: 'seoul' | 'daegu'.
// baseId는 한국 출발 기준 id (샘플 데이터용).
export function routesFor(dir, city) {
  const routes = cityOf(city).routes;
  if (dir !== 'tokyo') return routes.map((r) => ({ ...r, baseId: r.id }));
  return routes.map((r) => ({
    id: `${r.to}-${r.from}`, baseId: r.id,
    from: r.to, to: r.from, fromName: r.toName, toName: r.fromName,
  }));
}
export const AIRLINES = {
  KE: '대한항공', OZ: '아시아나', '7C': '제주항공', LJ: '진에어', TW: '티웨이',
  BX: '에어부산', RS: '에어서울', ZE: '이스타항공', YP: '에어프레미아',
  JL: 'JAL', NH: 'ANA', MM: '피치항공', ZG: 'ZIPAIR', GK: '젯스타재팬',
  BC: '스카이마크', HD: '에어두', SJ: '스카이마크',
};

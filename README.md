# ✈️ 도쿄 항공권 최저가

김포·인천 ↔ 하네다·나리타 4개 노선 최저가를 한 번에 비교하는 웹앱 (서울 출발·도쿄 출발 선택).
설치할 패키지가 없는 구조(정적 HTML + Vercel 서버리스 함수)라 그대로 배포됩니다.

```
index.html          화면 (검색 폼 + 4개 노선 카드)
api/compare.js      GET /api/compare?from=seoul|tokyo&depart=YYYY-MM[-DD]&return=...&direct=1&depFrom=6&depTo=12 … (가는 편 dep/arr, 오는 편 retDep/retArr + From/To)
lib/flights.js      Travelpayouts 호출·노선별 정리, 토큰 없을 때 샘플 데이터
lib/routes.js       노선/항공사 목록, 서울↔도쿄 방향 전환
lib/timefilter.js   출발·도착 시각 범위 필터
dev-server.js       로컬 실행용 (배포엔 안 쓰임)
```

## 로컬 실행

```bash
cp .env.example .env.local   # 토큰 입력 (비워두면 샘플 데이터)
npm run dev                  # http://localhost:3000
```

## Vercel 배포

1. GitHub에 이 저장소 푸시
2. vercel.com → **Add New → Project** → 저장소 Import
3. Framework Preset: **Other** (빌드 명령 없음, 그대로 두기)
4. **Environment Variables**에 `TRAVELPAYOUTS_TOKEN` 추가 (선택: `TRAVELPAYOUTS_MARKER`)
5. Deploy

토큰을 나중에 추가했다면 Deployments → 최신 배포 → **Redeploy** 해야 반영됩니다.

## 참고

- 가격은 Aviasales 캐시 데이터(최근 사용자 검색 기반)라 실시간 가격이 아닙니다. 인기 노선은 잘 채워지지만 특정일엔 비어 있을 수 있어요 → "한 달" 검색으로 넓혀 보세요.
- API 응답은 Vercel CDN에 10분 캐시됩니다 (`s-maxage=600`).

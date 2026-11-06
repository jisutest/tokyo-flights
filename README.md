# ✈️ 도쿄 항공권 최저가

김포·인천(서울 4개 노선) 또는 대구(2개 노선) ↔ 하네다·나리타 최저가를 한 번에 비교하는 웹앱 (한국 출발·도쿄 출발 선택).
설치할 패키지가 없는 구조(정적 HTML + Vercel 서버리스 함수)라 그대로 배포됩니다.

```
index.html          화면 (검색 폼 + 노선 카드)
api/compare.js      GET /api/compare?from=seoul|tokyo&city=seoul|daegu&depart=YYYY-MM[-DD]&return=...&direct=1&depFrom=6&depTo=12 … (가는 편 dep/arr, 오는 편 retDep/retArr + From/To)
lib/serpapi.js      SerpApi(Google 항공권) 실시간 조회 — 특정일 검색
lib/flights.js      Travelpayouts 캐시 조회·노선별 정리, 키가 없을 때 샘플 데이터
lib/routes.js       도시별(서울·대구) 노선, 항공사 목록, 방향 전환
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
4. **Environment Variables**에 추가
   - `SERPAPI_KEY` — 실시간 가격 (권장)
   - `TRAVELPAYOUTS_TOKEN` (선택: `TRAVELPAYOUTS_MARKER`) — "한 달" 검색용 캐시 가격
5. Deploy

키를 나중에 추가했다면 Deployments → 최신 배포 → **Redeploy** 해야 반영됩니다.

## 가격 데이터는 어디서 오나

| 검색 | `SERPAPI_KEY` 있음 | 없음 |
|---|---|---|
| 특정일 | **실시간** Google 항공권 (SerpApi) | Travelpayouts 캐시 (없으면 샘플) |
| 한 달 | Travelpayouts 캐시 (없으면 샘플) | Travelpayouts 캐시 (없으면 샘플) |

- **SerpApi**: 검색 1번 = 크레딧 1개 (도시의 모든 노선을 요청 1번으로 조회). 같은 검색은 SerpApi가 1시간, Vercel CDN이 10분 캐시하며 캐시 응답은 크레딧을 쓰지 않습니다. 무료 플랜은 월 250회 정도라 공개 사이트라면 유료 플랜을 고려하세요.
  - 왕복은 가는 편 목록 + 왕복 합계 가격만 받아옵니다. 오는 편 항공편은 항공편마다 추가 요청(크레딧)이 필요해서 받지 않고, 오는 편 시간 조건은 Google에 넘겨 거릅니다. 정확한 오는 편은 카드의 "Google 항공권에서 보기"에서 고릅니다.
- **Travelpayouts**: 최근 사용자 검색을 모은 캐시라 실시간이 아닙니다. 특정일 조합(특히 도쿄 출발)은 비어 있는 경우가 많아, 비면 같은 달 전체로 한 번 더 조회합니다.

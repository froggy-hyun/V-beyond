# V beyond

상장사가 만드는 상품에서 성분·소재 근거와 비교 가능한 대안을 찾는 모바일 우선 웹 서비스.

## 브랜치와 배포

개발은 `dev`, 운영은 `main`. 두 브랜치의 푸시와 PR에서 검증 수행. 앱을 포함한 `main` 푸시만 GHCR에 ARM64 이미지를 발행하고 같은 이미지 다이제스트를 Docker Compose로 배포. 커밋 형식은 `feat: 종목 탐색 추가`와 같이 영어 유형과 한글 명사형 제목 사용.

배포 환경은 GitHub Actions의 `production`. SSH 호스트 키 고정, 키와 비밀번호 인증, 작업별 단기 레지스트리 토큰 사용. 필수 secret 이름은 워크플로의 deploy 단계 참조. 실제 등록값은 이 컴퓨터의 Git 제외 파일 `.local/GITHUB_SECRETS.md`에 보관.

서버 배포 경로는 `~/product-lens`. 운영 도메인은 GitHub `production` 변수 `PROD_SITE_HOST`로 지정하고 DNS A 레코드를 서버 IPv4에 연결. Caddy가 80·443 포트에서 HTTP를 HTTPS로 전환하고 도메인 및 공개 IP의 ACME 인증서를 자동 발급·갱신. 인증서는 Compose 볼륨에 보관. 로컬 Compose 웹은 `127.0.0.1:18081`에서 접근. 헬스체크 실패 시 이전 이미지 구성으로 복귀. DB 마이그레이션은 이전 앱 버전과 호환되는 변경으로 작성.

## 로컬 실행

```sh
docker build -t product-lens-backend:local backend
docker build -t product-lens-frontend:local frontend
docker compose --env-file .env.example up -d --wait
```

브라우저에서 `http://127.0.0.1:18081` 접속. 키 없이 상품 비교 및 규칙 기반 탐색 사용 가능. 운영 설정값과 로컬 실행 예시값 분리. 종목별 관심 등록은 브라우저 Local Storage 사용.

## 데이터와 확인 범위

- 국내 4개·미국 6개 종목 및 30개 상품의 시드와 제품별 원문 링크는 `data/`에 포함. 로고와 제품 사진의 제조사·판매처 출처는 `frontend/src/assets/image-sources.json`에 기록. 삼양·풀무원의 판매 확인이 부족한 후보는 시드에 포함된 확인 상품으로 교체.
- 제품 단위 비교는 동일 판매 시장과 조리 상태, 단위 및 제공 기준 적용. 미확인 소재는 미사용 검색에서 제외. 기업 비교는 표본 상품과 공개 영양·소재 자료 제공.
- 시세 모드는 로컬·CI 기본값 `REPLAY`와 한국투자증권 HTTPS 조회용 `KIS` 지원. KIS 모드는 국내·미국 현재가, 종목별 정규장 분봉 및 1년 일봉, 코스피·코스닥 지수와 지수 분봉 제공. 차트와 지수 스냅샷을 백그라운드에서 갱신하고 PostgreSQL에 저장. 브라우저는 저장된 시세만 조회. 서버 재시작 시 저장된 스냅샷 복원.
- KIS 접근 토큰은 암호화해 PostgreSQL에 저장하고 공급자가 지정한 만료 시각까지 재사용. 동일 자격 증명의 동시 발급은 데이터베이스 행으로 제어. `ops/check-kis.py`는 이미 발급한 접근 토큰으로 현재가 조회만 확인.
- 하나증권V 공개 화면을 기준으로 홈·관심·검색·현재가·메뉴, 간편·프로 전환과 종목 상세 탭 구성. V beyond 로고와 캐릭터, Pretendard Variable 사용. 회원 관리와 계좌·주문 기능은 MVP 범위에서 제외.

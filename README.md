# Product Lens · 종목의 뒷면

상장사가 만드는 상품에서 성분·소재 근거와 비교 가능한 대안을 찾는 모바일 우선 웹 서비스.

## 브랜치와 배포

개발은 `dev`, 운영은 `main`. 두 브랜치의 푸시와 PR에서 검증 수행. 앱을 포함한 `main` 푸시만 GHCR에 ARM64 이미지를 발행하고 같은 이미지 다이제스트를 Docker Compose로 배포. 커밋 형식은 `feat: 종목 탐색 추가`와 같이 영어 유형과 한글 명사형 제목 사용.

배포 환경은 GitHub Actions의 `production`. SSH 호스트 키 고정, 키와 비밀번호 인증, 작업별 단기 레지스트리 토큰 사용. 필수 secret 이름은 워크플로의 deploy 단계 참조. 실제 등록값은 이 컴퓨터의 Git 제외 파일 `.local/GITHUB_SECRETS.md`에 보관.

서버 배포 경로는 `~/product-lens`. 운영은 Caddy가 80·443 포트를 점유하고 HTTP를 HTTPS로 전환. 공개 IP용 단기 ACME 인증서 자동 갱신. 로컬 Compose 웹은 `127.0.0.1:18081`에서 접근. 헬스체크 실패 시 이전 이미지 구성으로 복귀. DB 마이그레이션은 이전 앱 버전과 호환되는 변경으로 작성.

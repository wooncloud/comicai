# ADR-0007: 호스팅 — 개인 PC + Cloudflare Zero Trust Tunnel

- 상태: Accepted
- 날짜: 2026-05-16

## 컨텍스트
- 1인 개발, MVP 단계, 사업화 전.
- 클라우드 비용 부담 최소화 희망.
- 외부 사용자 접근 필요 (베타 테스터).

## 결정
**개인 PC**에서 Docker Compose로 전체 스택을 구동하고, **Cloudflare Zero Trust Tunnel**(`cloudflared`)로 외부 노출한다. 사업화 단계에서 AWS 또는 GCP로 이전.

## 대안
1. **클라우드 처음부터** — 비용·운영 부담. MVP 검증 전 비효율.
2. **VPS** (Hetzner/Vultr 등) — 저렴하지만 GPU 없음, 향후 비용 비효율.
3. **개인 PC + 포트포워딩** — 가정 NAT, IP 변동, ISP 정책 등 변수 많음.
4. **개인 PC + Cloudflare Tunnel** — IP 비공개, HTTPS, DDoS 방어, 무료. **채택**.

## 결과
**긍정**:
- 인프라 비용 0 (전기료 제외).
- HTTPS·인증·Zero Trust 정책 가능.
- 향후 클라우드 이전 시 Docker Compose 그대로 이식 가능.

**부정**:
- PC 가동률 = 서비스 가동률. 정전/재부팅 시 다운.
- 업로드 대역폭 한정.
- DB 백업이 외부 클라우드 백업소로 빠져나가야 함(데이터 손실 방지).

## 관련
- 배포: [`../40-ops/01-deployment.md`](../40-ops/01-deployment.md)

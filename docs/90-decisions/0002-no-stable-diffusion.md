# ADR-0002: Stable Diffusion 미사용, 상용 멀티모달 API 채택

- 상태: Accepted
- 날짜: 2026-05-16

## 컨텍스트
- 일관성 유지가 제품의 핵심 가치.
- 자체 GPU 없음 (개인 PC). SD/LoRA 학습 인프라 부담 큼.
- 사용자 화면에서 캐릭터 시트 + 텍스트로 빠른 결과 필요.

## 결정
**Gemini nano banana 2.5 (gemini-2.5-flash-image) 및 GPT-image-1**을 사용한다. Stable Diffusion / IP-Adapter / ControlNet / LoRA 등 SD 계열 기법은 본 프로젝트에서 사용하지 않는다.

## 대안
1. **Stable Diffusion + IP-Adapter** — GPU 필요. 일관성은 강력하지만 BYOK 모델과 불일치, 인프라 비용 큼.
2. **LoRA 학습** — 캐릭터별 학습 시간/리소스 → 사용자 진입 장벽 큼.
3. **현재 결정** — 두 모델 모두 멀티 이미지 입력 지원, BYOK 방식과 정합.

## 결과
**긍정**:
- 사용자 키 + HTTP 호출만으로 동작. GPU 불필요.
- 모델 업데이트 자동 수혜.
- 두 모델 비교 실험 용이.

**부정**:
- 일관성이 SD+IP-Adapter보다 약할 가능성. M3 PoC에서 검증 필요.
- API 호출 비용·레이트리밋이 사용자 부담.
- 모델사 정책(safety, quota) 의존성.

## 관련
- 어댑터 설계: [`../30-tech/06-model-adapters.md`](../30-tech/06-model-adapters.md)
- 일관성 PoC 항목: [`../10-product/05-open-questions.md`](../10-product/05-open-questions.md) Q-02, Q-04

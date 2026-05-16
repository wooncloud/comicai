# ADR-0003: 에디터 캔버스에 tldraw 채택 (Konva 대체 옵션)

- 상태: Accepted (PoC, 향후 재평가)
- 날짜: 2026-05-16

## 컨텍스트
- 에디터에 필요: 무한 캔버스, 자유 도형(패널), 자유선(콘티), 이미지, 텍스트, 커스텀 shape.
- Next.js / React 환경. 단기간에 PoC 필요.

## 결정
**tldraw**를 1차 선택. 한계 발견 시 **Konva.js (react-konva)** 로 마이그레이션.

## 대안
1. **Konva.js** — 자유도 최고지만 UI 직접 구현 필요. 초기 비용 큼.
2. **Fabric.js** — 안정적이나 React 통합 번거로움.
3. **Excalidraw** — 손그림 느낌 좋으나 커스터마이징 한계.
4. **tldraw** — React/Next 친화, 무한 캔버스 + 도형/자유선/이미지/텍스트 기본 제공, 커스텀 shape 가능. **채택**.

## 결과
**긍정**:
- 빠른 PoC. 핵심 기능 대부분 기본 제공.
- 커스텀 "패널 shape"으로 만화 패널 모델링 가능.

**부정**:
- 상업용 라이선스 검토 필요(사업화 시점). → [`../10-product/05-open-questions.md`](../10-product/05-open-questions.md) Q-01.
- tldraw 내부 모델에 종속됨 → 마이그레이션 시 비용.

## 관련
- 에디터 화면: [`../20-ux/screens/12-page-editor.md`](../20-ux/screens/12-page-editor.md)

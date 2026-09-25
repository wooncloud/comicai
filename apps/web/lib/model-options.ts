import { MODEL_LABEL, modelLabel, SELECTABLE_MODEL_IDS, type ModelId } from '@comicai/types';

export { modelLabel };

/**
 * 사용자가 인스펙터 등에서 고를 수 있는 AI 서비스 목록.
 *
 * `MODEL_LABEL`과 `modelLabel`은 이제 서버(원장 내역 라벨 '그림 생성 (Gemini)' 등)에서도
 * 함께 사용하므로 단일 진실 공급원인 `@comicai/types` 로 모았다.
 *
 * 목록 자체는 `SELECTABLE_MODEL_IDS`(`@comicai/types`) 하나에서 나온다 — 여기에 손으로
 * 적어 두면 모델을 올릴 때 화면만 옛 판을 계속 내민다. `mock` 과 지난 기록용 옛 id 는
 * 그 목록에서 이미 빠져 있다.
 */
export const MODEL_OPTIONS: { id: ModelId; label: string }[] = SELECTABLE_MODEL_IDS.map((id) => ({
  id,
  label: MODEL_LABEL[id],
}));

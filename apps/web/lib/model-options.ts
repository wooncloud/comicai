import { MODEL_LABEL, modelLabel, type ModelId } from '@comicai/types';

export { modelLabel };

/**
 * 사용자가 인스펙터 등에서 고를 수 있는 AI 서비스 목록.
 *
 * `MODEL_LABEL`과 `modelLabel`은 이제 서버(원장 내역 라벨 '그림 생성 (Gemini)' 등)에서도
 * 함께 사용하므로 단일 진실 공급원인 `@comicai/types` 로 모았다.
 *
 * `mock` 은 개발 전용이라 선택지 목록에서는 제외한다.
 */
export const MODEL_OPTIONS: { id: ModelId; label: string }[] = [
  { id: 'gemini-3.1-flash-image-preview', label: MODEL_LABEL['gemini-3.1-flash-image-preview'] },
  { id: 'gpt-image-2', label: MODEL_LABEL['gpt-image-2'] },
];

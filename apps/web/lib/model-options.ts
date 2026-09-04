import type { ModelId } from '@comicai/types';

/**
 * 화면에 보여 줄 AI 서비스 이름.
 *
 * `ModelId` 원문('gemini-3.1-flash-image-preview')은 사용자가 고른 적 없는 내부
 * 식별자다. 그런데 생성 기록 캡션에는 그 원문이 그대로 찍히고 있었다 — 정작 그 모델을
 * 고른 화면에서는 'Gemini' 라는 이름으로 보여 주는데도.
 *
 * 같은 목록이 세 파일에 복붙돼 있어서, 서비스를 추가하면 세 곳을 다 고쳐야 했고
 * 한 곳을 빠뜨리면 그 화면에서만 목록이 짧아진다. 여기로 모았다.
 *
 * `packages/types` 가 아니라 웹에 둔 이유: 이 라벨은 API 계약이 아니라 화면 표기다.
 * 서버는 이 값을 쓰지 않는다.
 */
export const MODEL_LABEL: Record<ModelId, string> = {
  'gemini-3.1-flash-image-preview': 'Gemini',
  'gpt-image-2': 'OpenAI',
  // 개발용 어댑터. 목록에는 넣지 않지만, 지난 기록에 남아 있을 수 있어 이름은 준비해 둔다.
  mock: '테스트',
};

/** 사용자가 고를 수 있는 서비스. `mock` 은 개발 전용이라 제외한다. */
export const MODEL_OPTIONS: { id: ModelId; label: string }[] = [
  { id: 'gemini-3.1-flash-image-preview', label: MODEL_LABEL['gemini-3.1-flash-image-preview'] },
  { id: 'gpt-image-2', label: MODEL_LABEL['gpt-image-2'] },
];

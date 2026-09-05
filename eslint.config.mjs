import config from './packages/eslint-config/base.js';

export default [
  ...config,
  {
    // @comicai/config 는 순수 CommonJS 다 — ESM 설정 파일(next.config.mjs), CJS 런타임,
    // 그리고 빌드 이전 시점에서 모두 로드돼야 해서다(packages/config/index.js 머리말).
    // require 와 CLI 출력이 이 패키지의 형태라 여기서만 허용한다.
    files: ['packages/config/**/*.js'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      'no-console': 'off',
    },
  },
  {
    // allowDefaultProject 는 packages/eslint-config/base.js 에 있다.
    // projectService 설정은 실행 단위로 하나만 적용되므로 여기 두면 무시된다.
    files: ['scripts/**/*.{ts,mts,cts}'],
    rules: {
      '@typescript-eslint/no-floating-promises': 'off',
      // CLI 라 출력이 곧 결과다. 여기서 console 을 막으면 로거를 새로 들일 이유밖에 안 된다.
      'no-console': 'off',
    },
  },
];

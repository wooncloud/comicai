import config from './packages/eslint-config/base.js';

export default [
  ...config,
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

import config from './packages/eslint-config/base.js';

export default [
  ...config,
  {
    files: ['scripts/**/*.{ts,mts,cts}'],
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ['scripts/*.ts'],
        },
      },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'off',
    },
  },
];

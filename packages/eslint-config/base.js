import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default [
  {
    ignores: [
      '**/dist/**',
      '**/.next/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/build/**',
      '**/*.d.ts',
      '**/prisma/migrations/**',
      '**/*.config.ts',
      '**/*.config.mts',
      '**/*.config.{js,mjs,cjs}',
      '**/eslint.config.{js,mjs,cjs}',
      '**/playwright.config.ts',
      'packages/eslint-config/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          // scripts/*.ts 는 어느 워크스페이스 tsconfig 에도 속하지 않는 일회성 유틸이다.
          // 루트 eslint.config.mjs 에도 같은 오버라이드가 있으나, projectService 설정은
          // 실행 단위로 하나만 적용되어 scripts/ 와 apps/ 를 함께 lint 하면(= lint-staged)
          // 이쪽이 이기므로 여기에 둔다.
          allowDefaultProject: [
            '*.config.{js,mjs,cjs}',
            'eslint.config.{js,mjs,cjs}',
            'scripts/*.ts',
          ],
        },
      },
      globals: { ...globals.node, ...globals.es2022 },
    },
    rules: {
      // 안전성 (타입 정보 기반)
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false, arguments: false } },
      ],
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/require-await': 'warn',
      '@typescript-eslint/no-unnecessary-condition': 'warn',

      // 모던 TS 스타일
      '@typescript-eslint/prefer-nullish-coalescing': 'warn',
      '@typescript-eslint/prefer-optional-chain': 'warn',
      '@typescript-eslint/consistent-type-imports': [
        'warn',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],

      // 안전한 미사용
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],

      // 너무 시끄러운 타입체크 결과 완화
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',
      '@typescript-eslint/no-unnecessary-type-assertion': 'warn',

      // 일반
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-var': 'error',
      'prefer-const': 'error',
      'no-throw-literal': 'error',
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
    },
  },
  {
    files: ['**/*.{test,spec}.{ts,tsx}', '**/test/**/*.{ts,tsx}', '**/e2e/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/no-misused-promises': 'off',
      'no-console': 'off',
    },
  },
];

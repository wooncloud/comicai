import reactHooks from 'eslint-plugin-react-hooks';
import react from 'eslint-plugin-react';
import nextPlugin from '@next/eslint-plugin-next';
import globals from 'globals';
import base from './base.js';

export default [
  ...base,
  {
    files: ['**/*.{ts,tsx,js,jsx}'],
    plugins: {
      react,
      'react-hooks': reactHooks,
      '@next/next': nextPlugin,
    },
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      'react/jsx-uses-react': 'off',
      'react/react-in-jsx-scope': 'off',
      '@next/next/no-html-link-for-pages': 'off',
      /*
       * 이 앱이 `<img>` 로 그리는 것은 전부 `next/image` 가 다룰 수 없거나 다뤄서는
       * 안 되는 것들이다.
       *
       * - 렌더 결과·콘티·참조 이미지·썸네일: **presign 된 S3 URL** 이라 요청마다
       *   서명이 바뀐다. 옵티마이저는 URL 을 캐시 키로 쓰므로 적중이 영원히 없고,
       *   변환본만 계속 쌓인다. 스토리지 호스트를 `remotePatterns` 에 열어야 하는 것은 덤이다.
       * - 업로드 미리보기: `URL.createObjectURL` 의 `blob:` URL 이라 서버가 못 가져온다.
       * - 랜딩 샘플: 이미 미리 만든 반응형 파일로 `srcSet`/`sizes` 를 직접 준다.
       *
       * 규칙을 켜 두면 열 자리에서 같은 설명을 반복해 disable 해야 한다.
       */
      '@next/next/no-img-element': 'off',
    },
  },
];

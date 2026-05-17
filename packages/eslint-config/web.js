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
    },
  },
];

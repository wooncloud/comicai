import { createRequire } from 'node:module';

// `@comicai/config` 는 순수 CommonJS 다 (그 이유는 packages/config/index.js 머리말).
// 여기서 createRequire 로 부르는 이유는 하나 더 있다 — 이 파일은 **빌드보다 먼저**
// 평가되므로, dist/ 를 요구하는 패키지를 import 하면 갓 클론한 저장소에서 깨진다.
const require = createRequire(import.meta.url);
/** @type {typeof import('@comicai/config')} */
const { loadEnv } = require('@comicai/config');

// `.env` → env-profile.json 순으로 process.env 의 빈 자리를 채운다.
// 이미 들어 있는 값(도커 build arg, CI, 쉘 export)은 건드리지 않으므로,
// `--build-arg NEXT_PUBLIC_API_URL=...` 이 항상 프로파일을 이긴다.
loadEnv();

/**
 * 브라우저 번들에 박히는 값. **런타임 환경변수로는 바뀌지 않는다.**
 *
 * Next 는 `NEXT_PUBLIC_` 값을 빌드 시점에 문자열로 치환하고, standalone 산출물은
 * 이 설정 파일을 다시 읽지 않는다. 그래서 값을 바꾸려면 web 을 다시 빌드해야 한다.
 * 여기 명시적으로 적는 이유는, 빠졌을 때 조용히 `undefined` 가 박히는 대신
 * 빌드가 멈추게 하기 위해서다.
 *
 * @param {string} name
 * @returns {string}
 */
function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} 이 비어 있다. env-profile.json 의 현재 그룹(APP_ENV=${process.env.APP_ENV ?? 'dev'})에 ` +
        `있는지 확인한다 — 이 값은 번들에 박히므로 빈 채로 빌드하면 런타임에 고칠 수 없다.`,
    );
  }
  return value;
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  outputFileTracingRoot: new URL('../..', import.meta.url).pathname,
  env: {
    NEXT_PUBLIC_API_URL: required('NEXT_PUBLIC_API_URL'),
    NEXT_PUBLIC_FEATURE_API_KEYS: required('NEXT_PUBLIC_FEATURE_API_KEYS'),
  },
};

export default nextConfig;

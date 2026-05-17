import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';

// 브라우저 dev에서 임시 모킹용. 필요할 때 importing 측에서 worker.start() 호출.
// public/mockServiceWorker.js 가 있어야 동작 — `pnpm exec msw init public/` 로 생성.
export const worker = setupWorker(...handlers);

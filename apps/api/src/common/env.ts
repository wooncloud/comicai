import type { ConfigService } from '@nestjs/config';

/** 개발 기본값. 여기 한 곳에만 둔다. */
const REDIS_URL_FALLBACK = 'redis://localhost:6379';

/**
 * Redis 접속 URL. **반드시 `ConfigService` 를 거친다.**
 *
 * 예전에는 일곱 곳 중 `sse.hub.ts` 하나만 `process.env` 를 직접 읽었다. `ConfigService` 는
 * `ConfigModule.forRoot()` 가 `.env` 를 로드한 뒤의 값을 보는데, 모듈 초기화 순서에 따라
 * `process.env` 는 그 시점에 아직 비어 있을 수 있다. 그러면 **SSE 만 다른 Redis 를 본다** —
 * 증상은 "워커 이벤트가 브라우저에 안 간다" 로 나타나서, 원인이 Redis 주소라는 것을
 * 알아보기 어렵다.
 *
 * 기본값 문자열이 일곱 벌로 흩어져 있던 것도 여기로 모은다. 한 곳만 고치면 나머지 여섯이
 * 조용히 옛 주소를 쓴다.
 */
export function redisUrl(config: ConfigService): string {
  return config.get<string>('REDIS_URL') ?? REDIS_URL_FALLBACK;
}

import { Controller, Get, Logger, ServiceUnavailableException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { prisma } from '@comicai/db';
import { SseHub } from '../render/sse.hub';
import { StorageService } from '../storage/storage.service';

type Probe = 'ok' | 'down';

/**
 * 검사 결과를 재사용하는 창.
 *
 * 도커 헬스체크 간격이 5초(`infra/compose/full.yml`)라, 이 창은 정상 운영에서 아무것도
 * 바꾸지 않는다 — 매 헬스체크가 새 검사를 본다. 창이 막는 것은 초당 수백 번 두드리는 쪽이다.
 */
const PROBE_CACHE_MS = 2000;

/**
 * 컨테이너 헬스체크와 터널이 이 응답을 보고 트래픽을 보낼지 정한다.
 *
 * 예전에는 상수만 돌려줬다. Postgres 가 죽어도 `{ok:true}` 라서 컨테이너는 영원히
 * healthy 로 남고, 앞단은 계속 트래픽을 밀어 넣었다. 사용자는 모든 화면에서
 * 에러를 보는데 대시보드는 초록이었다.
 *
 * 의존성이 하나라도 죽으면 503 을 준다 — 그래야 재기동이나 트래픽 차단이 걸린다.
 */
@Controller()
// `@SkipThrottle()` 이었다. 인증 없이 열린 채로 요청마다 Postgres 쿼리 1 + Redis ping +
// S3 HeadBucket 을 돌리는 엔드포인트라, 무제한이면 그 자체가 증폭 벡터다 — 초당 수백 번이면
// Prisma 커넥션 풀이 헬스체크로 가득 차 실제 사용자 요청이 밀린다.
// 상한은 도커 헬스체크(5초 간격 = 분당 12회)가 여유 있게 통과하도록 잡았다. 그 검사는
// 컨테이너 안에서 localhost 로 오므로 외부 트래픽과 스로틀 버킷도 다르다.
@Throttle({ default: { ttl: 60_000, limit: 60 } })
export class HealthController {
  private readonly logger = new Logger(HealthController.name);
  private inFlight?: Promise<boolean>;
  private cachedAt = 0;
  private cachedOk = false;

  constructor(
    private readonly hub: SseHub,
    private readonly storage: StorageService,
  ) {}

  @Get('healthz')
  async health() {
    const body = { ok: await this.checkDependencies(), at: new Date().toISOString() };
    // 200 이 아니면 docker healthcheck 의 wget 이 실패하고 컨테이너가 unhealthy 가 된다.
    if (!body.ok) throw new ServiceUnavailableException(body);
    return body;
  }

  /**
   * 캐시된 결과가 있으면 그대로, 없으면 검사한다.
   *
   * 스로틀만으로는 한 창 안의 버스트가 남고, 아래 타임아웃은 `Promise.race` 라 **밑에서
   * 도는 작업을 취소하지 않는다** — 느린 검사는 2초 뒤 'down' 으로 보고된 뒤에도 커넥션을
   * 계속 쥔다. 그래서 요청 수가 아니라 검사 자체에 상한을 건다.
   *
   * 진행 중인 검사는 공유한다. 같은 틱에 들어온 요청들이 각자 검사를 시작하면 캐시가
   * 있어도 첫 물결은 그대로 통과한다.
   */
  private checkDependencies(): Promise<boolean> {
    if (Date.now() - this.cachedAt < PROBE_CACHE_MS) return Promise.resolve(this.cachedOk);
    this.inFlight ??= this.runProbes();
    return this.inFlight;
  }

  private async runProbes(): Promise<boolean> {
    try {
      // 하나가 느려도 나머지를 못 보면 원인을 좁힐 수 없다. 병렬로 전부 잰다.
      const [db, redis, s3] = await Promise.all([
        probe(() => prisma.$queryRaw`SELECT 1`),
        probe(() => this.hub.healthPing()),
        probe(() => this.storage.healthPing()),
      ]);
      const ok = db === 'ok' && redis === 'ok' && s3 === 'ok';
      // 무엇이 어떻게 죽었는지는 **응답이 아니라 로그로** 나간다. healthz 는 인증 없이
      // 열려 있어서, 내부 구성을 그대로 알려 줄 이유가 없다. 운영자는 로그를 본다.
      if (!ok) this.logger.error({ db, redis, s3 }, 'healthz: 의존성 실패');
      this.cachedOk = ok;
      this.cachedAt = Date.now();
      return ok;
    } finally {
      this.inFlight = undefined;
    }
  }
}

/** 검사 하나를 실행한다. 실패 사유는 호출부가 로그로만 쓴다. */
async function probe(fn: () => Promise<unknown>): Promise<Probe> {
  try {
    // 하나가 매달리면 헬스체크 자체가 타임아웃된다. 그러면 "죽었다" 와
    // "응답이 없다" 를 구분할 수 없으므로 여기서 먼저 끊는다.
    await Promise.race([
      fn(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000)),
    ]);
    return 'ok';
  } catch {
    return 'down';
  }
}

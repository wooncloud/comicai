import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { prisma } from '@comicai/db';
import { SseHub } from '../render/sse.hub';
import { StorageService } from '../storage/storage.service';

type Probe = 'ok' | 'down';

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
@SkipThrottle()
export class HealthController {
  constructor(
    private readonly hub: SseHub,
    private readonly storage: StorageService,
  ) {}

  @Get('healthz')
  async health() {
    // 하나가 느려도 나머지를 못 보면 원인을 좁힐 수 없다. 병렬로 재고 전부 보고한다.
    const [db, redis, s3] = await Promise.all([
      probe(() => prisma.$queryRaw`SELECT 1`),
      probe(() => this.hub.healthPing()),
      probe(() => this.storage.healthPing()),
    ]);

    const body = {
      ok: db === 'ok' && redis === 'ok' && s3 === 'ok',
      db,
      redis,
      s3,
      at: new Date().toISOString(),
    };
    // 200 이 아니면 docker healthcheck 의 wget 이 실패하고 컨테이너가 unhealthy 가 된다.
    if (!body.ok) throw new ServiceUnavailableException(body);
    return body;
  }
}

/**
 * 검사 하나를 실행한다. 이유는 굳이 밖으로 내보내지 않는다 — healthz 는 인증 없이
 * 열려 있어서, 어떤 의존성이 어떻게 죽었는지까지 알려 줄 필요가 없다.
 */
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

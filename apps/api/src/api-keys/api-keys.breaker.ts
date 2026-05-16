import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { prisma } from '@comicai/db';

const PREFIX = 'breaker:apikey:';
const WINDOW_SECONDS = 60 * 60; // 1시간 윈도우 — 오래된 실패는 카운트에서 빠진다.
const TRIP_AT = 5;

/**
 * BYOK 키 회로 차단기. spec 07-error-reliability §회로차단:
 * 동일 키가 1시간 윈도우 내 연속 5회 auth 실패 시 isActive=false.
 *
 * 카운터는 Redis INCR + EXPIRE로 슬라이딩 윈도우 근사.
 * 성공 시 카운터를 삭제하여 streak 리셋.
 */
@Injectable()
export class ApiKeyBreaker implements OnModuleDestroy {
  private readonly logger = new Logger(ApiKeyBreaker.name);
  private readonly redis: Redis;

  constructor(config: ConfigService) {
    this.redis = new Redis(config.get<string>('REDIS_URL') ?? 'redis://localhost:6379');
  }

  async onModuleDestroy() {
    await this.redis.quit();
  }

  async recordSuccess(apiKeyId: string): Promise<void> {
    await this.redis.del(PREFIX + apiKeyId);
  }

  /** auth 실패를 기록. 임계치 도달 시 키를 비활성화. */
  async recordAuthFailure(apiKeyId: string): Promise<{ tripped: boolean; count: number }> {
    const count = await this.redis.incr(PREFIX + apiKeyId);
    if (count === 1) {
      await this.redis.expire(PREFIX + apiKeyId, WINDOW_SECONDS);
    }
    if (count >= TRIP_AT) {
      await this.redis.del(PREFIX + apiKeyId);
      await prisma.apiKey.update({ where: { id: apiKeyId }, data: { isActive: false } });
      this.logger.warn({ apiKeyId, count }, 'api key tripped by breaker');
      return { tripped: true, count };
    }
    return { tripped: false, count };
  }
}

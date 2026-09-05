import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { prisma } from '@comicai/db';
import { MODEL_PROVIDER, type ModelId, type ModelProvider } from '@comicai/types';
import { open } from '../api-keys/crypto';
import { redisUrl } from '../common/env';
import { nonEmpty } from '../common/non-empty';

/** 그림 생성에 쓸 자격 증명. `id` 는 사용자 키일 때만 있다(차단기 기록용). */
export interface ModelCredential {
  id: string | null;
  secret: string;
  /** 이 호출의 비용을 누가 내는가. 사용량 상한은 platform 일 때만 건다. */
  source: 'user' | 'platform' | 'mock';
}

export class ApiKeyMissingError extends Error {
  readonly category = 'auth' as const;
}

export class UsageLimitError extends Error {
  readonly category = 'quota' as const;
}

/** 하루에 한 사람이 플랫폼 키로 만들 수 있는 그림 수. */
const DEFAULT_DAILY_LIMIT = 20;

const USAGE_PREFIX = 'platform:usage:';
/** 잡 단위 중복 청구 방지 표시. 값은 의미 없고 존재 여부만 본다. */
const CHARGED_PREFIX = 'platform:charged:';
/**
 * 카운터 키를 UTC 날짜로 끊으므로 TTL 은 하루보다 넉넉해야 한다. 정확히 24시간으로
 * 잡으면 자정 직전에 만들어진 키가 그날이 끝나기 전에 사라져 사용량이 0 으로 돌아간다.
 */
const USAGE_TTL_SECONDS = 26 * 60 * 60;

function platformKeyFor(provider: ModelProvider): string | undefined {
  const raw =
    provider === 'gemini' ? process.env.PLATFORM_GEMINI_KEY : process.env.PLATFORM_OPENAI_KEY;
  return nonEmpty(raw?.trim());
}

/**
 * 모델 호출에 쓸 키를 고른다.
 *
 * 예전에는 이 로직이 렌더 워커와 일관성 서비스에 **두 벌로 복제돼** 있었다.
 * 한쪽만 고치면 컷 렌더는 되는데 참조 이미지 생성만 죽는 상태가 된다.
 *
 * 우선순위는 사용자 키 → 플랫폼 키다. 사용자가 자기 키를 넣어 뒀다면 그 비용은
 * 본인이 내는 것이고 상한을 걸 이유가 없다. 플랫폼 키를 쓸 때만 상한을 본다.
 */
@Injectable()
export class ModelCredentials implements OnModuleDestroy {
  private readonly logger = new Logger(ModelCredentials.name);
  private readonly redis: Redis;

  constructor(config: ConfigService) {
    this.redis = new Redis(redisUrl(config));
  }

  async onModuleDestroy() {
    await this.redis.quit();
  }

  /**
   * @param chargeKey 같은 작업의 재시도를 한 번만 청구하기 위한 키(렌더 잡 id).
   *   생략하면 호출마다 청구한다 — 참조 이미지 생성처럼 호출 자체가 곧 한 건인 경우다.
   */
  async resolve(userId: string, model: ModelId, chargeKey?: string): Promise<ModelCredential> {
    // mock 은 외부 호출이 없어 비용이 0 이다. 상한에 넣으면 개발·테스트가
    // 사용자의 하루치를 갉아먹는다.
    if (model === 'mock') return { id: null, secret: '', source: 'mock' };

    const provider = MODEL_PROVIDER[model];
    const row = await prisma.apiKey.findFirst({
      where: { userId, provider, isActive: true },
      orderBy: { createdAt: 'desc' },
    });
    if (row) {
      return {
        id: row.id,
        secret: open({ ciphertext: row.ciphertext, nonce: row.nonce }),
        source: 'user',
      };
    }

    const platform = platformKeyFor(provider);
    if (!platform) {
      throw new ApiKeyMissingError(`no ${provider} key`);
    }

    await this.consumePlatformQuota(userId, chargeKey);
    return { id: null, secret: platform, source: 'platform' };
  }

  /**
   * 플랫폼 키 사용량을 1 올리고, 상한을 넘겼으면 키를 내주지 않는다.
   *
   * 플랫폼 키에는 지출 상한이 없다. 쿼터 없이 열면 가입자 누구나 무제한으로
   * 회사 키를 태울 수 있다 — rate limit(요청 빈도)은 지출을 막지 못한다.
   *
   * **계량은 키를 내주는 이 자리에 있어야 한다.** 예전에는 `renderJob` 행 수를 셌는데,
   * 그 테이블에 행을 넣는 곳은 컷 렌더 하나뿐이었다. 같은 키를 받아 가는 참조 이미지
   * 생성은 카운터를 읽기만 하고 올리지 않아서, 그 경로로는 상한이 아예 없었다.
   * 여기서 세면 호출부가 몇으로 늘어나도 계량이 새지 않는다.
   *
   * 세는 것은 "성공한 것"이 아니라 "키를 내준 것"이다. 실패한 호출에도 대부분 비용이
   * 청구되고, 실패를 공짜로 두면 무한 재시도로 우회할 수 있다.
   *
   * 사용자 키로 그린 사람은 여기까지 오지 않는다. 예전 카운터는 키 출처를 구분하지
   * 않아서, 자기 키로 50컷을 그린 사람이 그 키가 차단되는 순간 플랫폼 키를 한 번도 쓴
   * 적 없이 "하루치를 다 썼다" 는 이유로 막혔다.
   *
   * Redis 가 죽으면 예외가 그대로 올라간다. 지출 상한은 열어 두는 쪽이 더 위험하고,
   * 아직 모델을 부르기 전이라 여기서 실패해도 돈이 나가지는 않는다.
   */
  private async consumePlatformQuota(userId: string, chargeKey?: string): Promise<void> {
    const limit = Number(process.env.PLATFORM_DAILY_RENDER_LIMIT ?? DEFAULT_DAILY_LIMIT);
    if (!Number.isFinite(limit) || limit <= 0) return;

    /*
     * **한 작업은 한 번만 청구한다.**
     *
     * 워커는 잡마다 이 함수를 부르는데, transient 실패는 BullMQ 가 3회까지 재시도한다.
     * 그러면 그림 한 장에 상한이 3 소모돼, 정상 사용자가 상한의 1/3 만 쓰고 막혔다.
     * 배포 중 stalled 재큐로 잡이 되살아나는 경로도 같은 문제다.
     *
     * SETNX 로 "이 잡은 이미 셌다" 를 표시한다. 표시가 있으면 상한 검사도 건너뛴다 —
     * 이미 통과시킨 작업을 도중에 막으면 절반만 된 결과가 남는다.
     */
    if (chargeKey) {
      const first = await this.redis.set(
        `${CHARGED_PREFIX}${chargeKey}`,
        '1',
        'EX',
        USAGE_TTL_SECONDS,
        'NX',
      );
      if (first === null) return;
    }

    const key = `${USAGE_PREFIX}${userId}:${utcDay()}`;
    const used = await this.redis.incr(key);
    if (used === 1) await this.redis.expire(key, USAGE_TTL_SECONDS);
    if (used > limit) {
      this.logger.warn(`daily limit reached: user=${userId} used=${used} limit=${limit}`);
      throw new UsageLimitError(`daily limit ${limit} reached`);
    }
  }
}

/** 카운터 키의 날짜 조각. 서버 타임존이 달라도 같은 하루를 가리키도록 UTC 로 끊는다. */
function utcDay(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

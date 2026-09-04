import { Injectable, Logger } from '@nestjs/common';
import { prisma } from '@comicai/db';
import { MODEL_PROVIDER, type ModelId, type ModelProvider } from '@comicai/types';
import { open } from '../api-keys/crypto';

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

function platformKeyFor(provider: ModelProvider): string | undefined {
  const raw =
    provider === 'gemini' ? process.env.PLATFORM_GEMINI_KEY : process.env.PLATFORM_OPENAI_KEY;
  return raw?.trim() || undefined;
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
export class ModelCredentials {
  private readonly logger = new Logger(ModelCredentials.name);

  async resolve(userId: string, model: ModelId): Promise<ModelCredential> {
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

    /*
     * 플랫폼 키에는 지출 상한이 없다. 쿼터 없이 열면 가입자 누구나 무제한으로
     * 회사 키를 태울 수 있다 — rate limit(요청 빈도)은 지출을 막지 못한다.
     *
     * 여기서 세는 것은 "성공한 것"이 아니라 "시도한 것"이다. 실패한 호출에도
     * 대부분 비용이 청구되고, 실패를 공짜로 두면 무한 재시도로 우회할 수 있다.
     */
    const limit = Number(process.env.PLATFORM_DAILY_RENDER_LIMIT ?? DEFAULT_DAILY_LIMIT);
    if (limit > 0) {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const used = await prisma.renderJob.count({
        // mock 은 외부 호출이 없어 비용이 0 이다. 상한에 넣으면 개발·테스트가
        // 사용자의 하루치를 갉아먹는다.
        where: { userId, model: { not: 'mock' }, createdAt: { gte: since } },
      });
      if (used >= limit) {
        this.logger.warn(`daily limit reached: user=${userId} used=${used} limit=${limit}`);
        throw new UsageLimitError(`daily limit ${limit} reached`);
      }
    }

    return { id: null, secret: platform, source: 'platform' };
  }
}

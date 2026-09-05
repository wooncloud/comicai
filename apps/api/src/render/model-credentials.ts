import { Injectable } from '@nestjs/common';
import { prisma } from '@comicai/db';
import { MODEL_PROVIDER, type ModelId, type ModelProvider } from '@comicai/types';
import { open } from '../api-keys/crypto';
import { nonEmpty } from '../common/non-empty';
import { TokensService, renderChargeKey } from '../tokens/tokens.service';

/** 그림 생성에 쓸 자격 증명. `id` 는 사용자 키일 때만 있다(차단기 기록용). */
export interface ModelCredential {
  id: string | null;
  secret: string;
  /** 이 호출의 비용을 누가 내는가. 토큰은 platform 일 때만 나간다. */
  source: 'user' | 'platform' | 'mock';
}

export class ApiKeyMissingError extends Error {
  readonly category = 'auth' as const;
}

function platformKeyFor(provider: ModelProvider): string | undefined {
  const raw =
    provider === 'gemini' ? process.env.PLATFORM_GEMINI_KEY : process.env.PLATFORM_OPENAI_KEY;
  return nonEmpty(raw?.trim());
}

/**
 * 모델 호출에 쓸 키를 고르고, 플랫폼 키를 쓸 때는 토큰을 차감한다.
 *
 * 예전에는 이 로직이 렌더 워커와 일관성 서비스에 **두 벌로 복제돼** 있었다.
 * 한쪽만 고치면 컷 렌더는 되는데 참조 이미지 생성만 죽는 상태가 된다.
 *
 * 우선순위는 사용자 키 → 플랫폼 키다. 사용자가 자기 키를 넣어 뒀다면 그 비용은
 * 본인이 프로바이더에 직접 내는 것이라 토큰을 받지 않는다.
 */
@Injectable()
export class ModelCredentials {
  constructor(private readonly tokens: TokensService) {}

  /**
   * 이 사용자가 이 모델을 부르면 토큰이 얼마나 나가는가. 0 이면 나가지 않는다.
   *
   * "누가 내는가" 규칙은 `resolve` 하나가 안다(사용자 키 → 무료, 플랫폼 키 → 유료).
   * 화면에 미리 알려 주려는 쪽이 그 규칙을 다시 적으면 두 벌이 되고, 실제로 그렇게
   * 해서 **자기 키를 넣은 사용자가 잔액 0 이면 문 앞에서 막혔다** — 그 렌더는 토큰을
   * 한 개도 쓰지 않는데도.
   */
  async previewCost(userId: string, model: ModelId): Promise<number> {
    if (model === 'mock') return 0;
    const hasOwnKey = await prisma.apiKey.findFirst({
      where: { userId, provider: MODEL_PROVIDER[model], isActive: true },
      select: { id: true },
    });
    return hasOwnKey ? 0 : this.tokens.costOf(model);
  }

  /**
   * @param chargeKey 이 호출을 원장에서 가리키는 키. 렌더는 잡 id 를 쓴다 —
   *   BullMQ 재시도와 stalled 재큐가 같은 잡을 여러 번 처리하는데, 그때마다 청구하면
   *   그림 한 장에 토큰이 3개 나간다. 환급도 이 키로 되짚는다.
   */
  async resolve(userId: string, model: ModelId, chargeKey: string): Promise<ModelCredential> {
    // mock 은 외부 호출이 없어 비용이 0 이다. 개발·테스트가 사용자 잔액을 갉아먹으면 안 된다.
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
     * **계량은 키를 내주는 이 자리에 있어야 한다.**
     *
     * 예전에는 `renderJob` 행 수를 셌는데, 그 테이블에 행을 넣는 곳은 컷 렌더 하나뿐이다.
     * 같은 키를 받아 가는 참조 이미지 생성은 카운터를 읽기만 하고 올리지 않아서, 그
     * 경로로는 상한이 아예 없었다. 여기서 세면 호출부가 몇으로 늘어나도 계량이 새지 않는다.
     *
     * 차감은 **성공이 아니라 시작** 시점이다. 그래야 잔액 1로 100장을 동시에 시작할 수
     * 없다. 결과를 못 낸 호출은 끝난 뒤에 돌려준다(`TokensService.refundRender`).
     */
    const cost = this.tokens.costOf(model);
    if (cost > 0) {
      await this.tokens.charge(userId, cost, {
        kind: 'render',
        idempotencyKey: renderChargeKey(chargeKey),
        refId: chargeKey,
        memo: `그림 생성 (${model})`,
      });
    }
    return { id: null, secret: platform, source: 'platform' };
  }
}
